"use strict";

(function installMapAnimationRenderer(global) {
  const ROTATOR_HANDLE_OFFSET = 40;

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
      const rotator = angleToXY(state.previewAngle, state.radius + ROTATOR_HANDLE_OFFSET);
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

  function updateSimulationAnimationFrame() {
    const program = simulationProgram();
    const svg = els.simulation?.querySelector("#simulationSvg");
    updateAnimatedSvg(svg, program, () => renderSimulationMap(program));
  }

  global.updateAnimatedSvg = updateAnimatedSvg;
  global.updateMapAnimationFrame = updateMapAnimationFrame;
  global.updateSimulationAnimationFrame = updateSimulationAnimationFrame;
  global.LabelerMapAnimationRenderer = Object.freeze({
    updateAnimatedSvg,
    updateMapAnimationFrame,
    updateSimulationAnimationFrame
  });
})(window);
