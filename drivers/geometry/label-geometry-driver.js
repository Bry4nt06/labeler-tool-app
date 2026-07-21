(function (global) {
  "use strict";
  function finite(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
  function positive(value, fallback = null) { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : fallback; }
  function effectiveDiameterMm(bottle) { const d = positive(bottle?.diameterTargetMm); return d ? d - Math.max(0, finite(bottle?.radiusReductionMm)) * 2 : null; }
  function circumferenceFromDiameterMm(diameterMm) { const d = positive(diameterMm); return d ? Math.PI * d : null; }
  function bodyCircumferenceMm(bottle) { return circumferenceFromDiameterMm(effectiveDiameterMm(bottle)); }
  function degreesFromMm(lengthMm, circumferenceMm) { const c = positive(circumferenceMm); const l = Number(lengthMm); return c && Number.isFinite(l) ? (l / c) * 360 : null; }
  function mmFromDegrees(degrees, circumferenceMm) { const c = positive(circumferenceMm); const d = Number(degrees); return c && Number.isFinite(d) ? (d / 360) * c : null; }
  function tableDegreesFromArcMm(arcMm, pitchRadiusMm) { const r = positive(pitchRadiusMm); const a = Number(arcMm); return r && Number.isFinite(a) ? (a / (2 * Math.PI * r)) * 360 : null; }
  function tableArcMmFromDegrees(degrees, pitchRadiusMm) { const r = positive(pitchRadiusMm); const d = Number(degrees); return r && Number.isFinite(d) ? (d / 360) * 2 * Math.PI * r : null; }
  function scaleTableAngle(angle, options) { const current = positive(options?.currentPitchRadiusMm); const reference = positive(options?.referencePitchRadiusMm); const zero = finite(options?.zeroAngle, 0); const raw = Number(angle); return Number.isFinite(raw) && current && reference && options?.enabled !== false ? zero + (raw - zero) * (reference / current) : raw; }
  function encoderCountsFromPlateDegrees(plateDegrees, encoderCountsPerRev, gearRatio = 1) { const counts = positive(encoderCountsPerRev); const ratio = positive(gearRatio, 1); const deg = Number(plateDegrees); return counts && Number.isFinite(deg) ? (deg / 360) * counts * ratio : null; }
  function solveSection(options) {
    const mode = options?.mode === "leading-edge" ? "leading-edge" : "center-tack-two-stage";
    const labelDeg = degreesFromMm(options?.labelLengthMm, options?.circumferenceMm);
    const contactDeg = Math.max(0, finite(degreesFromMm(options?.contactMm, options?.circumferenceMm), 0));
    const explicitOverWipeDeg = Number(options?.overWipeDeg);
    const overWipeDeg = Math.max(0, Number.isFinite(explicitOverWipeDeg)
      ? explicitOverWipeDeg
      : finite(degreesFromMm(options?.overWipeMm, options?.circumferenceMm), 0));
    if (!Number.isFinite(labelDeg)) return null;
    if (mode === "center-tack-two-stage") {
      const stageRequired = labelDeg / 2 + overWipeDeg;
      return { mode, labelDeg, contactDeg, overWipeDeg, baseCoveragePerStage: labelDeg / 2, stageRequired, baseCoverageRequired: labelDeg, overWipeRequired: overWipeDeg * 2, totalRequired: stageRequired * 2, stages: [{ key: "outer", requiredRotation: stageRequired }, { key: "inner", requiredRotation: stageRequired }] };
    }
    // Workbook leading-edge sequence:
    //   1. back-spin by contact + one over-wipe allowance
    //   2. forward wipe by the full label + two over-wipe allowances
    const backSpinRequired = contactDeg + overWipeDeg;
    const forwardWipeRequired = labelDeg + overWipeDeg * 2;
    return { mode, labelDeg, contactDeg, overWipeDeg, contactSetDown: contactDeg, backSpinRequired, forwardWipeRequired, baseCoverageRequired: labelDeg + contactDeg, overWipeRequired: overWipeDeg * 3, stageRequired: forwardWipeRequired, totalRequired: backSpinRequired + forwardWipeRequired, stages: [{ key: "set-down", requiredRotation: backSpinRequired }, { key: "wipe", requiredRotation: forwardWipeRequired }] };
  }
  function planTwoSurfaceWipe(options) {
    const labelDeg = Math.max(0, finite(options?.labelDeg, 0));
    const totalRequired = Math.max(0, finite(options?.totalRequired, 0));
    const preferredOutside = Math.max(0, Math.min(totalRequired, finite(options?.preferredOutside, totalRequired / 2)));
    const outsideSpan = Math.max(0, finite(options?.outsideSpan, 0));
    const insideSpan = Math.max(0, finite(options?.insideSpan, 0));
    const maxRatio = positive(options?.maxRatio, 21);
    const safetyFactor = Math.min(0.98, Math.max(0.25, finite(options?.safetyFactor, 0.9)));
    const safeRatio = maxRatio * safetyFactor;
    const outsideCapacity = outsideSpan * safeRatio;
    const insideCapacity = insideSpan * safeRatio;
    const minimumOutside = Math.max(0, totalRequired - insideCapacity);
    const maximumOutside = Math.min(totalRequired, outsideCapacity);
    const outsideRotation = Math.min(maximumOutside, Math.max(minimumOutside, preferredOutside));
    const insideRotation = Math.max(0, totalRequired - outsideRotation);
    const shortfall = Math.max(0, totalRequired - outsideCapacity - insideCapacity);
    return {
      longWrap: labelDeg > 360,
      labelDeg,
      totalRequired,
      preferredOutside,
      outsideRotation,
      insideRotation,
      outsideSpan,
      insideSpan,
      outsideCapacity,
      insideCapacity,
      outsideRequiredTableSpan: outsideRotation / safeRatio,
      insideRequiredTableSpan: insideRotation / safeRatio,
      safeRatio,
      shortfall,
      fits: shortfall <= 0.001
    };
  }
  function planColdGlueSection(options) {
    const labelDeg = Math.max(0, finite(options?.labelDeg, 0));
    const overWipeDeg = Math.max(0, finite(options?.overWipeDeg, 0));
    const maxRatio = positive(options?.maxRatio, 21);
    const safetyFactor = Math.min(0.98, Math.max(0.25, finite(options?.safetyFactor, 0.9)));
    const windows = Array.isArray(options?.windows) ? options.windows.map((window) => ({
      ...window,
      span: Math.max(0, finite(window?.end) - finite(window?.start))
    })) : [];
    const halfCoverage = labelDeg / 2;
    const stageRequired = halfCoverage + overWipeDeg;
    const fullWrap = labelDeg >= 330;
    const outside = windows.filter((window) => window.stage === "outer");
    const inside = windows.filter((window) => window.stage === "inner");

    function allocate(required, candidates) {
      let remaining = Math.max(0, required);
      const allocations = [];
      const usable = candidates.filter((window) => window.span > 0);
      const totalSpan = usable.reduce((sum, window) => sum + window.span, 0);
      usable.forEach((window, index) => {
        const capacity = window.span * maxRatio * safetyFactor;
        const proportional = totalSpan > 0 ? required * (window.span / totalSpan) : 0;
        const amount = index === usable.length - 1
          ? Math.min(capacity, remaining)
          : Math.min(capacity, remaining, proportional);
        allocations.push({ ...window, rotation: amount, ratio: window.span > 0 ? amount / window.span : Infinity });
        remaining -= amount;
      });
      if (remaining > 0.001 && usable.length) {
        for (const allocation of allocations) {
          const capacity = allocation.span * maxRatio * safetyFactor;
          const spare = Math.max(0, capacity - allocation.rotation);
          const add = Math.min(spare, remaining);
          allocation.rotation += add;
          allocation.ratio = allocation.rotation / allocation.span;
          remaining -= add;
          if (remaining <= 0.001) break;
        }
      }
      return { allocations, remaining: Math.max(0, remaining) };
    }

    const outsidePlan = allocate(stageRequired, outside);
    // After the outside brush carries the center-tacked label slightly past
    // one edge, the plate reverses through the complete label and both
    // over-wipe allowances to finish slightly past the opposite edge.
    const insideRequired = labelDeg + overWipeDeg * 2;
    const insideCandidates = fullWrap ? inside : inside.filter((window) => window.role !== "final-neck");
    const insidePlan = allocate(insideRequired, insideCandidates.length ? insideCandidates : inside);
    const issues = [];
    if (outsidePlan.remaining > 0.001) issues.push({ level: "bad", code: "cold-glue-outer-capacity", message: `Outside brush windows are short by ${outsidePlan.remaining.toFixed(1)} deg of bottle rotation.` });
    if (insidePlan.remaining > 0.001) issues.push({ level: "bad", code: "cold-glue-inner-capacity", message: `Inside brush windows are short by ${insidePlan.remaining.toFixed(1)} deg of bottle rotation.` });
    return {
      labelDeg, overWipeDeg, halfCoverage, stageRequired, fullWrap,
      outside: outsidePlan.allocations, inside: insidePlan.allocations,
      insideRequired, totalRequired: stageRequired + insideRequired,
      issues
    };
  }
  global.LabelerGeometryDriver = { effectiveDiameterMm, circumferenceFromDiameterMm, bodyCircumferenceMm, degreesFromMm, mmFromDegrees, tableDegreesFromArcMm, tableArcMmFromDegrees, scaleTableAngle, encoderCountsFromPlateDegrees, solveSection, planTwoSurfaceWipe, planColdGlueSection };
})(window);
