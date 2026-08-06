"use strict";

(function installFirstApplicationZeroDatum(global) {
  if (global.LabelerFirstApplicationZeroDatum?.installed) return;

  const DEFAULT_SERVO_START_DEG = 0;
  const DEFAULT_FRONT_CENTERLINE_DEG = 0;
  const PREVIOUS_DEFAULT_SERVO_START_DEG = 15;
  const PREVIOUS_DEFAULT_SPENDER_DEG = 75;
  const RETRY_MS = 50;
  const EPS = 0.001;
  let activeApplicationDatumOffset = 0;

  const finite = (value, fallback = NaN) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const text = (value) => String(value ?? "").trim();
  const stateRef = () => typeof state !== "undefined" ? state : global.state;

  function selectedLabel(target = stateRef()) {
    const labels = Array.isArray(target?.labelSpecs) ? target.labelSpecs : [];
    return labels.find((spec) => text(spec?.brand) === text(target?.selectedBrand)
      && (!spec?.applicationMode || spec.applicationMode === target?.applicationMode))
      || labels.find((spec) => text(spec?.brand) === text(target?.selectedBrand))
      || null;
  }

  function legacyCenterLineFront(inputs = {}, label = null) {
    if (text(inputs.neckApplication) === "Leading Edge") {
      const circumference = finite(label?.neckBottomCircumferenceMm, NaN);
      const developed = finite(label?.neckBottomCurveMm, finite(label?.neckLengthMm, NaN));
      const neckLabelDeg = Number.isFinite(circumference) && circumference > 0 && Number.isFinite(developed)
        ? developed / circumference * 360
        : 0;
      return finite(inputs.plateStartPositionDeg, DEFAULT_SERVO_START_DEG) + neckLabelDeg / 2;
    }
    return -(90 - finite(inputs.neckSpenderPlateDeg, PREVIOUS_DEFAULT_SPENDER_DEG))
      + finite(inputs.plateStartPositionDeg, DEFAULT_SERVO_START_DEG);
  }

  function ensureBuildInputDefaults(target = stateRef()) {
    if (!target || typeof target !== "object") return false;
    target.buildInputs = target.buildInputs && typeof target.buildInputs === "object"
      ? target.buildInputs
      : {};
    const inputs = target.buildInputs;
    const label = selectedLabel(target);
    const derivedFront = legacyCenterLineFront(inputs, label);
    if (!Number.isFinite(finite(inputs.centerLineFrontDeg, NaN))) {
      inputs.centerLineFrontDeg = Number.isFinite(derivedFront)
        ? derivedFront
        : DEFAULT_FRONT_CENTERLINE_DEG;
    }

    const previousUntouchedDefault = text(inputs.neckApplication || "Center") === "Center"
      && Math.abs(finite(inputs.neckSpenderPlateDeg, PREVIOUS_DEFAULT_SPENDER_DEG) - PREVIOUS_DEFAULT_SPENDER_DEG) <= EPS
      && Math.abs(finite(inputs.plateStartPositionDeg, PREVIOUS_DEFAULT_SERVO_START_DEG) - PREVIOUS_DEFAULT_SERVO_START_DEG) <= EPS
      && Math.abs(finite(inputs.centerLineFrontDeg, DEFAULT_FRONT_CENTERLINE_DEG) - DEFAULT_FRONT_CENTERLINE_DEG) <= EPS;

    if (previousUntouchedDefault || !Number.isFinite(finite(inputs.plateStartPositionDeg, NaN))) {
      inputs.plateStartPositionDeg = DEFAULT_SERVO_START_DEG;
    }
    return previousUntouchedDefault;
  }

  function applications(target = stateRef()) {
    try {
      return typeof global.selectedLabelApplicationState === "function"
        ? global.selectedLabelApplicationState()
        : { neck: true, body: true, back: true };
    } catch {
      return { neck: true, body: true, back: true };
    }
  }

  function stationSections(machineMap) {
    try {
      return typeof global.inferAplStationSections === "function"
        ? global.inferAplStationSections(machineMap)
        : { ...(machineMap?.stationSections || {}) };
    } catch {
      return { ...(machineMap?.stationSections || {}) };
    }
  }

  function sectionForStation(station, sections) {
    const assigned = text(sections?.[String(station)]).toLowerCase();
    if (["neck", "body", "back", "none"].includes(assigned)) return assigned;
    if (typeof global.labelSectionForStation === "function") {
      const resolved = text(global.labelSectionForStation(station)).toLowerCase();
      if (["neck", "body", "back", "none"].includes(resolved)) return resolved;
    }
    return Number(station) <= 2 ? "neck" : Number(station) <= 4 ? "body" : "back";
  }

  function rawApplicationTargets(seed = [], startPlate = DEFAULT_SERVO_START_DEG) {
    return {
      neck: finite(seed?.[1]?.plateAngle, startPlate),
      body: finite(seed?.[11]?.plateAngle, startPlate),
      back: finite(seed?.[21]?.plateAngle, startPlate)
    };
  }

  function resolveApplicationDatum(machineMap, seed, target = stateRef()) {
    const startPlate = finite(target?.buildInputs?.plateStartPositionDeg, DEFAULT_SERVO_START_DEG);
    const rawTargets = rawApplicationTargets(seed, startPlate);
    const active = applications(target);
    const sections = stationSections(machineMap);
    const stations = [...new Set((Array.isArray(machineMap?.objects) ? machineMap.objects : [])
      .filter((item) => item?.enabled !== false && (item?.kind === "roller" || item?.kind === "pad"))
      .map((item) => Number(item?.station ?? item?.aggregate))
      .filter(Number.isFinite))]
      .sort((left, right) => left - right);
    const firstStation = stations.find((station) => {
      const section = sectionForStation(station, sections);
      return section !== "none" && active?.[section] !== false;
    });
    const firstSection = Number.isFinite(firstStation)
      ? sectionForStation(firstStation, sections)
      : "";
    const rawFirstTarget = firstSection ? finite(rawTargets[firstSection], startPlate) : startPlate;
    const offset = rawFirstTarget - startPlate;
    const rebasedTargets = Object.fromEntries(
      Object.entries(rawTargets).map(([section, value]) => [section, value - offset])
    );
    return {
      startPlate,
      firstStation: Number.isFinite(firstStation) ? firstStation : null,
      firstSection,
      rawTargets,
      offset,
      rebasedTargets
    };
  }

  function effectiveCenterLineFront(target = stateRef()) {
    ensureBuildInputDefaults(target);
    return finite(target?.buildInputs?.centerLineFrontDeg, DEFAULT_FRONT_CENTERLINE_DEG)
      - activeApplicationDatumOffset;
  }

  function rewriteSummary(summary, target = stateRef()) {
    if (!summary || !Array.isArray(summary.rows)) return summary;
    const front = effectiveCenterLineFront(target);
    return {
      ...summary,
      rows: summary.rows.map((row) => {
        if (row?.[0] === "Center Line Front (deg)") return [row[0], front, row[2]];
        if (row?.[0] === "Center Line Back (deg)") return [row[0], front + 180, row[2]];
        return row;
      })
    };
  }

  function wrapBuildProgramSummary() {
    const base = global.buildProgramSummary;
    if (typeof base !== "function") return false;
    if (base.firstApplicationZeroDatumV1) return true;
    const wrapped = function buildProgramSummaryWithZeroDatum(...args) {
      ensureBuildInputDefaults(stateRef());
      return rewriteSummary(base.apply(this, args), stateRef());
    };
    wrapped.firstApplicationZeroDatumV1 = true;
    wrapped.previousBuildProgramSummary = base;
    global.buildProgramSummary = wrapped;
    return true;
  }

  function patchBuildInputs(target = stateRef()) {
    ensureBuildInputDefaults(target);
    const front = finite(target?.buildInputs?.centerLineFrontDeg, DEFAULT_FRONT_CENTERLINE_DEG);
    const values = {
      plateStartPositionDeg: finite(target?.buildInputs?.plateStartPositionDeg, DEFAULT_SERVO_START_DEG),
      programCenterLineFrontDeg: front,
      programCenterLineBackDeg: front + 180
    };
    Object.entries(values).forEach(([id, value]) => {
      const input = global.document?.getElementById(id);
      if (input) input.value = String(value);
    });
  }

  function wrapRenderBuildInputs() {
    const base = global.renderBuildInputs;
    if (typeof base !== "function") return false;
    if (base.firstApplicationZeroDatumV1) return true;
    const wrapped = function renderBuildInputsWithZeroDatum(...args) {
      ensureBuildInputDefaults(stateRef());
      const result = base.apply(this, args);
      patchBuildInputs(stateRef());
      return result;
    };
    wrapped.firstApplicationZeroDatumV1 = true;
    wrapped.previousRenderBuildInputs = base;
    global.renderBuildInputs = wrapped;
    return true;
  }

  function commitCenterLine(value) {
    const target = stateRef();
    const mutate = () => {
      ensureBuildInputDefaults(target);
      target.buildInputs.centerLineFrontDeg = finite(value, DEFAULT_FRONT_CENTERLINE_DEG);
    };
    const actions = global.LabelerWorkspaceActionService;
    if (actions?.execute) {
      return actions.execute({ mutate, syncMap: true, regenerate: true, persist: true, render: "all" });
    }
    mutate();
    global.saveCurrentSettings?.();
    global.applyGeneratedServoProfile?.();
    global.render?.();
    return target.buildInputs.centerLineFrontDeg;
  }

  function wrapBuildInputsController() {
    const base = global.LabelerBuildInputsController;
    if (!base) return false;
    if (base.firstApplicationZeroDatumV1) return true;
    global.LabelerBuildInputsController = Object.freeze({
      ...base,
      updateCalculatedField(id, rawValue) {
        if (id === "programCenterLineFrontDeg") return commitCenterLine(rawValue);
        if (id === "programCenterLineBackDeg") return commitCenterLine(finite(rawValue, 180) - 180);
        return base.updateCalculatedField(id, rawValue);
      },
      firstApplicationZeroDatumV1: true
    });
    return true;
  }

  function wrapLoadSavedSettings() {
    const base = global.loadSavedSettings;
    if (typeof base !== "function") return false;
    if (base.firstApplicationZeroDatumV1) return true;
    const wrapped = function loadSavedSettingsWithZeroDatum(...args) {
      const result = base.apply(this, args);
      ensureBuildInputDefaults(stateRef());
      return result;
    };
    wrapped.firstApplicationZeroDatumV1 = true;
    wrapped.previousLoadSavedSettings = base;
    global.loadSavedSettings = wrapped;
    return true;
  }

  function wrapMapGenerator() {
    const base = global.generatedAplMapDrivenProfile;
    if (typeof base !== "function") return false;
    if (base.firstApplicationZeroDatumV1) return true;

    const wrapped = function generatedAplMapDrivenProfileWithZeroDatum(machineMap) {
      const target = stateRef();
      ensureBuildInputDefaults(target);
      const rawSeed = typeof global.generatedAplSeedProfile === "function"
        ? global.generatedAplSeedProfile()
        : [];
      const datum = resolveApplicationDatum(machineMap, rawSeed, target);
      const previousOffset = activeApplicationDatumOffset;
      activeApplicationDatumOffset = datum.offset;
      let rows;
      try {
        rows = base.call(this, machineMap);
      } finally {
        activeApplicationDatumOffset = previousOffset;
      }

      const initialAction = Number.isFinite(datum.firstStation)
        ? `Hold for ${datum.firstSection ? `${datum.firstSection.charAt(0).toUpperCase()}${datum.firstSection.slice(1)}` : "Label"} Application - Agg ${datum.firstStation}`
        : "";
      const finalized = (Array.isArray(rows) ? rows : []).map((row) =>
        initialAction && text(row?.action) === initialAction
          ? {
              ...row,
              initialApplicationDatum: true,
              applicationDatumOffset: datum.offset,
              initialApplicationSection: datum.firstSection,
              initialApplicationStation: datum.firstStation
            }
          : row
      );

      if (target?.motionPlan && typeof target.motionPlan === "object") {
        target.motionPlan.rows = finalized;
        target.motionPlan.initialApplicationDatum = true;
        target.motionPlan.initialApplicationSection = datum.firstSection;
        target.motionPlan.initialApplicationStation = datum.firstStation;
        target.motionPlan.applicationDatumOffset = datum.offset;
        target.motionPlan.neckApplicationTarget = datum.rebasedTargets.neck;
        target.motionPlan.bodyApplicationTarget = datum.rebasedTargets.body;
        target.motionPlan.backApplicationTarget = datum.rebasedTargets.back;
      }
      return finalized;
    };
    wrapped.firstApplicationZeroDatumV1 = true;
    wrapped.previousGeneratedAplMapDrivenProfile = base;
    global.generatedAplMapDrivenProfile = wrapped;

    const generator = global.LabelerAplMapProfileGenerator;
    if (generator?.generate) {
      global.LabelerAplMapProfileGenerator = Object.freeze({
        ...generator,
        generate: wrapped,
        resolveApplicationDatum,
        firstApplicationZeroDatumV1: true
      });
    }
    return true;
  }

  function installWrappers() {
    const ready = [
      wrapBuildProgramSummary(),
      wrapRenderBuildInputs(),
      wrapBuildInputsController(),
      wrapLoadSavedSettings(),
      wrapMapGenerator()
    ].every(Boolean);
    if (!ready) global.setTimeout(installWrappers, RETRY_MS);
  }

  ensureBuildInputDefaults(stateRef());
  installWrappers();

  global.LabelerFirstApplicationZeroDatum = Object.freeze({
    installed: true,
    version: 1,
    DEFAULT_SERVO_START_DEG,
    DEFAULT_FRONT_CENTERLINE_DEG,
    legacyCenterLineFront,
    ensureBuildInputDefaults,
    rawApplicationTargets,
    resolveApplicationDatum,
    effectiveCenterLineFront,
    rewriteSummary,
    patchBuildInputs
  });
})(typeof window !== "undefined" ? window : globalThis);
