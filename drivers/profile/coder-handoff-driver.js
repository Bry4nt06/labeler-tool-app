"use strict";

(function installCoderHandoffDriver(global) {
  if (global.LabelerCoderHandoffDriver) return;

  const DEFAULT_GAP = 0.5;
  const DEFAULT_EPSILON = 0.001;
  const DEFAULT_SAFETY_FACTOR = 0.9;

  function finite(value, fallback = NaN) {
    if (value === null || value === undefined || value === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function orientationDriver() {
    return global.LabelerMapObjectOrientationDriver || null;
  }

  function locateFinalWipe(rows = [], windowStart = Infinity) {
    const domain = orientationDriver();
    let turnIndex = -1;
    rows.forEach((row, index) => {
      if (finite(row?.tableAngle, Infinity) < finite(windowStart, Infinity)
        && domain?.isPhysicalContactTransition?.(row)) turnIndex = index;
    });
    if (turnIndex < 0) return { turnIndex: -1, holdIndex: -1 };
    let holdIndex = -1;
    for (let index = turnIndex + 1; index < rows.length; index += 1) {
      if (domain?.samePhysicalMotion?.(rows[turnIndex], rows[index])) {
        holdIndex = index;
        break;
      }
    }
    return { turnIndex, holdIndex };
  }

  function timing({
    holdTable,
    window,
    rotation,
    maxRatio = 21,
    gap = DEFAULT_GAP,
    safetyFactor = DEFAULT_SAFETY_FACTOR,
    epsilon = DEFAULT_EPSILON
  } = {}) {
    const resolvedWindow = window || { start: 0, end: 0 };
    const turnStart = finite(holdTable, 0) + Math.max(0, finite(gap, DEFAULT_GAP));
    const safeRatio = Math.max(0.1, finite(maxRatio, 21) * Math.max(0.1, finite(safetyFactor, DEFAULT_SAFETY_FACTOR)));
    const requiredSpan = Math.abs(finite(rotation, 0)) / safeRatio;
    const readyTable = Math.max(finite(resolvedWindow.start, turnStart), turnStart + requiredSpan);
    return {
      turnStart,
      safeRatio,
      requiredSpan,
      readyTable,
      available: turnStart < finite(resolvedWindow.end, turnStart) - epsilon,
      withinWindow: readyTable <= finite(resolvedWindow.end, readyTable) - epsilon
    };
  }

  function interference(rows = [], { holdIndex, holdTable, readyTable, epsilon = DEFAULT_EPSILON } = {}) {
    return rows.find((row, index) => index > finite(holdIndex, -1)
      && finite(row?.tableAngle, Infinity) > finite(holdTable, 0) + epsilon
      && finite(row?.tableAngle, Infinity) < finite(readyTable, Infinity) - epsilon) || null;
  }

  function continuationPlan({
    rows = [],
    followingIndex,
    targetPlate,
    window,
    gap = DEFAULT_GAP,
    epsilon = DEFAULT_EPSILON
  } = {}) {
    const following = rows[followingIndex];
    if (!following) return { kind: "none" };
    const domain = orientationDriver();
    if (Number(following.cmd) === 7) {
      const metrics = domain?.continuationMetrics?.({
        startRow: following,
        destinationRow: rows[followingIndex + 1],
        targetPlate
      });
      if (Number.isFinite(metrics?.destinationPlate) && metrics.tableTravel > epsilon) {
        return {
          kind: "retarget",
          index: followingIndex,
          row: {
            ...following,
            plateAngle: targetPlate,
            plannedRotation: metrics.plannedRotation,
            plannedRatio: metrics.plannedRatio
          }
        };
      }
      return { kind: "none" };
    }

    const expected = finite(following?.plateAngle, targetPlate);
    if (Math.abs(expected - finite(targetPlate, expected)) <= epsilon) return { kind: "none" };
    const start = finite(window?.end, 0) + Math.max(0, finite(gap, DEFAULT_GAP));
    const end = finite(following?.tableAngle, start);
    if (end <= start + epsilon) return { kind: "blocked", start, end, expected };
    return {
      kind: "insert",
      index: followingIndex,
      start,
      end,
      expected,
      plannedRotation: expected - finite(targetPlate, expected),
      plannedRatio: Math.abs(expected - finite(targetPlate, expected)) / Math.max(epsilon, end - start)
    };
  }

  const api = Object.freeze({
    DEFAULT_GAP,
    DEFAULT_EPSILON,
    DEFAULT_SAFETY_FACTOR,
    finite,
    locateFinalWipe,
    timing,
    interference,
    continuationPlan
  });

  global.LabelerCoderHandoffDriver = api;
  global.LabelerDriverRegistry?.register("profile.coderHandoff", api, {
    dependencies: ["profile.mapObjectOrientation"],
    source: "drivers/profile/coder-handoff-driver.js",
    replace: true
  });

  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
