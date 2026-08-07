"use strict";

(function installSimulationMapSceneRenderer(global) {
  const ROTATOR_HANDLE_OFFSET = 40;

  function renderSimulationMap(program = simulationProgram()) {
    const svg = els.simulation?.querySelector("#simulationSvg");
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

    bottleHeads.forEach((head) => {
      const padAngle = bottlePreviewAngle(head, program);
      const servoSign = state.direction === "cw" ? -1 : 1;
      const referenceRotation = angleToSvgRotation(head.tableAngle) + servoSign * padAngle;
      const bottle = add("g", { transform: `translate(${head.x} ${head.y}) rotate(${referenceRotation})`, "data-animation-head": head.head });
      drawTopViewBottle(add, bottle, head.tableAngle);
    });

    const moveDistanceLayer = add("g", { "aria-label": "Active servo move distance overlay" });
    const rotator = angleToXY(state.previewAngle, state.radius + ROTATOR_HANDLE_OFFSET);
    add("circle", { cx: rotator.x, cy: rotator.y, r: 5.5, fill: "#ffffff", stroke: "#d71920", "stroke-width": 2.5, class: "map-rotator-handle", "data-map-rotator-handle": "true", "aria-label": "Drag primary head around labeler" });
    drawMoveDistanceOverlay(add, moveDistanceLayer, program);
    const allMovesLayer = add("g", { "aria-label": "All servo program moves overlay" });
    drawAllProgramMovesOverlay(add, allMovesLayer, program);

    const aggregateLayer = add("g", { "aria-label": "Enabled machine aggregates" });
    drawIndependentAggregates(add, aggregateLayer);
    const configuredAssemblyLayer = add("g", { "aria-label": "Configured wipe-down assemblies" });
    drawConfiguredAssemblies(add, configuredAssemblyLayer);

    const centerReadout = add("g", { "aria-label": "Current table angle" });
    const centerAngleFontSize = Math.abs(state.previewAngle) >= 100 ? 14 : Math.abs(state.previewAngle) >= 10 ? 16 : 18;
    add("circle", { cx: 0, cy: 0, r: 39, fill: "var(--map-readout)", "fill-opacity": 0.96, stroke: "var(--map-ring)", "stroke-width": 1.5 }, centerReadout);
    add("text", { x: 0, y: -3, fill: "var(--map-text)", "font-size": centerAngleFontSize, "font-weight": 700, "text-anchor": "middle", "data-animation-center": "true" }, centerReadout).textContent = `${fmt(state.previewAngle, 1)} deg`;
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

  global.renderSimulationMap = renderSimulationMap;
  global.LabelerSimulationMapSceneRenderer = Object.freeze({
    renderSimulationMap,
    premiumBottleTableV1: true,
    synchronizedBottlePocketsV1: true,
    amberBottleBlueCapV1: true
  });
})(window);