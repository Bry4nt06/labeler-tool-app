"use strict";

(function installMechanicalMapSceneRenderer(global) {
  const ROTATOR_HANDLE_OFFSET = 40;
  const SENSOR_FIELD_OF_VIEW_DEG = 18;

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function sensorConeGeometry(length, fieldOfViewDeg) {
    const resolvedLength = Math.max(1, Number(length) || 1);
    const resolvedField = clamp(Number(fieldOfViewDeg) || SENSOR_FIELD_OF_VIEW_DEG, 4, 60);
    const halfAngleRad = resolvedField * Math.PI / 360;
    const edgeX = resolvedLength * Math.cos(halfAngleRad);
    const edgeY = resolvedLength * Math.sin(halfAngleRad);
    return {
      fieldOfViewDeg: resolvedField,
      path: `M 0 0 L ${edgeX} ${-edgeY} A ${resolvedLength} ${resolvedLength} 0 0 1 ${edgeX} ${edgeY} Z`
    };
  }

  function sensorShouldRender(sensor, map) {
    const activation = global.LabelerSensorActivationController;
    if (typeof activation?.shouldRender === "function") {
      try { return Boolean(activation.shouldRender(sensor, map)); }
      catch { return true; }
    }
    return sensor?.enabled !== false;
  }

  function drawSensorFieldOfViewCones(add, layer, map) {
    const sensors = (Array.isArray(map?.objects) ? map.objects : [])
      .filter((item) => item?.kind === "sensor" && sensorShouldRender(item, map));

    sensors.forEach((sensor) => {
      const placement = Number(sensor.angle ?? sensor.start);
      if (!Number.isFinite(placement)) return;

      const tableRadius = Number(state.radius || 0);
      const radius = tableRadius + Number(state.depths?.opRoller || 0) + 7;
      const origin = angleToXY(placement, radius);
      const aim = clamp(Number(sensor.sensorAimOffsetDeg || 0), -90, 90);
      const directionSign = state.direction === "cw" ? -1 : 1;
      const rotation = angleToSvgRotation(placement) + 180 + directionSign * aim;
      const coneLength = clamp(Math.abs(radius - tableRadius) + 14, 32, 48);
      const geometry = sensorConeGeometry(coneLength, sensor.sensorFieldOfViewDeg);
      const selected = String(state.selectedMapObjectId || "") === String(sensor.id);
      const group = add("g", {
        transform: `translate(${origin.x} ${origin.y}) rotate(${rotation})`,
        "data-sensor-field-of-view": sensor.id,
        "data-sensor-aim-deg": aim,
        "data-sensor-field-of-view-deg": geometry.fieldOfViewDeg,
        "pointer-events": "none",
        "aria-hidden": "true"
      }, layer);

      add("path", {
        d: geometry.path,
        fill: "#55d7ff",
        "fill-opacity": selected ? 0.24 : 0.13,
        stroke: "#a8efff",
        "stroke-width": selected ? 1.8 : 1.35,
        "stroke-opacity": selected ? 0.82 : 0.64,
        "vector-effect": "non-scaling-stroke"
      }, group);
      add("line", {
        x1: 0,
        y1: 0,
        x2: coneLength,
        y2: 0,
        stroke: "#e1fbff",
        "stroke-width": selected ? 1.8 : 1.35,
        "stroke-opacity": selected ? 0.92 : 0.78,
        "stroke-dasharray": "5 4",
        "vector-effect": "non-scaling-stroke"
      }, group);
      add("circle", {
        cx: 0,
        cy: 0,
        r: selected ? 3.5 : 2.8,
        fill: "#e1fbff",
        "fill-opacity": selected ? 0.92 : 0.78,
        stroke: "#08677e",
        "stroke-width": 1,
        "stroke-opacity": 0.76,
        "vector-effect": "non-scaling-stroke"
      }, group);
      const title = add("title", {}, group);
      title.textContent = `${sensor.name || "Sensor"} field of view: ${geometry.fieldOfViewDeg}° at ${aim}° rotation`;
    });
  }

  function applyMapView() {
    if (!els.mapSvg) return;
    const zoom = Math.min(2.5, Math.max(0.65, num(state.mapZoom, 1)));
    state.mapZoom = zoom;
    const width = 680 / zoom;
    const height = 630 / zoom;
    const panX = num(state.mapPanX, 0);
    const panY = num(state.mapPanY, 0);
    state.mapPanX = panX;
    state.mapPanY = panY;
    els.mapSvg.setAttribute("viewBox", `${panX - width / 2} ${panY - height / 2} ${width} ${height}`);
  }

  function renderMap() {
    const activeMap = typeof activeMachineMap === "function" ? activeMachineMap() : null;
    if (els.activeMapName) {
      els.activeMapName.textContent = activeMap?.name || "Unnamed Map";
      els.activeMapName.title = activeMap?.name || "Unnamed Map";
    }
    syncMapPointsFromAssemblies();
    applyMapView();
    const svg = els.mapSvg;
    if (!svg) return;
    svg.innerHTML = "";
    const ns = "http://www.w3.org/2000/svg";
    const add = (name, attrs, parent = svg) => {
      const element = document.createElementNS(ns, name);
      Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, String(value)));
      parent.appendChild(element);
      return element;
    };

    const bottleHeads = heads();
    drawBottleTableVisual(add, svg, state.radius, bottleHeads);
    const quadrantLayer = add("g", { "aria-label": "Table quadrant references" });
    drawMapQuadrantReferences(add, quadrantLayer);
    const zeroEnd = angleToXY(0, state.radius + 34);
    add("line", { x1: 0, y1: 0, x2: zeroEnd.x, y2: zeroEnd.y, stroke: "#28735a", "stroke-width": 3 });
    add("text", { x: zeroEnd.x + (state.direction === "cw" ? -42 : 8), y: zeroEnd.y - 8, fill: "#28735a", "font-size": 13 }).textContent = "0 deg";

    const preview = angleToXY(state.previewAngle, state.radius + 12);
    add("line", { x1: 0, y1: 0, x2: preview.x, y2: preview.y, stroke: "#ad3434", "stroke-width": 2, "stroke-dasharray": "6 5", "data-animation-preview": "true" });

    const equipmentLayer = add("g", {});
    const hiddenEquipmentIds = new Set(
      state.mapPoints
        .filter((point) => /Wipe-Down/i.test(point.name))
        .map((point) => point.id)
    );

    bottleHeads.forEach((head) => {
      const padAngle = bottlePreviewAngle(head);
      const servoSign = state.direction === "cw" ? -1 : 1;
      const referenceRotation = angleToSvgRotation(head.tableAngle) + servoSign * padAngle;
      const bottle = add("g", { transform: `translate(${head.x} ${head.y}) rotate(${referenceRotation})`, "data-animation-head": head.head });
      drawTopViewBottle(add, bottle, head.tableAngle);
    });

    const rotator = angleToXY(state.previewAngle, state.radius + ROTATOR_HANDLE_OFFSET);
    add("circle", { cx: rotator.x, cy: rotator.y, r: 5.5, fill: "#ffffff", stroke: "#d71920", "stroke-width": 2.5, class: "map-rotator-handle", "data-map-rotator-handle": "true", "aria-label": "Drag primary head around labeler" });

    state.mapPoints.forEach((point) => {
      if (state.applicationMode === "cold-glue") return;
      if (hiddenEquipmentIds.has(point.id)) return;
      if (/Spender/i.test(point.name)) return;
      if (/Roller/i.test(point.name)) {
        const rollerRadius = /\(Op Side\)/i.test(point.name)
          ? state.radius + state.depths.opRoller
          : state.radius + state.depths.nonOpRoller;
        const position = angleToXY(point.angle, rollerRadius);
        if (typeof drawSpongeRoller === "function") {
          drawSpongeRoller(add, equipmentLayer, position.x, position.y, { "data-map-point-roller": point.id });
        } else {
          const group = add("g", { transform: `translate(${position.x} ${position.y})` }, equipmentLayer);
          add("circle", { cx: 0, cy: 0, r: 10, fill: "#969da4", stroke: "#d0d5da", "stroke-width": 1 }, group);
          add("circle", { cx: 0, cy: 0, r: 4.2, fill: "#111417", stroke: "#050607", "stroke-width": 0.9 }, group);
        }
        return;
      }
      if (/Inspection|Coding/i.test(point.name)) return;
    });

    const program = currentProgram();
    const moveDistanceLayer = add("g", { "aria-label": "Active servo move distance overlay" });
    drawMoveDistanceOverlay(add, moveDistanceLayer, program);
    const allMovesLayer = add("g", { "aria-label": "All servo program moves overlay" });
    drawAllProgramMovesOverlay(add, allMovesLayer, program);

    const aggregateLayer = add("g", { "aria-label": "Enabled machine aggregates" });
    drawIndependentAggregates(add, aggregateLayer);
    const aggregateSpacingLayer = add("g", { "aria-label": "Aggregate centerline table-distance overlay" });
    drawAggregateSpacingOverlay(add, aggregateSpacingLayer);

    const configuredAssemblyLayer = add("g", { "aria-label": "Configured wipe-down assemblies" });
    drawConfiguredAssemblies(add, configuredAssemblyLayer);
    const sensorFieldOfViewLayer = add("g", { "aria-label": "Sensor field-of-view cones", "data-sensor-field-of-view-layer": "core" });
    drawSensorFieldOfViewCones(add, sensorFieldOfViewLayer, activeMap);

    const centerReadout = add("g", { "aria-label": "Current table angle" });
    const centerAngleFontSize = Math.abs(state.previewAngle) >= 100 ? 14 : Math.abs(state.previewAngle) >= 10 ? 16 : 18;
    add("circle", { cx: 0, cy: 0, r: 39, fill: "var(--map-readout)", "fill-opacity": 0.96, stroke: "var(--map-ring)", "stroke-width": 1.5 }, centerReadout);
    add("text", { x: 0, y: -3, fill: "var(--map-text)", "font-size": centerAngleFontSize, "font-weight": 700, "text-anchor": "middle", "data-animation-center": "true" }, centerReadout).textContent = `${fmt(state.previewAngle, 1)} deg`;
    add("text", { x: 0, y: 15, fill: "var(--map-muted)", "font-size": 10, "text-anchor": "middle" }, centerReadout).textContent = "TABLE ANGLE";

    const faultLayer = add("g", { "aria-label": "Servo move fault overlay" });
    drawFaultOverlay(add, faultLayer, program);
    svg.dataset.animationSegment = String(activeSegmentForProgram(program, state.previewAngle)?.hmi ?? "none");
    renderLabelerMapReference();
  }

  renderMap.sensorFieldOfViewCoreV1 = true;
  global.applyMapView = applyMapView;
  global.renderMap = renderMap;
  global.LabelerMechanicalMapSceneRenderer = Object.freeze({
    applyMapView,
    renderMap,
    SENSOR_FIELD_OF_VIEW_DEG,
    sensorConeGeometry,
    drawSensorFieldOfViewCones,
    sensorFieldOfViewCoreV1: true,
    premiumBottleTableV1: true,
    synchronizedBottlePocketsV1: true,
    amberBottleBlueCapV1: true,
    spongeWipeComponentsV1: true
  });
})(window);