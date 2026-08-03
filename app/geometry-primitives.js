"use strict";

function fmt(value, decimals = 2) {
  return Number.isFinite(value) ? value.toFixed(decimals).replace(/\.?0+$/, "") : "";
}

function norm(angle) {
  const value = angle % 360;
  return value < 0 ? value + 360 : value;
}

function angleToXY(angle, radius) {
  const signed = state.direction === "cw" ? -1 : 1;
  const zeroBase = state.direction === "cw" ? 180 : 0;
  const rad = ((norm(zeroBase + state.zeroAngle + signed * angle)) * Math.PI) / 180;
  return { x: Math.cos(rad) * radius, y: Math.sin(rad) * radius };
}

function angleToSvgRotation(angle) {
  const signed = state.direction === "cw" ? -1 : 1;
  const zeroBase = state.direction === "cw" ? 180 : 0;
  return norm(zeroBase + state.zeroAngle + signed * angle);
}

function arcPath(startAngle, endAngle, innerRadius, outerRadius) {
  const startOuter = angleToXY(startAngle, outerRadius);
  const endOuter = angleToXY(endAngle, outerRadius);
  const startInner = angleToXY(startAngle, innerRadius);
  const endInner = angleToXY(endAngle, innerRadius);
  const span = Math.abs(endAngle - startAngle);
  const largeArc = span > 180 ? 1 : 0;
  const sweepOuter = state.direction === "cw" ? 0 : 1;
  const sweepInner = sweepOuter ? 0 : 1;
  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} ${sweepOuter} ${endOuter.x} ${endOuter.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} ${sweepInner} ${startInner.x} ${startInner.y}`,
    "Z"
  ].join(" ");
}

function bodyDiameter(spec) { return window.LabelerGeometryDriver?.effectiveDiameterMm(spec) ?? null; }

function bodyCircumference(spec) { return window.LabelerGeometryDriver?.bodyCircumferenceMm(spec) ?? null; }
