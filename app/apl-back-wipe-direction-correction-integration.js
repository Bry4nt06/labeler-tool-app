"use strict";

(function installAplBackWipeDirectionCorrection() {
  const RETRY_MS = 50;
  const EPSILON = 0.001;
  let installed = false;

  function numeric(value, fallback = NaN) {
    if (value === null || value === undefined || value === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function finish(value) {
    return typeof finishAngle === "function"
      ? finishAngle(value)
      : Math.round(numeric(value, 0) * 10) / 10;
  }

  function isTargetProgram() {
    if (typeof state === "undefined"
      || state.applicationMode !== "apl"
      || typeof selectedLabelApplicationState !== "function") return false;
    const applications = selectedLabelApplicationState();
    return Boolean(!applications.neck && applications.body && applications.back);
  }

  function actionFor(row) {
    return String(row?.action || "");
  }

  function findFollowing(rows, startIndex, pattern) {
    for (let index = Math.max(0, startIndex); index < rows.length; index += 1) {
      if (pattern.test(actionFor(rows[index]))) return index;
    }
    return -1;
  }

  function updateFollowingTransition(rows, referenceIndex) {
    const transitionIndex = referenceIndex + 1;
    const transition = rows[transitionIndex];
    const target = rows[transitionIndex + 1];
    if (!transition || Number(transition.cmd) !== 7 || !target) return;

    const referenceAngle = numeric(rows[referenceIndex]?.plateAngle, NaN);
    const targetAngle = numeric(target.plateAngle, NaN);
    if (!Number.isFinite(referenceAngle) || !Number.isFinite(targetAngle)) return;

    const tableTravel = numeric(target.tableAngle, 0) - numeric(transition.tableAngle, 0);
    const rotation = targetAngle - referenceAngle;
    rows[transitionIndex] = {
      ...transition,
      plateAngle: finish(referenceAngle),
      plannedRotation: rotation,
      plannedRatio: Math.abs(rotation) / Math.max(EPSILON, tableTravel),
      backWipeDirectionCorrected: true
    };
  }

  function correctBackWipeDirection(sourceRows) {
    if (!isTargetProgram() || !Array.isArray(sourceRows) || !sourceRows.length) return sourceRows;

    const rows = sourceRows.map((row) => ({ ...row }));
    const correctedPlans = new Map();

    for (let turn1Index = 0; turn1Index < rows.length; turn1Index += 1) {
      const match = actionFor(rows[turn1Index]).match(/^Wipe\s+Turn\s+1\s+Back\s*-\s*Agg\s*(\d+)/i);
      if (!match) continue;

      const station = Number(match[1]);
      const turn2Pattern = new RegExp(`^Wipe\\s+Turn\\s+2\\s+Back\\s*-\\s*Agg\\s*${station}(?:\\D|$)`, "i");
      const holdPattern = new RegExp(`^Wipe\\s+Hold\\s+Back\\s*-\\s*Agg\\s*${station}(?:\\D|$)`, "i");
      const turn2Index = findFollowing(rows, turn1Index + 1, turn2Pattern);
      const holdIndex = turn2Index >= 0 ? findFollowing(rows, turn2Index + 1, holdPattern) : -1;
      if (turn2Index < 0 || holdIndex < 0) continue;

      const applicationAngle = numeric(rows[turn1Index].plateAngle, NaN);
      const oldTurn2Angle = numeric(rows[turn2Index].plateAngle, NaN);
      const oldHoldAngle = numeric(rows[holdIndex].plateAngle, NaN);
      if (![applicationAngle, oldTurn2Angle, oldHoldAngle].every(Number.isFinite)) continue;

      const oldFirstRotation = oldTurn2Angle - applicationAngle;
      const oldSecondRotation = oldHoldAngle - oldTurn2Angle;
      const correctedFirstRotation = -oldFirstRotation;
      const correctedSecondRotation = -oldSecondRotation;
      const correctedTurn2Angle = applicationAngle + correctedFirstRotation;
      const correctedHoldAngle = correctedTurn2Angle + correctedSecondRotation;

      rows[turn1Index] = {
        ...rows[turn1Index],
        plannedRotation: correctedFirstRotation,
        backWipeDirectionCorrected: true,
        physicalWipeDirection: "reversed-from-v3"
      };
      rows[turn2Index] = {
        ...rows[turn2Index],
        plateAngle: finish(correctedTurn2Angle),
        plannedRotation: correctedSecondRotation,
        backWipeDirectionCorrected: true,
        physicalWipeDirection: "reversed-from-v3"
      };
      rows[holdIndex] = {
        ...rows[holdIndex],
        plateAngle: finish(correctedHoldAngle),
        backWipeDirectionCorrected: true,
        physicalWipeDirection: "reversed-from-v3"
      };

      correctedPlans.set(station, [correctedFirstRotation, correctedSecondRotation]);
      updateFollowingTransition(rows, holdIndex);
    }

    if (!correctedPlans.size) return sourceRows;

    const reindexed = rows.map((row, index) => ({
      ...row,
      hmi: index + 1,
      plc: index,
      motionSource: row.motionSource === "apl-map-driven-no-neck-body-back-v3"
        ? "apl-map-driven-no-neck-body-back-v4"
        : row.motionSource
    }));

    if (state.motionPlan && typeof state.motionPlan === "object") {
      state.motionPlan.rows = reindexed;
      state.motionPlan.profileKind = "apl-map-driven";
      state.motionPlan.profileVariant = "no-neck-body-back-v4";
      state.motionPlan.backWipeDirectionCorrected = true;
      state.motionPlan.stationPlans = (Array.isArray(state.motionPlan.stationPlans)
        ? state.motionPlan.stationPlans
        : []).map((plan) => {
        const movePath = correctedPlans.get(Number(plan.station));
        if (plan.section !== "back" || !movePath) return plan;
        return {
          ...plan,
          movePath,
          directionChanges: Math.sign(movePath[0]) !== Math.sign(movePath[1]) ? 1 : 0,
          backWipeDirectionCorrected: true
        };
      });
      state.motionPlan.finalPlateAngle = reindexed.at(-1)?.plateAngle;
    }

    return reindexed;
  }

  function install() {
    if (installed) return true;
    if (typeof state === "undefined"
      || typeof generatedAplMapDrivenProfile !== "function"
      || generatedAplMapDrivenProfile.backWipeDirectionCorrection) return false;

    const base = generatedAplMapDrivenProfile;
    generatedAplMapDrivenProfile = function generatedAplMapDrivenProfileWithCorrectBackWipeDirection(machineMap, ...args) {
      return correctBackWipeDirection(base.call(this, machineMap, ...args));
    };
    generatedAplMapDrivenProfile.backWipeDirectionCorrection = true;
    installed = true;

    try {
      if (isTargetProgram() && typeof applyGeneratedServoProfile === "function") {
        applyGeneratedServoProfile();
        if (typeof render === "function") render();
      }
    } catch (error) {
      console.error("Unable to refresh the corrected Back-label wipe direction.", error);
    }
    return true;
  }

  function wait() {
    if (install()) return;
    window.setTimeout(wait, RETRY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait, { once: true });
  else wait();
})();