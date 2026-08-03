"use strict";

(function installOrientationConstraintPlannerDriver(global) {
  if (global.LabelerOrientationConstraintPlannerDriver) return;

  const FULL_CYCLE_DEG = 360;
  const COMMAND_RESOLUTION_DEG = 0.1;
  const VALID_SECTIONS = Object.freeze(["neck", "body", "back"]);

  function finite(value, fallback = NaN) {
    if (value === null || value === undefined || value === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function commandAngle(value, resolution = COMMAND_RESOLUTION_DEG) {
    const step = Math.max(Number.EPSILON, Math.abs(finite(resolution, COMMAND_RESOLUTION_DEG)));
    return Math.round(finite(value, 0) / step) * step;
  }

  function sameCommandAngle(left, right, resolution = COMMAND_RESOLUTION_DEG) {
    return Math.abs(commandAngle(left, resolution) - commandAngle(right, resolution)) <= Number.EPSILON * 32;
  }

  function activeFallback(activeApplications = {}) {
    if (activeApplications.back) return "back";
    if (activeApplications.body) return "body";
    if (activeApplications.neck) return "neck";
    return "none";
  }

  function sectionOf(row) {
    const section = String(row?.section || "").trim().toLowerCase();
    return VALID_SECTIONS.includes(section) ? section : "none";
  }

  function isApplicationActivity(row) {
    const section = sectionOf(row);
    if (section === "none") return false;
    const action = String(row?.action || "");
    return Boolean(row?.applicationReference)
      || Boolean(row?.wipeReference)
      || Boolean(row?.applicationTarget)
      || /application|apply|wipe|brush|roller|pad|contact|set[- ]?down/i.test(action);
  }

  function isApplicationCompletion(row) {
    if (!isApplicationActivity(row)) return false;
    const action = String(row?.action || "");
    return Number(row?.cmd) === 3
      && (row?.stage === "complete"
        || Boolean(row?.wipeReference)
        || /complete|hold|rest|stop|finish|through/i.test(action));
  }

  function applicationHistory(rows = [], activeApplications = {}) {
    const source = Array.isArray(rows) ? rows : [];
    const activity = source
      .map((row, index) => ({
        row,
        index,
        section: sectionOf(row),
        tableAngle: finite(row?.tableAngle, NaN),
        completion: isApplicationCompletion(row),
        activity: isApplicationActivity(row)
      }))
      .filter((entry) => entry.activity
        && Number.isFinite(entry.tableAngle)
        && activeApplications[entry.section] !== false)
      .sort((left, right) => left.tableAngle - right.tableAngle || left.index - right.index);

    const completions = activity.filter((entry) => entry.completion);
    return completions.length ? completions : activity;
  }

  function lastApplied(rows = [], before = Infinity, activeApplications = {}) {
    const history = applicationHistory(rows, activeApplications);
    if (!history.length) return null;
    const limit = finite(before, Infinity);
    const prior = history.filter((entry) => entry.tableAngle < limit - 0.001);
    if (prior.length) return prior.at(-1);

    // An object near table zero can legitimately inspect the label applied at
    // the end of the preceding machine revolution.
    const wrapped = history.at(-1);
    return wrapped ? { ...wrapped, wrappedFromPreviousCycle: true, tableAngle: wrapped.tableAngle - FULL_CYCLE_DEG } : null;
  }

  function resolveSection({
    item,
    rows = [],
    before = Infinity,
    activeApplications = {},
    stationSections = {},
    fallbackStationSection
  } = {}) {
    const explicit = String(item?.orientationLabelSection || "auto").trim().toLowerCase();
    if (explicit === "none") return { section: "none", source: "manual-none", application: null };
    if (VALID_SECTIONS.includes(explicit)) {
      if (activeApplications[explicit]) return { section: explicit, source: "manual", application: null };
      const fallback = activeFallback(activeApplications);
      return {
        section: item?.kind === "coding" ? fallback : explicit,
        source: item?.kind === "coding" ? "manual-inactive-fallback" : "manual-inactive",
        application: null
      };
    }

    const application = lastApplied(rows, before, activeApplications);
    if (application?.section) {
      return { section: application.section, source: "last-applied-label", application };
    }

    const station = Number(item?.station);
    const inferred = String(
      stationSections?.[String(station)]
      || (typeof fallbackStationSection === "function" ? fallbackStationSection(station) : "")
      || ""
    ).trim().toLowerCase();
    if (VALID_SECTIONS.includes(inferred) && activeApplications[inferred]) {
      return { section: inferred, source: "station-fallback", application: null };
    }

    return { section: activeFallback(activeApplications), source: "active-label-fallback", application: null };
  }

  function windowsOverlap(left, right, mergeGap = 0) {
    const gap = Math.max(0, finite(mergeGap, 0));
    const leftStart = finite(left?.start, 0);
    const leftEnd = finite(left?.end, leftStart);
    const rightStart = finite(right?.start, 0);
    const rightEnd = finite(right?.end, rightStart);
    return rightStart <= leftEnd + gap && leftStart <= rightEnd + gap;
  }

  function groupObjects(objects = [], mergeGap = 0.5) {
    const sorted = [...(Array.isArray(objects) ? objects : [])]
      .sort((left, right) => finite(left?.window?.start, 0) - finite(right?.window?.start, 0));
    const groups = [];
    sorted.forEach((object) => {
      const last = groups.at(-1);
      if (!last || !windowsOverlap(last.window, object.window, mergeGap)) {
        groups.push({
          objects: [object],
          window: { ...object.window }
        });
        return;
      }
      last.objects.push(object);
      last.window.start = Math.min(finite(last.window.start, 0), finite(object.window?.start, 0));
      last.window.end = Math.max(finite(last.window.end, last.window.start), finite(object.window?.end, last.window.start));
    });
    return groups;
  }

  function sensorSatisfied(sensor, plateAngle, visibilityAt) {
    if (typeof visibilityAt !== "function") return false;
    const visibility = finite(visibilityAt(sensor, plateAngle), 0);
    const required = Math.min(100, Math.max(1, finite(sensor?.target?.required, 50)));
    return visibility + 0.001 >= required;
  }

  function objectSatisfied(object, plateAngle, visibilityAt) {
    if (object?.item?.kind === "coding") {
      return sameCommandAngle(object?.target?.target, plateAngle);
    }
    return sensorSatisfied(object, plateAngle, visibilityAt);
  }

  function uniqueCoderTargets(objects = []) {
    const targets = [];
    objects
      .filter((object) => object?.item?.kind === "coding")
      .forEach((object) => {
        const target = finite(object?.target?.target, NaN);
        if (!Number.isFinite(target)) return;
        if (!targets.some((existing) => sameCommandAngle(existing, target))) targets.push(target);
      });
    return targets;
  }

  function chooseSharedTarget({ objects = [], currentPlate = 0, visibilityAt } = {}) {
    const source = Array.isArray(objects) ? objects : [];
    const coderTargets = uniqueCoderTargets(source);
    if (coderTargets.length > 1) {
      return { compatible: false, reason: "multiple-coder-targets", coderTargets };
    }

    if (coderTargets.length === 1) {
      const target = coderTargets[0];
      const compatible = source.every((object) => objectSatisfied(object, target, visibilityAt));
      return {
        compatible,
        reason: compatible ? "coder-target-satisfies-group" : "coder-target-misses-sensor",
        target,
        coderTargets
      };
    }

    const candidates = [
      finite(currentPlate, 0),
      ...source.map((object) => finite(object?.target?.target, NaN)).filter(Number.isFinite)
    ];
    const unique = candidates.filter((candidate, index) =>
      candidates.findIndex((other) => sameCommandAngle(other, candidate)) === index);
    const valid = unique.filter((candidate) => source.every((object) => objectSatisfied(object, candidate, visibilityAt)));
    if (!valid.length) return { compatible: false, reason: "sensor-ranges-do-not-intersect", coderTargets: [] };
    valid.sort((left, right) => Math.abs(left - currentPlate) - Math.abs(right - currentPlate));
    return {
      compatible: true,
      reason: sameCommandAngle(valid[0], currentPlate) ? "existing-angle-satisfies-group" : "shared-sensor-target",
      target: valid[0],
      coderTargets: []
    };
  }

  const api = Object.freeze({
    FULL_CYCLE_DEG,
    COMMAND_RESOLUTION_DEG,
    VALID_SECTIONS,
    finite,
    commandAngle,
    sameCommandAngle,
    activeFallback,
    sectionOf,
    isApplicationActivity,
    isApplicationCompletion,
    applicationHistory,
    lastApplied,
    resolveSection,
    windowsOverlap,
    groupObjects,
    sensorSatisfied,
    objectSatisfied,
    uniqueCoderTargets,
    chooseSharedTarget
  });

  global.LabelerOrientationConstraintPlannerDriver = api;
  global.LabelerDriverRegistry?.register("profile.orientationConstraintPlanner", api, {
    dependencies: ["profile.mapObjectOrientation"],
    source: "drivers/profile/orientation-constraint-planner-driver.js",
    replace: true
  });

  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
