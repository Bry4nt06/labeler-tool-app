"use strict";

(function installMechanicalMapSceneRenderer(global) {
  const ROTATOR_HANDLE_OFFSET = 40;

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

    add("circle", { cx: 0, cy: 0, r: state.radius, fill: "var(--map-surface)", stroke: "var(--map-ring)", "stroke-width": 2 });
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

    heads().forEach((head) => {
      const padAngle = bottlePreviewAngle(head);
      const servoSign = state.direction === "cw" ? -1 : 1;
      const referenceRotation = angleToSvgRotation(head.tableAngle) + servoSign * padAngle;
      const bottle = add("g", { transform: `translate(${head.x} ${head.y}) rotate(${referenceRotation})`, "data-animation-head": head.head });
      add("circle", { cx: 0, cy: 0, r: 7.5, fill: "var(--map-head-fill)", stroke: "var(--map-head-stroke)", "stroke-width": 1.7 }, bottle);
      drawBottleLabelIndicators(add, bottle, head.tableAngle);
      add("line", { x1: 0, y1: 0, x2: 6.6, y2: 0, stroke: "#ad3434", "stroke-width": 2, "stroke-linecap": "round", "data-bottle-orientation": "true" }, bottle);
      add("circle", { cx: 0, cy: 0, r: 2.2, fill: "var(--map-head-stroke)" }, bottle);
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
        const group = add("g", { transform: `translate(${position.x} ${position.y})` }, equipmentLayer);
        add("circle", { cx: 0, cy: 0, r: 10, fill: "#477664", "fill-opacity": 0.78, stroke: "none" }, group);
        add("circle", { cx: -3, cy: -3, r: 3, fill: "#789b8d", "fill-opacity": 0.55 }, group);
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

  global.applyMapView = applyMapView;
  global.renderMap = renderMap;
  global.LabelerMechanicalMapSceneRenderer = Object.freeze({ applyMapView, renderMap });
})(window);
