"use strict";

(function installAplNoNeckBodyBackProfile() {
  const RETRY_MS = 50;
  const EPSILON = 0.001;
  let installed = false;

  function number(value, fallback = NaN) {
    if (value === null || value === undefined || value === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function rounded(value) {
    return typeof finishAngle === "function"
      ? finishAngle(value)
      : Math.round(number(value, 0) * 10) / 10;
  }

  function circularDistance(left, right) {
    return Math.abs(((number(left, 0) - number(right, 0) + 540) % 360) - 180);
  }

  function nearestEquivalent(target, reference) {
    const base = number(target, 0);
    const current = number(reference, base);
    return base + 360 * Math.round((current - base) / 360);
  }

  function isTargetProgram() {
    if (typeof state === "undefined"
      || state.applicationMode !== "apl"
      || typeof selectedLabelApplicationState !== "function") return false;
    const applications = selectedLabelApplicationState();
    return Boolean(!applications.neck && applications.body && applications.back);
  }

  function stationSections(machineMap) {
    try {
      return typeof inferAplStationSections === "function"
        ? inferAplStationSections(machineMap)
        : { ...(machineMap?.stationSections || {}) };
    } catch {
      return { ...(machineMap?.stationSections || {}) };
    }
  }

  function stationIsEnabled(machineMap, station) {
    try {
      return typeof isStationEnabled !== "function" || isStationEnabled(machineMap, station);
    } catch {
      return true;
    }
  }

  function stationSequence(machineMap) {
    const sections = stationSections(machineMap);
    const grouped = new Map();
    (machineMap?.objects || [])
      .filter((item) => item.kind === "pad" || item.kind === "roller")
      .filter((item) => stationIsEnabled(machineMap, Number(item.station)))
      .forEach((item) => {
        const station = Number(item.station);
        if (!Number.isFinite(station)) return;
        if (!grouped.has(station)) grouped.set(station, []);
        grouped.get(station).push(item);
      });

    return [...grouped.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([station, objects]) => ({
        station,
        objects,
        section: String(sections[String(station)] || (typeof labelSectionForStation === "function" ? labelSectionForStation(station) : ""))
      }))
      .filter((entry) => entry.section === "body" || entry.section === "back");
  }

  function geometryTargets() {
    const label = typeof selectedLabelSpec === "function" ? selectedLabelSpec() : null;
    const bottle = typeof selectedBottleSpec === "function" ? selectedBottleSpec() : null;
    const bottleCirc = typeof bodyCircumference === "function" ? bodyCircumference(bottle) : NaN;
    const neckCirc = number(label?.neckBottomCircumferenceMm, NaN);
    const input = state.buildInputs || {};
    const centerFront = typeof buildProgramSummary === "function"
      ? number(buildProgramSummary().rows.find(([name]) => name === "Center Line Front (deg)")?.[1], NaN)
      : NaN;
    const centerBack = Number.isFinite(centerFront) ? centerFront + 180 : NaN;
    const neckContact = typeof degFromMm === "function" ? number(degFromMm(input.neckContactMm, neckCirc), NaN) : NaN;
    const bodyContact = typeof degFromMm === "function" ? number(degFromMm(input.bodyContactMm, bottleCirc), NaN) : NaN;
    const backContact = typeof degFromMm === "function" ? number(degFromMm(input.backContactMm, bottleCirc), NaN) : NaN;
    const neckOffset = typeof degFromMm === "function" ? number(degFromMm(input.neckOffsetMm, neckCirc), 0) : 0;
    const bodyOffset = typeof degFromMm === "function" ? number(degFromMm(input.bodyOffsetMm, bottleCirc), 0) : 0;
    const backOffset = typeof degFromMm === "function" ? number(degFromMm(input.backOffsetMm, bottleCirc), 0) : 0;
    const inspectionOffset = typeof degFromMm === "function" ? number(degFromMm(input.backInspectionOffsetMm, bottleCirc), 0) : 0;
    const bodyFull = typeof degFromMm === "function" ? number(degFromMm(label?.bodyLengthMm, bottleCirc), NaN) : NaN;
    const backFull = typeof degFromMm === "function" ? number(degFromMm(label?.backLengthMm, bottleCirc), NaN) : NaN;
    const codeBox = typeof degFromMm === "function" ? number(degFromMm(label?.codeBoxCenterMm, bottleCirc), NaN) : NaN;
    const bodyHalf = Number.isFinite(bodyFull) ? bodyFull / 2 : NaN;
    const backHalf = Number.isFinite(backFull) ? backFull / 2 : NaN;
    const leading = input.neckApplication === "Leading Edge";

    const bodyAdjustedCenter = Number.isFinite(centerFront) && Number.isFinite(bodyContact)
      ? centerFront + bodyContact
      : NaN;
    const backAdjustedCenter = Number.isFinite(centerBack) && Number.isFinite(backContact)
      ? centerBack + backContact
      : NaN;

    let body = [bodyAdjustedCenter, neckContact, bodyHalf].every(Number.isFinite)
      ? (leading
        ? (bodyAdjustedCenter - (neckOffset + neckContact)) - bodyHalf + bodyOffset
        : (bodyAdjustedCenter - neckOffset + neckContact) - bodyHalf + bodyOffset)
      : number(input.plateStartPositionDeg, 0);

    let back = [backAdjustedCenter, neckContact, backHalf].every(Number.isFinite)
      ? (leading
        ? (backAdjustedCenter - (neckOffset + neckContact)) - backHalf + backOffset
        : (backAdjustedCenter - neckOffset + neckContact) - backHalf + backOffset)
      : body + 180;

    if (circularDistance(back, body) < 90) back += 180;

    const coder = [centerBack, neckContact, backHalf, codeBox].every(Number.isFinite)
      ? (leading
        ? (centerBack - (neckOffset + neckContact)) + (backHalf - codeBox) + backOffset + inspectionOffset
        : (centerBack - neckOffset + neckContact) + (backHalf - codeBox) + backOffset + inspectionOffset)
      : back;

    return { body, back, coder };
  }

  function contactRange(objects) {
    const preferredKind = objects.some((item) => item.kind === "pad") ? "pad" : "roller";
    const preferred = objects.filter((item) => item.kind === preferredKind);
    if (!preferred.length) return null;
    const starts = preferred.map((item) => number(item.start, item.angle)).filter(Number.isFinite);
    const ends = preferred.map((item) => {
      const start = number(item.start, item.angle);
      return number(item.end, start + number(item.wipeSpanDeg, 0.1));
    }).filter(Number.isFinite);
    if (!starts.length || !ends.length) return null;
    return {
      start: Math.min(...starts),
      end: Math.max(...ends),
      objects: preferred,
      side: preferred.every((item) => item.side === "inner") ? "inner" : "outer"
    };
  }

  function aggregateAngle(machineMap, station) {
    return number(
      machineMap?.aggregateAngles?.[String(station)],
      number(machineMap?.stationAngles?.[String(station)], NaN)
    );
  }

  function sectionTarget(rawTarget, reference) {
    return nearestEquivalent(rawTarget, reference);
  }

  function wipeMotion(section, side, wipe) {
    const backSpin = Math.max(0, number(wipe?.backSpinRequired, number(wipe?.stages?.[0]?.requiredRotation, 0)));
    const forward = Math.max(0, number(wipe?.forwardWipeRequired, number(wipe?.stages?.[1]?.requiredRotation, 0)));
    const sectionSign = section === "back" ? -1 : 1;
    const sideSign = side === "inner" ? -1 : 1;
    const orientation = sectionSign * sideSign;
    return {
      backSpin,
      forward,
      first: -backSpin * orientation,
      second: forward * orientation,
      totalRequired: backSpin + forward
    };
  }

  function rebuildProfile(machineMap) {
    const commandDriver = window.LabelerServoCommandDriver;
    const sequence = stationSequence(machineMap);
    if (!sequence.some((entry) => entry.section === "body")
      || !sequence.some((entry) => entry.section === "back")) return null;

    const targets = geometryTargets();
    const issues = [];
    const stationPlans = [];
    const rows = [];
    let plate = number(state.buildInputs?.plateStartPositionDeg, 0);
    let lastTable = 0;

    const add = (cmd, tableAngle, plateAngle, action, extra = {}) => {
      let table = number(tableAngle, lastTable + 0.5);
      if (rows.length && table <= lastTable + EPSILON) table = lastTable + 0.5;
      rows.push({
        hmi: rows.length + 1,
        plc: rows.length,
        cmd,
        tableAngle: rounded(table),
        plateAngle: rounded(plateAngle),
        action,
        motionSource: "apl-map-driven-no-neck-body-back-v3",
        mapDriven: true,
        noNeckBodyBackProfile: true,
        ...extra
      });
      lastTable = table;
    };

    const addReferenceTurn = (targetTable, targetPlate, action, extra = {}) => {
      const table = number(targetTable, lastTable + 0.5);
      const target = sectionTarget(targetPlate, plate);
      const rotation = target - plate;
      if (Math.abs(rotation) <= EPSILON) {
        add(3, table, plate, action.replace(/^Turn/i, "Hold"), {
          ...extra,
          applicationReference: true,
          plannedRotation: 0,
          plannedRatio: 0
        });
        return;
      }
      const start = lastTable + 0.5;
      const available = Math.max(EPSILON, table - start);
      const ratio = Math.abs(rotation) / available;
      add(7, start, plate, action, {
        ...extra,
        plannedRotation: rotation,
        plannedRatio: ratio,
        applicationTransition: true
      });
      plate = target;
      add(3, table, plate, `${action.replace(/^Turn/i, "Hold")} - Reference`, {
        ...extra,
        plannedRotation: rotation,
        plannedRatio: ratio,
        applicationReference: true
      });
      if (ratio >= number(state.maxMoveRatio, 21)) {
        issues.push({
          level: "bad",
          code: "apl-application-transition-capacity",
          station: extra.station,
          section: extra.section,
          message: `${action} requires ${Math.abs(rotation).toFixed(1)} deg of bottle rotation in ${available.toFixed(1)} deg of table travel (${ratio.toFixed(2)}:1; limit ${number(state.maxMoveRatio, 21).toFixed(1)}:1). Move the aggregate later or finish the preceding wipe earlier.`
        });
      }
    };

    add(3, 0, plate, "Zero Line", { startupReference: true });

    sequence.forEach((entry) => {
      const range = contactRange(entry.objects);
      const wipe = typeof sectionWipePlan === "function" ? sectionWipePlan(entry.section) : null;
      if (!range || !wipe) {
        issues.push({
          level: "bad",
          code: "apl-no-neck-station-contact-missing",
          station: entry.station,
          section: entry.section,
          message: `Aggregate ${entry.station} has no usable ${entry.section} wipe-down contact window.`
        });
        return;
      }

      const aggregate = aggregateAngle(machineMap, entry.station);
      const applicationPoint = aggregate - number(typeof profileTiming !== "undefined" ? profileTiming.spenderArriveEarly : 1, 1);
      const rawTarget = entry.section === "back" ? targets.back : targets.body;
      addReferenceTurn(applicationPoint, rawTarget, `Turn for ${typeof sectionLabel === "function" ? sectionLabel(entry.section) : entry.section} Application - Agg ${entry.station}`, {
        station: entry.station,
        section: entry.section
      });

      let start = number(range.start, lastTable + 0.5);
      let end = number(range.end, start + 0.1);
      if (start <= lastTable + EPSILON) start = lastTable + 0.5;
      if (end <= start + EPSILON) end = start + 0.5;

      const motion = wipeMotion(entry.section, range.side, wipe);
      const total = Math.max(EPSILON, motion.totalRequired);
      const split = start + (end - start) * (motion.backSpin / total);
      const firstRatio = Math.abs(motion.first) / Math.max(EPSILON, split - start);
      const secondRatio = Math.abs(motion.second) / Math.max(EPSILON, end - split);
      const labelName = typeof sectionLabel === "function" ? sectionLabel(entry.section) : entry.section;

      add(7, start, plate, `Wipe Turn 1 ${labelName} - Agg ${entry.station}`, {
        station: entry.station,
        section: entry.section,
        stage: "set-down",
        contactSide: range.side,
        plannedRotation: motion.first,
        plannedRatio: firstRatio
      });
      plate += motion.first;
      add(7, split, plate, `Wipe Turn 2 ${labelName} - Agg ${entry.station}`, {
        station: entry.station,
        section: entry.section,
        stage: "wipe",
        contactSide: range.side,
        plannedRotation: motion.second,
        plannedRatio: secondRatio
      });
      plate += motion.second;
      add(3, end, plate, `Wipe Hold ${labelName} - Agg ${entry.station}`, {
        station: entry.station,
        section: entry.section,
        stage: "complete",
        contactSide: range.side,
        wipeReference: true
      });

      [[firstRatio, motion.first, split - start, 1], [secondRatio, motion.second, end - split, 2]].forEach(([ratio, rotation, span, turn]) => {
        if (ratio < number(state.maxMoveRatio, 21)) return;
        issues.push({
          level: "bad",
          code: "apl-object-contact-capacity",
          station: entry.station,
          section: entry.section,
          message: `Wipe Turn ${turn} ${labelName} - Agg ${entry.station} requires ${Math.abs(rotation).toFixed(1)} deg of bottle rotation in ${span.toFixed(1)} deg of pad contact (${ratio.toFixed(2)}:1; limit ${number(state.maxMoveRatio, 21).toFixed(1)}:1). Increase the pad contact span or adjust the map.`
        });
      });

      stationPlans.push({
        station: entry.station,
        section: entry.section,
        active: true,
        valid: true,
        requiredRotation: motion.totalRequired,
        movePath: [motion.first, motion.second],
        directionChanges: Math.sign(motion.first) !== Math.sign(motion.second) ? 1 : 0,
        objects: entry.objects,
        contactSide: range.side
      });
    });

    const codingObject = (machineMap?.objects || []).find((item) => item.kind === "coding");
    if (codingObject) {
      const codingStart = number(codingObject.start, 304);
      const codingStop = number(codingObject.end, codingStart + 5);
      const desiredReady = codingStart - number(typeof profileTiming !== "undefined" ? profileTiming.codingArriveEarlyDeg : 75, 75);
      const codingReady = desiredReady > lastTable + 0.5 ? desiredReady : codingStart;
      const target = sectionTarget(targets.coder, plate);
      const transitionStart = lastTable + 0.5;
      const available = Math.max(EPSILON, codingReady - transitionStart);
      const rotation = target - plate;
      const ratio = Math.abs(rotation) / available;

      if (codingReady <= transitionStart + EPSILON) {
        issues.push({
          level: "bad",
          code: "coding-window-passed",
          message: `The coder begins at ${codingStart.toFixed(1)} deg table before the Back wipe can establish a reference at ${lastTable.toFixed(1)} deg. Move the coder later or finish Aggregate ${sequence.at(-1)?.station ?? 6} earlier.`
        });
      } else {
        if (Math.abs(rotation) > EPSILON) {
          add(7, transitionStart, plate, "Center Back Code Box at Coder", {
            section: "coding",
            codingMotion: "code-box-centerline",
            codingWindowStart: rounded(codingStart),
            codingWindowStop: rounded(codingStop),
            codingReadyTableAngle: rounded(codingReady),
            plannedRotation: rotation,
            plannedRatio: ratio
          });
          plate = target;
        }
        add(3, codingReady, plate, "Hold Back Code Box Centerline at Coder", {
          section: "coding",
          codingHold: true,
          codingWindowStart: rounded(codingStart),
          codingWindowStop: rounded(codingStop),
          codingReadyTableAngle: rounded(codingReady),
          codeBoxCenterlineAligned: true
        });
      }

      const endCurveTable = Math.max(359, codingStop + 0.5);
      const endCurveTarget = nearestEquivalent(number(state.buildInputs?.plateStartPositionDeg, 0), plate);
      const releaseRotation = endCurveTarget - plate;
      const releaseSpan = Math.max(EPSILON, endCurveTable - codingStop);
      add(7, codingStop, plate, "Return Bottle to End Curve Reference After Coding", {
        section: "coding",
        codingRelease: true,
        plannedRotation: releaseRotation,
        plannedRatio: Math.abs(releaseRotation) / releaseSpan,
        codeBoxCenterlineAligned: true
      });
      plate = endCurveTarget;
      add(3, endCurveTable, plate, "End Curve - Rest", {
        terminalRest: true,
        motionSource: "terminal-end-curve-rest",
        codeBoxCenterlineAligned: true
      });

      if (ratio >= number(state.maxMoveRatio, 21)) {
        issues.push({
          level: "bad",
          code: "coding-centerline-capacity",
          message: `Centering the Back code box at the coder requires ${Math.abs(rotation).toFixed(1)} deg of bottle rotation in ${available.toFixed(1)} deg of table travel (${ratio.toFixed(2)}:1; limit ${number(state.maxMoveRatio, 21).toFixed(1)}:1). Move the coder later or finish Aggregate ${sequence.at(-1)?.station ?? 6} earlier.`
        });
      }
    } else {
      add(3, Math.max(359, lastTable + 0.5), plate, "End Curve - Rest", {
        terminalRest: true,
        motionSource: "terminal-end-curve-rest"
      });
    }

    const finalized = commandDriver?.finalize ? commandDriver.finalize(rows) : rows;
    const reindexed = finalized.map((row, index) => ({ ...row, hmi: index + 1, plc: index }));
    state.motionPlan = {
      rows: reindexed,
      issues,
      stationPlans,
      pairPlans: [],
      finalPlateAngle: reindexed.at(-1)?.plateAngle,
      termination: {
        section: codingObject ? "coding" : "back",
        hmi: reindexed.length,
        tableAngle: reindexed.at(-1)?.tableAngle,
        command: "Rest"
      },
      mapDriven: true,
      profileKind: "apl-map-driven",
      profileVariant: "no-neck-body-back-v3",
      noNeckBodyBackProfile: true,
      bodyApplicationTarget: rounded(targets.body),
      backApplicationTarget: rounded(targets.back),
      coderCenterlineTarget: rounded(targets.coder)
    };
    return reindexed;
  }

  function install() {
    if (installed) return true;
    if (typeof state === "undefined"
      || typeof generatedAplMapDrivenProfile !== "function"
      || generatedAplMapDrivenProfile.noNeckBodyBackV3) return false;

    const base = generatedAplMapDrivenProfile;
    generatedAplMapDrivenProfile = function generatedAplMapDrivenProfileWithNoNeckBodyBackV3(machineMap, ...args) {
      if (!isTargetProgram()) return base.call(this, machineMap, ...args);
      return rebuildProfile(machineMap) || base.call(this, machineMap, ...args);
    };
    generatedAplMapDrivenProfile.noNeckBodyBackV3 = true;
    installed = true;

    try {
      if (isTargetProgram() && typeof applyGeneratedServoProfile === "function") {
        applyGeneratedServoProfile();
        if (typeof render === "function") render();
      }
    } catch (error) {
      console.error("Unable to refresh the no-neck Body/Back APL profile.", error);
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