"use strict";

(function installCompanyDefaultPrograms(global) {
  const SEED_KEY = "labelerCompanyProgramSeedVersion";
  const MANIFEST = "./config/company-default-settings.json";
  const LEGACY_LABEL_CATALOG = "./config/default-programs/label-specs.json";
  const WORKSPACE_STORAGE_KEY = typeof SETTINGS_KEY === "string" ? SETTINGS_KEY : "labelerToolSettings";
  const RESET_PREFIX = /^(labeler|servoforge)/i;

  const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
  const key = (value) => String(value ?? "").trim().toLowerCase();

  function savedVersion() {
    try { return Number(localStorage.getItem(SEED_KEY) || 0); }
    catch { return 0; }
  }

  function saveVersion(version) {
    try { localStorage.setItem(SEED_KEY, String(version)); }
    catch { }
  }

  function hasSavedWorkspace() {
    try { return Boolean(localStorage.getItem(WORKSPACE_STORAGE_KEY)); }
    catch { return false; }
  }

  async function json(source) {
    const response = await fetch(source, { cache: "no-store" });
    if (!response.ok) throw new Error(`${source} returned ${response.status}.`);
    return response.json();
  }

  async function fragments(reference) {
    const sources = Array.isArray(reference) ? reference : reference ? [reference] : [];
    const values = await Promise.all(sources.map(json));
    return values.flatMap((value) => Array.isArray(value) ? value : [value]);
  }

  function addMissing(current, seeded, identity) {
    const result = Array.isArray(current) ? [...current] : [];
    const known = new Set(result.map(identity).filter(Boolean));
    let added = 0;
    seeded.forEach((rawEntry) => {
      const entry = clone(rawEntry);
      const id = identity(entry);
      if (!id || known.has(id)) return;
      result.push(entry);
      known.add(id);
      added += 1;
    });
    return { items: result, added, changed: added > 0 };
  }

  function applyBase(base) {
    [
      "themePreset", "headCount", "radius", "zeroAngle", "direction",
      "animationSpeed", "animationSpeedUnit", "maxMoveRatio",
      "tablePitchRadiusMm", "referencePitchRadiusMm", "autoScaleTableMap",
      "encoderCountsPerRev", "servoGearRatio", "padClearanceMm",
      "showMoveDistanceOverlay", "showAllProgramMovesOverlay",
      "showQuadrantReferences", "showAggregateSpacingOverlay", "workspaceView",
      "wipeBuilderOpen", "mapLocked", "applicationMode", "selectedBrand",
      "selectedBottle", "activeMapId"
    ].forEach((name) => {
      if (base[name] !== undefined) state[name] = clone(base[name]);
    });
    if (base.buildInputs) state.buildInputs = { ...state.buildInputs, ...clone(base.buildInputs) };
    state.machineTypes = [...new Set([...(state.machineTypes || []), ...(base.machineTypes || [])])];
  }

  function taggedMaps(maps, version) {
    return maps.map((map) => ({
      ...clone(map),
      companyDefaultProgram: true,
      companyDefaultProgramVersion: version
    }));
  }

  function taggedLabels(labels, version) {
    return labels.map((spec) => ({
      ...clone(spec),
      companyDefaultSpecVersion: version
    }));
  }

  function taggedBottles(bottles, version) {
    return bottles.map((spec) => ({
      ...clone(spec),
      companyDefaultSpecVersion: version
    }));
  }

  function labelSnapshot(spec) {
    const normalizedSpecNumber = ["", "n/a"].includes(key(spec?.specNumber)) ? "" : key(spec?.specNumber);
    return JSON.stringify({
      applicationMode: key(spec?.applicationMode || "apl"),
      brand: key(spec?.brand),
      specNumber: normalizedSpecNumber,
      bottleType: key(spec?.bottleType),
      bodyLengthMm: Number(spec?.bodyLengthMm || 0),
      backLengthMm: Number(spec?.backLengthMm || 0),
      neckHeightMm: Number(spec?.neckHeightMm || 0),
      neckLengthMm: Number(spec?.neckLengthMm || 0),
      neckBottomCurveMm: Number(spec?.neckBottomCurveMm || 0),
      neckBottomCircumferenceMm: Number(spec?.neckBottomCircumferenceMm || 0),
      codeBoxCenterMm: Number(spec?.codeBoxCenterMm || 0)
    });
  }

  async function loadCatalog() {
    const documentData = await json(MANIFEST);
    const base = documentData?.format === "labeler-tool-portable-settings"
      ? documentData.settings : documentData;
    const source = documentData?.fragments || {};
    const version = Number(documentData?.companyDefaultsVersion || 1);
    if (!base) throw new Error("Company default settings are invalid.");

    const [maps, labels, bottles, legacyLabels] = await Promise.all([
      fragments(source.mapLibrary),
      fragments(source.labelSpecs),
      fragments(source.bottleSpecs),
      json(LEGACY_LABEL_CATALOG).catch(() => [])
    ]);
    if (!maps.length) throw new Error("No default machine programs were provided.");
    if (!bottles.length) throw new Error("No default bottle specifications were provided.");

    return {
      base,
      version,
      maps: taggedMaps(maps, version),
      labels: taggedLabels(labels, version),
      bottles: taggedBottles(bottles, version),
      legacyLabels: Array.isArray(legacyLabels) ? legacyLabels : []
    };
  }

  function retireOldPackagedMaps(current, currentDefaults) {
    const currentIds = new Set(currentDefaults.map((map) => key(map?.id)));
    const source = Array.isArray(current) ? current : [];
    const items = source.filter((map) => !map?.companyDefaultProgram || currentIds.has(key(map?.id)));
    return { items, removed: source.length - items.length };
  }

  function retirePackagedLabelSpecs(current, currentDefaults, legacyDefaults = []) {
    const currentKeys = new Set(currentDefaults.map((spec) => `${key(spec?.applicationMode || "apl")}|${key(spec?.brand)}`));
    const legacySnapshots = new Set(legacyDefaults.map(labelSnapshot));
    const source = Array.isArray(current) ? current : [];
    const items = source.filter((spec) => {
      const identity = `${key(spec?.applicationMode || "apl")}|${key(spec?.brand)}`;
      if (currentKeys.has(identity)) return true;
      if (spec?.companyDefaultSpecVersion) return false;
      return !legacySnapshots.has(labelSnapshot(spec));
    });
    return { items, removed: source.length - items.length };
  }

  async function reconcile() {
    if (typeof state === "undefined") throw new Error("ServoForge state is not available.");

    const catalog = await loadCatalog();
    const existingWorkspace = hasSavedWorkspace();
    const previousMachineTypes = JSON.stringify(state.machineTypes || []);
    let baseApplied = false;
    let mapResult;
    let labelResult;
    let bottleResult;
    let retiredMaps = 0;
    let retiredLabels = 0;

    if (!existingWorkspace) {
      state.mapLibrary = clone(catalog.maps);
      state.labelSpecs = clone(catalog.labels);
      state.bottleSpecs = clone(catalog.bottles);
      applyBase(catalog.base);
      mapResult = { items: state.mapLibrary, added: state.mapLibrary.length, changed: true };
      labelResult = { items: state.labelSpecs, added: state.labelSpecs.length, changed: true };
      bottleResult = { items: state.bottleSpecs, added: state.bottleSpecs.length, changed: true };
      baseApplied = true;
    } else {
      const mapCleanup = retireOldPackagedMaps(state.mapLibrary, catalog.maps);
      retiredMaps = mapCleanup.removed;
      mapResult = addMissing(mapCleanup.items, catalog.maps, (map) => key(map?.id));

      const labelCleanup = retirePackagedLabelSpecs(state.labelSpecs, catalog.labels, catalog.legacyLabels);
      retiredLabels = labelCleanup.removed;
      labelResult = addMissing(
        labelCleanup.items,
        catalog.labels,
        (spec) => `${key(spec?.applicationMode || "apl")}|${key(spec?.brand)}`
      );

      bottleResult = { items: Array.isArray(state.bottleSpecs) ? state.bottleSpecs : [], added: 0, changed: false };
      state.mapLibrary = mapResult.items;
      state.labelSpecs = labelResult.items;
      state.bottleSpecs = bottleResult.items;
      state.machineTypes = [...new Set([...(state.machineTypes || []), ...(catalog.base.machineTypes || [])])];
    }

    const currentExists = state.mapLibrary.some((map) => key(map?.id) === key(state.activeMapId));
    if (!currentExists) {
      const fallback = state.mapLibrary[0] || null;
      state.activeMapId = fallback?.id || "";
      if (fallback && typeof loadMachineMapIntoRuntime === "function") loadMachineMapIntoRuntime(fallback, false);
    } else if (baseApplied) {
      const active = state.mapLibrary.find((map) => key(map?.id) === key(state.activeMapId)) || state.mapLibrary[0];
      if (active && typeof loadMachineMapIntoRuntime === "function") loadMachineMapIntoRuntime(active, false);
    }

    if (!state.labelSpecs.some((spec) => String(spec?.brand || "") === String(state.selectedBrand || ""))) {
      state.selectedBrand = state.labelSpecs[0]?.brand || "";
    }

    const machineTypesChanged = JSON.stringify(state.machineTypes || []) !== previousMachineTypes;
    const changed = mapResult.changed
      || labelResult.changed
      || retiredMaps > 0
      || retiredLabels > 0
      || machineTypesChanged
      || baseApplied;

    saveVersion(catalog.version);

    if (changed) {
      if (typeof applyGeneratedServoProfile === "function" && state.selectedBrand) applyGeneratedServoProfile();
      if (typeof saveCurrentSettings === "function") saveCurrentSettings();
      if (typeof render === "function") render();
    }

    return {
      changed,
      version: catalog.version,
      existingWorkspace,
      maps: { added: mapResult.added, removed: retiredMaps, total: state.mapLibrary.length },
      labels: { added: labelResult.added, removed: retiredLabels, total: state.labelSpecs.length },
      bottles: { added: bottleResult.added, total: state.bottleSpecs.length },
      baseApplied
    };
  }

  function removableStorageKeys(storage) {
    const keys = [];
    try {
      for (let index = 0; index < storage.length; index += 1) {
        const storageKey = storage.key(index);
        if (storageKey && (storageKey === WORKSPACE_STORAGE_KEY || RESET_PREFIX.test(storageKey))) {
          keys.push(storageKey);
        }
      }
    } catch { }
    return keys;
  }

  function clearApplicationStorage() {
    let removed = 0;
    [global.localStorage, global.sessionStorage].forEach((storage) => {
      if (!storage) return;
      removableStorageKeys(storage).forEach((storageKey) => {
        try {
          storage.removeItem(storageKey);
          removed += 1;
        } catch { }
      });
    });
    return removed;
  }

  function resetToDefaults() {
    const removed = clearApplicationStorage();
    global.location?.reload();
    return removed;
  }

  global.LabelerCompanyDefaultsService = Object.freeze({
    reconcile,
    loadCatalog,
    savedVersion,
    hasSavedWorkspace,
    clearApplicationStorage,
    resetToDefaults
  });
})(window);
