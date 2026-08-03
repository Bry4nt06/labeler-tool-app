"use strict";

(function installMapObjectServoOrientationIntegration() {
  const RETRY_MS = 50;
  const GAP = 0.5;
  const EPS = 0.001;
  const STAGE_ID = "orientation.map-objects";
  let installed = false;

  const num = (value, fallback = NaN) => {
    if (value === null || value === undefined || value === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const done = (value) => typeof finishAngle === "function" ? finishAngle(value) : Math.round(num(value, 0) * 10) / 10;
  const sectionName = (section) => typeof sectionLabel === "function" ? sectionLabel(section) : String(section || "Label");
  const activeMap = () => typeof activeMachineMap === "function" ? activeMachineMap() : null;

  function orientationDriver() {
    return window.LabelerDriverRegistry?.resolve("profile.mapObjectOrientation")
      || window.LabelerMapObjectOrientationDriver
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

  function applications() {
    try { return selectedLabelApplicationState(); }
    catch { return { neck: true, body: true, back: true }; }
  }

  function stationSections(map) {
    try { return typeof inferAplStationSections === "function" ? inferAplStationSections(map) : { ...(map?.stationSections || {}) }; }
    catch { return { ...(map?.stationSections || {}) }; }
  }

  function objectSection(item, map) {
    return orientationDriver()?.resolveSection({
      item,
      activeApplications: applications(),
      stationSections: stationSections(map),
      fallbackStationSection: (station) => typeof labelSectionForStation === "function" ? labelSectionForStation(station) : ""
    }) || "none";
  }

  function enabled(item) {
    return orientationDriver()?.enabled(item) ?? false;
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

  function geometry(section) {
    const wipe = typeof sectionWipePlan === "function" ? sectionWipePlan(section) : null;
    const width = Math.min(360, Math.max(0.1, num(wipe?.labelDeg, 0.1)));
    const label = typeof selectedLabelSpec === "function" ? selectedLabelSpec() : null;
    const bottle = typeof selectedBottleSpec === "function" ? selectedBottleSpec() : null;
    const circumference = section === "neck"
      ? num(label?.neckBottomCircumferenceMm, NaN)
      : num(typeof bodyCircumference === "function" ? bodyCircumference(bottle) : NaN, NaN);
    const code = typeof degFromMm === "function" ? num(degFromMm(label?.codeBoxCenterMm, circumference), NaN) : NaN;
    const inspection = typeof degFromMm === "function" ? num(degFromMm(state?.buildInputs?.backInspectionOffsetMm, circumference), 0) : 0;
    return { width, code, inspection };
  }

  function targetFor(item, section, rows, currentPlate, table) {
    const shape = geometry(section);
    const application = applicationTarget(section, rows, table);
    const center = typeof labelSensorInspectionCenter === "function"
      ? labelSensorInspectionCenter(section, application, shape.width)
      : application;
    let sensorPlan = null;
    if (item.kind === "sensor") {
      const required = Math.min(100, Math.max(1, num(item.requiredVisibilityPercent, 50)));
      sensorPlan = typeof nearestLabelSensorTarget === "function"
        ? nearestLabelSensorTarget(currentPlate, center, shape.width, required, 180)
        : { target: center, visibility: { percent: 100 } };
    }
    return orientationDriver()?.orientationTarget({
      item,
      section,
      currentPlate,
      applicationTarget: application,
      labelWidthDeg: shape.width,
      labelCenter: center,
      sensorTarget: sensorPlan?.target,
      sensorVisibilityPercent: sensorPlan?.visibility?.percent,
      coderCenterlineTarget: state?.motionPlan?.coderCenterlineTarget,
      codeBoxOffsetDeg: shape.code,
      inspectionOffsetDeg: shape.inspection
    }) || { target: currentPlate, mode: "label-center", required: 100, visibility: 100 };
  }

  function windowFor(item, rows) {
    return orientationDriver()?.objectWindow({ item, rows }) || { start: num(item?.start, 0), end: num(item?.end, 5) };
  }

  function alreadyHandled(rows, item) {
    const explicit = Boolean(item.orientationConfigured) || !["", "auto"].includes(String(item.orientationLabelSection || "auto"));
    if (explicit) return false;
    if (item.kind === "sensor") return rows.some((row) => String(row.sensorId || "") === String(item.id));
    return rows.some((row) => row.codingHold || row.codingMotion || /(?:turn|hold).*coding/i.test(String(row.action || "")));
  }

  function stripOldRows(rows, item) {
    if (item.kind === "sensor") return rows.filter((row) => String(row.sensorId || "") !== String(item.id));
    if (!item.orientationConfigured && ["", "auto"].includes(String(item.orientationLabelSection || "auto"))) return rows;
    return rows.filter((row) => row.terminalRest || row.codingRelease || !(row.codingHold || row.codingMotion || /(?:direct turn|center.*code|hold.*coding|hold.*code box)/i.test(String(row.action || ""))));
  }

  function orientationAction(item, section, target, label) {
    return item.kind === "coding"
      ? `Orient ${sectionName(section)} ${target.mode === "code-box" ? "Code Box" : "Label"} for ${label}`
      : `Orient ${sectionName(section)} Label for ${label}`;
  }

  function holdAction(section, target, label) {
    return `Hold ${sectionName(section)} ${target.mode === "code-box" ? "Code Box" : "Label"} Through ${label}`;
  }

  function updateFollowing(rows, followingIndex, targetPlate, window, label, metadata, issues, item, section) {
    const following = rows[followingIndex];
    if (!following) return;
    if (Number(following.cmd) === 7) {
      const metrics = orientationDriver()?.continuationMetrics({
        startRow: following,
        destinationRow: rows[followingIndex + 1],
        targetPlate
      });
      if (Number.isFinite(metrics?.destinationPlate) && metrics.tableTravel > EPS) {
        rows[followingIndex] = rowBuilder().retargetContinuation(following, {
          plateAngle: targetPlate,
          rotation: metrics.plannedRotation,
          ratio: metrics.plannedRatio,
          formatter: done
        });
      }
      return;
    }
    const expected = num(following.plateAngle, targetPlate);
    if (Math.abs(expected - targetPlate) <= EPS) return;
    const continueStart = window.end + GAP;
    if (continueStart < num(following.tableAngle, continueStart) - EPS) {
      rows.splice(followingIndex, 0, rowBuilder().continuation({
        tableAngle: continueStart,
        plateAngle: targetPlate,
        action: `Continue After ${label}`,
        metadata,
        rotation: expected - targetPlate,
        ratio: Math.abs(expected - targetPlate) / Math.max(EPS, num(following.tableAngle, continueStart) - continueStart),
        formatter: done
      }));
    } else {
      issues.push(issueFactory().exitWindow({ item, section, label }));
    }
  }

  function insertObject(rows, item, section, window, issues, plans) {
    const active = applications();
    const label = item.name || (item.kind === "coding" ? "Coding" : "Label Sensor");
    if (!active[section]) {
      issues.push(issueFactory().labelInactive({ item, section, label, sectionName: sectionName(section) }));
      return;
    }
    const applied = rows.some((row) => num(row.tableAngle, Infinity) < window.start
      && String(row.section || "").toLowerCase() === section
      && /application|wipe|brush/i.test(String(row.action || "")));
    if (!applied) {
      issues.push(issueFactory().beforeApplication({ item, section, label, sectionName: sectionName(section) }));
      return;
    }

    let previousIndex = -1;
    rows.forEach((row, index) => { if (num(row.tableAngle, -Infinity) < window.start) previousIndex = index; });
    const previous = rows[previousIndex];
    if (!previous) {
      issues.push(issueFactory().noReference({ item, section, label }));
      return;
    }

    let nextIndex = rows.findIndex((row) => num(row.tableAngle, Infinity) >= window.start);
    let next = rows[nextIndex];
    const nextAtWindowStart = Boolean(next && Math.abs(num(next.tableAngle, Infinity) - window.start) <= EPS);
    const reusableStartReference = Boolean(nextAtWindowStart && Number(next.cmd) === 3);
    if (next && num(next.tableAngle, Infinity) < window.end - EPS && !reusableStartReference) {
      issues.push(issueFactory().windowOverlap({ item, section, label, span: done(window.end - window.start) }));
      return;
    }

    const activeTransition = Number(previous.cmd) === 7;
    const reusableActiveTransition = activeTransition && !orientationDriver().isPhysicalContactTransition(previous);
    if (activeTransition && !reusableActiveTransition) {
      issues.push(issueFactory().physicalWipeOverlap({ item, section, label, action: String(previous.action || "the current wipe") }));
      return;
    }

    const current = num(previous.plateAngle, NaN);
    const turnStart = reusableActiveTransition ? num(previous.tableAngle, 0) : num(previous.tableAngle, 0) + GAP;
    if (!Number.isFinite(current) || turnStart >= window.start - EPS) {
      issues.push(issueFactory().turnWindow({ item, section, label, windowStart: done(window.start) }));
      return;
    }

    const target = targetFor(item, section, rows, current, window.start);
    const rotation = target.target - current;
    const span = window.start - turnStart;
    const ratio = Math.abs(rotation) / Math.max(EPS, span);
    const metadata = rowBuilder().metadata({ item, section });
    const holdRow = rowBuilder().hold({
      tableAngle: window.start,
      plateAngle: target.target,
      action: holdAction(section, target, label),
      metadata,
      window,
      formatter: done,
      extras: {
        requiredLabelVisibilityPercent: target.required,
        plannedLabelVisibilityPercent: target.visibility
      }
    });

    let holdIndex = -1;
    let reusedActiveTransition = false;
    if (reusableActiveTransition) {
      const originalAction = String(previous.action || "Servo transition");
      rows[previousIndex] = rowBuilder().retargetTurn(previous, {
        plateAngle: current,
        action: orientationAction(item, section, target, label),
        metadata,
        rotation,
        ratio,
        formatter: done,
        extras: {
          activeHold: Math.abs(rotation) <= EPS,
          mapObjectOrientationRetargetedTransition: true,
          interruptedAction: originalAction
        }
      });
      reusedActiveTransition = true;
      if (reusableStartReference) {
        rows[nextIndex] = { ...next, ...holdRow };
        holdIndex = nextIndex;
      } else {
        rows.splice(previousIndex + 1, 0, holdRow);
        holdIndex = previousIndex + 1;
      }
    } else if (Math.abs(rotation) > EPS) {
      const turnRow = rowBuilder().turn({
        tableAngle: turnStart,
        plateAngle: current,
        action: orientationAction(item, section, target, label),
        metadata,
        rotation,
        ratio,
        formatter: done
      });
      if (reusableStartReference) {
        rows.splice(previousIndex + 1, 0, turnRow);
        nextIndex += 1;
        next = rows[nextIndex];
        rows[nextIndex] = { ...next, ...holdRow };
        holdIndex = nextIndex;
      } else {
        rows.splice(previousIndex + 1, 0, turnRow, holdRow);
        holdIndex = previousIndex + 2;
      }
    } else if (reusableStartReference) {
      rows[nextIndex] = { ...next, ...holdRow };
      holdIndex = nextIndex;
    } else {
      rows[previousIndex] = rowBuilder().satisfied(previous, {
        metadata,
        window,
        formatter: done
      });
    }

    const followingIndex = holdIndex >= 0 ? holdIndex + 1 : previousIndex + 1;
    updateFollowing(rows, followingIndex, target.target, window, label, metadata, issues, item, section);

    const maxMoveRatio = num(state.maxMoveRatio, 21);
    if (ratio >= maxMoveRatio) {
      issues.push(issueFactory().orientationCapacity({
        item,
        section,
        label,
        rotation,
        span,
        ratio,
        limit: maxMoveRatio
      }));
    }
    plans.push(rowBuilder().orientationPlan({
      item,
      label,
      section,
      target,
      window,
      rotation,
      ratio,
      reusedActiveTransition,
      formatter: done
    }));
  }

  function process(sourceRows) {
    const map = activeMap();
    if (!map || !Array.isArray(sourceRows) || !sourceRows.length) return sourceRows;
    let rows = sourceRows.map((row) => ({ ...row }));
    const issues = [];
    const plans = [];
    let replacesSensors = false;
    const objects = (map.objects || []).filter((item) => ["sensor", "coding"].includes(item.kind) && enabled(item))
      .map((item) => ({ ...item, section: objectSection(item, map) }))
      .filter((item) => item.section !== "none")
      .map((item) => ({ ...item, window: windowFor(item, rows) }))
      .sort((a, b) => a.window.start - b.window.start);
    objects.forEach((item) => {
      if (alreadyHandled(rows, item)) {
        plans.push({
          objectId: item.id,
          kind: item.kind,
          section: item.section,
          handledByGenerator: true,
          orientationDriver: "profile.mapObjectOrientation",
          rowBuilderDriver: "profile.mapObjectRowBuilder"
        });
        return;
      }
      if (item.kind === "sensor") replacesSensors = true;
      rows = stripOldRows(rows, item);
      rows.sort((a, b) => num(a.tableAngle, 0) - num(b.tableAngle, 0));
      insertObject(rows, item, item.section, item.window, issues, plans);
      rows.sort((a, b) => num(a.tableAngle, 0) - num(b.tableAngle, 0));
    });
    const finalized = window.LabelerServoCommandDriver?.finalize ? window.LabelerServoCommandDriver.finalize(rows) : rows;
    const output = finalized.map((row, index) => ({ ...row, hmi: index + 1, plc: index }));
    if (state.motionPlan && typeof state.motionPlan === "object") {
      const oldIssues = Array.isArray(state.motionPlan.issues) ? state.motionPlan.issues : [];
      state.motionPlan.rows = output;
      state.motionPlan.issues = [...oldIssues.filter((issue) => {
        const code = String(issue?.code || "");
        return !/^map-object-/.test(code) && !(replacesSensors && /^label-sensor-/.test(code));
      }), ...issues];
      state.motionPlan.mapObjectOrientationPlans = plans;
      state.motionPlan.mapObjectOrientationDriven = true;
      state.motionPlan.mapObjectOrientationDriver = "profile.mapObjectOrientation";
      state.motionPlan.mapObjectRowBuilderDriver = "profile.mapObjectRowBuilder";
      state.motionPlan.orientationIssueFactoryDriver = "profile.orientationIssueFactory";
      state.motionPlan.finalPlateAngle = output.at(-1)?.plateAngle;
    }
    return output;
  }

  function registerPipelineStage() {
    const pipeline = pipelineDriver();
    if (!pipeline?.registerStage) return false;
    pipeline.registerStage({
      id: STAGE_ID,
      phase: "orientation",
      order: 300,
      source: "app/map-object-servo-orientation-integration.js",
      description: "Apply map-driven sensor and coder orientation plans.",
      process
    });
    window.LabelerMapObjectOrientationProcessor = process;
    return true;
  }

  function installLegacyWrapper() {
    const base = generatedServoProfile;
    generatedServoProfile = function generatedServoProfileWithMapObjectOrientation(...args) {
      return process(base.apply(this, args));
    };
    generatedServoProfile.mapObjectOrientationIntegration = true;
    window.generatedServoProfile = generatedServoProfile;
  }

  function install() {
    if (installed) return true;
    if (typeof generatedServoProfile !== "function"
      || typeof state === "undefined"
      || !orientationDriver()?.orientationTarget
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
        console.error("Unable to apply map-object servo orientation.", error);
      }
    }
    return true;
  }

  function wait() { if (!install()) window.setTimeout(wait, RETRY_MS); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait, { once: true });
  else wait();
})();
