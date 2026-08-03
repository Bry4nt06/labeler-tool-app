"use strict";

function saveMapDefinitionFromControls(event) {
  const liveInput = event?.type === "input";
  const explicitSave = event?.type === "click";
  const map = editableMachineMap();
  if (!map) return;
  const proposedName = String(els.mapName?.value || map.name).trim() || map.name;
  const proposedZone = normalizedZoneSiteName(els.mapZone?.value) || mapLocationFor(map).zone;
  const proposedSite = normalizedZoneSiteName(els.mapSite?.value) || sitesForZone(proposedZone)[0] || "";
  if (proposedZone === "ALL") {
    window.alert("Select a specific Zone and Site before saving a map.");
    return;
  }
  if (explicitSave && !window.confirm(`Save map "${proposedName}" to ${proposedZone || "No Zone"} / ${proposedSite || "No Site"}?`)) return;
  const previousLimit = activeAplStationLimit(map);
  map.name = proposedName;
  map.zone = proposedZone;
  map.site = proposedSite;
  state.selectedZone = proposedZone;
  state.selectedSite = proposedSite;
  state.mapLibraryZone = proposedZone;
  state.mapLibrarySite = proposedSite;
  map.machineType = String(els.mapMachineType?.value || map.machineType || "TopModul").trim() || "TopModul";
  state.applicationMode = els.applicationMode?.value === "cold-glue" ? "cold-glue" : "apl";
  map.applicationMode = state.applicationMode;
  if (map.applicationMode === "cold-glue") {
    map.objects = normalizeColdGlueMap(map.objects);
    map.restoreDefaultObjects = false;
  }
  ensureSelectedBrandForApplication();
  map.headCount = Math.max(1, Math.min(120, Math.round(num(els.mapHeadCount?.value, map.headCount))));
  map.machineSettings = {
    direction: els.mapDirection?.value === "cw" ? "cw" : "ccw",
    radius: Math.max(1, num(els.mapRadius?.value, map.machineSettings?.radius)),
    referencePitchRadiusMm: Math.max(1, num(els.mapReferencePitchRadiusMm?.value, map.machineSettings?.referencePitchRadiusMm)),
    encoderCountsPerRev: Math.max(1, num(els.mapEncoderCountsPerRev?.value, map.machineSettings?.encoderCountsPerRev)),
    servoGearRatio: Math.max(0.001, num(els.mapServoGearRatio?.value, map.machineSettings?.servoGearRatio)),
    autoScaleTableMap: Boolean(els.mapAutoScaleTableMap?.checked),
    zeroAngle: norm(num(els.mapZeroAngle?.value, map.machineSettings?.zeroAngle)),
    maxMoveRatio: Math.max(0.1, num(els.mapMaxMoveRatio?.value, map.machineSettings?.maxMoveRatio))
  };
  map.enabledAggregates = normalizeEnabledSlots(map.enabledAggregates, map.aggregateCount);
  map.enabledStations = normalizeEnabledSlots(map.enabledStations, map.stationCount);
  map.aggregateCount = map.enabledAggregates.filter(Boolean).length;
  map.stationCount = map.enabledStations.filter(Boolean).length;
  map.objects = map.objects.map((item) => normalizeBuilderObject(item, map.applicationMode, 6));
  map.aggregateAngles = normalizeAggregateAngles(map.aggregateAngles, map.applicationMode, map.objects);
  map.stationAngles = normalizeStationAngles({ ...map.stationAngles, ...map.aggregateAngles });
  ensureAplObjectsForNewStations(map, previousLimit);
  if (liveInput) {
    loadMachineMapIntoRuntime(map, false);
    refreshAfterBuilderEdit({ persist: true });
    return;
  }
  loadMachineMapIntoRuntime(map, true);
  saveCurrentSettings();
  renderWipeDownBuilder();
}

function exportSelectedMachineMap() {
  const map = activeMachineMap();
  if (!map) {
    window.alert("Select a map before exporting.");
    return;
  }
  const safeName = String(map.name || "machine-map")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "machine-map";
  const payload = {
    format: "servoforge-machine-map",
    version: 1,
    exportedAt: new Date().toISOString(),
    map: deepClone(map)
  };
  download(`${safeName}.servoforge-map.json`, "application/json", JSON.stringify(payload, null, 2));
}

function clearServoSimulationForSelectedMap() {
  state.simulation = { useCustom: false, turns: [], rows: [], deletedRows: [], lines: [] };
  state.previewBottleAngle = null;
}

function runGuidedMapSetup() {
  const map = editableMachineMap();
  if (!map) return false;
  const machineType = String(window.prompt("Machine type (TopMatic, Autocol, TopModul, or MultiModul):", map.machineType || "TopModul") || "").trim();
  if (!machineType) return false;
  const headCount = Math.max(1, Math.min(120, Math.round(num(window.prompt("Head count:", String(map.headCount || 45)), map.headCount || 45))));
  const stations = Math.max(1, Math.min(6, Math.round(num(window.prompt("Number of active application stations:", String(map.stationCount || 3)), map.stationCount || 3))));
  const labels = String(window.prompt("Label order by station (comma separated):", stations === 3 ? "neck,body,back" : "neck,neck,body,body,back,back") || "")
    .split(",")
    .map((value) => value.trim().toLowerCase());
  recordBuilderHistory("Guided map setup");
  map.machineType = machineType;
  map.headCount = headCount;
  map.enabledAggregates = Array.from({ length: 6 }, (_, index) => index < stations);
  map.enabledStations = Array.from({ length: 6 }, (_, index) => index < stations);
  map.aggregateCount = stations;
  map.stationCount = stations;
  map.stationSections = {};
  labels.slice(0, stations).forEach((section, index) => {
    if (["neck", "body", "back", "none"].includes(section)) map.stationSections[String(index + 1)] = section;
  });
  ensureAplObjectsForNewStations(map);
  loadMachineMapIntoRuntime(map, true);
  saveCurrentSettings();
  render();
  renderWipeDownBuilder();
  return true;
}

function optimizeActiveColdGlueMap() {
  recordBuilderHistory("Optimize Cold Glue map");
  if (!optimizeColdGlueMapExample()) {
    state.builderHistory.undo.pop();
    window.alert("Select a Cold Glue label specification before optimizing this map.");
    return false;
  }
  builderExpandedStation = String(activeSlotNumbers(activeMachineMap().enabledStations)[0] || 1);
  refreshAfterBuilderEdit({ persist: true });
  renderWipeDownBuilder();
  return true;
}

function createMachineMapFromCurrent() {
  const base = activeMachineMap();
  if (!base) return null;
  const location = mapLibraryLocation();
  const copy = createMachineMap({
    ...deepClone(base),
    id: uniqueMapId("machine-map"),
    name: uniqueMapName(`${base.name} Copy`),
    zone: location.zone,
    site: location.site,
    isTemplate: false
  });
  state.mapLibrary.push(copy);
  clearServoSimulationForSelectedMap();
  loadMachineMapIntoRuntime(copy, true);
  saveCurrentSettings();
  renderWipeDownBuilder();
  return copy;
}

function selectMapLibraryZone(value) {
  state.mapLibraryZone = normalizedZoneSiteName(value) || mapLibraryLocation().zone;
  state.mapLibrarySite = state.mapLibraryZone === "ALL" ? "" : sitesForZone(state.mapLibraryZone)[0] || "";
  const maps = mapsForMapLibraryLocation();
  if (maps.length) {
    clearServoSimulationForSelectedMap();
    loadMachineMapIntoRuntime(maps[0], true);
  }
  renderMapLibraryControls();
}

function selectMapLibrarySite(value) {
  state.mapLibrarySite = normalizedZoneSiteName(value) || "";
  const maps = mapsForMapLibraryLocation();
  if (maps.length) {
    clearServoSimulationForSelectedMap();
    loadMachineMapIntoRuntime(maps[0], true);
  }
  renderMapLibraryControls();
}

function addMachineTypeFromPrompt() {
  const entered = String(window.prompt("Enter the new machine type name:", "") || "").trim();
  if (!entered) return false;
  state.machineTypes = [...new Set([...(state.machineTypes || []), entered])];
  const map = editableMachineMap();
  if (map) map.machineType = entered;
  saveCurrentSettings();
  renderWipeDownBuilder();
  return true;
}

function deleteActiveMachineMap() {
  if (state.mapLibrary.length <= 1) {
    window.alert("At least one machine map must remain in the library.");
    return false;
  }
  const index = state.mapLibrary.findIndex((map) => map.id === state.activeMapId);
  const map = state.mapLibrary[index];
  if (!map || !window.confirm(`Delete map "${map.name}" from ${mapLocationLabel(map)}? This cannot be undone.`)) return false;
  if (index >= 0) state.mapLibrary.splice(index, 1);
  loadMachineMapIntoRuntime(state.mapLibrary[Math.max(0, index - 1)] || state.mapLibrary[0], true);
  saveCurrentSettings();
  renderWipeDownBuilder();
  return true;
}

function addBuilderObjectFromControls() {
  recordBuilderHistory("Add map object");
  const machineMap = editableMachineMap();
  if (!machineMap) return null;
  const selectedType = document.querySelector("#builderObjectType")?.value || (state.applicationMode === "cold-glue" ? "brush-outer" : "pad");
  const type = selectedType === "brush-outer" || selectedType === "brush-inner" ? "brush" : selectedType;
  const side = selectedType === "brush-inner"
    ? "inner"
    : selectedType === "brush-outer"
      ? "outer"
      : document.querySelector("#builderObjectSide")?.value === "inner" ? "inner" : "outer";
  const station = Math.max(1, Math.min(6, Math.round(num(document.querySelector("#builderObjectStation")?.value, nextAplStation()))));
  const start = num(document.querySelector("#builderObjectStart")?.value, 0);
  const end = num(document.querySelector("#builderObjectEnd")?.value, start + 10);
  const name = String(document.querySelector("#builderObjectName")?.value || "").trim()
    || (type === "coding"
      ? "Coding"
      : type === "sensor"
        ? "Label Sensor"
        : type === "brush-channel"
          ? "Inside + Outside Brush Channel"
          : `${side === "inner" ? "Inside" : "Outside"} ${type === "pad" ? "wipe-down pad" : type}`);
  const addedObject = normalizeBuilderObject({
    id: uniqueMapId(state.applicationMode),
    name,
    kind: type,
    application: state.applicationMode,
    side,
    start,
    end,
    outerStart: start,
    outerEnd: end,
    innerStart: start,
    innerEnd: end,
    angle: type === "sensor" || (state.applicationMode === "cold-glue" && type === "roller") ? start : undefined,
    wipeSpanDeg: state.applicationMode === "apl" && type === "roller" ? Math.max(0.1, Math.abs(end - start)) : undefined,
    extension: num(document.querySelector("#builderObjectExtension")?.value, 20),
    servoAssist: type === "sensor" && Boolean(document.querySelector("#builderSensorAssist")?.checked),
    requiredVisibilityPercent: type === "sensor" ? num(document.querySelector("#builderSensorVisibility")?.value, 50) : 50,
    station: type === "coding" ? null : station
  }, machineMap.applicationMode, machineMap.stationCount);
  machineMap.objects.push(addedObject);
  if (machineMap.applicationMode === "cold-glue") {
    const normalizedColdGlueObjects = normalizeColdGlueMap(machineMap.objects);
    machineMap.objects.splice(0, machineMap.objects.length, ...normalizedColdGlueObjects);
    state.coldGlueMap = machineMap.objects.map((item) => ({ ...item }));
  }
  builderExpandedStation = String(type === "coding" ? "coding" : station);
  if (els.configuredMapObjectsSection) els.configuredMapObjectsSection.open = true;
  refreshAfterBuilderEdit({ persist: true });
  renderWipeDownBuilder();
  return addedObject;
}

function resetActiveBuilderMap() {
  const machineMap = activeMachineMap();
  if (!machineMap) return false;
  if (machineMap.restoreDefaultObjects === false) {
    machineMap.objects = [];
  } else {
    machineMap.objects = machineMap.applicationMode === "cold-glue"
      ? []
      : createMachineMap({ applicationMode: "apl", aggregateCount: 6, stationCount: 6 }).objects;
  }
  loadMachineMapIntoRuntime(machineMap, true);
  saveCurrentSettings();
  renderWipeDownBuilder();
  return true;
}

// Compatibility entrypoint retained for modules that still call the original
// binder. Static Map Builder events are owned by LabelerSetupEventControllers.
function bindWipeDownBuilder() {
  return true;
}

window.LabelerMapBuilderDomainActions = Object.freeze({
  saveMapDefinitionFromControls,
  exportSelectedMachineMap,
  clearServoSimulationForSelectedMap,
  runGuidedMapSetup,
  optimizeActiveColdGlueMap,
  createMachineMapFromCurrent,
  selectMapLibraryZone,
  selectMapLibrarySite,
  addMachineTypeFromPrompt,
  deleteActiveMachineMap,
  addBuilderObjectFromControls,
  resetActiveBuilderMap
});
