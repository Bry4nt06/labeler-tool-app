"use strict";

(function installCoderWindowReferenceHandoff(global) {
  if (global.LabelerCoderWindowReferenceHandoff?.installed) return;

  const EPS = 0.001;
  const basePlanner = global.LabelerOrientationConstraintProgramPlanner;
  const baseProcess = basePlanner?.process;
  if (typeof baseProcess !== "function") return;

  const number = (value, fallback = NaN) => {
    if (value === null || value === undefined || value === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const text = (value) => String(value ?? "").trim();

  function targetService() {
    return global.LabelerOrientationConstraintTargetService || null;
  }

  function activeMap() {
    try {
      return targetService()?.activeMap?.()
        || (typeof global.activeMachineMap === "function" ? global.activeMachineMap() : null);
    } catch {
      return null;
    }
  }

  function codingObjects(map = activeMap()) {
    return (Array.isArray(map?.objects) ? map.objects : [])
      .filter((item) => item?.kind === "coding" && item?.enabled !== false && item?.orientBottle !== false);
  }

  function codingWindow(item, rows = []) {
    const service = targetService();
    if (typeof service?.windowFor === "function") return service.windowFor(item, rows);
    const start = number(item?.angle, number(item?.start, 0));
    let end = number(item?.end, start + Math.max(0.5, number(item?.wipeSpanDeg, 5)));
    if (end < start) end += 360;
    return { start, end };
  }

  function protectedServoReference(row) {
    return row?.sensorId
      || row?.codingObjectId
      || row?.codingHold === true
      || row?.orientationHold === true
      || row?.mapObjectOrientation === true
      || row?.codingMotion === true
      || row?.codingRelease === true
      || row?.sensorRelease === true
      || row?.orientationRelease === true
      || row?.orientationConstraintContinuation === true
      || row?.mapObjectOrientationContinuation === true
      || row?.coderAfterWipeHandoff === true
      || row?.coderAfterWipeContinuation === true;
  }

  function supersedableCodingReference(row) {
    if (!row || Number(row.cmd) !== 3 || protectedServoReference(row)) return false;
    const action = text(row.action);
    return row?.terminalRest === true
      || /end\s*(?:of\s*)?curve/i.test(action)
      || /return\s+(?:the\s+)?bottle.*(?:end\s*curve|reference)/i.test(action)
      || /^(?:rest|reference|idle|hold)$/i.test(action);
  }

  function removeSupersededCodingReferences(sourceRows, map = activeMap()) {
    const rows = (Array.isArray(sourceRows) ? sourceRows : []).map((row) => ({ ...row }));
    const removed = [];
    codingObjects(map).forEach((item) => {
      const window = codingWindow(item, rows);
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        const table = number(rows[index]?.tableAngle, NaN);
        if (!Number.isFinite(table)
          || table <= number(window.start, 0) + EPS
          || table >= number(window.end, window.start) - EPS
          || !supersedableCodingReference(rows[index])) continue;
        removed.push({ ...rows[index], absorbedByCodingObjectId: item.id });
        rows.splice(index, 1);
      }
    });
    return { rows, removed };
  }

  function planForCodingObject(item, plans) {
    return (Array.isArray(plans) ? plans : []).find((plan) =>
      String(plan?.objectId || "") === String(item?.id || "")
      && (plan?.kind === "coding" || /cod/i.test(text(plan?.name)))
    ) || null;
  }

  function existingCodingHoldIndex(rows, item, start) {
    return rows.findIndex((row) => {
      const sameObject = String(row?.codingObjectId || "") === String(item?.id || "")
        || (Array.isArray(row?.codingObjectIds) && row.codingObjectIds.map(String).includes(String(item?.id)));
      const sameStart = Math.abs(number(row?.tableAngle, Infinity) - start) <= EPS;
      return Number(row?.cmd) === 3 && (row?.codingHold === true || (row?.orientationHold === true && sameObject) || (sameStart && sameObject));
    });
  }

  function codingHoldRow({ item, plan, start, end, target, source = {} }) {
    const section = text(plan?.section || item?.orientationLabelSection || item?.labelSection || "back").toLowerCase();
    const sectionName = section ? `${section.charAt(0).toUpperCase()}${section.slice(1)}` : "Label";
    const name = item?.name || plan?.name || "Coding";
    return {
      ...source,
      cmd: 3,
      baseCmd: 3,
      tableAngle: start,
      generatedTableAngle: start,
      plateAngle: target,
      action: `Hold ${sectionName} Code Box Through ${name}`,
      section,
      station: item?.station,
      mapDriven: true,
      mapObjectOrientation: true,
      orientationConstraintPlanner: true,
      orientationHold: true,
      codingHold: true,
      codingMotion: false,
      codingObjectId: item?.id,
      codingObjectIds: [item?.id],
      orientationObjectId: item?.id,
      orientationObjectIds: [item?.id],
      codingReadyTableAngle: start,
      inspectionWindowStart: start,
      inspectionWindowStop: end,
      terminalRest: true,
      plannerIntent: "HOLD",
      plannerRequestedCommand: 3,
      plannerRecommendedCommand: 3,
      explicitCodingWindowHold: true,
      satisfiedByExistingMotion: plan?.satisfiedByExistingMotion === true
    };
  }

  function ensureExplicitCodingHolds(sourceRows, map = activeMap(), plans = global.state?.motionPlan?.orientationConstraintPlans) {
    const rows = (Array.isArray(sourceRows) ? sourceRows : []).map((row) => ({ ...row }));
    const inserted = [];

    codingObjects(map).forEach((item) => {
      const plan = planForCodingObject(item, plans);
      if (!plan) return;
      const window = codingWindow(item, rows);
      const start = number(plan.windowStart, number(window.start, NaN));
      const end = number(plan.windowStop, number(window.end, start));
      const target = number(plan.targetPlateAngle, NaN);
      if (!Number.isFinite(start) || !Number.isFinite(target)) return;

      const existingIndex = existingCodingHoldIndex(rows, item, start);
      if (existingIndex >= 0) {
        rows[existingIndex] = codingHoldRow({
          item,
          plan,
          start,
          end,
          target,
          source: rows[existingIndex]
        });
        return;
      }

      const exactReferenceIndex = rows.findIndex((row) =>
        Number(row?.cmd) === 3
        && Math.abs(number(row?.tableAngle, Infinity) - start) <= EPS
        && supersedableCodingReference(row)
      );
      const hold = codingHoldRow({
        item,
        plan,
        start,
        end,
        target,
        source: exactReferenceIndex >= 0 ? rows[exactReferenceIndex] : {}
      });
      if (exactReferenceIndex >= 0) rows[exactReferenceIndex] = hold;
      else {
        rows.push(hold);
        inserted.push(item.id);
      }
    });

    rows.sort((left, right) => number(left?.tableAngle, 0) - number(right?.tableAngle, 0));
    const output = rows.map((row, index) => ({ ...row, hmi: index + 1, plc: index }));
    if (global.state?.motionPlan && typeof global.state.motionPlan === "object") {
      global.state.motionPlan.rows = output;
      global.state.motionPlan.finalPlateAngle = output.at(-1)?.plateAngle;
      global.state.motionPlan.coderWindowReferenceHandoff = true;
      global.state.motionPlan.absorbedCodingReferences = global.state.motionPlan.absorbedCodingReferences || [];
      global.state.motionPlan.explicitCodingHoldObjectIds = codingObjects(map)
        .filter((item) => planForCodingObject(item, plans))
        .map((item) => item.id);
    }
    return { rows: output, inserted };
  }

  function process(sourceRows) {
    const map = activeMap();
    if (!map || map.applicationMode !== "apl" || !codingObjects(map).length) {
      return baseProcess.call(basePlanner, sourceRows);
    }

    const prepared = removeSupersededCodingReferences(sourceRows, map);
    const planned = baseProcess.call(basePlanner, prepared.rows);
    const finalized = ensureExplicitCodingHolds(
      planned,
      map,
      global.state?.motionPlan?.orientationConstraintPlans
    );

    if (global.state?.motionPlan && typeof global.state.motionPlan === "object") {
      global.state.motionPlan.absorbedCodingReferences = prepared.removed;
      global.state.motionPlan.coderWindowReferenceHandoff = true;
    }
    return finalized.rows;
  }

  const wrappedPlanner = Object.freeze({
    ...basePlanner,
    process,
    coderWindowReferenceHandoffV1: true
  });
  global.LabelerOrientationConstraintProgramPlanner = wrappedPlanner;
  global.LabelerCoderWindowReferenceHandoff = Object.freeze({
    installed: true,
    codingObjects,
    codingWindow,
    protectedServoReference,
    supersedableCodingReference,
    removeSupersededCodingReferences,
    ensureExplicitCodingHolds,
    process
  });
})(typeof window !== "undefined" ? window : globalThis);
