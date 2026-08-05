"use strict";

(function installSensorPostInspectionReleaseDriver(global) {
  if (global.LabelerSensorPostInspectionReleaseDriver) return;

  const EPS = 0.001;
  const GAP = 0.5;
  const RESTORE_FIELDS = Object.freeze([
    "section",
    "station",
    "mapDriven",
    "mapObjectOrientation",
    "orientationConstraintPlanner",
    "orientationConstraintMerged",
    "orientationConstraintContinuation",
    "orientationSections",
    "orientationObjectId",
    "orientationObjectIds",
    "sensorId",
    "sensorIds",
    "codingObjectId",
    "codingObjectIds",
    "autoTargetSource",
    "plannedRotation",
    "plannedRatio"
  ]);

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

  function sameAngle(left, right) {
    return Math.abs(finite(left, Infinity) - finite(right, -Infinity)) <= EPS;
  }

  function rowObjectIds(row) {
    return [...new Set([
      ...(Array.isArray(row?.orientationObjectIds) ? row.orientationObjectIds : []),
      ...(Array.isArray(row?.sensorIds) ? row.sensorIds : []),
      row?.orientationObjectId,
      row?.sensorId
    ].filter((value) => value !== null && value !== undefined && String(value) !== "")
      .map((value) => String(value)))];
  }

  function sharesObject(hold, row) {
    const holdIds = rowObjectIds(hold);
    if (!holdIds.length) return true;
    const rowIds = new Set(rowObjectIds(row));
    return holdIds.some((id) => rowIds.has(id));
  }

  function originalTurn(sourceRows, row) {
    const candidates = sourceRows.filter((candidate) => (
      Number(candidate?.cmd) === 7
      && sameAngle(candidate?.tableAngle, row?.tableAngle)
    ));
    if (!candidates.length) return null;
    const action = String(row?.action || "");
    return candidates.find((candidate) => String(candidate?.action || "") === action)
      || candidates[0];
  }

  function restoreRetargetedTurn(row, original) {
    const restored = { ...row, plateAngle: finite(original?.plateAngle, row?.plateAngle) };
    RESTORE_FIELDS.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(original || {}, field)) restored[field] = original[field];
      else delete restored[field];
    });
    return restored;
  }

  function releaseSubject(hold) {
    const action = String(hold?.action || "").trim();
    const through = action.match(/\bthrough\s+(.+)$/i);
    if (through?.[1]) return through[1].trim();
    return hold?.sensorId ? "Label Sensor" : "Inspection Window";
  }

  function inspectionPoint(hold) {
    const start = finite(hold?.inspectionWindowStart, NaN);
    const stop = finite(hold?.inspectionWindowStop, NaN);
    if (Number.isFinite(start) && Number.isFinite(stop)) return start + (stop - start) / 2;
    if (Number.isFinite(stop)) return stop;
    return finite(hold?.tableAngle, NaN);
  }

  function availableReleaseAngle(rows, start, stop, formatter) {
    let candidate = round(start, formatter);
    const finalAllowed = stop - 0.1;
    while (candidate < finalAllowed + EPS) {
      const occupied = rows.some((row) => sameAngle(row?.tableAngle, candidate));
      if (!occupied) return candidate;
      candidate = round(candidate + 0.1, formatter);
    }
    return NaN;
  }

  function apply({
    sourceRows = [],
    outputRows = [],
    maxMoveRatio = 21,
    formatter
  } = {}) {
    const source = Array.isArray(sourceRows) ? sourceRows.map((row) => ({ ...row })) : [];
    const rows = Array.isArray(outputRows) ? outputRows.map((row) => ({ ...row })) : [];
    const releases = [];

    for (let holdIndex = 0; holdIndex < rows.length; holdIndex += 1) {
      const hold = rows[holdIndex];
      if (Number(hold?.cmd) !== 3
        || !hold?.orientationHold
        || (!hold?.sensorId && !Array.isArray(hold?.sensorIds))) continue;

      const sensorTable = inspectionPoint(hold);
      const windowStop = finite(hold?.inspectionWindowStop, sensorTable);
      if (!Number.isFinite(sensorTable)) continue;

      const nextIndex = rows.findIndex((row, index) => (
        index > holdIndex
        && finite(row?.tableAngle, -Infinity) > sensorTable + EPS
        && Number(row?.cmd) === 7
        && row?.orientationConstraintContinuation
        && sharesObject(hold, row)
      ));
      if (nextIndex < 0) continue;

      const next = rows[nextIndex];
      const original = originalTurn(source, next);
      if (!original) continue;

      const targetPlate = finite(hold?.plateAngle, NaN);
      const destinationPlate = finite(original?.plateAngle, NaN);
      const destinationTable = finite(next?.tableAngle, NaN);
      if (!Number.isFinite(targetPlate)
        || !Number.isFinite(destinationPlate)
        || !Number.isFinite(destinationTable)
        || sameAngle(targetPlate, destinationPlate)) continue;

      const releaseTable = availableReleaseAngle(
        rows,
        sensorTable + GAP,
        destinationTable,
        formatter
      );
      if (!Number.isFinite(releaseTable) || releaseTable >= destinationTable - EPS) continue;

      const rotation = destinationPlate - targetPlate;
      const tableTravel = destinationTable - releaseTable;
      const ratio = Math.abs(rotation) / Math.max(EPS, tableTravel);
      const restored = restoreRetargetedTurn(next, original);
      rows[nextIndex] = restored;

      const subject = releaseSubject(hold);
      const release = {
        hmi: 0,
        plc: 0,
        cmd: 7,
        tableAngle: releaseTable,
        plateAngle: round(targetPlate, formatter),
        action: `Begin Next Setup After ${subject}`,
        section: hold.section,
        station: hold.station,
        mapDriven: true,
        mapObjectOrientation: true,
        orientationConstraintPlanner: true,
        orientationConstraintContinuation: true,
        sensorRelease: true,
        orientationRelease: true,
        postInspectionRelease: true,
        orientationObjectId: hold.orientationObjectId,
        orientationObjectIds: hold.orientationObjectIds,
        sensorId: hold.sensorId,
        sensorIds: hold.sensorIds,
        plannedRotation: rotation,
        plannedRatio: ratio,
        releaseExceedsMoveRatio: ratio >= Math.max(0.1, finite(maxMoveRatio, 21)),
        sensorInspectionTableAngle: round(sensorTable, formatter),
        inspectionWindowStop: round(windowStop, formatter),
        releaseDestinationTableAngle: round(destinationTable, formatter),
        releaseDestinationPlateAngle: round(destinationPlate, formatter),
        releaseDestinationAction: String(original.action || next.action || "Next aggregate")
      };
      rows.splice(nextIndex, 0, release);
      releases.push({
        sensorId: hold.sensorId,
        sensorIds: hold.sensorIds,
        objectId: hold.orientationObjectId || hold.sensorId,
        sensorInspectionTableAngle: release.sensorInspectionTableAngle,
        releaseTableAngle: release.tableAngle,
        targetPlateAngle: release.plateAngle,
        destinationTableAngle: release.releaseDestinationTableAngle,
        destinationPlateAngle: release.releaseDestinationPlateAngle,
        destinationAction: release.releaseDestinationAction,
        plannedRotation: rotation,
        plannedRatio: ratio,
        exceedsMoveRatio: release.releaseExceedsMoveRatio
      });
      holdIndex += 1;
    }

    rows.sort((left, right) => finite(left?.tableAngle, 0) - finite(right?.tableAngle, 0));
    const numbered = rows.map((row, index) => ({ ...row, hmi: index + 1, plc: index }));
    return { rows: numbered, releases };
  }

  const api = Object.freeze({
    EPS,
    GAP,
    finite,
    round,
    sameAngle,
    rowObjectIds,
    sharesObject,
    originalTurn,
    restoreRetargetedTurn,
    inspectionPoint,
    availableReleaseAngle,
    apply
  });

  global.LabelerSensorPostInspectionReleaseDriver = api;
  global.LabelerDriverRegistry?.register?.("profile.sensorPostInspectionRelease", api, {
    dependencies: ["profile.orientationConstraintPlanner", "profile.mapObjectRowBuilder"],
    source: "drivers/profile/sensor-post-inspection-release-driver.js",
    replace: true
  });

  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
