"use strict";

function builderTypeOptions() {
  return state.applicationMode === "cold-glue"
    ? [["brush-channel", "Brush Channel (Inside + Outside)"], ["brush-outer", "Outside Brush"], ["brush-inner", "Inside Brush"], ["gripper", "Gripper / Spender Plate"], ["roller", "Roller"]]
    : [["pad", "Wipe-Down Pad"], ["roller", "Roller"], ["coding", "Coding"], ["sensor", "Label Sensor"]];
}

function nextAplStation() {
  const machineMap = activeMachineMap();
  const active = activeAplStationNumbers(machineMap);
  const used = new Set(machineMap.objects
    .filter((item) => item.kind === "pad" || item.kind === "roller")
    .map((item) => Number(item.station)));
  for (const station of active) if (!used.has(station)) return station;
  return active[0] || 1;
}

function updateBuilderTypeControls() {
  const select = document.querySelector("#builderObjectType");
  const extensionLabel = document.querySelector("#builderExtensionLabel");
  const sensorAssistLabel = document.querySelector("#builderSensorAssistLabel");
  const sensorVisibilityLabel = document.querySelector("#builderSensorVisibilityLabel");
  if (!select) return;
  const previous = select.value;
  select.innerHTML = builderTypeOptions().map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
  if ([...select.options].some((option) => option.value === previous)) select.value = previous;
  const stationSelect = document.querySelector("#builderObjectStation");
  const stationLabel = document.querySelector("#builderObjectStationLabel");
  const sideSelect = document.querySelector("#builderObjectSide");
  const map = typeof activeMachineMap === "function" ? activeMachineMap() : null;
  if (stationSelect && map) {
    const previousStation = stationSelect.value;
    const stations = activeSlotNumbers(map.enabledStations);
    stationSelect.innerHTML = stations.map((station) => `<option value="${station}">Station ${station}</option>`).join("");
    if (stations.includes(Number(previousStation))) stationSelect.value = previousStation;
  }
  const selectedBrush = select.value === "brush-outer" || select.value === "brush-inner";
  if (extensionLabel) extensionLabel.hidden = !selectedBrush && select.value !== "brush-channel";
  if (sensorAssistLabel) sensorAssistLabel.hidden = select.value !== "sensor";
  if (sensorVisibilityLabel) sensorVisibilityLabel.hidden = select.value !== "sensor";
  if (stationLabel) stationLabel.hidden = select.value === "coding";
  if (stationSelect) stationSelect.disabled = select.value === "coding";
  if (sideSelect) sideSelect.value = select.value === "brush-inner" ? "inner" : "outer";
  if (sideSelect?.parentElement) sideSelect.parentElement.hidden = select.value === "sensor" || select.value === "gripper" || select.value === "brush-channel" || selectedBrush;
  const isAplRoller = state.applicationMode === "apl" && select.value === "roller";
  const startLabel = document.querySelector("#builderObjectStartLabel");
  const endLabel = document.querySelector("#builderObjectEndLabel");
  const isSinglePlacement = select.value === "coding" || select.value === "sensor";
  if (startLabel) startLabel.firstChild.textContent = select.value === "sensor" ? "Placement (deg) " : isAplRoller ? "Roller center (deg) " : "Start / point 1 (deg) ";
  if (endLabel) {
    endLabel.hidden = isSinglePlacement;
    endLabel.firstChild.textContent = isAplRoller ? "Roller surface coverage (table deg) " : "Stop / point 2 (deg) ";
  }
}

function renderAggregateAngleEditor(machineMap) {
  if (!els.aggregateAngleEditor) return;
  if (els.aggregateAnglesSection) els.aggregateAnglesSection.hidden = false;
  machineMap.aggregateAngles = normalizeAggregateAngles(machineMap.aggregateAngles, machineMap.applicationMode, machineMap.objects);
  machineMap.spenderPlateAngles = normalizeSpenderPlateAngles(machineMap.spenderPlateAngles);
  machineMap.stationAngles = normalizeStationAngles({ ...machineMap.stationAngles, ...machineMap.aggregateAngles });
  const activeAggregates = activeSlotNumbers(machineMap.enabledAggregates);
  if (els.aggregateAnglesSummary) els.aggregateAnglesSummary.textContent = `${activeAggregates.length} active aggregate${activeAggregates.length === 1 ? "" : "s"} • click to expand`;
  els.aggregateAngleEditor.innerHTML = `<div class="builder-row-grid">${activeAggregates.map((aggregate) => `<label>Aggregate ${aggregate} table angle<input data-aggregate-angle="${aggregate}" type="number" step="0.1" value="${fmt(machineMap.aggregateAngles[String(aggregate)], 1)}"></label><label>Spender ${aggregate} plate angle<input data-spender-plate-angle="${aggregate}" type="number" min="0" max="180" step="0.1" value="${fmt(machineMap.spenderPlateAngles[String(aggregate)], 1)}" title="Application arm / spender plate angle. Default 75°."></label>`).join("")}</div>`;
}

function renderMachineLayoutControls(machineMap) {
  if (!els.aggregateToggleList || !els.stationToggleList) return;
  machineMap.enabledAggregates = normalizeEnabledSlots(machineMap.enabledAggregates, machineMap.aggregateCount);
  machineMap.enabledStations = normalizeEnabledSlots(machineMap.enabledStations, machineMap.stationCount);
  const renderGroup = (container, slots, label, slotType) => {
    container.innerHTML = slots.map((enabled, index) => {
      const number = index + 1;
      return `<label class="machine-toggle-item${enabled ? "" : " inactive"}"><input type="checkbox" data-machine-slot="${slotType}" data-slot-number="${number}" ${enabled ? "checked" : ""}><span>${label} ${number}</span></label>`;
    }).join("");
  };
  renderGroup(els.aggregateToggleList, machineMap.enabledAggregates, "Aggregate", "aggregate");
  renderGroup(els.stationToggleList, machineMap.enabledStations, "Station", "station");
  const aggregateCount = machineMap.enabledAggregates.filter(Boolean).length;
  const stationCount = machineMap.enabledStations.filter(Boolean).length;
  if (els.machineLayoutSummary) els.machineLayoutSummary.textContent = `${aggregateCount} active aggregate${aggregateCount === 1 ? "" : "s"} • ${stationCount} active station${stationCount === 1 ? "" : "s"}`;
}

function renderMapLibraryControls() {
  const map = activeMachineMap();
  if (!map) return;
  const libraryLocation = mapLibraryLocation();
  const visibleMaps = mapsForMapLibraryLocation();
  if (els.mapLibrarySelect) {
    els.mapLibrarySelect.disabled = !visibleMaps.length;
    els.mapLibrarySelect.innerHTML = visibleMaps.length
      ? visibleMaps.map((entry) => `<option value="${entry.id}"${entry.id === map.id ? " selected" : ""}>${entry.name}</option>`).join("")
      : '<option value="">No maps saved for this site</option>';
  }
  if (els.mapLibrarySummary) els.mapLibrarySummary.textContent = `${map.machineType || "TopModul"} • ${map.name} • ${map.headCount} heads • ${map.aggregateCount} aggregate${map.aggregateCount === 1 ? "" : "s"}`;
  if (els.mapName) els.mapName.value = map.name;
  if (els.mapZone) els.mapZone.innerHTML = optionList(["ALL", ...zoneNames()], libraryLocation.zone);
  if (els.mapSite) {
    const sites = sitesForZone(libraryLocation.zone);
    els.mapSite.disabled = libraryLocation.zone === "ALL" || !sites.length;
    els.mapSite.innerHTML = libraryLocation.zone === "ALL" ? '<option value="">All sites</option>' : sites.length ? optionList(sites, libraryLocation.site) : '<option value="">No sites configured</option>';
  }
  if (els.newMachineMap) els.newMachineMap.disabled = libraryLocation.zone === "ALL";
  if (els.applicationMode) {
    const supportedModes = [
      { value: "apl", label: "APL" },
      { value: "cold-glue", label: "Cold Glue" }
    ];
    els.applicationMode.replaceChildren(...supportedModes.map(({ value, label }) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      return option;
    }));
    els.applicationMode.value = state.applicationMode;
    els.applicationMode.disabled = false;
    els.applicationMode.setAttribute("aria-disabled", "false");
    els.applicationMode.title = String(map.machineType || "").trim() === "MultiModul"
      ? "Choose APL or Cold Glue for this MultiModul map."
      : "Choose the application system saved with this map.";
  }
  if (els.mapHeadCount) els.mapHeadCount.value = map.headCount;
  if (els.mapMachineType) {
    const types = [...new Set(["TopMatic", "Autocol", "TopModul", "MultiModul", ...(state.machineTypes || []), map.machineType || "TopModul"])];
    els.mapMachineType.replaceChildren(...types.map((type) => {
      const option = document.createElement("option");
      option.value = type;
      option.textContent = type;
      option.selected = type === (map.machineType || "TopModul");
      return option;
    }));
  }
  const settings = map.machineSettings || {};
  const builderMachineFields = {
    mapDirection: settings.direction, mapRadius: settings.radius, mapReferencePitchRadiusMm: settings.referencePitchRadiusMm,
    mapEncoderCountsPerRev: settings.encoderCountsPerRev,
    mapServoGearRatio: settings.servoGearRatio, mapZeroAngle: settings.zeroAngle, mapMaxMoveRatio: settings.maxMoveRatio
  };
  Object.entries(builderMachineFields).forEach(([key, value]) => { if (els[key]) els[key].value = value; });
  if (els.mapAutoScaleTableMap) els.mapAutoScaleTableMap.checked = settings.autoScaleTableMap !== false;
  if (els.deleteMachineMap) els.deleteMachineMap.disabled = false;
  if (els.saveMachineMap) els.saveMachineMap.textContent = "Save Map";
  if (els.mapAggregateCount) els.mapAggregateCount.value = map.aggregateCount;
  if (els.mapStationCount) els.mapStationCount.value = map.stationCount;
  renderMachineLayoutControls(map);
  renderAggregateAngleEditor(map);
}
