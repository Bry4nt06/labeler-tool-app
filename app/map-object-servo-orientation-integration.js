"use strict";

(function installMapObjectServoOrientationIntegration() {
  const RETRY_MS = 50;
  const GAP = 0.5;
  const EPS = 0.001;
  let installed = false;

  const num = (value, fallback = NaN) => {
    if (value === null || value === undefined || value === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const done = (value) => typeof finishAngle === "function" ? finishAngle(value) : Math.round(num(value, 0) * 10) / 10;
  const nearest = (target, reference) => num(target, 0) + 360 * Math.round((num(reference, target) - num(target, 0)) / 360);
  const sectionName = (section) => typeof sectionLabel === "function" ? sectionLabel(section) : String(section || "Label");
  const activeMap = () => typeof activeMachineMap === "function" ? activeMachineMap() : null;

  function applications() {
    try { return selectedLabelApplicationState(); }
    catch { return { neck: true, body: true, back: true }; }
  }

  function stationSections(map) {
    try { return typeof inferAplStationSections === "function" ? inferAplStationSections(map) : { ...(map?.stationSections || {}) }; }
    catch { return { ...(map?.stationSections || {}) }; }
  }

  function objectSection(item, map) {
    const explicit = String(item.orientationLabelSection || "auto").toLowerCase();
    if (["neck", "body", "back", "none"].includes(explicit)) return explicit;
    if (item.kind === "sensor") {
      const station = Number(item.station);
      const inferred = stationSections(map)[String(station)] || (typeof labelSectionForStation === "function" ? labelSectionForStation(station) : "");
      if (["neck", "body", "back", "none"].includes(inferred)) return inferred;
    }
    const active = applications();
    return active.back ? "back" : active.body ? "body" : active.neck ? "neck" : "none";
  }

  function enabled(item) {
    if (item.kind === "sensor") return Boolean(item.orientBottle ?? item.servoAssist);
    if (item.kind === "coding") return item.orientBottle !== false;
    return false;
  }

  function applicationTarget(section, rows, before) {
    const planned = num(state?.motionPlan?.[`${section}ApplicationTarget`], NaN);
    if (Number.isFinite(planned)) return planned;
    const row = [...rows].reverse().find((entry) => num(entry.tableAngle, Infinity) < before
      && String(entry.section || "").toLowerCase() === section
      && /application/i.test(String(entry.action || ""))
      && Number.isFinite(num(entry.plateAngle, NaN)));
    if (row) return num(row.plateAngle, 0);
    try {
      const seed = generatedAplSeedProfile();
      return num(seed[section === "neck" ? 1 : section === "body" ? 11 : 21]?.plateAngle, 0);
    } catch { return 0; }
  }

  function geometry(section) {
    const wipe = typeof sectionWipePlan === "function" ? sectionWipePlan(section) : null;
    const width = Math.min(360, Math.max(0.1, num(wipe?.labelDeg, 0.1)));
    const label = typeof selectedLabelSpec === "function" ? selectedLabelSpec() : null;
    const bottle = typeof selectedBottleSpec === "function" ? selectedBottleSpec() : null;
    const circumference = section === "neck" ? num(label?.neckBottomCircumferenceMm, NaN) : num(typeof bodyCircumference === "function" ? bodyCircumference(bottle) : NaN, NaN);
    const code = typeof degFromMm === "function" ? num(degFromMm(label?.codeBoxCenterMm, circumference), NaN) : NaN;
    const inspection = typeof degFromMm === "function" ? num(degFromMm(state?.buildInputs?.backInspectionOffsetMm, circumference), 0) : 0;
    return { width, code, inspection };
  }

  function targetFor(item, section, rows, currentPlate, table) {
    const shape = geometry(section);
    const application = applicationTarget(section, rows, table);
    const center = typeof labelSensorInspectionCenter === "function" ? labelSensorInspectionCenter(section, application, shape.width) : application;
    if (item.kind === "sensor") {
      const required = Math.min(100, Math.max(1, num(item.requiredVisibilityPercent, 50)));
      const plan = typeof nearestLabelSensorTarget === "function"
        ? nearestLabelSensorTarget(currentPlate, center, shape.width, required, 180)
        : { target: center, visibility: { percent: 100 } };
      return { target: nearest(num(plan.target, center), currentPlate), mode: "label-center", required, visibility: num(plan.visibility?.percent, 100) };
    }
    const mode = item.orientationTarget === "label-center" ? "label-center" : "code-box";
    let target = center;
    const plannedCoder = section === "back" ? num(state?.motionPlan?.coderCenterlineTarget, NaN) : NaN;
    if (mode === "code-box" && Number.isFinite(plannedCoder)) target = plannedCoder;
    else if (mode === "code-box" && Number.isFinite(shape.code)) target = center + shape.width / 2 - shape.code + shape.inspection;
    return { target: nearest(target, currentPlate), mode, required: 100, visibility: 100 };
  }

  function windowFor(item, rows) {
    const point = num(item.angle, item.start);
    let start = item.kind === "sensor" ? point - 1.5 : num(item.start, point);
    let end = item.kind === "sensor" ? point + 1.5 : Math.max(start + 0.5, num(item.end, start + 5));
    while (end <= start) end += 360;
    const minimum = Math.min(...rows.map((row) => num(row.tableAngle, 0)));
    while (end < minimum) { start += 360; end += 360; }
    return { start, end };
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

  function addIssue(issues, item, section, code, text) {
    issues.push({ level: "bad", code, objectId: item.id, station: item.station, section, message: text });
  }

  function orientationAction(item, section, target, label) {
    return item.kind === "coding"
      ? `Orient ${sectionName(section)} ${target.mode === "code-box" ? "Code Box" : "Label"} for ${label}`
      : `Orient ${sectionName(section)} Label for ${label}`;
  }

  function holdAction(section, target, label) {
    return `Hold ${sectionName(section)} ${target.mode === "code-box" ? "Code Box" : "Label"} Through ${label}`;
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

  function updateFollowing(rows, followingIndex, targetPlate, window, label, metadata, issues, item, section) {
    const following = rows[followingIndex];
    if (!following) return;
    if (Number(following.cmd) === 7) {
      const destination = rows[followingIndex + 1];
      const destinationPlate = num(destination?.plateAngle, NaN);
      const travel = num(destination?.tableAngle, 0) - num(following.tableAngle, 0);
      if (Number.isFinite(destinationPlate) && travel > EPS) {
        rows[followingIndex] = {
          ...following,
          plateAngle: done(targetPlate),
          plannedRotation: destinationPlate - targetPlate,
          plannedRatio: Math.abs(destinationPlate - targetPlate) / travel,
          mapObjectOrientationContinuation: true
        };
      }
      return;
    }
    const expected = num(following.plateAngle, targetPlate);
    if (Math.abs(expected - targetPlate) <= EPS) return;
    const continueStart = window.end + GAP;
    if (continueStart < num(following.tableAngle, continueStart) - EPS) {
      rows.splice(followingIndex, 0, {
        hmi: 0,
        plc: 0,
        cmd: 7,
        tableAngle: done(continueStart),
        plateAngle: done(targetPlate),
        action: `Continue After ${label}`,
        ...metadata,
        mapObjectOrientationContinuation: true,
        plannedRotation: expected - targetPlate,
        plannedRatio: Math.abs(expected - targetPlate) / Math.max(EPS, num(following.tableAngle, continueStart) - continueStart)
      });
    } else {
      addIssue(issues, item, section, "map-object-exit-window", `${label} has no open table travel after its window to continue to the next servo reference.`);
    }
  }

  function insertObject(rows, item, section, window, issues, plans) {
    const active = applications();
    const label = item.name || (item.kind === "coding" ? "Coding" : "Label Sensor");
    if (!active[section]) {
      addIssue(issues, item, section, "map-object-label-inactive", `${label} targets the ${sectionName(section)} label, but that label is not active.`);
      return;
    }
    const applied = rows.some((row) => num(row.tableAngle, Infinity) < window.start && String(row.section || "").toLowerCase() === section && /application|wipe|brush/i.test(String(row.action || "")));
    if (!applied) {
      addIssue(issues, item, section, "map-object-before-label-application", `${label} is positioned before the ${sectionName(section)} label has been applied.`);
      return;
    }

    let previousIndex = -1;
    rows.forEach((row, index) => { if (num(row.tableAngle, -Infinity) < window.start) previousIndex = index; });
    const previous = rows[previousIndex];
    if (!previous) {
      addIssue(issues, item, section, "map-object-orientation-no-reference", `${label} has no prior servo state from which to calculate its orientation turn.`);
      return;
    }

    let nextIndex = rows.findIndex((row) => num(row.tableAngle, Infinity) >= window.start);
    let next = rows[nextIndex];
    const nextAtWindowStart = Boolean(next && Math.abs(num(next.tableAngle, Infinity) - window.start) <= EPS);
    const reusableStartReference = Boolean(nextAtWindowStart && Number(next.cmd) === 3);
    if (next && num(next.tableAngle, Infinity) < window.end - EPS && !reusableStartReference) {
      addIssue(issues, item, section, "map-object-window-overlap", `${label} overlaps an existing servo event inside its ${done(window.end - window.start)}° object window.`);
      return;
    }

    const activeTransition = Number(previous.cmd) === 7;
    const reusableActiveTransition = activeTransition && !isPhysicalContactTransition(previous);
    if (activeTransition && !reusableActiveTransition) {
      addIssue(issues, item, section, "map-object-overlaps-physical-wipe", `${label} begins while "${String(previous.action || "the current wipe")}" is still active. The sensor/coder cannot take control of the servo until the pad, roller, or brush wipe reaches its CMD 3 hold. Move the object later than that wipe hold.`);
      return;
    }

    const current = num(previous.plateAngle, NaN);
    const turnStart = reusableActiveTransition ? num(previous.tableAngle, 0) : num(previous.tableAngle, 0) + GAP;
    if (!Number.isFinite(current) || turnStart >= window.start - EPS) {
      addIssue(issues, item, section, "map-object-turn-window", `${label} does not have enough open table travel to orient before ${done(window.start)}°.`);
      return;
    }

    const target = targetFor(item, section, rows, current, window.start);
    const rotation = target.target - current;
    const span = window.start - turnStart;
    const ratio = Math.abs(rotation) / Math.max(EPS, span);
    const metadata = {
      section,
      station: item.station,
      mapDriven: true,
      mapObjectOrientation: true,
      orientationObjectId: item.id,
      sensorId: item.kind === "sensor" ? item.id : undefined,
      codingObjectId: item.kind === "coding" ? item.id : undefined
    };
    const holdRow = {
      hmi: 0,
      plc: 0,
      cmd: 3,
      tableAngle: done(window.start),
      plateAngle: done(target.target),
      action: holdAction(section, target, label),
      ...metadata,
      orientationHold: true,
      inspectionWindowStart: done(window.start),
      inspectionWindowStop: done(window.end),
      requiredLabelVisibilityPercent: target.required,
      plannedLabelVisibilityPercent: target.visibility
    };

    let holdIndex = -1;
    let reusedActiveTransition = false;
    if (reusableActiveTransition) {
      const originalAction = String(previous.action || "Servo transition");
      rows[previousIndex] = {
        ...previous,
        cmd: 7,
        plateAngle: done(current),
        action: orientationAction(item, section, target, label),
        ...metadata,
        activeHold: Math.abs(rotation) <= EPS,
        plannedRotation: rotation,
        plannedRatio: ratio,
        mapObjectOrientationRetargetedTransition: true,
        interruptedAction: originalAction
      };
      reusedActiveTransition = true;
      if (reusableStartReference) {
        rows[nextIndex] = { ...next, ...holdRow };
        holdIndex = nextIndex;
      } else {
        rows.splice(previousIndex + 1, 0, holdRow);
        holdIndex = previousIndex + 1;
      }
    } else if (Math.abs(rotation) > EPS) {
      const turnRow = {
        hmi: 0,
        plc: 0,
        cmd: 7,
        tableAngle: done(turnStart),
        plateAngle: done(current),
        action: orientationAction(item, section, target, label),
        ...metadata,
        plannedRotation: rotation,
        plannedRatio: ratio
      };
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
      rows[previousIndex] = {
        ...previous,
        ...metadata,
        mapObjectOrientationSatisfied: true,
        inspectionWindowStart: done(window.start),
        inspectionWindowStop: done(window.end)
      };
    }

    const followingIndex = holdIndex >= 0 ? holdIndex + 1 : previousIndex + 1;
    updateFollowing(rows, followingIndex, target.target, window, label, metadata, issues, item, section);

    if (ratio >= num(state.maxMoveRatio, 21)) {
      addIssue(issues, item, section, "map-object-orientation-capacity", `${label} requires ${Math.abs(rotation).toFixed(1)}° bottle rotation in ${span.toFixed(1)}° table travel (${ratio.toFixed(2)}:1; limit ${num(state.maxMoveRatio, 21).toFixed(1)}:1).`);
    }
    plans.push({
      objectId: item.id,
      kind: item.kind,
      name: label,
      station: item.station,
      section,
      targetMode: target.mode,
      windowStart: done(window.start),
      windowStop: done(window.end),
      targetPlateAngle: done(target.target),
      rotation: done(rotation),
      ratio: done(ratio),
      requiredVisibilityPercent: target.required,
      plannedVisibilityPercent: target.visibility,
      reusedActiveTransition
    });
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
        plans.push({ objectId: item.id, kind: item.kind, section: item.section, handledByGenerator: true });
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
      state.motionPlan.finalPlateAngle = output.at(-1)?.plateAngle;
    }
    return output;
  }

  function install() {
    if (installed) return true;
    if (typeof generatedServoProfile !== "function" || typeof state === "undefined") return false;
    const base = generatedServoProfile;
    generatedServoProfile = function generatedServoProfileWithMapObjectOrientation(...args) { return process(base.apply(this, args)); };
    generatedServoProfile.mapObjectOrientationIntegration = true;
    window.generatedServoProfile = generatedServoProfile;
    installed = true;
    try {
      if (typeof applyGeneratedServoProfile === "function") applyGeneratedServoProfile();
      if (typeof render === "function") render();
    } catch (error) { console.error("Unable to apply map-object servo orientation.", error); }
    return true;
  }

  function wait() { if (!install()) window.setTimeout(wait, RETRY_MS); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait, { once: true });
  else wait();
})();