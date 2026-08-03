"use strict";

(function installMapObjectCoderAfterWipeHandoff() {
  const RETRY_MS = 50;
  const GAP = 0.5;
  const EPS = 0.001;
  const SAFETY_FACTOR = 0.9;
  const STAGE_ID = "orientation.coder-handoff";
  let installed = false;

  const num = (value, fallback = NaN) => {
    if (value === null || value === undefined || value === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const done = (value) => typeof finishAngle === "function"
    ? finishAngle(value)
    : Math.round(num(value, 0) * 10) / 10;
  const sectionName = (section) => typeof sectionLabel === "function"
    ? sectionLabel(section)
    : String(section || "Label");

  function orientationDriver() {
    return window.LabelerDriverRegistry?.resolve("profile.mapObjectOrientation")
      || window.LabelerMapObjectOrientationDriver
      || null;
  }

  function handoffDriver() {
    return window.LabelerDriverRegistry?.resolve("profile.coderHandoff")
      || window.LabelerCoderHandoffDriver
      || null;
  }

  function rowBuilder() {
    return window.LabelerDriverRegistry?.resolve("profile.mapObjectRowBuilder")
      || window.LabelerMapObjectRowBuilderDriver
      || null;
  }

  function issueFactory() {
    return window.LabelerDriverRegistry?.resolve("profile.orientationIssueFactory")
      || window.LabelerOrientationIssueFactoryDriver
      || null;
  }

  function pipelineDriver() {
    return window.LabelerDriverRegistry?.resolve("profile.pipeline")
      || window.LabelerProfilePipelineDriver
      || null;
  }

  function activeMap() {
    try { return typeof activeMachineMap === "function" ? activeMachineMap() : null; }
    catch { return null; }
  }

  function applications() {
    try { return selectedLabelApplicationState(); }
    catch { return { neck: true, body: true, back: true }; }
  }

  function objectSection(item) {
    return orientationDriver()?.resolveSection({
      item,
      activeApplications: applications()
    }) || "none";
  }

  function windowFor(item, rows) {
    return orientationDriver()?.objectWindow({
      item,
      rows,
      sensorHalfWindow: 0,
      minimumSpan: 0.5,
      defaultSpan: 5
    }) || { start: num(item?.start, 0), end: num(item?.end, 5) };
  }

  function applicationTarget(section, rows, before) {
    let seedTarget = 0;
    try {
      const seed = generatedAplSeedProfile();
      seedTarget = num(seed[section === "neck" ? 1 : section === "body" ? 11 : 21]?.plateAngle, 0);
    } catch { seedTarget = 0; }
    return orientationDriver()?.applicationTarget({
      section,
      rows,
      before,
      plannedTarget: state?.motionPlan?.[`${section}ApplicationTarget`],
      seedTarget
    }) ?? seedTarget;
  }

  function targetFor(item, section, rows, currentPlate, before) {
    const wipe = typeof sectionWipePlan === "function" ? sectionWipePlan(section) : null;
    const width = Math.min(360, Math.max(0.1, num(wipe?.labelDeg, 0.1)));
    const application = applicationTarget(section, rows, before);
    const center = typeof labelSensorInspectionCenter === "function"
      ? labelSensorInspectionCenter(section, application, width)
      : application;
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
    return orientationDriver()?.orientationTarget({
      item,
      section,
      currentPlate,
      applicationTarget: application,
      labelWidthDeg: width,
      labelCenter: center,
      coderCenterlineTarget: state?.motionPlan?.coderCenterlineTarget,
      codeBoxOffsetDeg: code,
      inspectionOffsetDeg: inspection
    }) || { target: currentPlate, mode: "label-center" };
  }

  function updateFollowing(rows, followingIndex, targetPlate, window, metadata) {
    const plan = handoffDriver()?.continuationPlan({
      rows,
      followingIndex,
      targetPlate,
      window,
      gap: GAP,
      epsilon: EPS
    });
    if (!plan || plan.kind === "none" || plan.kind === "blocked") return;
    if (plan.kind === "retarget") {
      rows[plan.index] = rowBuilder().retargetContinuation(plan.row, {
        plateAngle: plan.row.plateAngle,
        rotation: plan.row.plannedRotation,
        ratio: plan.row.plannedRatio,
        formatter: done,
        marker: "coderAfterWipeContinuation"
      });
      return;
    }
    rows.splice(plan.index, 0, rowBuilder().continuation({
      tableAngle: plan.start,
      plateAngle: targetPlate,
      action: "Continue After Coder",
      metadata,
      rotation: plan.plannedRotation,
      ratio: plan.plannedRatio,
      formatter: done,
      marker: "coderAfterWipeContinuation"
    }));
  }

  function applyHandoff(rows, item, issue, section, issues, plans) {
    const label = item?.name || "Coder";
    const window = windowFor(item, rows);
    const located = handoffDriver()?.locateFinalWipe(rows, window.start) || { turnIndex: -1, holdIndex: -1 };
    if (located.turnIndex < 0 || located.holdIndex < 0) return false;

    const turn = rows[located.turnIndex];
    const hold = rows[located.holdIndex];
    const holdTable = num(hold?.tableAngle, NaN);
    const holdPlate = num(hold?.plateAngle, NaN);
    if (!Number.isFinite(holdTable) || !Number.isFinite(holdPlate)) return false;

    const target = targetFor(item, section, rows, holdPlate, window.start);
    const rotation = target.target - holdPlate;
    const timing = handoffDriver()?.timing({
      holdTable,
      window,
      rotation,
      maxRatio: state?.maxMoveRatio,
      gap: GAP,
      safetyFactor: SAFETY_FACTOR,
      epsilon: EPS
    });
    if (!timing?.available) {
      issues.push(issueFactory().coderWindowUnavailable({
        baseIssue: issue,
        item,
        section,
        label,
        action: String(turn.action || "the final wipe"),
        holdTable: done(holdTable),
        windowEnd: done(window.end)
      }));
      return true;
    }

    const interfering = handoffDriver()?.interference(rows, {
      holdIndex: located.holdIndex,
      holdTable,
      readyTable: timing.readyTable,
      epsilon: EPS
    });
    if (interfering || !timing.withinWindow) {
      issues.push(issueFactory().coderHandoffCapacity({
        baseIssue: issue,
        item,
        section,
        label,
        action: String(turn.action || "the final wipe"),
        holdTable: done(holdTable),
        rotation,
        windowEnd: done(window.end)
      }));
      return true;
    }

    const metadata = rowBuilder().metadata({
      item,
      section,
      extras: {
        coderAfterWipeHandoff: true,
        completedWipeAction: String(turn.action || ""),
        orientationDriver: "profile.mapObjectOrientation",
        handoffDriver: "profile.coderHandoff"
      }
    });

    let insertionIndex = located.holdIndex + 1;
    if (Math.abs(rotation) > EPS) {
      rows.splice(insertionIndex, 0,
        rowBuilder().turn({
          tableAngle: timing.turnStart,
          plateAngle: holdPlate,
          action: `Orient ${sectionName(section)} ${target.mode === "code-box" ? "Code Box" : "Label"} for ${label} After Wipe`,
          metadata,
          rotation,
          ratio: Math.abs(rotation) / Math.max(EPS, timing.readyTable - timing.turnStart),
          formatter: done
        }),
        rowBuilder().hold({
          tableAngle: timing.readyTable,
          plateAngle: target.target,
          action: `Hold ${sectionName(section)} ${target.mode === "code-box" ? "Code Box" : "Label"} Through ${label}`,
          metadata,
          window,
          formatter: done,
          extras: {
            codingReadyTableAngle: done(timing.readyTable),
            delayedCodingReady: timing.readyTable > window.start + EPS
          }
        })
      );
      insertionIndex += 2;
    } else {
      rows[located.holdIndex] = rowBuilder().satisfied(hold, {
        metadata,
        window,
        formatter: done,
        extras: { codingReadyTableAngle: done(holdTable) }
      });
    }

    updateFollowing(rows, insertionIndex, target.target, window, metadata);
    const delayed = timing.readyTable > window.start + EPS;
    issues.push(issueFactory().coderHandoffStatus({
      item,
      section,
      label,
      holdTable: done(holdTable),
      readyTable: done(timing.readyTable),
      delayed
    }));
    plans.push(rowBuilder().coderHandoffPlan({
      item,
      label,
      section,
      target,
      window,
      holdTable,
      readyTable: timing.readyTable,
      rotation,
      formatter: done
    }));
    return true;
  }

  function process(sourceRows) {
    if (!Array.isArray(sourceRows) || !sourceRows.length || !state?.motionPlan) return sourceRows;
    const map = activeMap();
    if (!map) return sourceRows;

    const overlapIssues = (Array.isArray(state.motionPlan.issues) ? state.motionPlan.issues : [])
      .filter((issue) => issue?.code === "map-object-overlaps-physical-wipe" && issue?.objectId);
    if (!overlapIssues.length) return sourceRows;

    const rows = sourceRows.map((row) => ({ ...row }))
      .sort((left, right) => num(left?.tableAngle, 0) - num(right?.tableAngle, 0));
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
    state.motionPlan.coderHandoffDriver = "profile.coderHandoff";
    state.motionPlan.mapObjectRowBuilderDriver = "profile.mapObjectRowBuilder";
    state.motionPlan.orientationIssueFactoryDriver = "profile.orientationIssueFactory";
    state.motionPlan.finalPlateAngle = output.at(-1)?.plateAngle;
    return output;
  }

  function registerPipelineStage() {
    const pipeline = pipelineDriver();
    if (!pipeline?.registerStage) return false;
    pipeline.registerStage({
      id: STAGE_ID,
      phase: "orientation",
      order: 400,
      source: "app/map-object-coder-after-wipe-integration.js",
      description: "Hand the bottle servo from the final wipe into the coder window.",
      process
    });
    window.LabelerCoderAfterWipeProcessor = process;
    return true;
  }

  function installLegacyWrapper() {
    const base = generatedServoProfile;
    generatedServoProfile = function generatedServoProfileWithCoderAfterWipeHandoff(...args) {
      return process(base.apply(this, args));
    };
    generatedServoProfile.coderAfterWipeHandoff = true;
    window.generatedServoProfile = generatedServoProfile;
  }

  function install() {
    if (installed) return true;
    if (typeof generatedServoProfile !== "function"
      || typeof state === "undefined"
      || !orientationDriver()?.orientationTarget
      || !handoffDriver()?.locateFinalWipe
      || !rowBuilder()?.turn
      || !issueFactory()?.issue) return false;

    const pipelineManaged = registerPipelineStage();
    if (!pipelineManaged) installLegacyWrapper();
    installed = true;

    if (!pipelineManaged || window.LabelerProfilePipelineOrchestratorInstalled) {
      try {
        if (typeof applyGeneratedServoProfile === "function") applyGeneratedServoProfile();
        if (typeof render === "function") render();
      } catch (error) {
        console.error("Unable to hand off from the final wipe to the coder.", error);
      }
    }
    return true;
  }

  function wait() {
    if (!install()) window.setTimeout(wait, RETRY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait, { once: true });
  else wait();
})();
