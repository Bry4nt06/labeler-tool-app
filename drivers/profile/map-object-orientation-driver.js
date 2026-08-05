"use strict";

(function installMapObjectOrientationDriver(global) {
  if (global.LabelerMapObjectOrientationDriver) return;

  const FULL_CYCLE_DEG = 360;
  const COMMAND_RESOLUTION_DEG = 0.1;
  const VALID_SECTIONS = Object.freeze(["neck", "body", "back", "none"]);

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
    return Math.abs(commandAngle(left, resolution) - commandAngle(right, resolution)) <= Number.EPSILON * 16;
  }

  function nearestEquivalent(target, reference) {
    const coder = global.LabelerCoderOrientationDriver;
    if (coder?.nearestEquivalent) return coder.nearestEquivalent(target, reference);
    const base = finite(target, 0);
    const current = finite(reference, base);
    return base + FULL_CYCLE_DEG * Math.round((current - base) / FULL_CYCLE_DEG);
  }

  function activeFallback(activeApplications = {}) {
    if (activeApplications.back) return "back";
    if (activeApplications.body) return "body";
    if (activeApplications.neck) return "neck";
    return "none";
  }

  function resolveSection({
    item,
    activeApplications = {},
    stationSections = {},
    fallbackStationSection
  } = {}) {
    const explicit = String(item?.orientationLabelSection || "auto").trim().toLowerCase();
    if (explicit === "none") return "none";
    if (["neck", "body", "back"].includes(explicit)) {
      if (activeApplications[explicit] !== false) return explicit;
      // A physical label sensor has no inspection duty when its assigned label
      // is absent from the selected brand. Ignore it without creating a turn,
      // hold, or validation issue. Coders still retarget to the active label.
      if (item?.kind === "coding") return activeFallback(activeApplications);
      return "none";
    }
    if (item?.kind === "sensor") {
      const station = Number(item?.station);
      const inferred = String(
        stationSections?.[String(station)]
        || (typeof fallbackStationSection === "function" ? fallbackStationSection(station) : "")
        || ""
      ).toLowerCase();
      if (VALID_SECTIONS.includes(inferred)) {
        if (["neck", "body", "back"].includes(inferred) && activeApplications[inferred] === false) {
          return "none";
        }
        return inferred;
      }
    }
    return activeFallback(activeApplications);
  }

  function enabled(item) {
    if (item?.kind === "sensor") return Boolean(item.orientBottle ?? item.servoAssist);
    if (item?.kind === "coding") return item.orientBottle !== false;
    return false;
  }

  function objectWindow({
    item,
    rows = [],
    sensorHalfWindow = 1.5,
    minimumSpan = 0.5,
    defaultSpan = 5
  } = {}) {
    const point = finite(item?.angle, item?.start);
    let start = item?.kind === "sensor"
      ? point - sensorHalfWindow
      : finite(item?.start, point);
    let end = item?.kind === "sensor"
      ? point + sensorHalfWindow
      : Math.max(start + minimumSpan, finite(item?.end, start + defaultSpan));
    while (end <= start) end += FULL_CYCLE_DEG;
    const minimum = rows.length
      ? Math.min(...rows.map((row) => finite(row?.tableAngle, 0)))
      : 0;
    while (end < minimum) {
      start += FULL_CYCLE_DEG;
      end += FULL_CYCLE_DEG;
    }
    return { start, end };
  }

  function applicationSection(row) {
    const explicit = String(
      row?.applicationSection
      || row?.applicationTargetSection
      || ""
    ).trim().toLowerCase();
    if (["neck", "body", "back"].includes(explicit)) return explicit;

    // A section-boundary Rest can finish the current wipe while already
    // holding the next label's application angle. In that case row.section
    // describes the completed wipe, while the action identifies the actual
    // application reference. Prefer that named application so a Body sensor
    // cannot accidentally use the following Back-label target.
    const match = String(row?.action || "").match(/\b(neck|body|back)\s+application\b/i);
    return match ? match[1].toLowerCase() : "none";
  }

  function applicationTarget({
    section,
    rows = [],
    before = Infinity,
    plannedTarget,
    seedTarget = 0
  } = {}) {
    const planned = finite(plannedTarget, NaN);
    if (Number.isFinite(planned)) return planned;
    const requestedSection = String(section || "").toLowerCase();
    const row = [...rows].reverse().find((entry) => {
      const action = String(entry?.action || "");
      if (finite(entry?.tableAngle, Infinity) >= finite(before, Infinity)
        || !/application/i.test(action)
        || !Number.isFinite(finite(entry?.plateAngle, NaN))) return false;

      const namedSection = applicationSection(entry);
      if (namedSection !== "none") return namedSection === requestedSection;
      return String(entry?.section || "").toLowerCase() === requestedSection;
    });
    return row ? finite(row.plateAngle, seedTarget) : finite(seedTarget, 0);
  }

  function orientationTarget({
    item,
    section,
    currentPlate,
    applicationTarget: application,
    labelWidthDeg,
    labelCenter,
    sensorTarget,
    sensorVisibilityPercent = 100,
    coderCenterlineTarget,
    codeBoxOffsetDeg,
    inspectionOffsetDeg = 0
  } = {}) {
    const width = Math.min(FULL_CYCLE_DEG, Math.max(0.1, finite(labelWidthDeg, 0.1)));
    const center = finite(labelCenter, finite(application, 0));
    if (item?.kind === "sensor") {
      const required = Math.min(100, Math.max(1, finite(item?.requiredVisibilityPercent, 50)));
      const current = finite(currentPlate, center);
      const rawTarget = nearestEquivalent(finite(sensorTarget, center), current);
      const target = sameCommandAngle(rawTarget, current) ? current : rawTarget;
      return {
        target,
        mode: "label-center",
        required,
        visibility: finite(sensorVisibilityPercent, 100),
        center,
        width,
        satisfiedAtCommandResolution: target === current
      };
    }

    const mode = item?.orientationTarget === "label-center" ? "label-center" : "code-box";
    let target = center;
    const plannedCoder = finite(coderCenterlineTarget, NaN);
    const code = finite(codeBoxOffsetDeg, NaN);
    if (mode === "code-box" && section === "back" && Number.isFinite(plannedCoder)) {
      target = plannedCoder;
    } else if (mode === "code-box" && Number.isFinite(code)) {
      target = center + width / 2 - code + finite(inspectionOffsetDeg, 0);
    }
    return {
      target: nearestEquivalent(target, currentPlate),
      mode,
      required: 100,
      visibility: 100,
      center,
      width,
      codeBoxOffsetDeg: code,
      inspectionOffsetDeg: finite(inspectionOffsetDeg, 0)
    };
  }

  function isPhysicalContactTransition(row) {
    if (Number(row?.cmd) !== 7) return false;
    const action = String(row?.action || "");
    return /wipe|brush|roller|pad|contact/i.test(action)
      || Boolean(row?.stage)
      || Boolean(row?.brushStage)
      || Boolean(row?.contactSide)
      || Boolean(row?.rollerPass)
      || Boolean(row?.wipeMotion);
  }

  function samePhysicalMotion(turn, hold) {
    if (Number(hold?.cmd) !== 3) return false;
    if (turn?.section && hold?.section && String(turn.section) !== String(hold.section)) return false;
    if (Number.isFinite(finite(turn?.station, NaN))
      && Number.isFinite(finite(hold?.station, NaN))
      && Number(turn.station) !== Number(hold.station)) return false;
    return hold?.stage === "complete"
      || Boolean(hold?.wipeReference)
      || /wipe\s+hold|wipe.*rest|brush.*hold|roller.*rest/i.test(String(hold?.action || ""));
  }

  function continuationMetrics({ startRow, destinationRow, targetPlate } = {}) {
    const destinationPlate = finite(destinationRow?.plateAngle, NaN);
    const tableTravel = finite(destinationRow?.tableAngle, 0) - finite(startRow?.tableAngle, 0);
    return {
      destinationPlate,
      tableTravel,
      plannedRotation: Number.isFinite(destinationPlate)
        ? destinationPlate - finite(targetPlate, destinationPlate)
        : NaN,
      plannedRatio: Number.isFinite(destinationPlate) && tableTravel > 0.001
        ? Math.abs(destinationPlate - finite(targetPlate, destinationPlate)) / tableTravel
        : NaN
    };
  }

  const api = Object.freeze({
    FULL_CYCLE_DEG,
    COMMAND_RESOLUTION_DEG,
    VALID_SECTIONS,
    finite,
    commandAngle,
    sameCommandAngle,
    nearestEquivalent,
    activeFallback,
    resolveSection,
    enabled,
    objectWindow,
    applicationSection,
    applicationTarget,
    orientationTarget,
    isPhysicalContactTransition,
    samePhysicalMotion,
    continuationMetrics
  });

  global.LabelerMapObjectOrientationDriver = api;
  global.LabelerDriverRegistry?.register("profile.mapObjectOrientation", api, {
    dependencies: ["profile.coderOrientation"],
    source: "drivers/profile/map-object-orientation-driver.js",
    replace: true
  });

  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
