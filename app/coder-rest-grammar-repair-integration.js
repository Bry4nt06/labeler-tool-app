"use strict";

(function installCoderRestGrammarRepair() {
  const RETRY_MS = 50;
  const TOLERANCE = 0.5;
  const COMMAND_TOLERANCE = 0.001;
  const STAGE_ID = "grammar.coder-rest";
  let installed = false;

  const num = (value, fallback = NaN) => {
    if (value === null || value === undefined || value === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  function pipelineDriver() {
    return window.LabelerDriverRegistry?.resolve("profile.pipeline")
      || window.LabelerProfilePipelineDriver
      || null;
  }

  function grammarDriver() {
    return window.LabelerDriverRegistry?.resolve("servo.restCorrectionGrammar")
      || window.LabelerRestCorrectionGrammarDriver
      || null;
  }

  function codingHoldScore(row) {
    if (Number(row?.cmd) !== 3) return -1;
    const action = String(row?.action || "");
    let score = 0;
    if (row?.codingHold === true) score += 100;
    if (row?.coderAfterWipeHandoff === true && row?.orientationHold === true) score += 90;
    if (row?.codingObjectId && row?.orientationHold === true) score += 80;
    if (/hold.*(?:coding|code box)|(?:coding|code box).*hold|inspection\s*&?\s*coding|coding.*reference/i.test(action)) score += 70;
    return score || -1;
  }

  function actualCodingHoldIndex(rows) {
    const candidates = rows.map((row, index) => ({
      index,
      score: codingHoldScore(row),
      tableAngle: num(row?.tableAngle, -Infinity)
    })).filter((entry) => entry.score > 0);
    candidates.sort((left, right) => right.score - left.score || right.tableAngle - left.tableAngle);
    return candidates[0]?.index ?? -1;
  }

  function suspiciousFalseCodingHold(row, actualIndex, index) {
    if (index === actualIndex || Number(row?.cmd) !== 3) return false;
    return row?.codeBoxDirectionCorrected === true
      || (row?.codingMotion && !row?.codingHold)
      || (row?.codingReadyTableAngle && !row?.codingHold);
  }

  function finalizeSegmentCommands(rows) {
    const rest = Number(window.LabelerServoCommandDriver?.MOVE_TYPES?.REST ?? 3);
    const correction = Number(window.LabelerServoCommandDriver?.MOVE_TYPES?.CORRECTION ?? 7);
    return rows.map((row, index) => {
      const next = rows[index + 1];
      const moves = Boolean(next)
        && Math.abs(num(next?.plateAngle, 0) - num(row?.plateAngle, 0)) > COMMAND_TOLERANCE;
      return {
        ...row,
        cmd: moves ? correction : rest,
        segmentCommandFinalized: true
      };
    });
  }

  function repair(sourceRows) {
    if (!Array.isArray(sourceRows) || sourceRows.length < 2) return sourceRows;
    const driver = grammarDriver();
    const actualIndex = actualCodingHoldIndex(sourceRows);
    const result = driver?.reconcile
      ? driver.reconcile(sourceRows, {
        tolerance: TOLERANCE,
        preserveRestIndexes: actualIndex >= 0 ? [actualIndex] : [],
        shouldRepair: (row, index) => index === actualIndex
          || suspiciousFalseCodingHold(row, actualIndex, index)
      })
      : { rows: sourceRows.map((row) => ({ ...row })), repairs: [] };

    const repairsByIndex = new Map((result.repairs || []).map((entry) => [entry.index, entry]));
    const repairedRows = result.rows.map((row, index) => {
      const grammarRepair = repairsByIndex.get(index);
      if (!grammarRepair) return row;
      const preservingCodingHold = grammarRepair.strategy === "preserve-rest-target"
        || grammarRepair.strategy === "preserve-coding-release-handoff";
      return {
        ...row,
        coderRestGrammarRepaired: true,
        coderRestGrammarStrategy: grammarRepair.strategy,
        automaticCodingReleaseHandoff: grammarRepair.automaticCodingRelease === true,
        rejectedRestPlateTravel: grammarRepair.rejectedPlateTravel,
        rejectedFalseCodingHold: !preservingCodingHold,
        codeBoxDirectionCorrected: preservingCodingHold ? row.codeBoxDirectionCorrected : false
      };
    });
    const output = finalizeSegmentCommands(repairedRows);

    if (state?.motionPlan && typeof state.motionPlan === "object") {
      state.motionPlan.rows = output;
      state.motionPlan.coderRestGrammarRepairs = (result.repairs || []).map((grammarRepair) => ({
        hmi: grammarRepair.index + 1,
        strategy: grammarRepair.strategy,
        automaticCodingRelease: grammarRepair.automaticCodingRelease === true,
        rejectedPlateTravel: grammarRepair.rejectedPlateTravel,
        restoredPlateAngle: grammarRepair.restoredPlateAngle,
        alignedThroughHmi: Number.isInteger(grammarRepair.alignedThroughIndex)
          ? grammarRepair.alignedThroughIndex + 1
          : undefined
      }));
      state.motionPlan.restCorrectionGrammarDriver = true;
      state.motionPlan.segmentCommandFinalized = true;
      state.motionPlan.profilePipelineGrammarStage = STAGE_ID;
      state.motionPlan.finalPlateAngle = output.at(-1)?.plateAngle;
    }
    return output;
  }

  function registerPipelineStage() {
    const pipeline = pipelineDriver();
    if (!pipeline?.registerStage) return false;
    pipeline.registerStage({
      id: STAGE_ID,
      phase: "grammar",
      order: 600,
      source: "app/coder-rest-grammar-repair-integration.js",
      description: "Reconcile coder Rest/Correction transitions and derive CMD 3/7 ownership from final plate travel.",
      process: repair
    });
    window.LabelerCoderRestGrammarRepairProcessor = repair;
    return true;
  }

  function installLegacyWrapper() {
    const base = generatedServoProfile;
    generatedServoProfile = function generatedServoProfileWithCoderRestGrammarRepair(...args) {
      return repair(base.apply(this, args));
    };
    generatedServoProfile.coderRestGrammarRepair = true;
    window.generatedServoProfile = generatedServoProfile;
  }

  function install() {
    if (installed) return true;
    if (typeof generatedServoProfile !== "function"
      || typeof state === "undefined") return false;

    const pipelineManaged = registerPipelineStage();
    if (!pipelineManaged) installLegacyWrapper();
    installed = true;

    if (!pipelineManaged) {
      try {
        if (typeof applyGeneratedServoProfile === "function") applyGeneratedServoProfile();
        if (typeof render === "function") render();
      } catch (error) {
        console.error("Unable to reconcile coder Rest/Correction grammar.", error);
      }
    }
    return true;
  }

  function wait() {
    if (!install()) window.setTimeout(wait, RETRY_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wait, { once: true });
  } else {
    wait();
  }
})();
