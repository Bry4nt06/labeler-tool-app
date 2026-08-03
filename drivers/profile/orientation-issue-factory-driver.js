"use strict";

(function installOrientationIssueFactoryDriver(global) {
  if (global.LabelerOrientationIssueFactoryDriver) return;

  function issue({ level = "bad", code, item, section, message, extras = {} } = {}) {
    return {
      level,
      code,
      objectId: item?.id,
      station: item?.station,
      section,
      message,
      ...extras,
      issueFactoryDriver: "profile.orientationIssueFactory"
    };
  }

  function labelInactive({ item, section, label, sectionName }) {
    return issue({
      code: "map-object-label-inactive",
      item,
      section,
      message: `${label} targets the ${sectionName} label, but that label is not active.`
    });
  }

  function beforeApplication({ item, section, label, sectionName }) {
    return issue({
      code: "map-object-before-label-application",
      item,
      section,
      message: `${label} is positioned before the ${sectionName} label has been applied.`
    });
  }

  function noReference({ item, section, label }) {
    return issue({
      code: "map-object-orientation-no-reference",
      item,
      section,
      message: `${label} has no prior servo state from which to calculate its orientation turn.`
    });
  }

  function windowOverlap({ item, section, label, span }) {
    return issue({
      code: "map-object-window-overlap",
      item,
      section,
      message: `${label} overlaps an existing servo event inside its ${span}° object window.`
    });
  }

  function physicalWipeOverlap({ item, section, label, action }) {
    return issue({
      code: "map-object-overlaps-physical-wipe",
      item,
      section,
      message: `${label} begins while "${action || "the current wipe"}" is still active. The sensor/coder cannot take control of the servo until the pad, roller, or brush wipe reaches its CMD 3 hold. Move the object later than that wipe hold.`
    });
  }

  function turnWindow({ item, section, label, windowStart }) {
    return issue({
      code: "map-object-turn-window",
      item,
      section,
      message: `${label} does not have enough open table travel to orient before ${windowStart}°.`
    });
  }

  function exitWindow({ item, section, label }) {
    return issue({
      code: "map-object-exit-window",
      item,
      section,
      message: `${label} has no open table travel after its window to continue to the next servo reference.`
    });
  }

  function orientationCapacity({ item, section, label, rotation, span, ratio, limit }) {
    return issue({
      code: "map-object-orientation-capacity",
      item,
      section,
      message: `${label} requires ${Math.abs(rotation).toFixed(1)}° bottle rotation in ${span.toFixed(1)}° table travel (${ratio.toFixed(2)}:1; limit ${limit.toFixed(1)}:1).`
    });
  }

  function baseIssueExtras(baseIssue = {}) {
    const {
      level,
      code,
      objectId,
      station,
      section,
      message,
      issueFactoryDriver,
      ...extras
    } = baseIssue || {};
    return { level, extras };
  }

  function coderWindowUnavailable({ baseIssue = {}, item, section, label, action, holdTable, windowEnd }) {
    const inherited = baseIssueExtras(baseIssue);
    return issue({
      level: inherited.level || "bad",
      code: "coder-window-after-wipe-unavailable",
      item,
      section,
      message: `${label} cannot take control after ${action || "the final wipe"} completes at ${holdTable}°. Its coding window ends at ${windowEnd}°. Move the coder later or finish the wipe earlier.`,
      extras: inherited.extras
    });
  }

  function coderHandoffCapacity({ baseIssue = {}, item, section, label, action, holdTable, rotation, windowEnd }) {
    const inherited = baseIssueExtras(baseIssue);
    return issue({
      level: inherited.level || "bad",
      code: "coder-handoff-capacity",
      item,
      section,
      message: `${label} waits for ${action || "the final wipe"} to finish at ${holdTable}°, but needs ${Math.abs(rotation).toFixed(1)}° of bottle rotation before the coding window ends at ${windowEnd}°. Move the coder later, increase the gap after the wipe, or reduce the required coding correction.`,
      extras: inherited.extras
    });
  }

  function coderHandoffStatus({ item, section, label, holdTable, readyTable, delayed }) {
    return issue({
      level: delayed ? "warn" : "ok",
      code: "coder-after-wipe-handoff",
      item,
      section,
      message: delayed
        ? `${label} waits for the wipe to complete at ${holdTable}°, then reaches the coding orientation at ${readyTable}° inside its configured window.`
        : `${label} waits for the wipe to complete, then takes control before its coding window begins.`
    });
  }

  const api = Object.freeze({
    issue,
    labelInactive,
    beforeApplication,
    noReference,
    windowOverlap,
    physicalWipeOverlap,
    turnWindow,
    exitWindow,
    orientationCapacity,
    coderWindowUnavailable,
    coderHandoffCapacity,
    coderHandoffStatus
  });

  global.LabelerOrientationIssueFactoryDriver = api;
  global.LabelerDriverRegistry?.register("profile.orientationIssueFactory", api, {
    dependencies: ["profile.mapObjectOrientation", "profile.coderHandoff"],
    source: "drivers/profile/orientation-issue-factory-driver.js",
    replace: true
  });

  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
