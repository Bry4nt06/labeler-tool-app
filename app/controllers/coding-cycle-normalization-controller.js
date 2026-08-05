"use strict";

(function installCodingCycleNormalizationController(global) {
  if (global.LabelerCodingCycleNormalizationController?.installed) return;

  const EPS = 0.001;
  const FULL_CYCLE = 360;
  let driverPatched = false;
  let validationWrapped = false;
  let installed = false;

  function finite(value, fallback = NaN) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function nextEquivalentAfter(angle, reference) {
    let value = finite(angle, 0);
    const after = finite(reference, 0);
    while (value <= after + EPS) value += FULL_CYCLE;
    return value;
  }

  function normalizeWindowAfter(window, reference) {
    const start = finite(window?.start, 0);
    const end = Math.max(start + EPS, finite(window?.end, start + 5));
    const normalizedStart = nextEquivalentAfter(start, reference);
    const offset = normalizedStart - start;
    return {
      ...window,
      start: normalizedStart,
      end: end + offset,
      physicalStart: start,
      physicalEnd: end,
      cycleOffset: offset
    };
  }

  function handoffDriver() {
    return global.LabelerDriverRegistry?.resolve?.("profile.coderHandoff")
      || global.LabelerCoderHandoffDriver
      || null;
  }

  function finalWipeReference(rows = []) {
    const source = Array.isArray(rows) ? rows : [];
    const located = handoffDriver()?.locateFinalWipe?.(source, Infinity);
    const locatedHold = source[located?.holdIndex];
    const locatedAngle = finite(locatedHold?.tableAngle, NaN);
    if (Number.isFinite(locatedAngle)) return locatedAngle;

    let best = NaN;
    source.forEach((row, index) => {
      if (Number(row?.cmd) !== 3) return;
      const action = String(row?.action || "");
      const previous = source[index - 1];
      const physical = /wipe|roller|pad|brush/i.test(action)
        || /wipe|roller|pad|brush/i.test(String(previous?.action || ""))
        || row?.stage === "complete"
        || Boolean(row?.wipeReference);
      if (!physical) return;
      const angle = finite(row.tableAngle, NaN);
      if (Number.isFinite(angle) && (!Number.isFinite(best) || angle > best)) best = angle;
    });
    return best;
  }

  function falseCycleMessage(message) {
    const text = String(message || "");
    const match = text.match(/Coding starts at\s+(-?\d+(?:\.\d+)?)\s*deg,\s*before the final label motion ends at\s+(-?\d+(?:\.\d+)?)\s*deg/i);
    if (!match) return false;
    const physicalStart = finite(match[1], NaN);
    const finalEnd = finite(match[2], NaN);
    if (!Number.isFinite(physicalStart) || !Number.isFinite(finalEnd) || finalEnd < FULL_CYCLE) return false;
    const equivalent = nextEquivalentAfter(physicalStart, finalEnd);
    return equivalent > finalEnd + EPS && equivalent - finalEnd <= FULL_CYCLE + EPS;
  }

  function filterCycleAliasIssues(issues) {
    return (Array.isArray(issues) ? issues : []).filter((issue) => {
      const message = issue?.message ?? issue?.[1] ?? "";
      return !falseCycleMessage(message);
    });
  }

  function pruneMotionPlan() {
    if (typeof state === "undefined" || !Array.isArray(state?.motionPlan?.issues)) return;
    state.motionPlan.issues = filterCycleAliasIssues(state.motionPlan.issues);
  }

  function patchOrientationDriver() {
    if (driverPatched) return true;
    const base = global.LabelerDriverRegistry?.resolve?.("profile.mapObjectOrientation")
      || global.LabelerMapObjectOrientationDriver;
    if (!base?.objectWindow) return false;

    const patched = Object.freeze({
      ...base,
      objectWindow(options = {}) {
        const raw = base.objectWindow(options);
        if (options?.item?.kind !== "coding") return raw;
        const reference = finalWipeReference(options.rows);
        return Number.isFinite(reference) ? normalizeWindowAfter(raw, reference) : raw;
      }
    });

    global.LabelerMapObjectOrientationDriver = patched;
    global.LabelerDriverRegistry?.register?.("profile.mapObjectOrientation", patched, {
      dependencies: ["profile.coderOrientation"],
      source: "app/controllers/coding-cycle-normalization-controller.js",
      replace: true
    });
    driverPatched = true;
    return true;
  }

  function patchValidation() {
    if (validationWrapped || typeof global.validate !== "function") return validationWrapped;
    const base = global.validate;
    global.validate = function validateWithCodingCycleNormalization(...args) {
      pruneMotionPlan();
      return filterCycleAliasIssues(base.apply(this, args));
    };
    validationWrapped = true;
    return true;
  }

  function install() {
    if (installed) return true;
    const complete = patchOrientationDriver() && patchValidation();
    if (!complete) return false;
    installed = true;
    pruneMotionPlan();
    try {
      if (typeof applyGeneratedServoProfile === "function") applyGeneratedServoProfile();
      if (typeof render === "function") render();
    } catch (error) {
      console.error("Unable to normalize the coding station table cycle.", error);
    }
    return true;
  }

  const retry = () => {
    if (!install()) global.setTimeout(retry, 50);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", retry, { once: true });
  else retry();

  global.LabelerCodingCycleNormalizationController = Object.freeze({
    installed: true,
    nextEquivalentAfter,
    normalizeWindowAfter,
    finalWipeReference,
    falseCycleMessage,
    filterCycleAliasIssues,
    refresh: pruneMotionPlan
  });
})(window);
