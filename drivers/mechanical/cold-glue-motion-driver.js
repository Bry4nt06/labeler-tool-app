(function (global) {
  "use strict";

  function finite(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function normalizeBrush(item, index) {
    const start = finite(item?.start, 0);
    const end = Math.max(start + 0.001, finite(item?.end, start + 1));
    const side = item?.side === "inner" ? "inner" : "outer";
    const role = ["process", "final", "hold"].includes(item?.role) ? item.role : "process";
    return {
      ...item,
      index,
      start,
      end,
      span: end - start,
      side,
      role,
      holdBottleAngle: Boolean(item?.holdBottleAngle),
      holdAngle: finite(item?.bottleHoldAngleDeg, 90),
      holdCurrent: Boolean(item?.holdCurrentBottleAngle),
      holdStart: Math.max(start, Math.min(end, finite(item?.bottleHoldStartDeg, start))),
      direction: side === "inner" ? 1 : -1,
      coveragePercent: Math.max(0, Math.min(100, finite(item?.coveragePercent, NaN)))
    };
  }

  function allocateAcrossWindows(required, windows, maxRatio, safetyFactor) {
    let remaining = Math.max(0, required);
    const allocations = [];
    const usable = windows.filter((window) => window.span > 0.001 && window.role !== "hold");
    const totalWeight = usable.reduce((sum, window) => {
      const explicit = Number.isFinite(window.coveragePercent) && window.coveragePercent > 0 ? window.coveragePercent : null;
      return sum + (explicit === null ? window.span : Math.max(0.001, explicit));
    }, 0);

    usable.forEach((window, index) => {
      const explicit = Number.isFinite(window.coveragePercent) && window.coveragePercent > 0 ? window.coveragePercent : null;
      const weight = explicit === null ? window.span : Math.max(0.001, explicit);
      const requested = index === usable.length - 1 ? remaining : required * (weight / Math.max(0.001, totalWeight));
      const capacity = window.span * maxRatio * safetyFactor;
      const rotation = Math.min(remaining, requested, capacity);
      allocations.push({ ...window, rotation, ratio: rotation / window.span });
      remaining -= rotation;
    });

    if (remaining > 0.001) {
      for (const allocation of allocations) {
        const capacity = allocation.span * maxRatio * safetyFactor;
        const spare = Math.max(0, capacity - allocation.rotation);
        const added = Math.min(spare, remaining);
        allocation.rotation += added;
        allocation.ratio = allocation.rotation / allocation.span;
        remaining -= added;
        if (remaining <= 0.001) break;
      }
    }
    return { allocations, remaining: Math.max(0, remaining) };
  }

  function collapseSharedOppositeChannels(brushes) {
    const consumed = new Set();
    const channels = [];
    brushes.forEach((brush, index) => {
      if (consumed.has(index)) return;
      const oppositeIndex = brushes.findIndex((candidate, candidateIndex) =>
        candidateIndex !== index &&
        !consumed.has(candidateIndex) &&
        candidate.side !== brush.side &&
        Math.min(candidate.end, brush.end) > Math.max(candidate.start, brush.start) + 0.001
      );
      if (oppositeIndex < 0) {
        channels.push(brush);
        consumed.add(index);
        return;
      }
      const opposite = brushes[oppositeIndex];
      consumed.add(index);
      consumed.add(oppositeIndex);
      const start = Math.max(brush.start, opposite.start);
      const end = Math.min(brush.end, opposite.end);
      channels.push({
        ...brush,
        id: `${brush.id || index}+${opposite.id || oppositeIndex}`,
        start,
        end,
        span: end - start,
        role: brush.role === "final" || opposite.role === "final" ? "final" : "process",
        coveragePercent: Number.isFinite(brush.coveragePercent) ? brush.coveragePercent : opposite.coveragePercent,
        pairedOppositeChannel: true
      });
    });
    return channels.sort((a, b) => a.start - b.start || a.end - b.end);
  }

  function flowFacingTarget(applicationPlateDeg, mapDirection = "cw", labelDeg = 0) {
    if (finite(labelDeg, 0) >= 330) return 0;
    // Cold Glue only: the bottle must enter a brush channel with the freshly
    // tacked label edge pointing downstream. Plate angle is relative to the
    // rotating table, so the downstream tangent is a fixed quarter-turn from
    // the radial zero. Do not add the application plate angle here: doing that
    // carries the pickup/application offset into the channel and can present the
    // loose label edge upstream, allowing the first brush to peel the label off.
    //
    // The map renderer's positive table direction is opposite the plate-axis
    // sign, therefore CCW bottle flow requires +90 deg plate orientation and CW
    // bottle flow requires -90 deg.
    void applicationPlateDeg;
    return mapDirection === "ccw" ? 90 : -90;
  }

  function applicationTarget(baseTargetDeg, mapDirection = "cw", labelDeg = 0) {
    // The proven Autocol full-wrap setup tacks the neck label at 120 degrees.
    // Mirror the sign when the machine direction is reversed.
    if (finite(labelDeg, 0) >= 330) return mapDirection === "ccw" ? 120 : -120;
    return finite(baseTargetDeg, 0);
  }

  function createPlan(options) {
    const labelDeg = Math.max(0, finite(options?.labelDeg, 0));
    const overWipeDeg = Math.max(0, finite(options?.overWipeDeg, 0));
    const fullWrap = labelDeg >= 330;
    const mapDirection = options?.mapDirection === "ccw" ? "ccw" : "cw";
    const maxRatio = Math.max(0.1, finite(options?.maxRatio, 21));
    const safetyFactor = Math.max(0.25, Math.min(0.98, finite(options?.safetyFactor, 0.9)));
    const normalizedBrushes = (Array.isArray(options?.brushes) ? options.brushes : [])
      .map(normalizeBrush)
      .filter((brush) => brush.end > brush.start)
      .sort((a, b) => a.start - b.start || a.end - b.end);
    const holds = [];
    const wipeBrushes = normalizedBrushes.flatMap((brush) => {
      if (brush.role === "hold") {
        holds.push({ ...brush, start: brush.start, end: brush.end, span: brush.span });
        return [];
      }
      if (!brush.holdBottleAngle) return [brush];
      if (brush.holdStart < brush.end - 0.001) holds.push({ ...brush, start: brush.holdStart, end: brush.end, span: brush.end - brush.holdStart });
      return brush.holdStart > brush.start + 0.001 ? [{ ...brush, end: brush.holdStart, span: brush.holdStart - brush.start }] : [];
    });
    const hasSharedOppositeChannel = wipeBrushes.some((brush, index) => wipeBrushes.some((candidate, candidateIndex) =>
      candidateIndex !== index &&
      candidate.side !== brush.side &&
      Math.min(candidate.end, brush.end) > Math.max(candidate.start, brush.start) + 0.001
    ));
    const brushes = hasSharedOppositeChannel ? collapseSharedOppositeChannels(wipeBrushes) : wipeBrushes;
    const centerTackTwoSided = fullWrap;
    const simultaneousOppositeWipe = hasSharedOppositeChannel;
    // A long center-tack neck label has two loose halves. Each half must be
    // wiped completely, and the plate must reverse between the outside and
    // inside brush channels. The center is already attached, so do not add the
    // leading-edge over-wipe allowance used by body/back labels.
    const totalRotation = centerTackTwoSided ? labelDeg : simultaneousOppositeWipe ? labelDeg / 2 + overWipeDeg : labelDeg + overWipeDeg * 2;
    const defaultPartialPercent = Math.max(5, Math.min(95, finite(options?.partialCoveragePercent, 50)));
    if (simultaneousOppositeWipe) {
      const direction = mapDirection === "ccw" ? 1 : -1;
      brushes.forEach((brush) => { brush.direction = direction; });
    }

    const issues = [];
    if (!brushes.length) {
      return { labelDeg, overWipeDeg, totalRotation, process: [], final: [], holds, issues: holds.length ? [] : [{ level: "bad", code: "cold-glue-no-brushes", message: "No brush windows are assigned to this Cold Glue station." }] };
    }

    let finalBrushes = brushes.filter((brush) => brush.role === "final");
    let processBrushes = brushes.filter((brush) => brush.role === "process");
    if (!finalBrushes.length) {
      finalBrushes = [brushes[brushes.length - 1]];
      processBrushes = brushes.slice(0, -1).filter((brush) => brush.role !== "hold");
    }
    if (!processBrushes.length && brushes.length > 1) processBrushes = brushes.slice(0, -1);

    const explicitProcessPercent = processBrushes
      .filter((brush) => Number.isFinite(brush.coveragePercent))
      .reduce((sum, brush) => sum + brush.coveragePercent, 0);
    const partialPercent = centerTackTwoSided ? 50 : explicitProcessPercent > 0 ? Math.max(5, Math.min(95, explicitProcessPercent)) : defaultPartialPercent;
    const processRequired = totalRotation * partialPercent / 100;
    const finalRequired = Math.max(0, totalRotation - processRequired);

    const processPlan = allocateAcrossWindows(processRequired, processBrushes, maxRatio, safetyFactor);
    const finalPlan = allocateAcrossWindows(finalRequired + processPlan.remaining, finalBrushes, maxRatio, safetyFactor);

    if (centerTackTwoSided) {
      const firstDirection = mapDirection === "ccw" ? 1 : -1;
      processPlan.allocations.forEach((allocation) => { allocation.direction = firstDirection; });
      finalPlan.allocations.forEach((allocation) => { allocation.direction = -firstDirection; });
    }

    if (processPlan.remaining > 0.001 && !finalBrushes.length) {
      issues.push({ level: "bad", code: "cold-glue-process-capacity", message: `Brush channels are short by ${processPlan.remaining.toFixed(1)} deg of bottle rotation.` });
    }
    if (finalPlan.remaining > 0.001) {
      issues.push({ level: "bad", code: "cold-glue-final-capacity", message: `Final brush is short by ${finalPlan.remaining.toFixed(1)} deg of bottle rotation.` });
    }

    return {
      labelDeg,
      overWipeDeg,
      totalRotation,
      fullWrap,
      centerTackTwoSided,
      simultaneousOppositeWipe,
      brushEntryLeadDeg: fullWrap ? 10 : 0,
      finalPlateTravel: centerTackTwoSided ? 0 : (mapDirection === "ccw" ? 1 : -1) * totalRotation,
      partialCoveragePercent: partialPercent,
      processRequired,
      finalRequired,
      process: processPlan.allocations,
      final: finalPlan.allocations,
      holds,
      issues
    };
  }

  global.LabelerColdGlueMotionDriver = { createPlan, flowFacingTarget, applicationTarget };
})(window);
