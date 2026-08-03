"use strict";

(function installAssemblyModelDriver(global) {
  if (global.LabelerAssemblyModelDriver) return;

  function normalizeAssembly(assembly, { defaults = [], number = Number } = {}) {
    const normalized = { ...assembly };
    if (normalized.type === "inner-pads") {
      normalized.type = "pads";
      normalized.sides = ["inner"];
    }
    if (!Array.isArray(normalized.sides)) {
      const legacySide = String(normalized.side || "").toLowerCase();
      normalized.sides = legacySide.includes("inner") ? ["inner"] : legacySide.includes("outer") ? ["outer"] : [];
    }
    normalized.sides = [...new Set(normalized.sides.filter((side) => side === "inner" || side === "outer"))];
    if (!normalized.type || normalized.type === "none" || !normalized.sides.length) {
      normalized.type = "none";
      normalized.sides = [];
    }

    const stationIndex = Math.max(0, Math.min(defaults.length - 1, Number(normalized.station || 1) - 1));
    const fallback = defaults[stationIndex] || {
      station: stationIndex + 1,
      spenderAngle: 0,
      innerRollerAngles: [0, 0],
      outerRollerAngles: [0, 0],
      padSpanDeg: 20,
      padSideOffsetDeg: 3,
      brushStartAngle: 0,
      brushEndAngle: 20
    };

    normalized.spenderAngle = number(normalized.spenderAngle, fallback.spenderAngle);
    normalized.innerRollerAngles = Array.isArray(normalized.innerRollerAngles)
      ? normalized.innerRollerAngles.slice(0, 2).map((value, index) => number(value, fallback.innerRollerAngles[index]))
      : [...fallback.innerRollerAngles];
    normalized.outerRollerAngles = Array.isArray(normalized.outerRollerAngles)
      ? normalized.outerRollerAngles.slice(0, 2).map((value, index) => number(value, fallback.outerRollerAngles[index]))
      : [...fallback.outerRollerAngles];
    while (normalized.innerRollerAngles.length < 2) normalized.innerRollerAngles.push(fallback.innerRollerAngles[normalized.innerRollerAngles.length]);
    while (normalized.outerRollerAngles.length < 2) normalized.outerRollerAngles.push(fallback.outerRollerAngles[normalized.outerRollerAngles.length]);

    normalized.padSpanDeg = number(
      normalized.padSpanDeg,
      Math.max(1, number(normalized.endAngle, fallback.brushEndAngle) - number(normalized.startAngle, fallback.brushStartAngle))
    );
    normalized.padSideOffsetDeg = Math.max(0, number(normalized.padSideOffsetDeg, number(fallback.padSideOffsetDeg, 3)));
    normalized.brushStartAngle = number(normalized.brushStartAngle, number(normalized.startAngle, fallback.brushStartAngle));
    normalized.brushEndAngle = number(normalized.brushEndAngle, number(normalized.endAngle, fallback.brushEndAngle));

    const brushMid = (normalized.brushStartAngle + normalized.brushEndAngle) / 2;
    const fallbackOuterBrush = [normalized.brushStartAngle, brushMid];
    const fallbackInnerBrush = [brushMid, normalized.brushEndAngle];
    normalized.outerBrushAngles = Array.isArray(normalized.outerBrushAngles)
      ? normalized.outerBrushAngles.slice(0, 2).map((value, index) => number(value, fallbackOuterBrush[index]))
      : fallbackOuterBrush;
    normalized.innerBrushAngles = Array.isArray(normalized.innerBrushAngles)
      ? normalized.innerBrushAngles.slice(0, 2).map((value, index) => number(value, fallbackInnerBrush[index]))
      : fallbackInnerBrush;
    while (normalized.outerBrushAngles.length < 2) normalized.outerBrushAngles.push(fallbackOuterBrush[normalized.outerBrushAngles.length]);
    while (normalized.innerBrushAngles.length < 2) normalized.innerBrushAngles.push(fallbackInnerBrush[normalized.innerBrushAngles.length]);
    normalized.brushStartAngle = Math.min(...normalized.outerBrushAngles, ...normalized.innerBrushAngles);
    normalized.brushEndAngle = Math.max(...normalized.outerBrushAngles, ...normalized.innerBrushAngles);
    return normalized;
  }

  function typeLabel(type) {
    return ({ rollers: "Rollers", pads: "Wipe-down pads", brushes: "Brushes", none: "Removed" })[type] || type;
  }

  function positionLabel(assembly) {
    const sides = assembly?.sides || [];
    if (sides.length === 2) return "Inner + outer";
    if (sides[0] === "inner") return "Inner";
    if (sides[0] === "outer") return "Outer";
    return "Select assembly";
  }

  function selectValue(assembly) {
    if (!assembly?.enabled || assembly.type === "none" || !assembly.sides?.length) return "none";
    const hasInner = assembly.sides.includes("inner");
    const hasOuter = assembly.sides.includes("outer");
    const position = hasInner && hasOuter ? "both" : hasInner ? "inner" : "outer";
    return `${assembly.type}:${position}`;
  }

  const api = Object.freeze({
    normalizeAssembly,
    typeLabel,
    positionLabel,
    selectValue
  });

  global.LabelerAssemblyModelDriver = api;
  global.LabelerDriverRegistry?.register("assembly.model", api, {
    dependencies: [],
    stage: "assembly-model"
  });
})(window);
