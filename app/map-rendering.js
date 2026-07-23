"use strict";

const BOTTLE_LABEL_INDICATORS = {
  neck: { center: 0, innerRadius: 5.8, outerRadius: 7.1, color: "#f0c84b" },
  body: { center: 0, innerRadius: 4.2, outerRadius: 5.5, color: "#42c987" },
  back: { center: 180, innerRadius: 5.2, outerRadius: 7.1, color: "#a984e8" }
};

const MAP_ROTATOR_HANDLE_OFFSET = 40;
const MAP_QUADRANT_REFERENCES = [90, 180, 270, 359.9];

function drawMapQuadrantReferences(add, parent) {
  if (!state.showQuadrantReferences) return;
  MAP_QUADRANT_REFERENCES.forEach((angle) => {
    const end = angleToXY(angle, state.radius + 8);
    const label = angleToXY(angle, state.radius + 55);
    add("line", {
      x1: 0,
      y1: 0,
      x2: end.x,
      y2: end.y,
      stroke: "var(--map-label)",
      "stroke-width": 1,
      "stroke-opacity": 0.42,
      "stroke-dasharray": "4 6",
      "data-quadrant-reference": angle
    }, parent);
    add("text", {
      x: label.x,
      y: label.y,
      fill: "var(--map-label)",
      "fill-opacity": 0.82,
      "font-size": 11,
      "font-weight": 700,
      stroke: "var(--map-surface)",
      "stroke-width": 4,
      "stroke-linejoin": "round",
      "paint-order": "stroke fill",
      "text-anchor": "middle",
      "dominant-baseline": "middle",
      "data-quadrant-label": angle
    }, parent).textContent = `${angle}°`;
  });
}

function drawAggregateSpacingOverlay(add, parent) {
  if (!state.showAggregateSpacingOverlay) return;
  const gaps = typeof aggregateCenterlineGaps === "function" ? aggregateCenterlineGaps().filter((gap) => !gap.wrapsToFirst) : [];
  const arcRadius = Math.max(36, state.radius - 24);
  gaps.forEach((gap) => {
    const color = gap.violatesMinimum ? "#d71920" : "var(--map-muted)";
    const midpoint = gap.startAngle + gap.gapDeg / 2;
    const midpointPosition = angleToXY(midpoint, arcRadius);
    const forwardSweep = state.direction === "cw" ? 0 : 1;
    const reverseForReadability = forwardSweep ? midpointPosition.y > 0 : midpointPosition.y < 0;
    const labelStartAngle = reverseForReadability ? gap.endAngle : gap.startAngle;
    const labelEndAngle = reverseForReadability ? gap.startAngle : gap.endAngle;
    const labelStart = angleToXY(labelStartAngle, arcRadius);
    const labelEnd = angleToXY(labelEndAngle, arcRadius);
    const labelSweep = reverseForReadability ? (forwardSweep ? 0 : 1) : forwardSweep;
    const labelPathId = `aggregate-gap-label-${gap.from}-${gap.to}`;
    add("path", {
      id: labelPathId,
      d: `M ${labelStart.x} ${labelStart.y} A ${arcRadius} ${arcRadius} 0 ${gap.gapDeg > 180 ? 1 : 0} ${labelSweep} ${labelEnd.x} ${labelEnd.y}`,
      fill: "none",
      stroke: color,
      "stroke-width": gap.violatesMinimum ? 3.2 : 2.4,
      "stroke-opacity": gap.violatesMinimum ? 0.7 : 0.3,
      "data-aggregate-spacing-from": gap.from,
      "data-aggregate-spacing-to": gap.to,
      "data-aggregate-spacing-gap": gap.gapDeg.toFixed(1),
      "data-spacing-violation": String(gap.violatesMinimum)
    }, parent);
    const text = add("text", {
      fill: color,
      "font-size": 8,
      "font-weight": 600,
      stroke: "var(--map-surface)",
      "stroke-width": 2.2,
      "stroke-linejoin": "round",
      "paint-order": "stroke fill",
      dy: -5,
      "data-aggregate-spacing-label": `${gap.from}-${gap.to}`
    }, parent);
    const textPath = add("textPath", {
      href: `#${labelPathId}`,
      startOffset: "50%",
      "text-anchor": "middle",
      method: "align",
      spacing: "auto"
    }, text);
    add("tspan", {}, textPath).textContent = `A${gap.from}\u2002–\u2002A${gap.to}`;
    add("tspan", {
      dx: 9,
      fill: gap.violatesMinimum ? "#d71920" : "#42c987",
      "font-weight": 800,
      "data-aggregate-spacing-degrees": `${gap.from}-${gap.to}`
    }, textPath).textContent = `${fmt(gap.gapDeg, 1)}°`;
  });
}

function bottleLocalArcPath(startAngle, endAngle, innerRadius, outerRadius) {
  const point = (angle, radius) => {
    const radians = angle * Math.PI / 180;
    return { x: Math.cos(radians) * radius, y: Math.sin(radians) * radius };
  };
  const startOuter = point(startAngle, outerRadius);
  const endOuter = point(endAngle, outerRadius);
  const startInner = point(startAngle, innerRadius);
  const endInner = point(endAngle, innerRadius);
  const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${startInner.x} ${startInner.y}`,
    "Z"
  ].join(" ");
}

function bottleLabelApplications() {
  const available = typeof selectedLabelApplicationState === "function"
    ? selectedLabelApplicationState()
    : { neck: true, body: true, back: true };
  const applications = [];
  const seen = new Set();
  activeAggregateDefinitions()
    .sort((a, b) => norm(a.angle) - norm(b.angle))
    .forEach((aggregate) => {
      const section = labelSectionForStation(aggregate.number);
      if (!BOTTLE_LABEL_INDICATORS[section] || !available[section] || seen.has(section)) return;
      seen.add(section);
      applications.push({ section, station: aggregate.number, angle: norm(aggregate.angle) });
    });
  return applications;
}

function bottleHasPassedApplication(tableAngle, applicationAngle) {
  return norm(tableAngle) + 0.001 >= norm(applicationAngle);
}

function bottlePreviewAngle(head, program = currentProgram()) {
  if (head?.head === 1 && state.previewBottleAngle !== null && state.previewBottleAngle !== "" && Number.isFinite(Number(state.previewBottleAngle))) {
    return Number(state.previewBottleAngle);
  }
  return plateAngleAt(head?.tableAngle, program);
}

function drawBottleLabelIndicators(add, bottleGroup, tableAngle) {
  bottleLabelApplications().forEach((application) => {
    const visual = BOTTLE_LABEL_INDICATORS[application.section];
    const start = visual.center - 45;
    const end = visual.center + 45;
    add("path", {
      d: bottleLocalArcPath(start, end, visual.innerRadius, visual.outerRadius),
      fill: visual.color,
      stroke: visual.color,
      "stroke-width": 0.4,
      "data-bottle-label-indicator": application.section,
      "data-application-angle": application.angle,
      "data-application-station": application.station,
      display: bottleHasPassedApplication(tableAngle, application.angle) ? "inline" : "none"
    }, bottleGroup);
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
  svg.innerHTML = "";
  const ns = "http://www.w3.org/2000/svg";
  const add = (name, attrs, parent = svg) => {
    const el = document.createElementNS(ns, name);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
    parent.appendChild(el);
    return el;
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
  // Configured wipe-down assemblies are drawn once by drawConfiguredAssemblies().
  // Hide their legacy map-point markers to avoid duplicate equipment overlays.
  const hiddenEquipmentIds = new Set(
    state.mapPoints
      .filter((point) => /Wipe-Down/i.test(point.name))
      .map((point) => point.id)
  );

  heads().forEach((h) => {
    const padAngle = bottlePreviewAngle(h);
    const servoSign = state.direction === "cw" ? -1 : 1;
    const referenceRotation = angleToSvgRotation(h.tableAngle) + servoSign * padAngle;
    const pad = add("g", { transform: `translate(${h.x} ${h.y}) rotate(${referenceRotation})`, "data-animation-head": h.head });
    add("circle", { cx: 0, cy: 0, r: 7.5, fill: "var(--map-head-fill)", stroke: "var(--map-head-stroke)", "stroke-width": 1.7 }, pad);
    drawBottleLabelIndicators(add, pad, h.tableAngle);
    add("line", { x1: 0, y1: 0, x2: 6.6, y2: 0, stroke: "#ad3434", "stroke-width": 2, "stroke-linecap": "round", "data-bottle-orientation": "true" }, pad);
    add("circle", { cx: 0, cy: 0, r: 2.2, fill: "var(--map-head-stroke)" }, pad);
  });
  const rotator = angleToXY(state.previewAngle, state.radius + MAP_ROTATOR_HANDLE_OFFSET);
  add("circle", { cx: rotator.x, cy: rotator.y, r: 5.5, fill: "#ffffff", stroke: "#d71920", "stroke-width": 2.5, class: "map-rotator-handle", "data-map-rotator-handle": "true", "aria-label": "Drag primary head around labeler" });

  state.mapPoints.forEach((point) => {
    // Cold Glue objects are rendered from the active Map Builder object list.
    // Skip the legacy assembly points so only the configured brushes and
    // rollers appear.
    if (state.applicationMode === "cold-glue") return;
    if (hiddenEquipmentIds.has(point.id)) return;
    const rotation = angleToSvgRotation(point.angle);
    if (/Spender/i.test(point.name)) return;

    if (/Roller/i.test(point.name)) {
      const rollerRadius = /\(Op Side\)/i.test(point.name) ? state.radius + state.depths.opRoller : state.radius + state.depths.nonOpRoller;
      const xy = angleToXY(point.angle, rollerRadius);
      const group = add("g", { transform: `translate(${xy.x} ${xy.y})` }, equipmentLayer);
      add("circle", { cx: 0, cy: 0, r: 12, fill: "#0d9b57", stroke: "#066b3b", "stroke-width": 2 }, group);
      add("circle", { cx: -4, cy: -4, r: 4, fill: "#78d9a8", "fill-opacity": 0.75 }, group);
      return;
    }

    if (/Inspection|Coding/i.test(point.name)) return;
  });

  const moveDistanceLayer = add("g", { "aria-label": "Active servo move distance overlay" });
  drawMoveDistanceOverlay(add, moveDistanceLayer, currentProgram());
  const allMovesLayer = add("g", { "aria-label": "All servo program moves overlay" });
  drawAllProgramMovesOverlay(add, allMovesLayer, currentProgram());

  const aggregateLayer = add("g", { "aria-label": "Enabled machine aggregates" });
  drawIndependentAggregates(add, aggregateLayer);
  const aggregateSpacingLayer = add("g", { "aria-label": "Aggregate centerline table-distance overlay" });
  drawAggregateSpacingOverlay(add, aggregateSpacingLayer);

  const configuredAssemblyLayer = add("g", { "aria-label": "Configured wipe-down assemblies" });
  drawConfiguredAssemblies(add, configuredAssemblyLayer);

  const centerReadout = add("g", { "aria-label": "Current table angle" });
  const centerAngleText = `${fmt(state.previewAngle, 1)} deg`;
  const centerAngleFontSize = Math.abs(state.previewAngle) >= 100 ? 14 : Math.abs(state.previewAngle) >= 10 ? 16 : 18;
  add("circle", { cx: 0, cy: 0, r: 39, fill: "var(--map-readout)", "fill-opacity": 0.96, stroke: "var(--map-ring)", "stroke-width": 1.5 }, centerReadout);
  add("text", { x: 0, y: -3, fill: "var(--map-text)", "font-size": centerAngleFontSize, "font-weight": 700, "text-anchor": "middle", "data-animation-center": "true" }, centerReadout).textContent = centerAngleText;
  add("text", { x: 0, y: 15, fill: "var(--map-muted)", "font-size": 10, "text-anchor": "middle" }, centerReadout).textContent = "TABLE ANGLE";

  const faultLayer = add("g", { "aria-label": "Servo move fault overlay" });
  drawFaultOverlay(add, faultLayer, currentProgram());
  svg.dataset.animationSegment = String(activeSegmentForProgram(currentProgram(), state.previewAngle)?.hmi ?? "none");
  renderLabelerMapReference();
}

function updateAnimatedSvg(svg, program, fallbackRender) {
  if (!svg) return;
  const active = activeSegmentForProgram(program, state.previewAngle);
  const segmentKey = String(active?.hmi ?? "none");
  const headNodes = svg.querySelectorAll("[data-animation-head]");
  if (svg.dataset.animationSegment !== segmentKey || headNodes.length !== state.headCount) {
    fallbackRender();
    return;
  }

  const previewLine = svg.querySelector("[data-animation-preview]");
  const preview = angleToXY(state.previewAngle, state.radius + 12);
  if (previewLine) {
    previewLine.setAttribute("x2", String(preview.x));
    previewLine.setAttribute("y2", String(preview.y));
  }

  const currentHeads = heads();
  const servoSign = state.direction === "cw" ? -1 : 1;
  headNodes.forEach((node, index) => {
    const head = currentHeads[index];
    if (!head) return;
    const padAngle = bottlePreviewAngle(head, program);
    const referenceRotation = angleToSvgRotation(head.tableAngle) + servoSign * padAngle;
    node.setAttribute("transform", `translate(${head.x} ${head.y}) rotate(${referenceRotation})`);
    node.querySelectorAll("[data-bottle-label-indicator]").forEach((indicator) => {
      const applicationAngle = num(indicator.getAttribute("data-application-angle"), 0);
      indicator.setAttribute("display", bottleHasPassedApplication(head.tableAngle, applicationAngle) ? "inline" : "none");
    });
  });
  const rotatorHandle = svg.querySelector("[data-map-rotator-handle]");
  if (rotatorHandle) {
    const rotator = angleToXY(state.previewAngle, state.radius + MAP_ROTATOR_HANDLE_OFFSET);
    rotatorHandle.setAttribute("cx", String(rotator.x));
    rotatorHandle.setAttribute("cy", String(rotator.y));
  }

  const center = svg.querySelector("[data-animation-center]");
  if (center) {
    center.textContent = `${fmt(state.previewAngle, 1)} deg`;
    center.setAttribute("font-size", String(Math.abs(state.previewAngle) >= 100 ? 14 : Math.abs(state.previewAngle) >= 10 ? 16 : 18));
  }

  const simulationAction = svg.querySelector("[data-animation-simulation-action]");
  if (simulationAction && active) simulationAction.textContent = `Simulation: HMI ${active.hmi} - ${active.action}`;
  const simulationPosition = svg.querySelector("[data-animation-simulation-position]");
  if (simulationPosition) simulationPosition.textContent = `${fmt(state.previewAngle, 1)} deg table / ${fmt(plateAngleAt(state.previewAngle, program), 1)} deg pad`;
}

function updateMapAnimationFrame() {
  const program = currentProgram();
  updateAnimatedSvg(els.mapSvg, program, renderMap);
}

function renderSimulationMap(program = simulationProgram()) {
  const svg = els.simulation?.querySelector("#simulationSvg");
  if (!svg) return;
  svg.innerHTML = "";
  const ns = "http://www.w3.org/2000/svg";
  const add = (name, attrs, parent = svg) => {
    const el = document.createElementNS(ns, name);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
    parent.appendChild(el);
    return el;
  };
  add("circle", { cx: 0, cy: 0, r: state.radius, fill: "var(--map-surface)", stroke: "var(--map-ring)", "stroke-width": 2 });
  const quadrantLayer = add("g", { "aria-label": "Table quadrant references" });
  drawMapQuadrantReferences(add, quadrantLayer);
  const zeroEnd = angleToXY(0, state.radius + 34);
  add("line", { x1: 0, y1: 0, x2: zeroEnd.x, y2: zeroEnd.y, stroke: "#28735a", "stroke-width": 3 });
  add("text", { x: zeroEnd.x + (state.direction === "cw" ? -42 : 8), y: zeroEnd.y - 8, fill: "#28735a", "font-size": 13 }).textContent = "0 deg";
  const preview = angleToXY(state.previewAngle, state.radius + 12);
  add("line", { x1: 0, y1: 0, x2: preview.x, y2: preview.y, stroke: "#ad3434", "stroke-width": 2, "stroke-dasharray": "6 5", "data-animation-preview": "true" });

  heads().forEach((h) => {
    const padAngle = bottlePreviewAngle(h, program);
    const servoSign = state.direction === "cw" ? -1 : 1;
    const referenceRotation = angleToSvgRotation(h.tableAngle) + servoSign * padAngle;
    const pad = add("g", { transform: `translate(${h.x} ${h.y}) rotate(${referenceRotation})`, "data-animation-head": h.head });
    add("circle", { cx: 0, cy: 0, r: 7.5, fill: "var(--map-head-fill)", stroke: "var(--map-head-stroke)", "stroke-width": 1.7 }, pad);
    drawBottleLabelIndicators(add, pad, h.tableAngle);
    add("line", { x1: 0, y1: 0, x2: 6.6, y2: 0, stroke: "#ad3434", "stroke-width": 2, "stroke-linecap": "round", "data-bottle-orientation": "true" }, pad);
    add("circle", { cx: 0, cy: 0, r: 2.2, fill: "var(--map-head-stroke)" }, pad);
  });

  const moveDistanceLayer = add("g", { "aria-label": "Active servo move distance overlay" });
  const rotator = angleToXY(state.previewAngle, state.radius + MAP_ROTATOR_HANDLE_OFFSET);
  add("circle", { cx: rotator.x, cy: rotator.y, r: 5.5, fill: "#ffffff", stroke: "#d71920", "stroke-width": 2.5, class: "map-rotator-handle", "data-map-rotator-handle": "true", "aria-label": "Drag primary head around labeler" });
  drawMoveDistanceOverlay(add, moveDistanceLayer, program);
  const allMovesLayer = add("g", { "aria-label": "All servo program moves overlay" });
  drawAllProgramMovesOverlay(add, allMovesLayer, program);

  const aggregateLayer = add("g", { "aria-label": "Enabled machine aggregates" });
  drawIndependentAggregates(add, aggregateLayer);

  const configuredAssemblyLayer = add("g", { "aria-label": "Configured wipe-down assemblies" });
  drawConfiguredAssemblies(add, configuredAssemblyLayer);

  const centerReadout = add("g", { "aria-label": "Current table angle" });
  const centerAngleText = `${fmt(state.previewAngle, 1)} deg`;
  const centerAngleFontSize = Math.abs(state.previewAngle) >= 100 ? 14 : Math.abs(state.previewAngle) >= 10 ? 16 : 18;
  add("circle", { cx: 0, cy: 0, r: 39, fill: "var(--map-readout)", "fill-opacity": 0.96, stroke: "var(--map-ring)", "stroke-width": 1.5 }, centerReadout);
  add("text", { x: 0, y: -3, fill: "var(--map-text)", "font-size": centerAngleFontSize, "font-weight": 700, "text-anchor": "middle", "data-animation-center": "true" }, centerReadout).textContent = centerAngleText;
  add("text", { x: 0, y: 15, fill: "var(--map-muted)", "font-size": 10, "text-anchor": "middle" }, centerReadout).textContent = "TABLE ANGLE";

  const faultLayer = add("g", { "aria-label": "Servo move fault overlay" });
  drawFaultOverlay(add, faultLayer, program);

  const active = activeSegmentForProgram(program, state.previewAngle);
  if (active) {
    add("text", { x: -345, y: -325, fill: "var(--map-text)", "font-size": 13, "font-weight": 700, "data-animation-simulation-action": "true" }).textContent = `Simulation: HMI ${active.hmi} - ${active.action}`;
    add("text", { x: -345, y: -305, fill: "var(--map-label)", "font-size": 12, "data-animation-simulation-position": "true" }).textContent = `${fmt(state.previewAngle, 1)} deg table / ${fmt(plateAngleAt(state.previewAngle, program), 1)} deg pad`;
  }
  svg.dataset.animationSegment = String(active?.hmi ?? "none");
}

function updateSimulationAnimationFrame() {
  const program = simulationProgram();
  const svg = els.simulation?.querySelector("#simulationSvg");
  updateAnimatedSvg(svg, program, () => renderSimulationMap(program));
}

function applicationMapPointRows() {
  if (state.applicationMode === "cold-glue") return coldGlueMapRows();
  const rows = [];
  const addRow = (name, angle, update, station = null) => rows.push({ name, angle, update, station });
  const sideLabel = (side) => side === "inner" ? "Inner" : "Outer";

  state.assemblies.map(normalizeAssembly).forEach((assembly, index) => {
    state.assemblies[index] = assembly;
    if (!assembly.enabled || assembly.type === "none" || !assembly.sides.length) return;

    const applicatorPointName = state.applicationMode === "cold-glue"
      ? `Cold Glue Agg ${assembly.station} Pallet Position`
      : `Agg ${assembly.station} Spender Plate Position`;
    addRow(applicatorPointName, assembly.spenderAngle, (value) => {
      assembly.spenderAngle = value;
      state.assemblies[index] = assembly;
    }, assembly.station);

    if (state.applicationMode === "apl" && assembly.type === "rollers") {
      if (assembly.sides.includes("outer")) {
        assembly.outerRollerAngles.forEach((angle, rollerIndex) => addRow(
          `Wipe-Down Agg ${assembly.station} Roller ${rollerIndex + 1} Center (Outer)`,
          angle,
          (value) => { assembly.outerRollerAngles[rollerIndex] = value; state.assemblies[index] = assembly; },
          assembly.station
        ));
      }
      if (assembly.sides.includes("inner")) {
        assembly.innerRollerAngles.forEach((angle, rollerIndex) => addRow(
          `Wipe-Down Agg ${assembly.station} Roller ${rollerIndex + 3} Center (Inner)`,
          angle,
          (value) => { assembly.innerRollerAngles[rollerIndex] = value; state.assemblies[index] = assembly; },
          assembly.station
        ));
      }
    }

    if (state.applicationMode === "apl" && assembly.type === "pads") {
      assembly.sides.forEach((side) => {
        const currentWindow = padAnglesForSide(assembly, side);
        addRow(`Wipe-Down Agg ${assembly.station} ${sideLabel(side)} Pad Position Start`, currentWindow[0], (value) => {
          if (side === "inner" && assembly.sides.includes("outer")) {
            assembly.padSideOffsetDeg = Math.max(0, value - padStartAngle(assembly));
          } else {
            assembly.spenderAngle = value - mmToTableDegrees(state.padClearanceMm);
          }
          state.assemblies[index] = assembly;
        }, assembly.station);
        addRow(`Wipe-Down Agg ${assembly.station} ${sideLabel(side)} Pad Position Stop`, currentWindow[1], (value) => {
          const start = padAnglesForSide(assembly, side)[0];
          assembly.padSpanDeg = Math.max(0.1, value - start);
          state.assemblies[index] = assembly;
        }, assembly.station);
      });
    }

    if (state.applicationMode === "cold-glue" && assembly.type === "brushes") {
      assembly.sides.forEach((side) => {
        const key = side === "inner" ? "innerBrushAngles" : "outerBrushAngles";
        addRow(`Cold Glue Agg ${assembly.station} ${sideLabel(side)} Brush Position Start`, assembly[key][0], (value) => {
          assembly[key][0] = value;
          assembly.brushStartAngle = Math.min(...assembly.outerBrushAngles, ...assembly.innerBrushAngles);
          state.assemblies[index] = assembly;
        }, assembly.station);
        addRow(`Cold Glue Agg ${assembly.station} ${sideLabel(side)} Brush Position Stop`, assembly[key][1], (value) => {
          assembly[key][1] = value;
          assembly.brushEndAngle = Math.max(...assembly.outerBrushAngles, ...assembly.innerBrushAngles);
          state.assemblies[index] = assembly;
        }, assembly.station);
      });
    }
  });

  // Non-station map points remain available in both application modes.
  state.mapPoints.filter((point) => !mapPointStation(point.name)).forEach((point) => {
    addRow(point.name, point.angle, (value) => { point.angle = value; });
  });
  return rows;
}

function labelerMapReferenceRows() {
  return permanentLabelerMapReferencePoints.map((point) => ({ ...point }));
}

function renderLabelerMapReference() {
  if (!els.labelerMapReferenceBody) return;
  if (els.labelerMapReferenceName) els.labelerMapReferenceName.textContent = "Permanent map-building reference • read only";
  els.labelerMapReferenceBody.innerHTML = "";
  labelerMapReferenceRows().forEach((point) => {
    const row = document.createElement("tr");
    const name = document.createElement("td");
    const angle = document.createElement("td");
    name.textContent = point.name;
    angle.textContent = fmt(point.angle, 1);
    angle.className = "num";
    row.append(name, angle);
    els.labelerMapReferenceBody.appendChild(row);
  });
}
