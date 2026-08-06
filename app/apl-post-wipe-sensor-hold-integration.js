"use strict";

(function installAplPostWipeSensorHold(global) {
  if (global.LabelerAplPostWipeSensorHold?.version >= 2) return;

  const STAGE_ID = "motion.apl-post-wipe-sensor-hold";
  const ORIENTATION_STAGE_ID = "orientation.map-objects";
  const STAGE_ORDER = 350;
  const HOLD_TRAVEL_DEG = 0.5;
  const MIN_SPACING_DEG = 0.1;
  const EPS = 0.001;
  const RETRY_MS = 50;

  const finite = (value, fallback = NaN) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const text = (value) => String(value ?? "").trim();
  const isCmd7 = (row) => Number(row?.cmd) === 7;
  const isCmd3 = (row) => Number(row?.cmd) === 3;
  const isWipeTurn1 = (row) => isCmd7(row) && /\bWipe\s+Turn\s+1\b/i.test(text(row?.action));
  const isWipeTurn2 = (row) => isCmd7(row) && /\bWipe\s+Turn\s+2\b/i.test(text(row?.action));
  const isMovingWipeHold = (row) => isCmd7(row) && /\bWipe\s+Hold\b/i.test(text(row?.action));
  const isSensorHold = (row) => isCmd3(row)
    && Boolean(
      row?.sensorId
      || (Array.isArray(row?.sensorIds) && row.sensorIds.length)
      || row?.orientationHold
      || /sensor|inspection|orientation/i.test(text(row?.action))
    );

  function done(value) {
    return typeof global.finishAngle === "function"
      ? global.finishAngle(value)
      : Math.round(finite(value, 0) * 10) / 10;
  }

  function sectionName(value) {
    const section = text(value).toLowerCase();
    return section ? `${section.charAt(0).toUpperCase()}${section.slice(1)}` : "Label";
  }

  function sensorTurnStart(holdTable, sensorTable, preferred = HOLD_TRAVEL_DEG) {
    const start = finite(holdTable, NaN);
    const stop = finite(sensorTable, NaN);
    if (!Number.isFinite(start) || !Number.isFinite(stop) || stop <= start + MIN_SPACING_DEG * 2) return NaN;
    const requested = start + preferred;
    if (requested < stop - MIN_SPACING_DEG) return done(requested);
    return done(start + (stop - start) / 2);
  }

  function clearOrientationMetadata(row) {
    const output = { ...row };
    [
      "orientationObjectId",
      "orientationObjectIds",
      "sensorId",
      "sensorIds",
      "codingObjectId",
      "codingObjectIds",
      "mapObjectOrientation",
      "mapObjectOrientationContinuation",
      "orientationConstraintPlanner",
      "orientationConstraintMerged",
      "orientationConstraintContinuation",
      "orientationHold",
      "inspectionWindowStart",
      "inspectionWindowStop",
      "autoTargetSource",
      "requiredLabelVisibilityPercent",
      "plannedLabelVisibilityPercent"
    ].forEach((field) => delete output[field]);
    return output;
  }

  function stoppedWipeReference(source) {
    return {
      ...clearOrientationMetadata(source),
      cmd: 3,
      baseCmd: 3,
      plateAngle: done(source?.plateAngle),
      plannerIntent: "HOLD",
      plannerRequestedCommand: 3,
      plannerRecommendedCommand: 3,
      plannerReason: "A stopped reference closes the two-command wipe pair before sensor setup.",
      plannedRotation: 0,
      plannedRatio: 0,
      stage: "complete",
      wipeSensorSetupHold: true,
      sensorSetupBoundary: true,
      commandTranslated: false,
      motionProfileApplied: false
    };
  }

  function sensorMetadata(source, sensorHold) {
    const output = {};
    [
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
      "autoTargetSource",
      "requiredLabelVisibilityPercent",
      "plannedLabelVisibilityPercent"
    ].forEach((field) => {
      if (source?.[field] !== undefined) output[field] = source[field];
      else if (sensorHold?.[field] !== undefined) output[field] = sensorHold[field];
    });
    return output;
  }

  function sensorTurnAction(row, sensorHold) {
    const holdAction = text(sensorHold?.action);
    const through = holdAction.match(/\bthrough\s+(.+)$/i);
    const subject = through?.[1] || "Label Sensor";
    return `Orient ${sectionName(row?.section || sensorHold?.section)} Label for ${subject}`;
  }

  function maxConsecutiveCorrections(rows) {
    let longest = 0;
    let current = 0;
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      current = isCmd7(row) ? current + 1 : 0;
      longest = Math.max(longest, current);
    });
    return longest;
  }

  function sameWipePair(first, second) {
    const firstStation = finite(first?.station, NaN);
    const secondStation = finite(second?.station, NaN);
    const firstSection = text(first?.section).toLowerCase();
    const secondSection = text(second?.section).toLowerCase();
    return (!Number.isFinite(firstStation) || !Number.isFinite(secondStation) || firstStation === secondStation)
      && (!firstSection || !secondSection || firstSection === secondSection);
  }

  function repair(sourceRows) {
    const rows = (Array.isArray(sourceRows) ? sourceRows : []).map((row) => ({ ...row }));
    const changes = [];
    const unresolved = [];

    for (let index = 0; index < rows.length - 3; index += 1) {
      const first = rows[index];
      const second = rows[index + 1];
      const movingHold = rows[index + 2];
      const sensorHold = rows[index + 3];

      if (!isWipeTurn1(first)
        || !isWipeTurn2(second)
        || !sameWipePair(first, second)
        || !isMovingWipeHold(movingHold)
        || !isSensorHold(sensorHold)) continue;

      const turnTable = sensorTurnStart(movingHold.tableAngle, sensorHold.tableAngle);
      if (!Number.isFinite(turnTable)) {
        unresolved.push({
          station: second.station,
          section: second.section,
          sensorId: movingHold.sensorId || sensorHold.sensorId,
          reason: "insufficient-table-spacing",
          message: `Move the ${sectionName(second.section).toLowerCase()} sensor later so a stopped reference can separate Wipe Turn 2 from sensor setup.`
        });
        continue;
      }

      const wipeHold = stoppedWipeReference(movingHold);
      const startPlate = finite(movingHold.plateAngle, 0);
      const targetPlate = finite(sensorHold.plateAngle, startPlate);
      const tableTravel = finite(sensorHold.tableAngle, turnTable) - turnTable;
      const sensorTurn = {
        ...movingHold,
        ...sensorMetadata(movingHold, sensorHold),
        cmd: 7,
        baseCmd: 7,
        tableAngle: turnTable,
        plateAngle: done(startPlate),
        action: sensorTurnAction(movingHold, sensorHold),
        stage: "sensor-setup",
        plannerIntent: "ROTATE",
        plannerRequestedCommand: 7,
        plannerRecommendedCommand: 7,
        plannerReason: "Begin sensor orientation only after the post-wipe stopped reference.",
        plannedRotation: targetPlate - startPlate,
        plannedRatio: Math.abs(targetPlate - startPlate) / Math.max(EPS, tableTravel),
        orientationConstraintContinuation: true,
        postWipeSensorSetup: true,
        sensorSetupAfterHold: true,
        wipeSensorSetupHoldTableAngle: done(movingHold.tableAngle),
        commandTranslated: false,
        motionProfileApplied: false
      };

      rows.splice(index + 2, 1, wipeHold, sensorTurn);
      changes.push({
        station: second.station,
        section: second.section,
        wipeHoldTableAngle: wipeHold.tableAngle,
        sensorTurnTableAngle: sensorTurn.tableAngle,
        sensorHoldTableAngle: sensorHold.tableAngle,
        sensorId: sensorTurn.sensorId || sensorHold.sensorId
      });
      index += 3;
    }

    const numbered = rows.map((row, index) => ({ ...row, hmi: index + 1, plc: index }));
    return {
      rows: numbered,
      changes,
      unresolved,
      maxConsecutiveCorrections: maxConsecutiveCorrections(numbered)
    };
  }

  function process(rows) {
    const result = repair(rows);
    if (global.state?.motionPlan && typeof global.state.motionPlan === "object") {
      global.state.motionPlan.aplPostWipeSensorHold = {
        version: 2,
        applied: result.changes.length > 0,
        changes: result.changes,
        unresolved: result.unresolved,
        maxConsecutiveCorrections: result.maxConsecutiveCorrections
      };
    }
    return result.rows;
  }

  function pipeline() {
    return global.LabelerDriverRegistry?.resolve?.("profile.pipeline")
      || global.LabelerProfilePipelineDriver
      || null;
  }

  function install() {
    const profilePipeline = pipeline();
    if (!profilePipeline?.registerStage || !profilePipeline.getStage?.(ORIENTATION_STAGE_ID)) return false;
    profilePipeline.registerStage({
      id: STAGE_ID,
      phase: "motion",
      order: STAGE_ORDER,
      source: "app/apl-post-wipe-sensor-hold-integration.js",
      description: "Convert the moving post-wipe handoff into a stopped reference followed by a separate map-positioned sensor turn.",
      process
    });

    global.LabelerAplPostWipeSensorHold = Object.freeze({
      installed: true,
      version: 2,
      stageId: STAGE_ID,
      order: STAGE_ORDER,
      holdTravelDeg: HOLD_TRAVEL_DEG,
      isWipeTurn1,
      isWipeTurn2,
      isMovingWipeHold,
      isSensorHold,
      sensorTurnStart,
      maxConsecutiveCorrections,
      repair,
      process
    });

    try {
      global.applyGeneratedServoProfile?.();
      global.renderProgram?.();
      global.renderValidation?.();
    } catch (error) {
      console.error("Unable to apply the post-wipe sensor hold policy.", error);
    }
    return true;
  }

  function wait() {
    if (!install()) global.setTimeout(wait, RETRY_MS);
  }

  wait();
})(typeof window !== "undefined" ? window : globalThis);
