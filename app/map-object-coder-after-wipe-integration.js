"use strict";

(function installMapObjectCoderAfterWipeHandoff() {
  const RETRY_MS = 50;
  const GAP = 0.5;
  const EPS = 0.001;
  const SAFETY_FACTOR = 0.9;
  let installed = false;

  const num = (value, fallback = NaN) => {
    if (value === null || value === undefined || value === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const done = (value) => typeof finishAngle === "function"
    ? finishAngle(value)
    : Math.round(num(value, 0) * 10) / 10;
  const nearest = (target, reference) => num(target, 0)
    + 360 * Math.round((num(reference, target) - num(target, 0)) / 360);
  const sectionName = (section) => typeof sectionLabel === "function"
    ? sectionLabel(section)
    : String(section || "Label");

  function activeMap() {
    try { return typeof activeMachineMap === "function" ? activeMachineMap() : null; }
    catch { return null; }
  }

  function applications() {
    try { return selectedLabelApplicationState(); }
    catch { return { neck: true, body: true, back: true }; }
  }

  function objectSection(item) {
    const explicit = String(item?.orientationLabelSection || "auto").toLowerCase();
    if (["neck", "body", "back", "none"].includes(explicit)) return explicit;
    const active = applications();
    return active.back ? "back" : active.body ? "body" : active.neck ? "neck" : "none";
  }

  function windowFor(item, rows) {
    const point = num(item?.angle, item?.start);
    let start = num(item?.start, point);
    let end = Math.max(start + 0.5, num(item?.end, start + 5));
    while (end <= start) end += 360;
    const minimum = Math.min(...rows.map((row) => num(row?.tableAngle, 0)));
    while (end < minimum) {
      start += 360;
      end += 360;
    }
    return { start, end };
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
    if (Number.isFinite(num(turn?.station, NaN))
      && Number.isFinite(num(hold?.station, NaN))
      && Number(turn.station) !== Number(hold.station)) return false;
    return hold?.stage === "complete"
      || Boolean(hold?.wipeReference)
      || /wipe\s+hold|wipe.*rest|brush.*hold|roller.*rest/i.test(String(hold?.action || ""));
  }

  function applicationTarget(section, rows, before) {
    const planned = num(state?.motionPlan?.[`${section}ApplicationTarget`], NaN);
    if (Number.isFinite(planned)) return planned;
    const row = [...rows].reverse().find((entry) => num(entry?.tableAngle, Infinity) < before
      && String(entry?.section || "").toLowerCase() === section
      && /application/i.test(String(entry?.action || ""))
      && Number.isFinite(num(entry?.plateAngle, NaN)));
    if (row) return num(row.plateAngle, 0);
    try {
      const seed = generatedAplSeedProfile();
      return num(seed[section === "neck" ? 1 : section === "body" ? 11 : 21]?.plateAngle, 0);
    } catch {
      return 0;
    }
  }

  function targetFor(item, section, rows, currentPlate, before) {
    const wipe = typeof sectionWipePlan === "function" ? sectionWipePlan(section) : null;
    const width = Math.min(360, Math.max(0.1, num(wipe?.labelDeg, 0.1)));
    const application = applicationTarget(section, rows, before);
    const center = typeof labelSensorInspectionCenter === "function"
      ? labelSensorInspectionCenter(section, application, width)
      : application;
    const mode = item?.orientationTarget === "label-center" ? "label-center" : "code-box";
    let target = center;

    const plannedCoder = num(state?.motionPlan?.coderCenterlineTarget, NaN);
    if (mode === "code-box" && section === "back" && Number.isFinite(plannedCoder)) {
      target = plannedCoder;
    } else if (mode === "code-box") {
      const label = typeof selectedLabelSpec === "function" ? selectedLabelSpec() : null;
      const bottle = typeof selectedBottleSpec === "function" ? selectedBottleSpec() : null;
      const circumference = section === "neck"
        ? num(label?.neckBottomCircumferenceMm, NaN)
        : num(typeof bodyCircumference === "function" ? bodyCircumference(bottle) : NaN, NaN);
      const code = typeof degFromMm === "function"
        ? num(degFromMm(label?.codeBoxCenterMm, circumference), NaN)
        : NaN;
      const inspection = typeof degFromMm === "function"
        ? num(degFromMm(state?.buildInputs?.backInspectionOffsetMm, circumference), 0)
        : 0;
      if (Number.isFinite(code)) target = center + width / 2 - code + inspection;
    }

    return { target: nearest(target, currentPlate), mode };
  }

  function updateFollowing(rows, followingIndex, targetPlate, window, metadata) {
    const following = rows[followingIndex];
    if (!following) return;
    if (Number(following.cmd) === 7) {
      const destination = rows[followingIndex + 1];
      const destinationPlate = num(destination?.plateAngle, NaN);
      const travel = num(destination?.tableAngle, 0) - num(following?.tableAngle, 0);
      if (Number.isFinite(destinationPlate) && travel > EPS) {
        rows[followingIndex] = {
          ...following,
          plateAngle: done(targetPlate),
          plannedRotation: destinationPlate - targetPlate,
          plannedRatio: Math.abs(destinationPlate - targetPlate) / travel,
          coderAfterWipeContinuation: true
        };
      }
      return;
    }

    const expected = num(following?.plateAngle, targetPlate);
    if (Math.abs(expected - targetPlate) <= EPS) return;
    const start = window.end + GAP;
    const end = num(following?.tableAngle, start);
    if (end <= start + EPS) return;
    rows.splice(followingIndex, 0, {
      hmi: 0,
      plc: 0,
      cmd: 7,
      tableAngle: done(start),
      plateAngle: done(targetPlate),
      action: "Continue After Coder",
      ...metadata,
      coderAfterWipeContinuation: true,
      plannedRotation: expected - targetPlate,
      plannedRatio: Math.abs(expected - targetPlate) / Math.max(EPS, end - start)
    });
  }

  function applyHandoff(rows, item, issue, section, issues, plans) {
    const label = item?.name || "Coder";
    const window = windowFor(item, rows);
    let turnIndex = -1;
    rows.forEach((row, index) => {
      if (num(row?.tableAngle, Infinity) < window.start && isPhysicalContactTransition(row)) turnIndex = index;
    });
    if (turnIndex < 0) return false;

    const turn = rows[turnIndex];
    let holdIndex = -1;
    for (let index = turnIndex + 1; index < rows.length; index += 1) {
      if (samePhysicalMotion(turn, rows[index])) {
        holdIndex = index;
        break;
      }
    }
    if (holdIndex < 0) return false;

    const hold = rows[holdIndex];
    const holdTable = num(hold?.tableAngle, NaN);
    const holdPlate = num(hold?.plateAngle, NaN);
    if (!Number.isFinite(holdTable) || !Number.isFinite(holdPlate)) return false;

    const turnStart = holdTable + GAP;
    if (turnStart >= window.end - EPS) {
      issues.push({
        ...issue,
        code: "coder-window-after-wipe-unavailable",
        message: `${label} cannot take control after ${String(turn.action || "the final wipe")} completes at ${done(holdTable)}°. Its coding window ends at ${done(window.end)}°. Move the coder later or finish the wipe earlier.`
      });
      return true;
    }

    const target = targetFor(item, section, rows, holdPlate, window.start);
    const rotation = target.target - holdPlate;
    const maxRatio = Math.max(0.1, num(state?.maxMoveRatio, 21));
    const safeRatio = Math.max(0.1, maxRatio * SAFETY_FACTOR);
    const requiredSpan = Math.abs(rotation) / safeRatio;
    const readyTable = Math.max(window.start, turnStart + requiredSpan);

    const interfering = rows.find((row, index) => index > holdIndex
      && num(row?.tableAngle, Infinity) > holdTable + EPS
      && num(row?.tableAngle, Infinity) < readyTable - EPS);
    if (interfering || readyTable > window.end - EPS) {
      issues.push({
        ...issue,
        code: "coder-handoff-capacity",
        message: `${label} waits for ${String(turn.action || "the final wipe")} to finish at ${done(holdTable)}°, but needs ${Math.abs(rotation).toFixed(1)}° of bottle rotation before the coding window ends at ${done(window.end)}°. Move the coder later, increase the gap after the wipe, or reduce the required coding correction.`
      });
      return true;
    }

    const metadata = {
      section,
      station: item?.station,
      mapDriven: true,
      mapObjectOrientation: true,
      codingObjectId: item?.id,
      orientationObjectId: item?.id,
      coderAfterWipeHandoff: true,
      completedWipeAction: String(turn.action || "")
    };

    let insertionIndex = holdIndex + 1;
    if (Math.abs(rotation) > EPS) {
      rows.splice(insertionIndex, 0, {
        hmi: 0,
        plc: 0,
        cmd: 7,
        tableAngle: done(turnStart),
        plateAngle: done(holdPlate),
        action: `Orient ${sectionName(section)} ${target.mode === "code-box" ? "Code Box" : "Label"} for ${label} After Wipe`,
        ...metadata,
        plannedRotation: rotation,
        plannedRatio: Math.abs(rotation) / Math.max(EPS, readyTable - turnStart)
      }, {
        hmi: 0,
        plc: 0,
        cmd: 3,
        tableAngle: done(readyTable),
        plateAngle: done(target.target),
        action: `Hold ${sectionName(section)} ${target.mode === "code-box" ? "Code Box" : "Label"} Through ${label}`,
        ...metadata,
        orientationHold: true,
        inspectionWindowStart: done(window.start),
        inspectionWindowStop: done(window.end),
        codingReadyTableAngle: done(readyTable),
        delayedCodingReady: readyTable > window.start + EPS
      });
      insertionIndex += 2;
    } else {
      rows[holdIndex] = {
        ...hold,
        ...metadata,
        mapObjectOrientationSatisfied: true,
        inspectionWindowStart: done(window.start),
        inspectionWindowStop: done(window.end),
        codingReadyTableAngle: done(holdTable)
      };
    }

    updateFollowing(rows, insertionIndex, target.target, window, metadata);
    issues.push({
      level: readyTable > window.start + EPS ? "warn" : "ok",
      code: "coder-after-wipe-handoff",
      objectId: item?.id,
      station: item?.station,
      section,
      message: readyTable > window.start + EPS
        ? `${label} waits for the wipe to complete at ${done(holdTable)}°, then reaches the coding orientation at ${done(readyTable)}° inside its configured window.`
        : `${label} waits for the wipe to complete, then takes control before its coding window begins.`
    });
    plans.push({
      objectId: item?.id,
      kind: "coding",
      name: label,
      section,
      targetMode: target.mode,
      windowStart: done(window.start),
      windowStop: done(window.end),
      wipeHoldTableAngle: done(holdTable),
      codingReadyTableAngle: done(readyTable),
      targetPlateAngle: done(target.target),
      rotation: done(rotation),
      coderAfterWipeHandoff: true
    });
    return true;
  }

  function process(sourceRows) {
    if (!Array.isArray(sourceRows) || !sourceRows.length || !state?.motionPlan) return sourceRows;
    const map = activeMap();
    if (!map) return sourceRows;

    const overlapIssues = (Array.isArray(state.motionPlan.issues) ? state.motionPlan.issues : [])
      .filter((issue) => issue?.code === "map-object-overlaps-physical-wipe" && issue?.objectId);
    if (!overlapIssues.length) return sourceRows;

    const rows = sourceRows.map((row) => ({ ...row })).sort((left, right) => num(left?.tableAngle, 0) - num(right?.tableAngle, 0));
    const retainedIssues = (state.motionPlan.issues || []).filter((issue) => issue?.code !== "map-object-overlaps-physical-wipe");
    const replacementIssues = [];
    const plans = Array.isArray(state.motionPlan.mapObjectOrientationPlans)
      ? state.motionPlan.mapObjectOrientationPlans.filter((plan) => !overlapIssues.some((issue) => String(issue.objectId) === String(plan.objectId)))
      : [];

    overlapIssues.forEach((issue) => {
      const item = map.objects?.find((entry) => String(entry?.id) === String(issue.objectId));
      const section = objectSection(item);
      if (!item || item.kind !== "coding" || item.orientBottle === false || section === "none") {
        replacementIssues.push(issue);
        return;
      }
      if (!applyHandoff(rows, item, issue, section, replacementIssues, plans)) replacementIssues.push(issue);
    });

    const finalized = window.LabelerServoCommandDriver?.finalize
      ? window.LabelerServoCommandDriver.finalize(rows)
      : rows;
    const output = finalized.map((row, index) => ({ ...row, hmi: index + 1, plc: index }));
    state.motionPlan.rows = output;
    state.motionPlan.issues = [...retainedIssues, ...replacementIssues];
    state.motionPlan.mapObjectOrientationPlans = plans;
    state.motionPlan.coderAfterWipeHandoff = plans.some((plan) => plan?.coderAfterWipeHandoff);
    state.motionPlan.finalPlateAngle = output.at(-1)?.plateAngle;
    return output;
  }

  function install() {
    if (installed) return true;
    if (typeof generatedServoProfile !== "function" || typeof state === "undefined") return false;
    const base = generatedServoProfile;
    generatedServoProfile = function generatedServoProfileWithCoderAfterWipeHandoff(...args) {
      return process(base.apply(this, args));
    };
    generatedServoProfile.coderAfterWipeHandoff = true;
    window.generatedServoProfile = generatedServoProfile;
    installed = true;
    try {
      if (typeof applyGeneratedServoProfile === "function") applyGeneratedServoProfile();
      if (typeof render === "function") render();
    } catch (error) {
      console.error("Unable to hand off from the final wipe to the coder.", error);
    }
    return true;
  }

  function wait() {
    if (!install()) window.setTimeout(wait, RETRY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait, { once: true });
  else wait();
})();
