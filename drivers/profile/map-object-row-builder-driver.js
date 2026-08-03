"use strict";

(function installMapObjectRowBuilderDriver(global) {
  if (global.LabelerMapObjectRowBuilderDriver) return;

  function finite(value, fallback = NaN) {
    if (value === null || value === undefined || value === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function round(value, formatter) {
    return typeof formatter === "function"
      ? formatter(value)
      : Math.round(finite(value, 0) * 10) / 10;
  }

  function metadata({ item, section, extras = {} } = {}) {
    return {
      section,
      station: item?.station,
      mapDriven: true,
      mapObjectOrientation: true,
      orientationObjectId: item?.id,
      sensorId: item?.kind === "sensor" ? item?.id : undefined,
      codingObjectId: item?.kind === "coding" ? item?.id : undefined,
      ...extras
    };
  }

  function turn({ tableAngle, plateAngle, action, metadata: rowMetadata = {}, rotation, ratio, formatter, extras = {} } = {}) {
    return {
      hmi: 0,
      plc: 0,
      cmd: 7,
      tableAngle: round(tableAngle, formatter),
      plateAngle: round(plateAngle, formatter),
      action,
      ...rowMetadata,
      plannedRotation: rotation,
      plannedRatio: ratio,
      ...extras
    };
  }

  function hold({ tableAngle, plateAngle, action, metadata: rowMetadata = {}, window, formatter, extras = {} } = {}) {
    return {
      hmi: 0,
      plc: 0,
      cmd: 3,
      tableAngle: round(tableAngle, formatter),
      plateAngle: round(plateAngle, formatter),
      action,
      ...rowMetadata,
      orientationHold: true,
      inspectionWindowStart: round(window?.start, formatter),
      inspectionWindowStop: round(window?.end, formatter),
      ...extras
    };
  }

  function retargetTurn(sourceRow, { plateAngle, action, metadata: rowMetadata = {}, rotation, ratio, formatter, extras = {} } = {}) {
    return {
      ...sourceRow,
      cmd: 7,
      plateAngle: round(plateAngle, formatter),
      action: action ?? sourceRow?.action,
      ...rowMetadata,
      plannedRotation: rotation,
      plannedRatio: ratio,
      ...extras
    };
  }

  function satisfied(sourceRow, { metadata: rowMetadata = {}, window, formatter, extras = {} } = {}) {
    return {
      ...sourceRow,
      ...rowMetadata,
      mapObjectOrientationSatisfied: true,
      inspectionWindowStart: round(window?.start, formatter),
      inspectionWindowStop: round(window?.end, formatter),
      ...extras
    };
  }

  function continuation({ tableAngle, plateAngle, action, metadata: rowMetadata = {}, rotation, ratio, formatter, marker = "mapObjectOrientationContinuation", extras = {} } = {}) {
    return turn({
      tableAngle,
      plateAngle,
      action,
      metadata: rowMetadata,
      rotation,
      ratio,
      formatter,
      extras: {
        [marker]: true,
        ...extras
      }
    });
  }

  function retargetContinuation(sourceRow, { plateAngle, rotation, ratio, formatter, marker = "mapObjectOrientationContinuation", extras = {} } = {}) {
    return {
      ...sourceRow,
      plateAngle: round(plateAngle, formatter),
      plannedRotation: rotation,
      plannedRatio: ratio,
      [marker]: true,
      ...extras
    };
  }

  function orientationPlan({ item, label, section, target, window, rotation, ratio, reusedActiveTransition = false, formatter } = {}) {
    return {
      objectId: item?.id,
      kind: item?.kind,
      name: label,
      station: item?.station,
      section,
      targetMode: target?.mode,
      windowStart: round(window?.start, formatter),
      windowStop: round(window?.end, formatter),
      targetPlateAngle: round(target?.target, formatter),
      rotation: round(rotation, formatter),
      ratio: round(ratio, formatter),
      requiredVisibilityPercent: target?.required,
      plannedVisibilityPercent: target?.visibility,
      reusedActiveTransition,
      orientationDriver: "profile.mapObjectOrientation",
      rowBuilderDriver: "profile.mapObjectRowBuilder"
    };
  }

  function coderHandoffPlan({ item, label, section, target, window, holdTable, readyTable, rotation, formatter } = {}) {
    return {
      objectId: item?.id,
      kind: "coding",
      name: label,
      section,
      targetMode: target?.mode,
      windowStart: round(window?.start, formatter),
      windowStop: round(window?.end, formatter),
      wipeHoldTableAngle: round(holdTable, formatter),
      codingReadyTableAngle: round(readyTable, formatter),
      targetPlateAngle: round(target?.target, formatter),
      rotation: round(rotation, formatter),
      coderAfterWipeHandoff: true,
      orientationDriver: "profile.mapObjectOrientation",
      handoffDriver: "profile.coderHandoff",
      rowBuilderDriver: "profile.mapObjectRowBuilder"
    };
  }

  const api = Object.freeze({
    finite,
    round,
    metadata,
    turn,
    hold,
    retargetTurn,
    satisfied,
    continuation,
    retargetContinuation,
    orientationPlan,
    coderHandoffPlan
  });

  global.LabelerMapObjectRowBuilderDriver = api;
  global.LabelerDriverRegistry?.register("profile.mapObjectRowBuilder", api, {
    dependencies: ["profile.mapObjectOrientation", "profile.coderHandoff"],
    source: "drivers/profile/map-object-row-builder-driver.js",
    replace: true
  });

  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
