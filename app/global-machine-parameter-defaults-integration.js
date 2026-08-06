"use strict";

(function installGlobalMachineParameterDefaults(global) {
  if (global.LabelerGlobalMachineParameterDefaults) return;

  // Center Line Front is derived by the current APL model as:
  // -(90 - neckSpenderPlateDeg) + plateStartPositionDeg.
  // A 75-degree spender plate therefore uses a 15-degree starting position
  // to produce the requested zero-degree front centerline.
  const DEFAULT_BUILD_INPUTS = Object.freeze({
    neckSpenderPlateDeg: 75,
    neckApplication: "Center",
    plateStartPositionDeg: 15,
    neckContactMm: 0,
    bodyContactMm: 0,
    backContactMm: 0
  });

  const LEGACY_BUILD_INPUTS = Object.freeze({
    neckSpenderPlateDeg: 75,
    neckApplication: "Center",
    plateStartPositionDeg: 0,
    neckContactMm: 4.4,
    bodyContactMm: 5,
    backContactMm: 5
  });

  function apply(targetState) {
    if (!targetState || typeof targetState !== "object") return false;
    targetState.buildInputs = {
      ...(targetState.buildInputs || {}),
      ...DEFAULT_BUILD_INPUTS
    };
    return true;
  }

  function matchesLegacyDefaults(buildInputs = {}) {
    return Object.entries(LEGACY_BUILD_INPUTS)
      .every(([key, value]) => buildInputs?.[key] === value);
  }

  function migrateUntouchedLegacyDefaults(targetState) {
    if (!targetState || !matchesLegacyDefaults(targetState.buildInputs)) return false;
    return apply(targetState);
  }

  // Establish the new fallback before loadSavedSettings(). Saved build inputs
  // are merged afterward and remain authoritative.
  const applied = typeof state !== "undefined" ? apply(state) : false;

  // Existing workspaces that still contain the complete previous default tuple
  // are treated as untouched defaults and migrated. Any changed parameter makes
  // the tuple different, so explicit user settings are preserved.
  const baseLoadSavedSettings = global.loadSavedSettings;
  if (typeof baseLoadSavedSettings === "function" && !baseLoadSavedSettings.globalMachineDefaultsWrapped) {
    const wrappedLoadSavedSettings = function loadSavedSettingsWithMachineDefaults(...args) {
      const result = baseLoadSavedSettings.apply(this, args);
      if (typeof state !== "undefined") migrateUntouchedLegacyDefaults(state);
      return result;
    };
    wrappedLoadSavedSettings.globalMachineDefaultsWrapped = true;
    wrappedLoadSavedSettings.previousLoadSavedSettings = baseLoadSavedSettings;
    global.loadSavedSettings = wrappedLoadSavedSettings;
  }

  global.LabelerGlobalMachineParameterDefaults = Object.freeze({
    DEFAULT_BUILD_INPUTS,
    LEGACY_BUILD_INPUTS,
    apply,
    matchesLegacyDefaults,
    migrateUntouchedLegacyDefaults,
    applied
  });
})(typeof window !== "undefined" ? window : globalThis);

(function installBrandContactParameterDefaults(global) {
  if (global.LabelerBrandContactParameterDefaults?.installed) return;

  const DEFAULT_CONTACT_DEG = 10;
  const STORE_KEY = "contactParameterDegByBrand";
  const MIGRATION_KEY = "servoforge-brand-contact-parameters-10deg-v1-applied";
  const RETRY_MS = 50;
  const CONTACT_INPUTS = Object.freeze({
    programNeckContactDeg: "neck",
    programBodyContactDeg: "body",
    programBackContactDeg: "back"
  });
  const SUMMARY_LABELS = Object.freeze({
    "Neck Contact Parameter (deg)": "neck",
    "Body Contact Parameter (deg)": "body",
    "Back Contact Parameter (deg)": "back"
  });
  const MM_FIELDS = Object.freeze({
    neck: "neckContactMm",
    body: "bodyContactMm",
    back: "backContactMm"
  });

  const finite = (value, fallback = NaN) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const text = (value) => String(value ?? "").trim();
  const stateRef = () => typeof state !== "undefined" ? state : global.state;

  function brandKey(specOrBrand, applicationMode = "") {
    if (specOrBrand && typeof specOrBrand === "object") {
      return `${text(specOrBrand.applicationMode || applicationMode || "apl").toLowerCase()}|${text(specOrBrand.brand).toLowerCase()}`;
    }
    return `${text(applicationMode || stateRef()?.applicationMode || "apl").toLowerCase()}|${text(specOrBrand).toLowerCase()}`;
  }

  function selectedLabel(target = stateRef()) {
    const labels = Array.isArray(target?.labelSpecs) ? target.labelSpecs : [];
    return labels.find((spec) => text(spec?.brand) === text(target?.selectedBrand)
      && (!spec?.applicationMode || spec.applicationMode === target?.applicationMode))
      || labels.find((spec) => text(spec?.brand) === text(target?.selectedBrand))
      || null;
  }

  function selectedBottle(target = stateRef(), label = selectedLabel(target)) {
    const bottleType = text(target?.selectedBottle || label?.bottleType);
    return (Array.isArray(target?.bottleSpecs) ? target.bottleSpecs : [])
      .find((spec) => text(spec?.bottleType) === bottleType) || null;
  }

  function ensureStore(target = stateRef()) {
    if (!target || typeof target !== "object") return {};
    target.buildInputs = target.buildInputs && typeof target.buildInputs === "object" ? target.buildInputs : {};
    const current = target.buildInputs[STORE_KEY];
    if (!current || typeof current !== "object" || Array.isArray(current)) target.buildInputs[STORE_KEY] = {};
    return target.buildInputs[STORE_KEY];
  }

  function defaultTuple() {
    return { neck: DEFAULT_CONTACT_DEG, body: DEFAULT_CONTACT_DEG, back: DEFAULT_CONTACT_DEG };
  }

  function ensureBrand(target = stateRef(), spec = selectedLabel(target), { force = false } = {}) {
    if (!target || !spec?.brand) return defaultTuple();
    const store = ensureStore(target);
    const key = brandKey(spec, target.applicationMode);
    const existing = store[key] && typeof store[key] === "object" ? store[key] : {};
    store[key] = {
      neck: force ? DEFAULT_CONTACT_DEG : Math.max(0, finite(existing.neck, DEFAULT_CONTACT_DEG)),
      body: force ? DEFAULT_CONTACT_DEG : Math.max(0, finite(existing.body, DEFAULT_CONTACT_DEG)),
      back: force ? DEFAULT_CONTACT_DEG : Math.max(0, finite(existing.back, DEFAULT_CONTACT_DEG))
    };
    return store[key];
  }

  function ensureAllBrands(target = stateRef(), { force = false } = {}) {
    const labels = Array.isArray(target?.labelSpecs) ? target.labelSpecs : [];
    labels.forEach((spec) => ensureBrand(target, spec, { force }));
    return ensureStore(target);
  }

  function contactDeg(target = stateRef(), section, spec = selectedLabel(target)) {
    return Math.max(0, finite(ensureBrand(target, spec)?.[section], DEFAULT_CONTACT_DEG));
  }

  function setContactDeg(target = stateRef(), section, value, spec = selectedLabel(target)) {
    if (!MM_FIELDS[section] || !spec?.brand) return DEFAULT_CONTACT_DEG;
    const tuple = ensureBrand(target, spec);
    tuple[section] = Math.max(0, finite(value, tuple[section]));
    return tuple[section];
  }

  function bodyCircumference(target = stateRef(), label = selectedLabel(target)) {
    const bottle = selectedBottle(target, label);
    if (typeof global.bodyCircumference === "function") {
      const value = finite(global.bodyCircumference(bottle), NaN);
      if (Number.isFinite(value) && value > 0) return value;
    }
    const diameter = finite(bottle?.diameterTargetMm, NaN);
    const reduction = finite(bottle?.radiusReductionMm, 0);
    return Number.isFinite(diameter) ? Math.max(0.001, Math.PI * (diameter - 2 * reduction)) : 0;
  }

  function circumferenceFor(target, section, label) {
    if (section === "neck") return Math.max(0, finite(label?.neckBottomCircumferenceMm, 0));
    return bodyCircumference(target, label);
  }

  function applySelectedBrand(target = stateRef()) {
    const label = selectedLabel(target);
    if (!target || !label) return false;
    const tuple = ensureBrand(target, label);
    Object.entries(MM_FIELDS).forEach(([section, field]) => {
      const circumference = circumferenceFor(target, section, label);
      target.buildInputs[field] = circumference > 0
        ? tuple[section] / 360 * circumference
        : 0;
    });
    return true;
  }

  function migrationApplied() {
    try { return global.localStorage?.getItem(MIGRATION_KEY) === "true"; }
    catch { return false; }
  }

  function markMigrationApplied() {
    try { global.localStorage?.setItem(MIGRATION_KEY, "true"); }
    catch { /* Storage can be unavailable in restricted contexts. */ }
  }

  function migrateLoadedState(target = stateRef()) {
    const force = !migrationApplied();
    ensureAllBrands(target, { force });
    applySelectedBrand(target);
    if (force) markMigrationApplied();
    return force;
  }

  function refreshAfterContextChange() {
    const target = stateRef();
    if (!applySelectedBrand(target)) return;
    try { global.saveCurrentSettings?.(); } catch { /* Persistence remains optional. */ }
    try { global.applyGeneratedServoProfile?.(); } catch { /* The next normal regeneration will use the defaults. */ }
    try {
      if (typeof global.render === "function") global.render();
      else global.renderBuildInputs?.();
    } catch { /* The next normal render will display the defaults. */ }
  }

  function patchContactInputs(target = stateRef()) {
    const label = selectedLabel(target);
    Object.entries(CONTACT_INPUTS).forEach(([id, section]) => {
      const input = global.document?.getElementById(id);
      if (input) input.value = String(contactDeg(target, section, label));
    });
  }

  function wrapLoadSavedSettings() {
    const base = global.loadSavedSettings;
    if (typeof base !== "function" || base.brandContactDefaultsWrapped) return typeof base === "function";
    const wrapped = function loadSavedSettingsWithBrandContactDefaults(...args) {
      const result = base.apply(this, args);
      migrateLoadedState(stateRef());
      return result;
    };
    wrapped.brandContactDefaultsWrapped = true;
    wrapped.previousLoadSavedSettings = base;
    global.loadSavedSettings = wrapped;
    return true;
  }

  function wrapBuildProgramSummary() {
    const base = global.buildProgramSummary;
    if (typeof base !== "function" || base.brandContactDefaultsWrapped) return typeof base === "function";
    const wrapped = function buildProgramSummaryWithBrandContactDefaults(...args) {
      const target = stateRef();
      applySelectedBrand(target);
      const summary = base.apply(this, args);
      if (!summary || !Array.isArray(summary.rows)) return summary;
      return {
        ...summary,
        rows: summary.rows.map((row) => {
          const section = SUMMARY_LABELS[text(row?.[0])];
          return section ? [row[0], contactDeg(target, section)] : row;
        })
      };
    };
    wrapped.brandContactDefaultsWrapped = true;
    wrapped.previousBuildProgramSummary = base;
    global.buildProgramSummary = wrapped;
    return true;
  }

  function wrapRenderBuildInputs() {
    const base = global.renderBuildInputs;
    if (typeof base !== "function" || base.brandContactDefaultsWrapped) return typeof base === "function";
    const wrapped = function renderBuildInputsWithBrandContactDefaults(...args) {
      applySelectedBrand(stateRef());
      const result = base.apply(this, args);
      patchContactInputs(stateRef());
      return result;
    };
    wrapped.brandContactDefaultsWrapped = true;
    wrapped.previousRenderBuildInputs = base;
    global.renderBuildInputs = wrapped;
    return true;
  }

  function wrapBuildInputsController() {
    const base = global.LabelerBuildInputsController;
    if (!base || base.brandContactDefaultsV1) return Boolean(base?.brandContactDefaultsV1);
    global.LabelerBuildInputsController = Object.freeze({
      ...base,
      selectBrand(value) {
        ensureBrand(stateRef(), (stateRef()?.labelSpecs || []).find((spec) => text(spec?.brand) === text(value)) || { brand: value, applicationMode: stateRef()?.applicationMode });
        const result = base.selectBrand(value);
        global.setTimeout(refreshAfterContextChange, 0);
        return result;
      },
      selectBottle(value) {
        const result = base.selectBottle(value);
        global.setTimeout(refreshAfterContextChange, 0);
        return result;
      },
      updateCalculatedField(id, rawValue) {
        const section = CONTACT_INPUTS[id];
        if (section) setContactDeg(stateRef(), section, rawValue);
        return base.updateCalculatedField(id, rawValue);
      },
      brandContactDefaultsV1: true
    });
    return true;
  }

  function installRuntimeWrappers() {
    const ready = [
      wrapLoadSavedSettings(),
      wrapBuildProgramSummary(),
      wrapRenderBuildInputs(),
      wrapBuildInputsController()
    ].every(Boolean);
    if (!ready) global.setTimeout(installRuntimeWrappers, RETRY_MS);
  }

  global.addEventListener?.("servoforge:repository-brands-downloaded", () => {
    ensureAllBrands(stateRef());
    refreshAfterContextChange();
  });

  ensureAllBrands(stateRef());
  applySelectedBrand(stateRef());
  installRuntimeWrappers();

  global.LabelerBrandContactParameterDefaults = Object.freeze({
    installed: true,
    version: 1,
    DEFAULT_CONTACT_DEG,
    STORE_KEY,
    MIGRATION_KEY,
    CONTACT_INPUTS,
    SUMMARY_LABELS,
    MM_FIELDS,
    brandKey,
    selectedLabel,
    selectedBottle,
    ensureStore,
    ensureBrand,
    ensureAllBrands,
    contactDeg,
    setContactDeg,
    bodyCircumference,
    applySelectedBrand,
    migrateLoadedState,
    patchContactInputs,
    refreshAfterContextChange
  });
})(typeof window !== "undefined" ? window : globalThis);
