"use strict";

(function installAplNeckFinalPadCompletion() {
  const RETRY_MS = 50;
  const EPS = 0.001;
  let installed = false;

  const number = (value, fallback = NaN) => {
    if (value === null || value === undefined || value === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const finish = (value) => typeof finishAngle === "function"
    ? finishAngle(value)
    : Math.round(number(value, 0) * 10) / 10;

  function enabledStation(machineMap, station) {
    try {
      return typeof isStationEnabled !== "function" || isStationEnabled(machineMap, station);
    } catch {
      return true;
    }
  }

  function sections(machineMap) {
    try {
      return typeof inferAplStationSections === "function"
        ? inferAplStationSections(machineMap)
        : { ...(machineMap?.stationSections || {}) };
    } catch {
      return { ...(machineMap?.stationSections || {}) };
    }
  }

  function neckTwoSurfaceStations(machineMap) {
    const stationSections = sections(machineMap);
    const grouped = new Map();
    (machineMap?.objects || [])
      .filter((item) => item?.kind === "pad" || item?.kind === "roller")
      .filter((item) => enabledStation(machineMap, Number(item.station)))
      .forEach((item) => {
        const station = Number(item.station);
        if (!Number.isFinite(station)) return;
        if (!grouped.has(station)) grouped.set(station, []);
        grouped.get(station).push(item);
      });

    return [...grouped.entries()].filter(([station, objects]) => {
      const section = stationSections[String(station)]
        || (typeof labelSectionForStation === "function" ? labelSectionForStation(station) : "");
      if (section !== "neck") return false;
      const preferredKind = objects.some((item) => item.kind === "pad") ? "pad" : "roller";
      const preferred = objects.filter((item) => item.kind === preferredKind);
      return preferred.some((item) => item.side !== "inner")
        && preferred.some((item) => item.side === "inner");
    }).map(([station]) => station);
  }

  function findIndex(rows, pattern, from = 0) {
    for (let index = Math.max(0, from); index < rows.length; index += 1) {
      if (pattern.test(String(rows[index]?.action || ""))) return index;
    }
    return -1;
  }

  function updateFollowingTransition(rows, holdIndex, correctedHold) {
    const followingIndex = holdIndex + 1;
    const following = rows[followingIndex];
    if (!following) return;

    if (Number(following.cmd) === 7) {
      const destination = rows[followingIndex + 1];
      const destinationPlate = number(destination?.plateAngle, NaN);
      const travel = number(destination?.tableAngle, NaN) - number(following.tableAngle, NaN);
      rows[followingIndex] = {
        ...following,
        plateAngle: finish(correctedHold),
        plannedRotation: Number.isFinite(destinationPlate) ? destinationPlate - correctedHold : following.plannedRotation,
        plannedRatio: Number.isFinite(destinationPlate) && travel > EPS
          ? Math.abs(destinationPlate - correctedHold) / travel
          : following.plannedRatio,
        neckFinalWipeContinuation: true
      };
      return;
    }

    const followingPlate = number(following.plateAngle, correctedHold);
    if (Math.abs(followingPlate - correctedHold) <= EPS) return;
    const start = number(rows[holdIndex]?.tableAngle, 0) + 0.5;
    const end = number(following.tableAngle, start);
    if (end <= start + EPS) return;
    rows.splice(followingIndex, 0, {
      hmi: 0,
      plc: 0,
      cmd: 7,
      tableAngle: finish(start),
      plateAngle: finish(correctedHold),
      action: "Continue After Complete Neck Wipe",
      section: "neck",
      mapDriven: true,
      neckFinalWipeContinuation: true,
      plannedRotation: followingPlate - correctedHold,
      plannedRatio: Math.abs(followingPlate - correctedHold) / Math.max(EPS, end - start)
    });
  }

  function completeRows(machineMap, sourceRows) {
    if (!machineMap || machineMap.applicationMode !== "apl" || !Array.isArray(sourceRows)) return sourceRows;
    const wipe = typeof sectionWipePlan === "function" ? sectionWipePlan("neck") : null;
    const fullSecondRotation = number(wipe?.labelDeg, NaN) + number(wipe?.overWipeDeg, 0) * 2;
    if (!Number.isFinite(fullSecondRotation) || fullSecondRotation <= EPS) return sourceRows;

    const rows = sourceRows.map((row) => ({ ...row }));
    const correctedStations = new Map();
    const capacityIssues = [];

    neckTwoSurfaceStations(machineMap).forEach((station) => {
      const suffix = `(?:\\D|$)`;
      const turn1Index = findIndex(rows, new RegExp(`^Wipe\\s+Turn\\s+1\\s+Neck(?:\\s+Label)?\\s*-\\s*Agg\\s*${station}${suffix}`, "i"));
      const turn2Index = turn1Index >= 0
        ? findIndex(rows, new RegExp(`^Wipe\\s+Turn\\s+2\\s+Neck(?:\\s+Label)?\\s*-\\s*Agg\\s*${station}${suffix}`, "i"), turn1Index + 1)
        : -1;
      const holdIndex = turn2Index >= 0
        ? findIndex(rows, new RegExp(`^Wipe\\s+Hold\\s+Neck(?:\\s+Label)?\\s*-\\s*Agg\\s*${station}${suffix}`, "i"), turn2Index + 1)
        : -1;
      if (turn1Index < 0 || turn2Index < 0 || holdIndex < 0) return;

      const firstStart = number(rows[turn1Index].plateAngle, NaN);
      const firstEnd = number(rows[turn2Index].plateAngle, NaN);
      const oldHold = number(rows[holdIndex].plateAngle, NaN);
      if (![firstStart, firstEnd, oldHold].every(Number.isFinite)) return;

      const firstRotation = number(rows[turn1Index].plannedRotation, firstEnd - firstStart);
      const oldSecondRotation = number(rows[turn2Index].plannedRotation, oldHold - firstEnd);
      const direction = Math.sign(oldSecondRotation) || -Math.sign(firstRotation) || -1;
      const desiredSecondRotation = direction * Math.max(Math.abs(oldSecondRotation), fullSecondRotation);
      if (Math.abs(oldSecondRotation) >= fullSecondRotation - 0.05) return;

      const correctedHold = firstEnd + desiredSecondRotation;
      const tableSpan = number(rows[holdIndex].tableAngle, 0) - number(rows[turn2Index].tableAngle, 0);
      const ratio = Math.abs(desiredSecondRotation) / Math.max(EPS, tableSpan);

      rows[turn2Index] = {
        ...rows[turn2Index],
        plannedRotation: desiredSecondRotation,
        plannedRatio: ratio,
        neckFinalPadFullLabelWipe: true,
        requiredSecondStageRotation: finish(fullSecondRotation)
      };
      rows[holdIndex] = {
        ...rows[holdIndex],
        plateAngle: finish(correctedHold),
        plannedRotation: desiredSecondRotation,
        plannedRatio: ratio,
        neckFinalPadFullLabelWipe: true,
        fullLabelWipeComplete: true
      };
      updateFollowingTransition(rows, holdIndex, correctedHold);
      correctedStations.set(station, { firstRotation, secondRotation: desiredSecondRotation, ratio });

      if (ratio >= number(state?.maxMoveRatio, 21)) {
        capacityIssues.push({
          level: "bad",
          code: "apl-neck-final-pad-capacity",
          station,
          section: "neck",
          message: `The inside wipe-down pad at Station ${station} needs ${Math.abs(desiredSecondRotation).toFixed(1)}° of bottle rotation to wipe from the first edge through the center and past the opposite edge, but its table-contact window only provides ${tableSpan.toFixed(1)}° (${ratio.toFixed(2)}:1; limit ${number(state?.maxMoveRatio, 21).toFixed(1)}:1). Increase the inside pad contact span.`
        });
      }
    });

    if (!correctedStations.size) return sourceRows;
    const output = rows.map((row, index) => ({ ...row, hmi: index + 1, plc: index }));
    if (state.motionPlan && typeof state.motionPlan === "object") {
      state.motionPlan.rows = output;
      state.motionPlan.profileVariant = "apl-neck-final-pad-full-label-v2";
      state.motionPlan.neckFinalPadFullLabelWipe = true;
      state.motionPlan.stationPlans = (Array.isArray(state.motionPlan.stationPlans) ? state.motionPlan.stationPlans : []).map((plan) => {
        const correction = correctedStations.get(Number(plan.station));
        if (!correction || plan.section !== "neck") return plan;
        return {
          ...plan,
          requiredRotation: Math.abs(correction.firstRotation) + Math.abs(correction.secondRotation),
          movePath: [correction.firstRotation, correction.secondRotation],
          directionChanges: Math.sign(correction.firstRotation) !== Math.sign(correction.secondRotation) ? 1 : 0,
          neckFinalPadFullLabelWipe: true
        };
      });
      const previousIssues = Array.isArray(state.motionPlan.issues) ? state.motionPlan.issues : [];
      state.motionPlan.issues = [
        ...previousIssues.filter((issue) => issue?.code !== "apl-neck-final-pad-capacity"),
        ...capacityIssues
      ];
      state.motionPlan.finalPlateAngle = output.at(-1)?.plateAngle;
    }
    return output;
  }

  function install() {
    if (installed) return true;
    if (typeof window.generatedAplMapDrivenProfile !== "function" || typeof state === "undefined") return false;
    const base = window.generatedAplMapDrivenProfile;
    window.generatedAplMapDrivenProfile = function generatedAplMapDrivenProfileWithCompleteNeckFinalPad(machineMap, ...args) {
      return completeRows(machineMap, base.call(this, machineMap, ...args));
    };
    window.generatedAplMapDrivenProfile.neckFinalPadFullLabelV2 = true;
    try { generatedAplMapDrivenProfile = window.generatedAplMapDrivenProfile; } catch { }
    installed = true;
    try {
      if (typeof applyGeneratedServoProfile === "function") applyGeneratedServoProfile();
      if (typeof render === "function") render();
    } catch (error) {
      console.error("Unable to complete the final Neck wipe-down pad motion.", error);
    }
    return true;
  }

  function wait() {
    if (!install()) window.setTimeout(wait, RETRY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait, { once: true });
  else wait();
})();
