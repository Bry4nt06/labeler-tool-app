"use strict";

function renderWipeDownBuilder() {
  ensurePersistentApplicationMaps();
  if (!els.wipeBuilderList) return;
  const machineMap = activeMachineMap();
  const optimizeColdGlueButton = document.querySelector("#optimizeColdGlueMap");
  if (optimizeColdGlueButton) optimizeColdGlueButton.hidden = machineMap.applicationMode !== "cold-glue";
  renderMapLibraryControls();
  if (els.applicationModeDescription) {
    els.applicationModeDescription.textContent = `${machineMap.machineType || "TopModul"} • ${machineMap.name}: ${machineMap.headCount} heads, ${machineMap.aggregateCount} aggregate${machineMap.aggregateCount === 1 ? "" : "s"}, ${machineMap.stationCount} station${machineMap.stationCount === 1 ? "" : "s"}.`;
  }
  updateBuilderTypeControls();
  const map = machineMap.objects;
  const visibleEntries = map
    .map((raw, index) => ({ raw, index }))
    .filter(({ raw }) => itemApplicationMode(raw) === state.applicationMode)
    .filter(({ raw }) => raw.kind === "coding" || state.applicationMode === "cold-glue" || activeAplStationNumbers(machineMap).includes(Number(raw.station)));
  const expandedStations = new Set([...els.wipeBuilderList.querySelectorAll(".configured-station-group[open]")].map((group) => group.dataset.stationGroup));
  els.wipeBuilderList.innerHTML = "";

  const stationGroups = new Map();
  visibleEntries.forEach((entry) => {
    const station = entry.raw.kind === "coding" ? "coding" : (Number(entry.raw.station) || 1);
    if (!stationGroups.has(station)) stationGroups.set(station, []);
    stationGroups.get(station).push(entry);
  });

  [...stationGroups.entries()].sort((a, b) => a[0] === "coding" ? 1 : b[0] === "coding" ? -1 : a[0] - b[0]).forEach(([station, entries]) => {
    const isCodingStation = station === "coding";
    const section = machineMap.applicationMode === "apl" && !isCodingStation
      ? (inferAplStationSections(machineMap)[String(station)] || "none")
      : "";
    const group = document.createElement("details");
    group.className = "configured-station-group collapsible-builder-section";
    group.dataset.stationGroup = String(station);
    group.open = expandedStations.has(String(station)) || builderExpandedStation === String(station);
    const compactObjects = entries.map(({ raw }) => {
      const item = normalizeBuilderObject(raw, itemApplicationMode(raw), machineMap.stationCount);
      const location = item.kind === "sensor" || item.kind === "gripper" ? num(item.angle, item.start) : item.start;
      return `${item.kind === "sensor" ? "Sensor" : item.kind === "coding" ? "Coder" : item.kind === "pad" ? "Pad" : item.kind === "roller" ? "Roller" : sectionLabel(item.kind)} ${fmt(location, 1)}°`;
    }).join(" · ");
    group.innerHTML = `<summary><span><strong>Station ${station}</strong><small>${section && section !== "none" ? `${sectionLabel(section)} label • ` : ""}${compactObjects}</small></span></summary><div class="configured-station-objects collapsible-builder-content">${isCodingStation ? "" : `<div class="builder-station-actions"><button type="button" class="builder-duplicate-station secondary-button">Duplicate Station</button></div>`}</div>`;
    if (isCodingStation) group.querySelector("summary strong").textContent = "Coding Station";
    const groupBody = group.querySelector(".configured-station-objects");

    entries.forEach(({ raw, index }) => {
      const mode = itemApplicationMode(raw);
      const item = normalizeBuilderObject(raw, mode, machineMap.stationCount);
      map[index] = item;
      const coreColdGlue = mode === "cold-glue" && /^cg-/.test(item.id);
      const isGripper = item.kind === "gripper";
      const isCoding = item.kind === "coding";
      const isSensor = item.kind === "sensor";
      const isBrushChannel = item.kind === "brush-channel";
      const sensorStatus = isSensor && typeof labelSensorMapStatus === "function" ? labelSensorMapStatus(item) : null;
      const isAplRoller = mode === "apl" && item.kind === "roller";
      const stationSection = mode === "apl" ? (machineMap.stationSections?.[String(item.station)] || "auto") : null;
      const holdWindowStart = isBrushChannel ? Math.min(item.outerStart, item.innerStart) : item.start;
      const holdWindowEnd = isBrushChannel ? Math.max(item.outerEnd, item.innerEnd) : item.end;
      const row = document.createElement("details");
      row.className = "wipe-builder-row";
      row.dataset.builderObjectId = item.id;
      row.open = state.selectedMapObjectId === item.id;
      if (row.open) row.classList.add("selected-builder-object");
      const objectKind = isCoding ? "Coder" : isSensor ? "Label Sensor" : isGripper ? "Gripper" : item.kind === "pad" ? "Wipe-down pad" : item.kind.charAt(0).toUpperCase() + item.kind.slice(1);
      const objectPosition = isGripper || isSensor ? "" : ` • ${item.side === "inner" ? "Inside" : "Outside"}`;
      const objectRange = isCoding || isGripper || isSensor
        ? `${fmt(isGripper || isSensor ? item.angle : item.start, 1)}°`
        : `${fmt(item.start, 1)}°–${fmt(isAplRoller ? item.start + item.wipeSpanDeg : item.end, 1)}°`;
      row.innerHTML = `
        <summary><span><strong></strong><small>${objectKind}${objectPosition} • ${objectRange}</small></span></summary>
        <div class="builder-object-editor">
        <div class="builder-row-title"><input class="builder-name-input" data-builder-field="name" value="${item.name.replace(/"/g, "&quot;")}" aria-label="Map object name"></div>
        <div class="builder-row-grid">
          ${isCoding ? "" : `<label>Station<select data-builder-field="station">${activeSlotNumbers(machineMap.enabledStations).map((station) => `<option value="${station}" ${Number(item.station) === station ? "selected" : ""}>Station ${station}</option>`).join("")}</select></label>`}
          ${mode === "apl" && !isCoding ? `<label>Label use<select data-station-section><option value="auto" ${stationSection === "auto" ? " selected" : ""}>Auto</option><option value="neck" ${stationSection === "neck" ? " selected" : ""}>Neck</option><option value="body" ${stationSection === "body" ? " selected" : ""}>Body</option><option value="back" ${stationSection === "back" ? " selected" : ""}>Back</option><option value="none" ${stationSection === "none" ? " selected" : ""}>None</option></select><small>Applies to every object assigned to this station.</small></label>` : ""}
          ${!isGripper && !isSensor && !isBrushChannel ? `<label>Position<select data-builder-field="side"><option value="outer" ${item.side === "outer" ? "selected" : ""}>Outside</option><option value="inner" ${item.side === "inner" ? "selected" : ""}>Inside</option></select></label>` : ""}
          ${isBrushChannel ? `<label>Outside start<input data-builder-field="outerStart" type="number" step="0.1" value="${fmt(item.outerStart, 1)}"></label><label>Outside stop<input data-builder-field="outerEnd" type="number" step="0.1" value="${fmt(item.outerEnd, 1)}"></label><label>Inside start<input data-builder-field="innerStart" type="number" step="0.1" value="${fmt(item.innerStart, 1)}"></label><label>Inside stop<input data-builder-field="innerEnd" type="number" step="0.1" value="${fmt(item.innerEnd, 1)}"></label>` : `<label>${isGripper ? "Table angle" : isSensor ? "Placement" : isAplRoller ? "Roller center" : "Start / point 1"}<input data-builder-field="${isGripper || isSensor ? "angle" : "start"}" type="number" step="0.1" value="${fmt(isGripper || isSensor ? item.angle : item.start, 1)}"></label>`}
          ${!isBrushChannel && !isGripper && !isCoding && !isSensor ? isAplRoller
            ? `<label>Roller surface coverage (table deg)<input data-builder-field="wipeSpanDeg" type="number" min="0.1" step="0.1" value="${fmt(item.wipeSpanDeg, 1)}"><small>Contact footprint used by the servo wipe calculation; this is not another roller point.</small></label>`
            : `<label>Stop / point 2<input data-builder-field="end" type="number" step="0.1" value="${fmt(item.end, 1)}"></label>` : ""}
          ${mode === "cold-glue" && item.kind === "brush" ? `<label>Brush role<select data-builder-field="role"><option value="process" ${item.role === "process" ? "selected" : ""}>Partial wipe</option><option value="final" ${item.role === "final" ? "selected" : ""}>Final wipe</option><option value="hold" ${item.role === "hold" ? "selected" : ""}>Hold only</option></select></label><label>Coverage %<input data-builder-field="coveragePercent" type="number" min="0" max="100" step="1" value="${fmt(item.coveragePercent, 0)}"></label><label>Brush extension<input data-builder-field="extension" type="number" min="4" step="1" value="${fmt(item.extension, 1)}"></label><div class="brush-hold-inline"><div class="hold-check-row"><label class="inline-check"><input data-builder-field="holdBottleAngle" type="checkbox" ${item.holdBottleAngle ? "checked" : ""}> Hold angle</label><span class="info-tip" role="img" tabindex="0" title="Wipes to the Hold from table angle, then holds either the current bottle angle or the entered angle through the brush end." aria-label="Hold bottle angle information">i</span><label class="inline-check" ${item.holdBottleAngle ? "" : "hidden"}><input data-builder-field="holdCurrentBottleAngle" type="checkbox" ${item.holdCurrentBottleAngle ? "checked" : ""}> Hold Current Deg</label></div><div class="hold-input-row" ${item.holdBottleAngle ? "" : "hidden"}><label class="inline-field" ${!item.holdCurrentBottleAngle ? "" : "hidden"}>Angle<input data-builder-field="bottleHoldAngleDeg" type="number" step="0.1" value="${fmt(item.bottleHoldAngleDeg, 1)}"></label><label class="inline-field">Hold from<input data-builder-field="bottleHoldStartDeg" type="number" min="${fmt(item.start, 1)}" max="${fmt(item.end, 1)}" step="0.1" value="${fmt(item.bottleHoldStartDeg, 1)}" title="Allowed range ${fmt(item.start, 1)}°–${fmt(item.end, 1)}°"></label></div></div>` : ""}
          ${mode === "cold-glue" && isBrushChannel ? `<label>Brush extension<input data-builder-field="extension" type="number" min="4" step="1" value="${fmt(item.extension, 1)}"></label><div class="brush-hold-inline"><div class="hold-check-row"><label class="inline-check"><input data-builder-field="holdBottleAngle" type="checkbox" ${item.holdBottleAngle ? "checked" : ""}> Hold angle</label><span class="info-tip" role="img" tabindex="0" title="Wipes to the Hold from table angle, then holds either the current bottle angle or the entered angle through the channel end." aria-label="Hold bottle angle information">i</span><label class="inline-check" ${item.holdBottleAngle ? "" : "hidden"}><input data-builder-field="holdCurrentBottleAngle" type="checkbox" ${item.holdCurrentBottleAngle ? "checked" : ""}> Hold Current Deg</label></div><div class="hold-input-row" ${item.holdBottleAngle ? "" : "hidden"}><label class="inline-field" ${!item.holdCurrentBottleAngle ? "" : "hidden"}>Angle<input data-builder-field="bottleHoldAngleDeg" type="number" step="0.1" value="${fmt(item.bottleHoldAngleDeg, 1)}"></label><label class="inline-field">Hold from<input data-builder-field="bottleHoldStartDeg" type="number" min="${fmt(holdWindowStart, 1)}" max="${fmt(holdWindowEnd, 1)}" step="0.1" value="${fmt(item.bottleHoldStartDeg, 1)}"></label></div></div>` : ""}
          ${isSensor ? `<label class="builder-checkbox-label"><input data-builder-field="servoAssist" type="checkbox" ${item.servoAssist ? "checked" : ""}> Orient bottle for sensor<small>Creates the shortest turn needed to meet the configured label view.</small></label><label>Required label view (%)<input data-builder-field="requiredVisibilityPercent" type="number" min="1" max="100" step="1" value="${fmt(item.requiredVisibilityPercent, 0)}"><small>1% allows an edge view; 100% aligns the label centerline directly with the sensor.</small></label><div class="sensor-inline-status ${sensorStatus?.passes ? "sensor-status-pass" : "sensor-status-fail"}"><strong>${fmt(sensorStatus?.percent, 1)}% visible</strong><span>Required: ${fmt(sensorStatus?.required, 0)}%</span></div>` : ""}
        </div>
        ${coreColdGlue ? `<small class="builder-core-note">Core Cold Glue machine point</small>` : ""}
        <div class="builder-object-actions"><button type="button" class="builder-duplicate secondary-button">Duplicate</button><button type="button" class="builder-remove secondary-button">Remove</button></div>
        </div>`;
      row.querySelector("summary strong").textContent = item.name;
      groupBody.appendChild(row);
    });
    els.wipeBuilderList.appendChild(group);
  });
  builderExpandedStation = null;
  const undoButton = document.querySelector("#undoBuilderEdit");
  const redoButton = document.querySelector("#redoBuilderEdit");
  if (undoButton) undoButton.disabled = !state.builderHistory?.undo?.length;
  if (redoButton) redoButton.disabled = !state.builderHistory?.redo?.length;
  if (els.builderStatus) els.builderStatus.textContent = `${state.builderSaveState === "saving" ? "Saving…" : "Saved"} • ${machineMap.name} • ${visibleEntries.length} object${visibleEntries.length === 1 ? "" : "s"}`;
}
