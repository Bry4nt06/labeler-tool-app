"use strict";

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function loadSavedSettings() {
  const raw = readStorage(SETTINGS_KEY);
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    ["headCount", "radius", "zeroAngle", "direction", "previewAngle", "previewBottleAngle", "animationSpeed", "maxMoveRatio", "tablePitchRadiusMm", "referencePitchRadiusMm", "autoScaleTableMap", "encoderCountsPerRev", "servoGearRatio", "padClearanceMm", "showMoveDistanceOverlay", "showQuadrantReferences", "showAggregateSpacingOverlay", "workspaceView", "wipeBuilderOpen", "activeMapId", "mapZoom", "mapPanX", "mapPanY", "mapLocked", "selectedBrand", "selectedBottle", "themePreset"].forEach((key) => {
      if (saved[key] !== undefined) state[key] = saved[key];
    });
    // Older builds stored degrees per 0.1-second tick. Preserve the perceived
    // speed while moving to continuous degrees-per-second playback.
    state.animationSpeed = saved.animationSpeedUnit === "deg-per-second"
      ? Math.min(50, Math.max(1, num(state.animationSpeed, 10)))
      : Math.min(50, Math.max(1, num(state.animationSpeed, 1) * 10));
    state.animationSpeedUnit = "deg-per-second";
    if (saved.depths) state.depths = { ...state.depths, ...saved.depths };
    if (saved.buildInputs) state.buildInputs = { ...state.buildInputs, ...saved.buildInputs };
    const legacyBuildInputs = saved.buildInputs || {};
    if (Array.isArray(saved.bottleSpecs)) state.bottleSpecs = saved.bottleSpecs;
    if (Array.isArray(saved.labelSpecs)) state.labelSpecs = saved.labelSpecs.map((spec) => ({ ...spec, applicationMode: normalizeLabelApplicationMode(spec?.applicationMode) }));
    else state.labelSpecs = state.labelSpecs.map((spec) => ({ ...spec, applicationMode: normalizeLabelApplicationMode(spec?.applicationMode) }));
    // Repair the known Mahou association saved by the earlier bottle-selection
    // regression. Keep the repair deliberately narrow so user-defined brand
    // and bottle relationships are never guessed or rewritten.
    const mahouLabel = state.labelSpecs.find((row) => String(row?.brand || "").trim().toLowerCase() === "660ml mahou");
    const mahouBottleType = state.bottleSpecs.find((row) => String(row?.bottleType || "").trim().toLowerCase() === "hlnr - 660ml")?.bottleType;
    if (mahouLabel && mahouBottleType && String(mahouLabel.bottleType || "").trim().toLowerCase() === "stdl - 330ml camden") {
      mahouLabel.bottleType = mahouBottleType;
      if (state.selectedBrand === mahouLabel.brand) state.selectedBottle = mahouBottleType;
    }
    const geometry = window.LabelerGeometryDriver;
    const savedLabel = state.labelSpecs.find((row) => row.brand === state.selectedBrand);
    const savedBottle = state.bottleSpecs.find((row) => row.bottleType === state.selectedBottle);
    const bodyCirc = geometry?.bodyCircumferenceMm(savedBottle);
    const neckCirc = num(savedLabel?.neckBottomCircumferenceMm, NaN);
    if (legacyBuildInputs.neckOverWipeDeg == null) state.buildInputs.neckOverWipeDeg = legacyBuildInputs.neckWipeDeg ?? geometry?.degreesFromMm(legacyBuildInputs.neckOverWipeMm, neckCirc) ?? state.buildInputs.neckOverWipeDeg;
    if (legacyBuildInputs.bodyOverWipeDeg == null) state.buildInputs.bodyOverWipeDeg = legacyBuildInputs.bodyWipeDeg ?? geometry?.degreesFromMm(legacyBuildInputs.bodyOverWipeMm, bodyCirc) ?? state.buildInputs.bodyOverWipeDeg;
    if (legacyBuildInputs.backOverWipeDeg == null) state.buildInputs.backOverWipeDeg = legacyBuildInputs.backWipeDeg ?? geometry?.degreesFromMm(legacyBuildInputs.backOverWipeMm, bodyCirc) ?? state.buildInputs.backOverWipeDeg;
    delete state.buildInputs.neckOverWipeMm;
    delete state.buildInputs.bodyOverWipeMm;
    delete state.buildInputs.backOverWipeMm;

    if (Array.isArray(saved.mapPoints)) state.mapPoints = saved.mapPoints.filter((point) => !/Neck\/Body Label Start Inspection/i.test(String(point?.name || "")));
    delete state.buildInputs.frontInspectionOffsetDeg;
    if (saved.applicationMode) state.applicationMode = saved.applicationMode;
    if (Array.isArray(saved.mapLibrary)) state.mapLibrary = saved.mapLibrary;
    if (Array.isArray(saved.servoProfileLibrary)) state.servoProfileLibrary = saved.servoProfileLibrary;
    if (typeof saved.activeServoProfileId === "string") state.activeServoProfileId = saved.activeServoProfileId;
    if (Array.isArray(saved.machineTypes)) {
      state.machineTypes = [...new Set(["TopMatic", "Autocol", "TopModul", ...saved.machineTypes.map((value) => String(value).trim()).filter(Boolean)])];
    }
    if (Array.isArray(saved.coldGlueMap)) state.coldGlueMap = normalizeColdGlueMap(saved.coldGlueMap);
    if (saved.coldGlueAggregateSettings && typeof saved.coldGlueAggregateSettings === "object") state.coldGlueAggregateSettings = deepClone(saved.coldGlueAggregateSettings);
    if (Array.isArray(saved.aplMapObjects)) state.aplMapObjects = saved.aplMapObjects;
    if (saved.servoOverrides && typeof saved.servoOverrides === "object") state.servoOverrides = saved.servoOverrides;
    if (Array.isArray(saved.assemblies)) state.assemblies = saved.assemblies.map((item, index) => normalizeAssembly({ ...defaultAssemblies[index], ...item }));
    if (saved.simulation) {
      state.simulation = {
        useCustom: Boolean(saved.simulation.useCustom),
        turns: Array.isArray(saved.simulation.turns) ? saved.simulation.turns : state.simulation.turns,
        rows: Array.isArray(saved.simulation.rows) ? saved.simulation.rows : [],
        deletedRows: Array.isArray(saved.simulation.deletedRows)
          ? saved.simulation.deletedRows.map(Number).filter(Number.isInteger)
          : [],
        lines: Array.isArray(saved.simulation.lines) ? saved.simulation.lines : []
      };
    }
  } catch {
    // Ignore malformed saved settings and continue with defaults.
  }
}


function applyFaultConfig(config) {
  const ratio = num(config?.faultLimits?.plateToTableRatio, NaN);
  if (!Number.isFinite(ratio) || ratio <= 0) {
    throw new Error("faultLimits.plateToTableRatio must be a number greater than zero.");
  }
  state.maxMoveRatio = ratio;
  if (els.maxMoveRatio) els.maxMoveRatio.value = ratio;
  render();
}

function importFaultConfigFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      applyFaultConfig(JSON.parse(String(reader.result)));
      saveCurrentSettings();
      window.alert(`Fault configuration loaded. Plate/table fault ratio: ${fmt(state.maxMoveRatio, 1)}:1`);
    } catch (error) {
      window.alert(`Unable to load fault configuration: ${error.message}`);
    } finally {
      els.importFaultConfig.value = "";
    }
  });
  reader.readAsText(file);
}

function settingsSnapshot() {
  return {
    themePreset: state.themePreset,
    headCount: state.headCount,
    radius: state.radius,
    zeroAngle: state.zeroAngle,
    direction: state.direction,
    previewAngle: state.previewAngle,
    previewBottleAngle: state.previewBottleAngle,
    animationSpeed: state.animationSpeed,
    animationSpeedUnit: state.animationSpeedUnit,
    maxMoveRatio: state.maxMoveRatio,
    tablePitchRadiusMm: state.tablePitchRadiusMm,
    referencePitchRadiusMm: state.referencePitchRadiusMm,
    autoScaleTableMap: state.autoScaleTableMap,
    encoderCountsPerRev: state.encoderCountsPerRev,
    servoGearRatio: state.servoGearRatio,
    padClearanceMm: state.padClearanceMm,
    showMoveDistanceOverlay: state.showMoveDistanceOverlay,
    showQuadrantReferences: state.showQuadrantReferences,
    showAggregateSpacingOverlay: state.showAggregateSpacingOverlay,
    workspaceView: state.workspaceView,
    wipeBuilderOpen: state.wipeBuilderOpen,
    mapLibrary: state.mapLibrary,
    servoProfileLibrary: state.servoProfileLibrary,
    activeServoProfileId: state.activeServoProfileId,
    machineTypes: state.machineTypes,
    activeMapId: state.activeMapId,
    mapZoom: state.mapZoom,
    mapPanX: state.mapPanX,
    mapPanY: state.mapPanY,
    mapLocked: state.mapLocked,
    depths: state.depths,
    selectedBrand: state.selectedBrand,
    selectedBottle: state.selectedBottle,
    buildInputs: state.buildInputs,
    bottleSpecs: state.bottleSpecs,
    labelSpecs: state.labelSpecs,
    mapPoints: state.mapPoints,
    applicationMode: state.applicationMode,
    coldGlueMap: state.coldGlueMap,
    coldGlueAggregateSettings: state.coldGlueAggregateSettings,
    aplMapObjects: state.aplMapObjects,
    servoOverrides: state.servoOverrides,
    assemblies: state.assemblies,
    simulation: state.simulation
  };
}

function importPortableSettingsFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const documentData = JSON.parse(String(reader.result));
      if (documentData?.format !== "labeler-tool-portable-settings" || Number(documentData?.version) !== 1) {
        throw new Error("This is not a Labeler Tool portable settings file.");
      }
      const saved = documentData.settings;
      if (!saved || typeof saved !== "object" || !Array.isArray(saved.mapLibrary) || !Array.isArray(saved.labelSpecs) || !Array.isArray(saved.bottleSpecs)) {
        throw new Error("The settings file is incomplete or damaged.");
      }
      if (!writeStorage(SETTINGS_KEY, JSON.stringify(saved))) throw new Error("Browser storage is unavailable on this computer.");
      if (saved.themePreset) writeStorage("labelerThemePreset", saved.themePreset);
      window.alert(`Settings imported successfully. ${saved.mapLibrary.length} map${saved.mapLibrary.length === 1 ? "" : "s"} will be loaded.`);
      window.location.reload();
    } catch (error) {
      window.alert(`Unable to import settings: ${error.message}`);
    } finally {
      if (els.importSettings) els.importSettings.value = "";
    }
  });
  reader.readAsText(file);
}

function saveCurrentSettings() {
  const saved = settingsSnapshot();
  const ok = writeStorage(SETTINGS_KEY, JSON.stringify(saved));
  state.builderSaveState = ok ? "saved" : "failed";
  if (els.builderStatus && !ok) els.builderStatus.textContent = "Save failed • Browser storage unavailable";
  els.saveSettings.textContent = ok ? "Saved" : "Save Failed";
  window.setTimeout(() => { els.saveSettings.textContent = "Save Settings"; }, 1100);
}

const COMPANY_SETTINGS_SEED_VERSION = 1;
const COMPANY_SETTINGS_SEED_KEY = "labelerCompanySettingsSeedVersion";

function normalizedSeedKey(value) {
  return String(value || "").trim().toLowerCase();
}

function mergeMissingLibraryEntries(current, seeded, identity) {
  const result = Array.isArray(current) ? current : [];
  const keysFor = (entry) => [identity(entry)].flat().filter(Boolean);
  const known = new Set(result.flatMap(keysFor));
  (Array.isArray(seeded) ? seeded : []).forEach((entry) => {
    const keys = keysFor(entry);
    if (!keys.length || keys.some((key) => known.has(key))) return;
    result.push(deepClone(entry));
    keys.forEach((key) => known.add(key));
  });
  return result;
}

async function applyCompanySettingsSeed() {
  if (Number(readStorage(COMPANY_SETTINGS_SEED_KEY)) >= COMPANY_SETTINGS_SEED_VERSION) return false;
  try {
    const response = await fetch("./config/company-default-settings.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Company settings returned ${response.status}.`);
    const documentData = await response.json();
    const seeded = documentData?.format === "labeler-tool-portable-settings" ? documentData.settings : documentData;
    if (!seeded || typeof seeded !== "object") throw new Error("Company settings are invalid.");

    const hasUserSettings = Boolean(readStorage(SETTINGS_KEY));
    if (!hasUserSettings) {
      if (!writeStorage(SETTINGS_KEY, JSON.stringify(seeded))) throw new Error("Browser storage is unavailable.");
      loadSavedSettings();
    } else {
      state.mapLibrary = mergeMissingLibraryEntries(state.mapLibrary, seeded.mapLibrary, (item) => [normalizedSeedKey(item?.id), normalizedSeedKey(item?.name) ? `${normalizedSeedKey(item?.applicationMode)}|${normalizedSeedKey(item?.name)}` : ""]);
      state.labelSpecs = mergeMissingLibraryEntries(state.labelSpecs, seeded.labelSpecs, (item) => `${normalizedSeedKey(item?.brand)}|${normalizedSeedKey(item?.bottleType)}|${normalizedSeedKey(item?.applicationMode)}`);
      state.bottleSpecs = mergeMissingLibraryEntries(state.bottleSpecs, seeded.bottleSpecs, (item) => [normalizedSeedKey(item?.id), normalizedSeedKey(item?.bottleType)]);
      state.servoProfileLibrary = mergeMissingLibraryEntries(state.servoProfileLibrary, seeded.servoProfileLibrary, (item) => [normalizedSeedKey(item?.id), normalizedSeedKey(item?.name) ? `${normalizedSeedKey(item?.mapId)}|${normalizedSeedKey(item?.name)}` : ""]);
      state.machineTypes = [...new Set([...(state.machineTypes || []), ...(seeded.machineTypes || [])].map((value) => String(value).trim()).filter(Boolean))];
      saveCurrentSettings();
    }
    writeStorage(COMPANY_SETTINGS_SEED_KEY, String(COMPANY_SETTINGS_SEED_VERSION));
    return true;
  } catch (error) {
    console.error("Company settings seed unavailable", error);
    return false;
  }
}

function compareApplicationVersions(left, right) {
  const parts = (value) => String(value || "0").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const a = parts(left);
  const b = parts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) > (b[index] || 0) ? 1 : -1;
  }
  return 0;
}

let updateServiceWorkerRegistration = null;
let pendingServiceWorker = null;
let reloadingForServiceWorker = false;

function showPendingToolUpdate(worker) {
  pendingServiceWorker = worker;
  if (els.updateCheckStatus) els.updateCheckStatus.textContent = "Update downloaded • Restart to apply.";
  if (els.checkForUpdates) els.checkForUpdates.textContent = "Restart to Update";
}

async function registerToolUpdateService() {
  if (!("serviceWorker" in navigator) || window.location.protocol === "file:") return;
  try {
    updateServiceWorkerRegistration = await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });
    if (updateServiceWorkerRegistration.waiting) showPendingToolUpdate(updateServiceWorkerRegistration.waiting);
    updateServiceWorkerRegistration.addEventListener("updatefound", () => {
      const installing = updateServiceWorkerRegistration.installing;
      installing?.addEventListener("statechange", () => {
        if (installing.state === "installed" && navigator.serviceWorker.controller) showPendingToolUpdate(installing);
      });
    });
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloadingForServiceWorker) return;
      reloadingForServiceWorker = true;
      window.location.reload();
    });
    await updateServiceWorkerRegistration.update();
  } catch (error) {
    console.error("Automatic update service unavailable", error);
  }
}

async function checkForToolUpdates() {
  const button = els.checkForUpdates;
  const status = els.updateCheckStatus;
  const currentVersion = document.querySelector('meta[name="application-version"]')?.content || "0.7.57";
  const manifestUrl = document.querySelector('meta[name="update-manifest-url"]')?.content?.trim();
  if (pendingServiceWorker) {
    if (button) button.disabled = true;
    if (status) status.textContent = "Applying update…";
    pendingServiceWorker.postMessage({ type: "SKIP_WAITING" });
    return;
  }
  if (button) button.disabled = true;
  if (status) status.textContent = "Checking for updates…";
  try {
    await updateServiceWorkerRegistration?.update();
    if (!manifestUrl) {
      if (status) status.textContent = `Version ${currentVersion} • Update source not configured yet.`;
      return;
    }
    const response = await fetch(manifestUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Update server returned ${response.status}.`);
    const manifest = await response.json();
    const latestVersion = String(manifest?.version || "").trim();
    if (!latestVersion) throw new Error("Update manifest has no version.");
    if (compareApplicationVersions(latestVersion, currentVersion) > 0) {
      const link = String(manifest.downloadUrl || manifest.releaseUrl || "").trim();
      if (status) {
        status.textContent = `Version ${latestVersion} is available.${link ? " " : ""}`;
        if (link) {
          const updateLink = document.createElement("a");
          updateLink.href = link;
          updateLink.target = "_blank";
          updateLink.rel = "noopener noreferrer";
          updateLink.textContent = "Open latest version";
          status.appendChild(updateLink);
        }
      }
    } else if (status) {
      status.textContent = `Up to date • Version ${currentVersion}`;
    }
  } catch (error) {
    if (status) status.textContent = "Unable to check GitHub. The update repository may be private or offline.";
    console.error("Update check failed", error);
  } finally {
    if (button) button.disabled = false;
  }
}

function setThemePreset(value) {
  state.themePreset = value || "dark-green";
  document.body.dataset.theme = state.themePreset;
  if (els.themePreset) els.themePreset.value = state.themePreset;
  writeStorage("labelerThemePreset", state.themePreset);
}

function setWorkspaceView(value) {
  state.workspaceView = value === "direct" ? "direct" : "standard";
  const app = document.querySelector(".app");
  const layout = app?.querySelector(":scope > .layout");
  const preview = layout?.querySelector(":scope > .preview-panel") || app?.querySelector("#mapRightRail > .preview-panel");
  const mapArea = layout?.querySelector(":scope > .map-area");
  const validation = app?.querySelector("#mapRightRail > .validation");
  const angleControls = app?.querySelector("#previewAngleControls");
  const tabs = app?.querySelector(":scope > .tabs");
  const loadGeneratedTurns = app?.querySelector("#loadGeneratedTurns");
  app?.classList.toggle("workspace-view-direct", state.workspaceView === "direct");
  if (state.workspaceView === "direct" && preview && validation) {
    validation.insertAdjacentElement("afterend", preview);
    if (angleControls) preview.insertAdjacentElement("afterend", angleControls);
  } else {
    if (preview && layout && mapArea) layout.insertBefore(preview, mapArea);
    if (angleControls && tabs) tabs.insertBefore(angleControls, loadGeneratedTurns || null);
  }
  if (els.workspaceView) els.workspaceView.value = state.workspaceView;
}
