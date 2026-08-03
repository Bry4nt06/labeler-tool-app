"use strict";

(function installMapOverlayRenderer(global) {
  const QUADRANT_REFERENCES = Object.freeze([90, 180, 270, 359.9]);

  function drawMapQuadrantReferences(add, parent) {
    if (!state.showQuadrantReferences) return;
    QUADRANT_REFERENCES.forEach((angle) => {
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
    const gaps = typeof aggregateCenterlineGaps === "function"
      ? aggregateCenterlineGaps().filter((gap) => !gap.wrapsToFirst)
      : [];
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

  global.drawMapQuadrantReferences = drawMapQuadrantReferences;
  global.drawAggregateSpacingOverlay = drawAggregateSpacingOverlay;
  global.LabelerMapOverlayRenderer = Object.freeze({
    quadrantReferences: QUADRANT_REFERENCES,
    drawMapQuadrantReferences,
    drawAggregateSpacingOverlay
  });
})(window);
