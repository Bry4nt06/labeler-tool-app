"use strict";

(function installCompanyDefaultPrograms(global) {
  const SEED_KEY = "labelerCompanyProgramSeedVersion";
  const MANIFEST = "./config/company-default-settings.json";

  const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
  const key = (value) => String(value ?? "").trim().toLowerCase();
  const serialized = (value) => JSON.stringify(value);

  function savedVersion() {
    try { return Number(localStorage.getItem(SEED_KEY) || 0); }
    catch { return 0; }
  }

  function saveVersion(version) {
    try { localStorage.setItem(SEED_KEY, String(version)); }
    catch { }
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

  function upsert(current, seeded, identity) {
    const result = Array.isArray(current) ? [...current] : [];
    let added = 0;
    let updated = 0;

    seeded.forEach((rawEntry) => {
      const entry = clone(rawEntry);
      const id = identity(entry);
      if (!id) return;
      const index = result.findIndex((candidate) => identity(candidate) === id);
      if (index < 0) {
        result.push(entry);
        added += 1;
      } else if (serialized(result[index]) !== serialized(entry)) {
        result[index] = entry;
        updated += 1;
      }
    });

    return {
      items: result,
      added,
      updated,
      changed: added > 0 || updated > 0
    };
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
  }

  async function reconcile() {
    if (typeof state === "undefined") throw new Error("ServoForge state is not available.");

    const documentData = await json(MANIFEST);
    const base = documentData?.format === "labeler-tool-portable-settings"
      ? documentData.settings : documentData;
    const source = documentData?.fragments || {};
    const version = Number(documentData?.companyDefaultsVersion || 2);
    if (!base) throw new Error("Company default settings are invalid.");

    const [maps, labels, bottles] = await Promise.all([
      fragments(source.mapLibrary),
      fragments(source.labelSpecs),
      fragments(source.bottleSpecs)
    ]);
    if (!maps.length) throw new Error("No default machine programs were provided.");
    if (!labels.length) throw new Error("No default label specifications were provided.");
    if (!bottles.length) throw new Error("No default bottle specifications were provided.");

    const defaultIds = new Set(maps.map((map) => key(map?.id)));
    const existingMaps = Array.isArray(state.mapLibrary) ? state.mapLibrary : [];
    const hasCustomMap = existingMaps.some((map) => {
      const id = key(map?.id);
      return id
        && id !== "map-blank-apl"
        && !defaultIds.has(id)
        && map?.companyDefaultProgram !== true;
    });
    const retainedMaps = existingMaps.filter((map) => {
      const id = key(map?.id);
      if (!id || defaultIds.has(id)) return true;
      return map?.companyDefaultProgram !== true;
    });
    const removedDefaults = existingMaps.length - retainedMaps.length;
    const upgradeNeeded = savedVersion() < version;

    const mapResult = upsert(retainedMaps, maps.map((map) => ({
      ...clone(map), companyDefaultProgram: true, companyDefaultProgramVersion: version
    })), (map) => key(map?.id));

    const labelResult = upsert(state.labelSpecs, labels.map((spec) => ({
      ...clone(spec), companyDefaultSpecVersion: version
    })), (spec) => `${key(spec?.applicationMode || "apl")}|${key(spec?.brand)}`);

    const bottleResult = upsert(state.bottleSpecs, bottles.map((spec) => ({
      ...clone(spec), companyDefaultSpecVersion: version
    })), (spec) => key(spec?.bottleType));

    state.mapLibrary = mapResult.items;
    state.labelSpecs = labelResult.items;
    state.bottleSpecs = bottleResult.items;

    const previousMachineTypes = serialized(state.machineTypes || []);
    state.machineTypes = [...new Set([...(state.machineTypes || []), ...(base.machineTypes || [])])];
    const machineTypesChanged = serialized(state.machineTypes) !== previousMachineTypes;

    let baseApplied = false;
    const currentExists = state.mapLibrary.some((map) => key(map?.id) === key(state.activeMapId));
    if (upgradeNeeded && (!hasCustomMap || !currentExists)) {
      applyBase(base);
      const active = state.mapLibrary.find((map) => key(map?.id) === key(state.activeMapId)) || state.mapLibrary[0];
      if (active && typeof loadMachineMapIntoRuntime === "function") loadMachineMapIntoRuntime(active, false);
      baseApplied = true;
    }

    const changed = removedDefaults > 0
      || mapResult.changed
      || labelResult.changed
      || bottleResult.changed
      || machineTypesChanged
      || baseApplied;

    saveVersion(version);

    if (changed) {
      if (typeof applyGeneratedServoProfile === "function") applyGeneratedServoProfile();
      if (typeof saveCurrentSettings === "function") saveCurrentSettings();
      if (typeof render === "function") render();
    }

    return {
      changed,
      version,
      maps: {
        added: mapResult.added,
        updated: mapResult.updated,
        removed: removedDefaults,
        total: state.mapLibrary.length
      },
      labels: { added: labelResult.added, updated: labelResult.updated, total: state.labelSpecs.length },
      bottles: { added: bottleResult.added, updated: bottleResult.updated, total: state.bottleSpecs.length },
      baseApplied
    };
  }

  global.LabelerCompanyDefaultsService = Object.freeze({
    reconcile,
    savedVersion
  });
})(window);
