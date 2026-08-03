"use strict";

(function installPhysicalDirectionCodeBoxOrientation() {
  const RETRY_MS = 50;
  const EPS = 0.001;
  const STAGE_ID = "orientation.physical-code-box";
  let installed = false;
  let refreshPending = false;

  const num = (value, fallback = NaN) => {
    if (value === null || value === undefined || value === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const done = (value) => typeof finishAngle === "function"
    ? finishAngle(value)
    : Math.round(num(value, 0) * 10) / 10;

  function pipelineDriver() {
    return window.LabelerDriverRegistry?.resolve("profile.pipeline")
      || window.LabelerProfilePipelineDriver
      || null;
  }

  function orientationDriver() {
    return window.LabelerDriverRegistry?.resolve("profile.coderOrientation")
      || window.LabelerCoderOrientationDriver
      || null;
  }

  function activeMapSafe() {
    try { return typeof activeMachineMap === "function" ? activeMachineMap() : null; }
    catch { return null; }
  }

  function editableMapSafe() {
    try { return typeof editableMachineMap === "function" ? editableMachineMap() : activeMapSafe(); }
    catch { return activeMapSafe(); }
  }

  function storedDirection(map = activeMapSafe()) {
    const value = map?.machineSettings?.direction || map?.direction || state?.direction || "ccw";
    return orientationDriver()?.normalizedStoredDirection(value)
      || (String(value).trim().toLowerCase() === "cw" ? "cw" : "ccw");
  }

  function physicalDirection(map = activeMapSafe()) {
    return orientationDriver()?.physicalDirection(storedDirection(map))
      || (storedDirection(map) === "cw" ? "ccw" : "cw");
  }

  function relabelDirectionControls() {
    const labels = orientationDriver()?.directionOptionLabels() || {
      cw: "Counter-clockwise",
      ccw: "Clockwise"
    };
    [document.querySelector("#mapDirection"), document.querySelector("#direction")]
      .filter(Boolean)
      .forEach((select) => {
        const storedCw = select.querySelector('option[value="cw"]');
        const storedCcw = select.querySelector('option[value="ccw"]');
        if (storedCw) storedCw.textContent = labels.cw;
        if (storedCcw) storedCcw.textContent = labels.ccw;
        select.dataset.physicalDirectionLabels = "true";
      });
  }

  function activeApplications() {
    try {
      return typeof selectedLabelApplicationState === "function"
        ? selectedLabelApplicationState()
        : { neck: true, body: true, back: true };
    } catch {
      return { neck: true, body: true, back: true };
    }
  }

  function codingSection(coder) {
    const explicit = coder?.orientationLabelSection || coder?.labelSection || "auto";
    return orientationDriver()?.resolveSection(explicit, activeApplications())
      || (activeApplications().back
        ? "back"
        : activeApplications().body
          ? "body"
          : activeApplications().neck
            ? "neck"
            : "none");
  }

  function ensureCoderOrientation() {
    const maps = [...new Set([activeMapSafe(), editableMapSafe()].filter(Boolean))];
    let changed = false;
    maps.forEach((map) => {
      (Array.isArray(map.objects) ? map.objects : []).forEach((item) => {
        if (item?.kind !== "coding") return;
        const section = String(item.orientationLabelSection || item.labelSection || "auto").toLowerCase();
        const shouldOrient = section !== "none";
        if (item.orientBottle !== shouldOrient) {
          item.orientBottle = shouldOrient;
          changed = true;
        }
        if (!item.orientationTarget) {
          item.orientationTarget = "code-box";
          changed = true;
        }
        if (item.orientationConfigured !== true) {
          item.orientationConfigured = true;
          changed = true;
        }
      });
    });
    return changed;
  }

  function labelCircumference(section) {
    const label = typeof selectedLabelSpec === "function" ? selectedLabelSpec() : null;
    const bottle = typeof selectedBottleSpec === "function" ? selectedBottleSpec() : null;
    return section === "neck"
      ? num(label?.neckBottomCircumferenceMm, NaN)
      : num(typeof bodyCircumference === "function" ? bodyCircumference(bottle) : NaN, NaN);
  }

  function labelWidth(section, circumference) {
    const wipe = typeof sectionWipePlan === "function" ? sectionWipePlan(section) : null;
    const planned = num(wipe?.labelDeg, NaN);
    if (Number.isFinite(planned)) return Math.min(360, Math.max(0.1, planned));
    const label = typeof selectedLabelSpec === "function" ? selectedLabelSpec() : null;
    const lengthMm = section === "neck"
      ? Math.max(num(label?.neckBottomCurveMm, 0), num(label?.neckLengthMm, 0))
      : section === "body"
        ? num(label?.bodyLengthMm, NaN)
        : num(label?.backLengthMm, NaN);
    return typeof degFromMm === "function"
      ? num(degFromMm(lengthMm, circumference), NaN)
      : NaN;
  }

  function applicationTarget(section, rows, beforeTable) {
    const planned = num(state?.motionPlan?.[`${section}ApplicationTarget`], NaN);
    if (Number.isFinite(planned)) return planned;

    const candidates = (Array.isArray(rows) ? rows : []).filter((row) =>
      num(row?.tableAngle, Infinity) < num(beforeTable, Infinity)
      && String(row?.section || "").toLowerCase() === section
      && /application/i.test(String(row?.action || ""))
      && Number.isFinite(num(row?.plateAngle, NaN))
    );
    if (candidates.length) return num(candidates.at(-1)?.plateAngle, NaN);

    const actionPattern = new RegExp(`(?:hold|turn).*${section}.*application`, "i");
    const fallback = (Array.isArray(rows) ? rows : []).filter((row) =>
      num(row?.tableAngle, Infinity) < num(beforeTable, Infinity)
      && actionPattern.test(String(row?.action || ""))
      && Number.isFinite(num(row?.plateAngle, NaN))
    );
    return num(fallback.at(-1)?.plateAngle, NaN);
  }

  function codeBoxTarget(map, section, rows, holdIndex) {
    const driver = orientationDriver();
    if (!driver?.codeBoxTarget) return null;
    const label = typeof selectedLabelSpec === "function" ? selectedLabelSpec() : null;
    const circumference = labelCircumference(section);
    const width = labelWidth(section, circumference);
    const code = typeof degFromMm === "function"
      ? num(degFromMm(label?.codeBoxCenterMm, circumference), NaN)
      : NaN;
    const inspection = typeof degFromMm === "function"
      ? num(degFromMm(state?.buildInputs?.backInspectionOffsetMm, circumference), 0)
      : 0;
    const hold = rows[holdIndex];
    const application = applicationTarget(section, rows, hold?.tableAngle);
    const previous = rows.slice(0, holdIndex).reverse()
      .find((row) => Number.isFinite(num(row?.plateAngle, NaN)));

    return driver.codeBoxTarget({
      section,
      applicationTarget: application,
      labelWidthDeg: width,
      codeBoxOffsetDeg: code,
      inspectionOffsetDeg: inspection,
      storedDirection: storedDirection(map),
      currentPlateAngle: num(previous?.plateAngle, NaN)
    });
  }

  function isCodingHold(row) {
    if (Number(row?.cmd) !== 3) return false;
    const action = String(row?.action || "");
    return Boolean(row?.codingObjectId)
      || Boolean(row?.codingHold)
      || Boolean(row?.codingReadyTableAngle)
      || Boolean(row?.codingMotion)
      || (Boolean(row?.orientationHold) && /coding|code box/i.test(action))
      || /hold.*(?:coding|code box)|(?:coding|code box).*hold|coding.*reference|direct turn for coding.*reference/i.test(action);
  }

  function updateTurnIntoHold(rows, holdIndex, target, direction) {
    for (let index = holdIndex - 1; index >= 0; index -= 1) {
      const row = rows[index];
      if (Number(row?.cmd) !== 7) continue;
      if (!(row?.codingObjectId
        || row?.codingMotion
        || row?.coderAfterWipeHandoff
        || /coding|code box/i.test(String(row?.action || "")))) continue;
      const startPlate = num(row?.plateAngle, NaN);
      const tableTravel = num(rows[holdIndex]?.tableAngle, NaN) - num(row?.tableAngle, NaN);
      rows[index] = {
        ...row,
        plannedRotation: Number.isFinite(startPlate) ? target - startPlate : row?.plannedRotation,
        plannedRatio: Number.isFinite(startPlate) && tableTravel > EPS
          ? Math.abs(target - startPlate) / tableTravel
          : row?.plannedRatio,
        codeBoxDirectionCorrected: true,
        physicalMachineDirection: direction,
        codeBoxPhysicalSide: "left"
      };
      return;
    }
  }

  function updateContinuation(rows, holdIndex, target, direction) {
    const continuation = rows[holdIndex + 1];
    if (!continuation || Number(continuation.cmd) !== 7) return;
    if (!(continuation.coderAfterWipeContinuation
      || continuation.mapObjectOrientationContinuation
      || /continue after/i.test(String(continuation.action || "")))) return;
    const destination = rows[holdIndex + 2];
    const destinationPlate = num(destination?.plateAngle, NaN);
    const tableTravel = num(destination?.tableAngle, NaN) - num(continuation?.tableAngle, NaN);
    rows[holdIndex + 1] = {
      ...continuation,
      plateAngle: done(target),
      plannedRotation: Number.isFinite(destinationPlate)
        ? destinationPlate - target
        : continuation?.plannedRotation,
      plannedRatio: Number.isFinite(destinationPlate) && tableTravel > EPS
        ? Math.abs(destinationPlate - target) / tableTravel
        : continuation?.plannedRatio,
      codeBoxDirectionCorrected: true,
      physicalMachineDirection: direction,
      codeBoxPhysicalSide: "left"
    };
  }

  function updateMotionPlan(target, section, direction) {
    if (!state?.motionPlan || typeof state.motionPlan !== "object") return;
    state.motionPlan.coderCenterlineTarget = done(target);
    state.motionPlan.physicalMachineDirection = direction;
    state.motionPlan.codeBoxPhysicalSide = "left";
    state.motionPlan.codeBoxDirectionInvariant = true;
    state.motionPlan.coderOrientationDriver = "profile.coderOrientation";
    state.motionPlan.profilePipelineOrientationStage = STAGE_ID;
    state.motionPlan.mapObjectOrientationPlans = (Array.isArray(state.motionPlan.mapObjectOrientationPlans)
      ? state.motionPlan.mapObjectOrientationPlans
      : []).map((plan) =>
      plan?.kind === "coding" || plan?.codingObjectId
        ? {
            ...plan,
            section,
            targetPlateAngle: done(target),
            codeBoxDirectionCorrected: true,
            physicalMachineDirection: direction,
            codeBoxPhysicalSide: "left",
            orientationDriver: "profile.coderOrientation"
          }
        : plan
    );
  }

  function process(sourceRows) {
    if (!Array.isArray(sourceRows) || !sourceRows.length) return sourceRows;
    const map = activeMapSafe();
    if (!map) return sourceRows;
    const coder = (Array.isArray(map.objects) ? map.objects : [])
      .find((item) => item?.kind === "coding");
    if (!coder || coder.orientBottle === false) return sourceRows;
    const section = codingSection(coder);
    if (section === "none") return sourceRows;

    const rows = sourceRows.map((row) => ({ ...row }));
    const holdIndexes = rows.map((row, index) => isCodingHold(row) ? index : -1)
      .filter((index) => index >= 0);
    if (!holdIndexes.length) return sourceRows;

    let finalTarget = null;
    let direction = physicalDirection(map);
    holdIndexes.forEach((holdIndex) => {
      const correction = codeBoxTarget(map, section, rows, holdIndex);
      if (!correction) return;
      finalTarget = correction.target;
      direction = correction.physicalDirection;
      rows[holdIndex] = {
        ...rows[holdIndex],
        plateAngle: done(correction.target),
        codeBoxDirectionCorrected: true,
        physicalMachineDirection: direction,
        codeBoxPhysicalSide: correction.physicalSide,
        codeBoxReferenceEdge: correction.referenceEdge,
        codeBoxOffsetDeg: done(correction.code),
        labelWidthDeg: done(correction.width),
        orientationDriver: "profile.coderOrientation"
      };
      updateTurnIntoHold(rows, holdIndex, correction.target, direction);
      updateContinuation(rows, holdIndex, correction.target, direction);
    });

    if (!Number.isFinite(finalTarget)) return sourceRows;
    const output = rows.map((row, index) => ({ ...row, hmi: index + 1, plc: index }));
    updateMotionPlan(finalTarget, section, direction);
    if (state?.motionPlan && typeof state.motionPlan === "object") {
      state.motionPlan.rows = output;
      state.motionPlan.finalPlateAngle = output.at(-1)?.plateAngle;
    }
    return output;
  }

  function scheduleRefresh() {
    if (refreshPending) return;
    refreshPending = true;
    window.requestAnimationFrame(() => {
      refreshPending = false;
      relabelDirectionControls();
      ensureCoderOrientation();
    });
  }

  function registerPipelineStage() {
    const pipeline = pipelineDriver();
    if (!pipeline?.registerStage) return false;
    pipeline.registerStage({
      id: STAGE_ID,
      phase: "orientation",
      order: 500,
      source: "app/clockwise-code-box-orientation-integration.js",
      description: "Apply the physical machine direction to the left-edge code-box target.",
      process(sourceRows) {
        ensureCoderOrientation();
        return process(sourceRows);
      }
    });
    window.LabelerPhysicalDirectionCodeBoxProcessor = process;
    return true;
  }

  function installLegacyWrapper() {
    const base = generatedServoProfile;
    generatedServoProfile = function generatedServoProfileWithPhysicalDirectionCodeBox(...args) {
      ensureCoderOrientation();
      return process(base.apply(this, args));
    };
    generatedServoProfile.physicalDirectionCodeBoxOrientation = true;
    window.generatedServoProfile = generatedServoProfile;
  }

  function installBuilderHook() {
    if (typeof renderWipeDownBuilder !== "function"
      || renderWipeDownBuilder.physicalDirectionCodeBoxOrientation) return;
    const renderBuilderBase = renderWipeDownBuilder;
    renderWipeDownBuilder = function renderWipeDownBuilderWithPhysicalDirections(...args) {
      const result = renderBuilderBase.apply(this, args);
      ensureCoderOrientation();
      relabelDirectionControls();
      return result;
    };
    renderWipeDownBuilder.physicalDirectionCodeBoxOrientation = true;
    window.renderWipeDownBuilder = renderWipeDownBuilder;
  }

  function installDirectionChange() {
    document.addEventListener("change", (event) => {
      if (!event.target.closest?.("#mapDirection,#direction")) return;
      window.setTimeout(() => {
        ensureCoderOrientation();
        if (typeof applyGeneratedServoProfile === "function") applyGeneratedServoProfile();
        if (typeof saveCurrentSettings === "function") saveCurrentSettings();
        if (typeof render === "function") render();
        relabelDirectionControls();
      }, 0);
    });
  }

  function install() {
    if (installed) return true;
    if (typeof generatedServoProfile !== "function"
      || typeof state === "undefined"
      || !orientationDriver()) return false;

    const pipelineManaged = registerPipelineStage();
    if (!pipelineManaged) installLegacyWrapper();
    installBuilderHook();
    installDirectionChange();

    const observer = new MutationObserver(scheduleRefresh);
    observer.observe(document.documentElement, { childList: true, subtree: true });

    installed = true;
    relabelDirectionControls();
    const changed = ensureCoderOrientation();
    try {
      if (changed && typeof saveCurrentSettings === "function") saveCurrentSettings();
      if (!pipelineManaged || window.LabelerProfilePipelineOrchestratorInstalled) {
        if (typeof applyGeneratedServoProfile === "function") applyGeneratedServoProfile();
        if (typeof render === "function") render();
      }
    } catch (error) {
      console.error("Unable to apply physical direction and code-box orientation correction.", error);
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
