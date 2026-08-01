"use strict";

(function installCompanyDefaultPrograms() {
  const RETRY_MS = 50;
  const SEED_KEY = "labelerCompanyProgramSeedVersion";
  const MANIFEST = "./config/company-default-settings.json";
  let installed = false;

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
    seeded.forEach((entry) => {
      const id = identity(entry);
      if (!id) return;
      const index = result.findIndex((candidate) => identity(candidate) === id);
      if (index < 0) result.push(entry);
      else result[index] = entry;
    });
    return result;
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

  async function seed() {
    const documentData = await json(MANIFEST);
    const base = documentData?.format === "labeler-tool-portable-settings"
      ? documentData.settings : documentData;
    const source = documentData?.fragments || {};
    const version = Number(documentData?.companyDefaultsVersion || 2);
    if (!base || savedVersion() >= version) return;

    const [maps, labels, bottles] = await Promise.all([
      fragments(source.mapLibrary),
      fragments(source.labelSpecs),
      fragments(source.bottleSpecs)
    ]);
    if (!maps.length) throw new Error("No default machine programs were provided.");

    const defaultIds = new Set(maps.map((map) => key(map?.id)));
    const hasCustomMap = (state.mapLibrary || []).some((map) => {
      const id = key(map?.id);
      return id && id !== "map-blank-apl" && !defaultIds.has(id);
    });

    state.mapLibrary = upsert(state.mapLibrary, maps.map((map) => ({
      ...clone(map), companyDefaultProgram: true, companyDefaultProgramVersion: version
    })), (map) => key(map?.id));
    state.labelSpecs = upsert(state.labelSpecs, labels.map((spec) => ({
      ...clone(spec), companyDefaultSpecVersion: version
    })), (spec) => `${key(spec?.applicationMode || "apl")}|${key(spec?.brand)}|${key(spec?.bottleType)}`);
    state.bottleSpecs = upsert(state.bottleSpecs, bottles.map((spec) => ({
      ...clone(spec), companyDefaultSpecVersion: version
    })), (spec) => key(spec?.id) || key(spec?.bottleType));
    state.machineTypes = [...new Set([...(state.machineTypes || []), ...(base.machineTypes || [])])];

    const currentExists = state.mapLibrary.some((map) => key(map?.id) === key(state.activeMapId));
    if (!hasCustomMap || !currentExists) {
      applyBase(base);
      const active = state.mapLibrary.find((map) => key(map?.id) === key(state.activeMapId)) || state.mapLibrary[0];
      if (active) loadMachineMapIntoRuntime(active, false);
    }

    if (typeof applyGeneratedServoProfile === "function") applyGeneratedServoProfile();
    saveCurrentSettings();
    saveVersion(version);
    render();
  }

  function install() {
    if (installed) return true;
    if (typeof state === "undefined"
      || typeof saveCurrentSettings !== "function"
      || typeof loadMachineMapIntoRuntime !== "function"
      || typeof render !== "function") return false;
    installed = true;
    seed().catch((error) => console.error("Company default programs unavailable", error));
    return true;
  }

  function wait() {
    if (!install()) window.setTimeout(wait, RETRY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait, { once: true });
  else wait();
})();
