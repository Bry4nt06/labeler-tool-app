"use strict";

function renderStations() {
  syncMapPointsFromAssemblies();
  els.stations.innerHTML = `<table><thead><tr><th>#</th><th>Map point object</th><th class="num">Table angle</th><th class="num">Nearest head</th><th class="num">X</th><th class="num">Y</th></tr></thead><tbody></tbody></table>`;
  const body = els.stations.querySelector("tbody");
  const pitch = 360 / state.headCount;
  const rows = applicationMapPointRows();
  const names = rows.map((row) => row.name);

  rows.forEach((point, index) => {
    const xy = angleToXY(point.angle, state.radius);
    const nearest = Math.round(norm(point.angle) / pitch) % state.headCount + 1;
    const row = document.createElement("tr");
    row.innerHTML = `<td>${index + 1}</td><td><select class="map-point-name" aria-label="Map point name">${optionList(names, point.name)}</select></td><td><input class="num" type="number" step="0.1" value="${fmt(point.angle, 3)}"></td><td class="num">${nearest}</td><td class="num">${fmt(xy.x)}</td><td class="num">${fmt(xy.y)}</td>`;
    const nameSelect = row.querySelector("select");
    const angleInput = row.querySelector("input");

    // Station object names are generated from the active application and
    // installed equipment, so their dropdown is informative but locked.
    if (point.station || point.fixed || point.fixedName) nameSelect.disabled = true;
    else nameSelect.addEventListener("change", () => {
      const globalPoint = state.mapPoints.find((entry) => entry.name === point.name && !mapPointStation(entry.name));
      if (globalPoint) globalPoint.name = nameSelect.value;
      render();
    });

    if (point.fixed) angleInput.disabled = true;
    angleInput.addEventListener("change", () => {
      if (point.fixed) return;
      point.angle = num(angleInput.value, point.angle);
      point.update(point.angle);
      syncMapPointsFromAssemblies();
      render();
      renderAssemblyEditor();
    });
    body.appendChild(row);
  });
}
function optionList(items, selected) {
  const options = selected && !items.includes(selected) ? [selected, ...items] : items;
  return options.map((item) => {
    const escaped = String(item).replace(/"/g, '&quot;');
    const suffix = item === selected && !items.includes(selected) ? " (not found in specs)" : "";
    return `<option value="${escaped}"${item === selected ? " selected" : ""}>${item}${suffix}</option>`;
  }).join("");
}

function renderBottleSpecs() {
  els.bottleSpecs.innerHTML = `<div class="table-tools"><button id="addBottleSpec" type="button">Add Bottle</button></div><table><thead><tr><th>#</th><th>Bottle Type</th><th class="num">Diameter Target (mm)</th><th class="num">Radius Reduction (mm)</th><th class="num">Body/Back Diameter (mm)</th><th class="num">Body/Back Circumference (mm)</th><th>Action</th></tr></thead><tbody></tbody></table>`;
  els.bottleSpecs.querySelector("#addBottleSpec").addEventListener("click", () => {
    const id = nextId(state.bottleSpecs);
    state.bottleSpecs.push({ id, bottleType: `New Bottle ${id}`, diameterTargetMm: 0, radiusReductionMm: 0 });
    state.selectedBottle = `New Bottle ${id}`;
    render();
  });
  const body = els.bottleSpecs.querySelector("tbody");
  state.bottleSpecs.forEach((spec, index) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${spec.id}</td><td><input value="${spec.bottleType ?? ""}"></td><td><input class="num" type="number" step="0.001" value="${spec.diameterTargetMm ?? ""}"></td><td><input class="num" type="number" step="0.001" value="${spec.radiusReductionMm ?? ""}"></td><td class="num">${fmt(bodyDiameter(spec), 3)}</td><td class="num">${fmt(bodyCircumference(spec), 3)}</td><td><button class="danger small-button" type="button">Delete</button></td>`;
    const inputs = tr.querySelectorAll("input");
    inputs[0].addEventListener("change", () => {
      const oldBottleType = spec.bottleType;
      const newBottleType = inputs[0].value.trim() || oldBottleType;
      spec.bottleType = newBottleType;
      if (state.selectedBottle === oldBottleType) state.selectedBottle = newBottleType;
      state.labelSpecs.forEach((label) => {
        if (label.bottleType === oldBottleType) label.bottleType = newBottleType;
      });
      render();
    });
    inputs[1].addEventListener("change", () => { spec.diameterTargetMm = num(inputs[1].value, spec.diameterTargetMm); render(); });
    inputs[2].addEventListener("change", () => { spec.radiusReductionMm = num(inputs[2].value, spec.radiusReductionMm); render(); });
    const deleteButton = tr.querySelector("button");
    if (deleteButton) {
      deleteButton.addEventListener("click", () => {
        if (!window.confirm(`Delete bottle spec "${spec.bottleType}"?`)) return;
        const deletedBottleType = spec.bottleType;
        state.bottleSpecs = state.bottleSpecs.filter((row) => row.id !== spec.id);
        const replacement = state.bottleSpecs[0]?.bottleType ?? "";
        if (state.selectedBottle === deletedBottleType) state.selectedBottle = replacement;
        state.labelSpecs.forEach((label) => {
          if (label.bottleType === deletedBottleType) label.bottleType = replacement;
        });
        render();
      });
    }
    body.appendChild(tr);
  });
}

function renderLabelSpecs() {
  els.labelSpecs.innerHTML = `
    <div class="table-tools">
      <span class="table-tool-note">Assign each brand to APL or Cold Glue. Build selections are filtered by the active application map.</span>
      <button id="addLabelSpec" type="button">Add Label</button>
    </div>
    <table><thead><tr><th>#</th><th>Brand</th><th>Spec #</th><th>Application</th><th class="num">Body Length</th><th class="num">Back Length</th><th class="num">Neck Height <button class="info-tip" type="button" title="Measure the vertical height of the neck label from its bottom edge to its top edge on the approved label drawing." aria-label="Where to get Neck Height information">i</button></th><th class="num">Neck Length</th><th class="num">Neck Curve Bottom <button class="info-tip" type="button" title="Use the developed label width along the lower curved edge of the neck label from the approved label drawing." aria-label="Where to get Neck Curve Bottom information">i</button></th><th class="num">Neck Bottom Circ <button class="info-tip" type="button" title="Measure the bottle circumference at the exact height where the bottom edge of the neck label sits." aria-label="Where to get Neck Bottom Circumference information">i</button></th><th class="num">Code Box Center from Left Edge <button class="info-tip" type="button" title="On the approved label drawing, measure from the label's left edge to the center of the 20 mm coding box." aria-label="Where to get Code Box Center information">i</button></th><th>Action</th></tr></thead><tbody></tbody></table>`;
  const labelSpecsTable = els.labelSpecs.querySelector("table");
  labelSpecsTable.classList.add("label-specs-table");
  labelSpecsTable.insertAdjacentHTML("afterbegin", '<colgroup><col class="label-col-id"><col class="label-col-brand"><col class="label-col-spec"><col class="label-col-application"><col class="label-col-short"><col class="label-col-short"><col class="label-col-neck-height"><col class="label-col-neck-length"><col class="label-col-curve"><col class="label-col-circ"><col class="label-col-code"><col class="label-col-action"></colgroup>');
  els.labelSpecs.querySelector("#addLabelSpec").addEventListener("click", () => {
    const id = nextId(state.labelSpecs);
    state.labelSpecs.push({
      id,
      applicationMode: normalizeLabelApplicationMode(state.applicationMode),
      brand: `New Label ${id}`,
      specNumber: "",
      bottleType: state.selectedBottle,
      bodyLengthMm: 0,
      backLengthMm: 0,
      neckHeightMm: 0,
      neckLengthMm: 0,
      neckBottomCurveMm: 0,
      neckBottomCircumferenceMm: 0,
      codeBoxCenterMm: 0
    });
    state.selectedBrand = `New Label ${id}`;
    render();
  });
  const body = els.labelSpecs.querySelector("tbody");
  state.labelSpecs.forEach((spec) => {
    spec.applicationMode = normalizeLabelApplicationMode(spec.applicationMode);
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${spec.id}</td><td><input value="${spec.brand ?? ""}"></td><td><input value="${spec.specNumber ?? ""}"></td><td><select aria-label="Application for ${spec.brand ?? "label"}"><option value="apl"${spec.applicationMode === "apl" ? " selected" : ""}>APL</option><option value="cold-glue"${spec.applicationMode === "cold-glue" ? " selected" : ""}>Cold Glue</option></select></td><td><input class="num" type="number" step="0.001" value="${spec.bodyLengthMm ?? ""}"></td><td><input class="num" type="number" step="0.001" value="${spec.backLengthMm ?? ""}"></td><td><input class="num" type="number" step="0.001" value="${spec.neckHeightMm ?? ""}"></td><td><input class="num" type="number" step="0.001" value="${spec.neckLengthMm ?? ""}"></td><td><input class="num" type="number" step="0.001" value="${spec.neckBottomCurveMm ?? ""}"></td><td><input class="num" type="number" step="0.001" value="${spec.neckBottomCircumferenceMm ?? ""}"></td><td><input class="num" type="number" step="0.001" value="${spec.codeBoxCenterMm ?? ""}"></td><td><button class="danger small-button" type="button">Delete</button></td>`;
    const textAndNumberInputs = tr.querySelectorAll("input");
    const applicationSelect = tr.querySelector("select");
    const keys = ["brand", "specNumber", "bodyLengthMm", "backLengthMm", "neckHeightMm", "neckLengthMm", "neckBottomCurveMm", "neckBottomCircumferenceMm", "codeBoxCenterMm"];
    textAndNumberInputs.forEach((input, index) => {
      input.addEventListener("change", () => {
        const oldBrand = spec.brand;
        spec[keys[index]] = input.type === "number" ? num(input.value, spec[keys[index]]) : input.value;
        if (keys[index] === "brand" && state.selectedBrand === oldBrand) state.selectedBrand = spec.brand;
        render();
      });
    });
    applicationSelect.addEventListener("change", () => {
      spec.applicationMode = normalizeLabelApplicationMode(applicationSelect.value);
      ensureSelectedBrandForApplication();
      render();
    });
    const deleteButton = tr.querySelector("button");
    if (deleteButton) {
      deleteButton.addEventListener("click", () => {
        if (!window.confirm(`Delete label spec "${spec.brand}"?`)) return;
        state.labelSpecs = state.labelSpecs.filter((row) => row.id !== spec.id);
        ensureSelectedBrandForApplication();
        render();
      });
    }
    body.appendChild(tr);
  });
}

function renderBuildInputs() {
  const availableLabels = labelSpecsForApplication();
  const brandOptions = availableLabels.map((spec) => spec.brand).filter(Boolean);
  const bottleOptions = state.bottleSpecs.map((spec) => spec.bottleType).filter(Boolean);
  const summary = buildProgramSummary();
  els.buildInputs.innerHTML = `
    <div class="build-grid">
      <div class="build-card">
        <h2>Build Program Inputs</h2>
        <div class="application-filter-note">Showing ${state.applicationMode === "cold-glue" ? "Cold Glue" : "APL"} brand profiles only.</div>
        <label>Brand <select id="brandSelect"${brandOptions.length ? "" : " disabled"}>${brandOptions.length ? optionList(brandOptions, state.selectedBrand) : `<option value="">No ${state.applicationMode === "cold-glue" ? "Cold Glue" : "APL"} brands assigned</option>`}</select></label>
        <label>Bottle Type <select id="bottleSelect">${optionList(bottleOptions, state.selectedBottle)}</select></label>
        <label>Neck Spender Plate Angle <input id="neckSpenderPlateDeg" type="number" step="0.1" value="${state.buildInputs.neckSpenderPlateDeg}"></label>
        <label>Neck Application <select id="neckApplication"><option${state.buildInputs.neckApplication === "Center" ? " selected" : ""}>Center</option><option${state.buildInputs.neckApplication === "Leading Edge" ? " selected" : ""}>Leading Edge</option></select></label>
        <label>Neck Contact Parameter (mm) <input id="neckContactMm" type="number" step="0.1" value="${state.buildInputs.neckContactMm}"></label>
        <label>Body Contact Parameter (mm) <input id="bodyContactMm" type="number" step="0.1" value="${state.buildInputs.bodyContactMm}"></label>
        <label>Back Contact Parameter (mm) <input id="backContactMm" type="number" step="0.1" value="${state.buildInputs.backContactMm}"></label>
        <label>Neck Over-Wipe (deg) <input id="neckOverWipeDeg" type="number" min="0" step="0.1" value="${state.buildInputs.neckOverWipeDeg}"></label>
        <label>Body Over-Wipe (deg) <input id="bodyOverWipeDeg" type="number" min="0" step="0.1" value="${state.buildInputs.bodyOverWipeDeg}"></label>
        <label>Back Over-Wipe (deg) <input id="backOverWipeDeg" type="number" min="0" step="0.1" value="${state.buildInputs.backOverWipeDeg}"></label>
        <label>Starting Servo Position (deg) <input id="plateStartPositionDeg" type="number" step="0.1" value="${state.buildInputs.plateStartPositionDeg}"></label>
        <label>Neck Label Offset (mm) <input id="neckOffsetMm" type="number" step="0.1" value="${state.buildInputs.neckOffsetMm}"></label>
        <label>Body Label Offset (mm) <input id="bodyOffsetMm" type="number" step="0.1" value="${state.buildInputs.bodyOffsetMm}"></label>
        <label>Back Label Offset (mm) <input id="backOffsetMm" type="number" step="0.1" value="${state.buildInputs.backOffsetMm}"></label>
        <label>Back Inspection Offset (mm) <input id="backInspectionOffsetMm" type="number" step="0.1" value="${state.buildInputs.backInspectionOffsetMm}"></label>
      </div>
      <div class="build-card">
        <h2>Workbook Feed Check</h2>
        <table><thead><tr><th>Build Program Field</th><th>Value</th></tr></thead><tbody>${summary.rows.map(([label, value]) => `<tr><td>${label}</td><td class="num">${typeof value === "number" ? fmt(value, 3) : value}</td></tr>`).join("")}</tbody></table>
      </div>
    </div>`;

  const brandSelect = els.buildInputs.querySelector("#brandSelect");
  const bottleSelect = els.buildInputs.querySelector("#bottleSelect");
  brandSelect.addEventListener("change", () => {
    state.selectedBrand = brandSelect.value;
    const label = selectedLabelSpec();
    ensureBottleReferenceForLabel(label);
    render();
  });
  bottleSelect.addEventListener("change", () => { state.selectedBottle = bottleSelect.value; render(); });
  ["neckSpenderPlateDeg", "neckContactMm", "bodyContactMm", "backContactMm", "neckOverWipeDeg", "bodyOverWipeDeg", "backOverWipeDeg", "plateStartPositionDeg", "neckOffsetMm", "bodyOffsetMm", "backOffsetMm", "backInspectionOffsetMm"].forEach((key) => {
    const input = els.buildInputs.querySelector(`#${key}`);
    input.addEventListener("change", () => { state.buildInputs[key] = num(input.value, state.buildInputs[key]); render(); });
  });
  const neckApplication = els.buildInputs.querySelector("#neckApplication");
  neckApplication.addEventListener("change", () => { state.buildInputs.neckApplication = neckApplication.value; render(); });
}

function activeMachineUsesAutocolCommands() {
  const machineMap = typeof activeMachineMap === "function" ? activeMachineMap() : null;
  return String(machineMap?.machineType || "").toLowerCase() === "autocol";
}

function autocolCommandLabel(row) {
  if (row.autocolBoundary === "start-shape") return "Spec.-shap. plate corners";
  if (row.autocolBoundary === "end-curve") return "End of curve";
  return Number(row.cmd) === 7 ? "Correction" : "Rest";
}

function servoCommandControl(row, allowAutocolBoundaries = false) {
  if (!activeMachineUsesAutocolCommands()) {
    return `<input class="num compact-input" type="number" step="1" value="${row.cmd}">`;
  }
  if (!allowAutocolBoundaries && (row.autocolBoundary === "start-shape" || row.autocolBoundary === "end-curve")) {
    return `<select class="compact-input" disabled><option value="${row.cmd}">${autocolCommandLabel(row)}</option></select>`;
  }
  if (allowAutocolBoundaries && (row.autocolBoundary === "start-shape" || row.autocolBoundary === "end-curve")) {
    return `<select class="compact-input" disabled><option>${autocolCommandLabel(row)}</option></select>`;
  }
  const value = row.autocolBoundary === "start-shape" ? "start-shape" : row.autocolBoundary === "end-curve" ? "end-curve" : String(Number(row.cmd) === 7 ? 7 : 3);
  return `<select class="compact-input">${allowAutocolBoundaries ? `<option value="start-shape"${value === "start-shape" ? " selected" : ""}>Spec.-shap. plate corners</option>` : ""}<option value="3"${value === "3" ? " selected" : ""}>Rest</option><option value="7"${value === "7" ? " selected" : ""}>Correction</option>${allowAutocolBoundaries ? `<option value="end-curve"${value === "end-curve" ? " selected" : ""}>End of curve</option>` : ""}</select>`;
}

function escapeServoProfileHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function servoProfileSavedDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString();
}

function currentServoProfileContext() {
  const map = typeof activeMachineMap === "function" ? activeMachineMap() : null;
  return {
    mapId: map?.id || state.activeMapId || "",
    mapName: map?.name || "Unnamed Map",
    brand: state.selectedBrand || "Unspecified brand",
    bottleType: state.selectedBottle || "Unspecified bottle",
    applicationMode: state.applicationMode || "apl"
  };
}

function saveServoProfileFromLibraryControls() {
  const nameInput = els.simulation.querySelector("#servoProfileName");
  const descriptionInput = els.simulation.querySelector("#servoProfileDescription");
  const name = String(nameInput?.value || "").trim();
  if (!name) {
    window.alert("Enter a profile name before saving.");
    nameInput?.focus();
    return;
  }
  const context = currentServoProfileContext();
  const profile = {
    id: `servo-profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    description: String(descriptionInput?.value || "").trim(),
    savedAt: new Date().toISOString(),
    ...context,
    simulation: deepClone(state.simulation)
  };
  if (!Array.isArray(state.servoProfileLibrary)) state.servoProfileLibrary = [];
  state.servoProfileLibrary.push(profile);
  state.activeServoProfileId = profile.id;
  saveCurrentSettings();
  render();
}

function loadServoProfileFromLibrary(profileId) {
  const profile = state.servoProfileLibrary.find((entry) => entry.id === profileId);
  if (!profile) return;
  if (!profile.simulation || typeof profile.simulation !== "object") {
    window.alert("This older profile does not contain custom simulation settings.");
    return;
  }
  const map = state.mapLibrary.find((entry) => entry.id === profile.mapId);
  if (!map) {
    window.alert(`The saved map “${profile.mapName || "Unknown"}” is no longer available.`);
    return;
  }
  loadMachineMapIntoRuntime(map, false);
  if (profile.applicationMode) state.applicationMode = profile.applicationMode;
  if (state.labelSpecs.some((entry) => entry.brand === profile.brand)) state.selectedBrand = profile.brand;
  if (state.bottleSpecs.some((entry) => entry.bottleType === profile.bottleType)) state.selectedBottle = profile.bottleType;
  state.simulation = deepClone(profile.simulation);
  ensureSimulationRows();
  state.activeServoProfileId = profile.id;
  saveCurrentSettings();
  render();
}

function deleteServoProfileFromLibrary(profileId) {
  const profile = state.servoProfileLibrary.find((entry) => entry.id === profileId);
  if (!profile || !window.confirm(`Delete saved servo profile “${profile.name}”?`)) return;
  state.servoProfileLibrary = state.servoProfileLibrary.filter((entry) => entry.id !== profileId);
  if (state.activeServoProfileId === profileId) state.activeServoProfileId = "";
  saveCurrentSettings();
  render();
}

function servoProfileLibraryMarkup() {
  const context = currentServoProfileContext();
  const profiles = Array.isArray(state.servoProfileLibrary) ? state.servoProfileLibrary : [];
  const selectedId = profiles.some((entry) => entry.id === state.activeServoProfileId)
    ? state.activeServoProfileId
    : profiles[0]?.id || "";
  const selected = profiles.find((entry) => entry.id === selectedId);
  const options = profiles.length
    ? profiles.map((entry) => `<option value="${escapeServoProfileHtml(entry.id)}"${entry.id === selectedId ? " selected" : ""}>${escapeServoProfileHtml(entry.name)}</option>`).join("")
    : '<option value="">No saved profiles</option>';
  const details = selected
    ? `<div class="servo-profile-details"><strong>${escapeServoProfileHtml(selected.name)}</strong><span>${escapeServoProfileHtml(selected.brand)} • ${escapeServoProfileHtml(selected.bottleType)} • ${escapeServoProfileHtml(selected.mapName)}</span>${selected.description ? `<small>${escapeServoProfileHtml(selected.description)}</small>` : ""}<time datetime="${escapeServoProfileHtml(selected.savedAt)}">Saved ${escapeServoProfileHtml(servoProfileSavedDate(selected.savedAt))}</time></div>`
    : '<div class="servo-profile-details empty"><span>Save the current custom simulation lines and angles for reuse.</span></div>';
  return `<section class="servo-profile-library" aria-labelledby="servoProfileLibraryTitle">
    <div class="servo-profile-library-head"><div><h2 id="servoProfileLibraryTitle">Custom Simulation Library</h2><p>Save and restore custom simulation settings by brand, bottle, and map.</p></div><span>${profiles.length} saved</span></div>
    <div class="servo-profile-save-grid">
      <label>Profile name<input id="servoProfileName" type="text" maxlength="80" placeholder="Example: Bud Light Lime production"></label>
      <label>Description<input id="servoProfileDescription" type="text" maxlength="180" placeholder="Optional notes about this setup"></label>
      <button id="saveServoProfile" type="button">Save Simulation Settings</button>
    </div>
    <div class="servo-profile-context"><span>Brand <strong>${escapeServoProfileHtml(context.brand)}</strong></span><span>Bottle <strong>${escapeServoProfileHtml(context.bottleType)}</strong></span><span>Map <strong>${escapeServoProfileHtml(context.mapName)}</strong></span></div>
    <div class="servo-profile-library-grid"><label>Saved profile<select id="servoProfileLibrarySelect"${profiles.length ? "" : " disabled"}>${options}</select></label><div class="servo-profile-actions"><button id="loadServoProfile" class="secondary-button" type="button"${selected ? "" : " disabled"}>Load</button><button id="deleteServoProfile" class="danger" type="button"${selected ? "" : " disabled"}>Delete</button></div>${details}</div>
  </section>`;
}

function bindServoProfileLibraryControls() {
  const select = els.simulation.querySelector("#servoProfileLibrarySelect");
  els.simulation.querySelector("#saveServoProfile")?.addEventListener("click", saveServoProfileFromLibraryControls);
  select?.addEventListener("change", () => {
    state.activeServoProfileId = select.value;
    renderSimulation();
  });
  els.simulation.querySelector("#loadServoProfile")?.addEventListener("click", () => loadServoProfileFromLibrary(select?.value));
  els.simulation.querySelector("#deleteServoProfile")?.addEventListener("click", () => deleteServoProfileFromLibrary(select?.value));
}

function renderProgram() {
  const commandHeading = activeMachineUsesAutocolCommands() ? "Travel command" : "CMD";
  els.program.innerHTML = `<table><thead><tr><th>HMI</th><th>PLC</th><th>${commandHeading}</th><th class="num">Table angle</th><th class="num override-heading">Table override</th><th class="num">Bottle angle</th><th class="num override-heading">Bottle override</th><th class="num">Table travel</th><th class="num">Bottle travel</th><th class="num">Encoder travel</th><th>Status</th><th class="num">Turn speed</th><th>Action</th></tr></thead><tbody></tbody></table>`;
  const body = els.program.querySelector("tbody");
  const segments = programSegments(state.program);
  const maxSpeed = segments.reduce((best, seg) => Number.isFinite(seg.absSpeed) && seg.absSpeed > (best?.absSpeed ?? -Infinity) ? seg : best, null);
  segments.forEach((row) => {
    const status = row.moveFault
      ? ["status-bad", `FAULT ${fmt(finishAngle(row.absSpeed), 1)} >= ${fmt(finishAngle(state.maxMoveRatio), 1)}`]
      : !Number.isFinite(row.plateAngle) && row.cmd !== 0
        ? ["status-warn", "Needs plate angle"]
        : ["status-ok", "OK"];
    const speedClass = maxSpeed && row.hmi === maxSpeed.hmi && row.absSpeed > 0 ? "speed-max" : "";
    const tr = document.createElement("tr");
    tr.dataset.programHmi = String(row.hmi);
    if (row.moveFault) tr.classList.add("move-fault-row");
    const tableOverride = Number.isFinite(row.tableAngleOverride) ? fmt(row.tableAngleOverride, 1) : "";
    const plateOverride = Number.isFinite(row.plateAngleOverride) ? fmt(row.plateAngleOverride, 1) : "";
    tr.innerHTML = `<td>${row.hmi}</td><td>${row.plc}</td><td>${servoCommandControl(row)}</td><td><input class="num compact-input generated-angle" type="number" value="${fmt(row.generatedTableAngle, 1)}" readonly title="Generated table angle"></td><td><input class="num compact-input angle-override${tableOverride !== "" ? " active-override" : ""}" type="number" step="0.1" placeholder="Override" value="${tableOverride}" aria-label="Override table angle for HMI ${row.hmi}"></td><td><input class="num compact-input generated-angle" type="number" value="${Number.isFinite(row.generatedPlateAngle) ? fmt(row.generatedPlateAngle, 1) : ""}" readonly title="Generated bottle angle"></td><td><input class="num compact-input angle-override${plateOverride !== "" ? " active-override" : ""}" type="number" step="0.1" placeholder="Override" value="${plateOverride}" aria-label="Override bottle angle for HMI ${row.hmi}"></td><td class="num">${fmt(row.tableTravel, 1)}</td><td class="num">${fmt(row.plateTravel, 1)}</td><td class="num">${Number.isFinite(row.plateTravel) ? fmt(finishAngle(window.LabelerGeometryDriver?.encoderCountsFromPlateDegrees(row.plateTravel, state.encoderCountsPerRev, state.servoGearRatio)), 1) : ""}</td><td class="${status[0]}">${status[1]}</td><td class="num ${speedClass}">${Number.isFinite(row.absSpeed) ? fmt(finishAngle(row.absSpeed), 1) : ""}</td><td><input value="${row.action}"></td>`;
    const inputs = tr.querySelectorAll("input, select");
    inputs[0].addEventListener("change", () => { state.program[row.hmi - 1].cmd = num(inputs[0].value, row.cmd); render(); });
    inputs[2].addEventListener("change", () => { setServoAngleOverride(row, "tableAngle", inputs[2].value); render(); });
    inputs[4].addEventListener("change", () => { setServoAngleOverride(row, "plateAngle", inputs[4].value); render(); });
    inputs[5].addEventListener("input", () => { state.program[row.hmi - 1].action = inputs[5].value; });
    body.appendChild(tr);
  });
  updateActiveServoProgramRow();
}

function servoMovePairKey(segment) {
  return String(segment?.action || "")
    .replace(/\s*-\s*rest\s*$/i, "")
    .trim()
    .toLowerCase();
}

function updateActiveServoProgramRow() {
  if (!els.program) return;
  const program = currentProgram();
  const segments = programSegments(program);
  const active = activeSegmentForProgram(program, state.previewAngle);
  const activeHmi = Number(active?.hmi);
  const activeIndex = segments.findIndex((segment) => Number(segment.hmi) === activeHmi);
  const pairedHmis = new Set(Number.isFinite(activeHmi) ? [activeHmi] : []);
  const activeSegment = segments[activeIndex];
  const pairKey = servoMovePairKey(activeSegment);
  if (pairKey && [3, 7].includes(Number(activeSegment?.cmd))) {
    const counterpartCommand = Number(activeSegment.cmd) === 7 ? 3 : 7;
    const counterpart = segments
      .map((segment, index) => ({ segment, index }))
      .filter(({ segment }) => Number(segment.cmd) === counterpartCommand && servoMovePairKey(segment) === pairKey)
      .sort((a, b) => Math.abs(a.index - activeIndex) - Math.abs(b.index - activeIndex))[0]?.segment;
    if (counterpart) pairedHmis.add(Number(counterpart.hmi));
  }
  els.program.querySelectorAll("tbody tr[data-program-hmi]").forEach((row) => {
    const rowHmi = Number(row.dataset.programHmi);
    const isActive = rowHmi === activeHmi;
    const isMovePair = pairedHmis.has(rowHmi);
    row.classList.toggle("active-servo-move-row", isMovePair);
    row.classList.toggle("active-servo-program-row", isActive);
    if (isActive) {
      row.setAttribute("aria-current", "step");
      row.title = `Head 1 is executing HMI ${activeHmi}: ${active?.action || "Servo move"}`;
    } else {
      row.removeAttribute("aria-current");
      if (isMovePair) row.title = `Reference row paired with Head 1 move at HMI ${activeHmi}`;
      else row.removeAttribute("title");
    }
  });
}

function renderSimulation() {
  ensureSimulationRows();
  const simProgram = simulationProgram();
  const segments = programSegments(simProgram);
  const maxSpeed = segments.reduce((best, seg) => Number.isFinite(seg.absSpeed) && seg.absSpeed > (best?.absSpeed ?? -Infinity) ? seg : best, null);
  els.simulation.innerHTML = `${servoProfileLibraryMarkup()}
    <div class="sim-tools">
      <div class="sim-summary">${maxSpeed ? `Max custom speed: ${fmt(finishAngle(maxSpeed.absSpeed), 1)} deg bottle / 1 deg table at HMI ${maxSpeed.hmi}` : "Enter custom turns to calculate speed."}</div>
    </div>
    <table><thead><tr><th>HMI</th><th>PLC</th><th>${activeMachineUsesAutocolCommands() ? "Travel command" : "CMD"}</th><th class="num">Table angle</th><th class="num">Plate angle</th><th class="num">Table travel</th><th class="num">Plate travel</th><th class="num">Encoder travel</th><th>Status</th><th class="num">Turn speed</th><th>Action</th><th>Line</th></tr></thead><tbody></tbody></table>
    `;
  bindServoProfileLibraryControls();

  const body = els.simulation.querySelector("tbody");
  segments.forEach((row, index) => {
    const status = row.moveFault
      ? ["status-bad", `FAULT ${fmt(finishAngle(row.absSpeed), 1)} >= ${fmt(finishAngle(state.maxMoveRatio), 1)}`]
      : !Number.isFinite(row.plateAngle) && row.cmd !== 0
        ? ["status-warn", "Needs plate angle"]
        : ["status-ok", "OK"];
    const tr = document.createElement("tr");
    if (row.moveFault) tr.classList.add("move-fault-row");
    const speedClass = maxSpeed && row.hmi === maxSpeed.hmi && row.absSpeed > 0 ? "speed-max" : "";
    const boundaryLine = ["start-shape", "end-curve"].includes(row.autocolBoundary);
    const lineControl = row.autocolBoundary === "end-curve"
      ? `<button class="small-button simulation-add-line" type="button" title="Add one simulator line above End curve">Add</button>`
      : row.autocolBoundary === "start-shape"
        ? ""
        : `<span class="simulation-line-actions"><button class="small-button simulation-insert-pair" type="button" data-simulation-line-index="${index}" title="Insert a Correction and Rest pair below this line" aria-label="Insert Correction and Rest below HMI ${row.hmi}">+</button><button class="danger small-button simulation-delete-line" type="button" title="Delete this simulator line">Delete</button></span>`;
    tr.innerHTML = `<td>${row.hmi}</td><td>${row.plc}</td><td>${servoCommandControl(row, true)}</td><td><input class="num compact-input" type="number" step="0.5" value="${fmt(row.tableAngle, 1)}"${boundaryLine ? " readonly" : ""}></td><td><input class="num compact-input" type="number" step="0.5" value="${Number.isFinite(row.plateAngle) ? fmt(row.plateAngle, 1) : ""}"></td><td class="num">${fmt(row.tableTravel, 1)}</td><td class="num">${fmt(row.plateTravel, 1)}</td><td class="num">${Number.isFinite(row.plateTravel) ? fmt(finishAngle(window.LabelerGeometryDriver?.encoderCountsFromPlateDegrees(row.plateTravel, state.encoderCountsPerRev, state.servoGearRatio)), 1) : ""}</td><td class="${status[0]}">${status[1]}</td><td class="num ${speedClass}">${Number.isFinite(row.absSpeed) ? fmt(finishAngle(row.absSpeed), 1) : ""}</td><td><input value="${row.action}"${boundaryLine ? " readonly" : ""}></td><td>${lineControl}</td>`;
    const inputs = tr.querySelectorAll("input, select");
    const sourceIndex = row.simulationSourceIndex;
    inputs[0].addEventListener("change", () => {
      setSimulationCommand(sourceIndex, inputs[0].value);
      render();
    });
    inputs[1].addEventListener("change", () => {
      state.simulation.useCustom = true;
      state.simulation.lines[sourceIndex] = { ...state.simulation.lines[sourceIndex], tableAngle: num(inputs[1].value, row.tableAngle) };
      render();
    });
    inputs[2].addEventListener("change", () => {
      state.simulation.useCustom = true;
      state.simulation.lines[sourceIndex] = { ...state.simulation.lines[sourceIndex], plateAngle: inputs[2].value === "" ? null : num(inputs[2].value, row.plateAngle) };
      render();
    });
    inputs[3].addEventListener("input", () => {
      state.simulation.useCustom = true;
      state.simulation.lines[sourceIndex] = { ...state.simulation.lines[sourceIndex], action: inputs[3].value };
      renderMap();
    });
    tr.querySelector(".simulation-delete-line")?.addEventListener("click", () => {
      deleteSimulationLine(sourceIndex);
      render();
    });
    tr.querySelector(".simulation-add-line")?.addEventListener("click", () => {
      addSimulationLineBeforeEnd();
      render();
    });
    body.appendChild(tr);
  });
}

function renderHeads() {
  els.heads.innerHTML = `<table><thead><tr><th>Head</th><th class="num">Home angle</th><th class="num">Current table angle</th><th class="num">Plate angle</th><th class="num">X</th><th class="num">Y</th></tr></thead><tbody></tbody></table>`;
  const body = els.heads.querySelector("tbody");
  heads().forEach((h) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${h.head}</td><td class="num">${fmt(h.angle, 3)}</td><td class="num">${fmt(h.tableAngle, 3)}</td><td class="num">${fmt(plateAngleAt(h.tableAngle), 1)}</td><td class="num">${fmt(h.x)}</td><td class="num">${fmt(h.y)}</td>`;
    body.appendChild(tr);
  });
}

function renderValidation() {
  els.pitchReadout.textContent = `${fmt(360 / state.headCount, 3)} deg/head`;
  els.playPause.textContent = state.isPlaying ? "Pause" : "Play";
  els.validationDetails.innerHTML = `<div><span>Brand</span><strong>${state.selectedBrand || "-"}</strong></div><div><span>Bottle</span><strong>${state.selectedBottle || "-"}</strong></div><div><span>Application</span><strong>${state.applicationMode === "cold-glue" ? "Cold Glue" : "APL"}</strong></div>${state.simulation.useCustom ? '<div><span>Preview</span><strong>Custom servo turns</strong></div>' : ""}`;
  const visibleIssues = validate().filter(([type, text]) => type !== "ok" || /Label Sensor.*can view/i.test(String(text)));
  els.validationList.innerHTML = visibleIssues.map(([type, text, meta]) => `<div class="notice ${type === "bad" ? "bad" : type === "warn" ? "warn" : ""}${meta?.objectId ? " clickable-validation" : ""}"${meta?.objectId ? ` data-validation-object-id="${meta.objectId}" title="Open this object in Map Builder"` : ""}>${text}</div>`).join("");
  els.validationList.querySelectorAll("[data-validation-object-id]").forEach((notice) => notice.addEventListener("click", () => selectMapBuilderObject(notice.dataset.validationObjectId)));
  renderWipeDownData();
}

function wipeSectionFromRow(row) {
  const explicit = String(row?.section || "").toLowerCase();
  if (["neck", "body", "back"].includes(explicit)) return explicit;
  const match = String(row?.action || "").match(/\b(neck|body|back)\b/i);
  return match ? match[1].toLowerCase() : null;
}

function wipeLabelLengthMm(section, label = selectedLabelSpec()) {
  if (section === "neck") return Math.max(num(label?.neckBottomCurveMm, 0), num(label?.neckLengthMm, 0));
  if (section === "body") return num(label?.bodyLengthMm, 0);
  if (section === "back") return num(label?.backLengthMm, 0);
  return 0;
}

function tableAngleWithinObject(angle, item, padding = 0.5) {
  const point = Number(item?.angle);
  if (Number.isFinite(point)) return Math.abs(signedAngleDifference(angle, point)) <= Math.max(2, padding);
  const start = Number(item?.start);
  const end = Number(item?.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  const span = ((end - start) % 360 + 360) % 360;
  const relative = ((norm(angle) - norm(start)) % 360 + 360) % 360;
  return relative <= span + padding || relative >= 360 - padding;
}

function wipeStationContextAtAngle(tableAngle) {
  const machineMap = typeof activeMachineMap === "function" ? activeMachineMap() : null;
  const objects = Array.isArray(machineMap?.objects) ? machineMap.objects : [];
  const candidates = objects.filter((item) => ["brush", "pad", "roller", "wipe"].includes(String(item?.kind || "")) && Number.isFinite(Number(item?.station)) && tableAngleWithinObject(tableAngle, item));
  if (!candidates.length) return null;
  const item = candidates[0];
  const station = Math.max(1, Math.min(6, Math.round(Number(item.station))));
  return { station, section: labelSectionForStation(station), object: item };
}

function wipeContextForSegment(row) {
  const start = Number(row?.tableAngle);
  const travel = Number(row?.tableTravel);
  const sampleAngles = [start];
  if (Number.isFinite(travel) && travel > 0) sampleAngles.push(start + travel / 2, start + Math.max(0, travel - 0.01));
  const physical = sampleAngles.map(wipeStationContextAtAngle).find(Boolean);
  if (physical) return physical;
  if (/wipe|brush/i.test(String(row?.action || ""))) {
    const section = wipeSectionFromRow(row);
    if (section) return { station: Number(row?.station) || null, section, object: null };
  }
  return null;
}

function wipeObjectsForSection(section, station = null) {
  const machineMap = typeof activeMachineMap === "function" ? activeMachineMap() : null;
  return (Array.isArray(machineMap?.objects) ? machineMap.objects : []).filter((item) => {
    if (!["brush", "pad", "roller", "wipe"].includes(String(item?.kind || ""))) return false;
    const itemStation = Number(item?.station);
    return Number.isFinite(itemStation)
      && labelSectionForStation(itemStation) === section
      && (!Number.isFinite(Number(station)) || itemStation === Number(station));
  });
}

function objectContactIntervals(item, minimum, maximum) {
  const point = Number(item?.angle);
  const rawStart = Number.isFinite(point) ? point - 1 : Number(item?.start);
  const rawEnd = Number.isFinite(point) ? point + 1 : Number(item?.end);
  if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd) || maximum <= minimum) return [];
  let span = rawEnd - rawStart;
  while (span < 0) span += 360;
  span = Math.min(360, span);
  const normalizedStart = norm(rawStart);
  const intervals = [];
  for (let turn = Math.floor((minimum - normalizedStart) / 360) - 1; turn <= Math.ceil((maximum - normalizedStart) / 360) + 1; turn += 1) {
    const start = normalizedStart + turn * 360;
    const end = start + span;
    const clippedStart = Math.max(minimum, start);
    const clippedEnd = Math.min(maximum, end);
    if (clippedEnd > clippedStart) intervals.push([clippedStart, clippedEnd]);
  }
  return intervals;
}

function mergedIntervalLength(intervals) {
  const sorted = intervals.filter((range) => Number.isFinite(range?.[0]) && Number.isFinite(range?.[1]) && range[1] > range[0]).sort((a, b) => a[0] - b[0]);
  if (!sorted.length) return 0;
  const merged = [sorted[0].slice()];
  sorted.slice(1).forEach(([start, end]) => {
    const last = merged[merged.length - 1];
    if (start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  });
  return merged.reduce((sum, [start, end]) => sum + end - start, 0);
}

function wipeObjectSideForRow(row) {
  const stage = String(row?.stage || row?.brushStage || "").toLowerCase();
  if (/outer|outer-pad/.test(stage)) return "outer";
  if (/inner|inner-pad/.test(stage)) return "inner";
  const action = String(row?.action || "");
  if (/wipe turn 1/i.test(action)) return "outer";
  if (/wipe turn 2/i.test(action)) return "inner";
  return null;
}

function contactedLabelCoverage(program, section, station, throughTableAngle, visual) {
  const objects = wipeObjectsForSection(section, station);
  const labelLengthMm = wipeLabelLengthMm(section);
  const label = selectedLabelSpec();
  const circumferenceMm = section === "neck" ? num(label?.neckBottomCircumferenceMm, 0) : bodyCircumference(selectedBottleSpec());
  const labelDegrees = degFromMm(labelLengthMm, circumferenceMm);
  if (!objects.length || !Number.isFinite(labelDegrees) || labelDegrees <= 0) return { percentage: 0, leftPercent: 0, rightPercent: 0 };
  const intervalsByVisualSide = { left: [], right: [] };
  const leadingIntervals = [];
  const physicalSides = new Set(objects.map((item) => item?.side === "inner" ? "inner" : "outer"));
  const usesOppositeContactSides = physicalSides.size > 1;
  programSegments(program).forEach((row) => {
    const tableStart = Number(row.tableAngle);
    const tableTravel = Number(row.tableTravel);
    const plateStart = Number(row.plateAngle);
    const plateTravel = Number(row.plateTravel);
    if (Number(row.cmd) !== 7 || !Number.isFinite(tableStart) || !Number.isFinite(tableTravel) || tableTravel <= 0 || !Number.isFinite(plateStart) || !Number.isFinite(plateTravel)) return;
    const tableEnd = Math.min(tableStart + tableTravel, throughTableAngle);
    if (tableEnd <= tableStart) return;
    const commandedSide = wipeObjectSideForRow(row);
    const matchingSideObjects = commandedSide
      ? objects.filter((item) => (item?.side === "inner" ? "inner" : "outer") === commandedSide)
      : [];
    // Neck roller stations have distinct outer and inner objects, so each turn
    // must use its matching family. Body/back stations commonly have one outer
    // pad that remains in contact for both turns; when no matching inner object
    // exists, retain that single physical pad as the contact surface.
    const contactObjects = matchingSideObjects.length ? matchingSideObjects : objects;
    contactObjects.forEach((item) => {
      objectContactIntervals(item, tableStart, tableEnd).forEach(([contactStart, contactEnd]) => {
        const startProgress = (contactStart - tableStart) / tableTravel;
        const endProgress = (contactEnd - tableStart) / tableTravel;
        const bottleStart = plateStart + plateTravel * startProgress;
        const bottleEnd = plateStart + plateTravel * endProgress;
        const bottleInterval = [Math.min(bottleStart, bottleEnd), Math.max(bottleStart, bottleEnd)];
        if (visual.tackMode === "leading") {
          leadingIntervals.push(bottleInterval);
          return;
        }
        let visualSide;
        if (usesOppositeContactSides) {
          const physicalSide = item?.side === "inner" ? "inner" : "outer";
          visualSide = state.direction === "cw"
            ? (physicalSide === "inner" ? "right" : "left")
            : (physicalSide === "inner" ? "left" : "right");
        } else {
          const movesRightToLeft = plateTravel >= 0 ? state.direction !== "cw" : state.direction === "cw";
          visualSide = movesRightToLeft ? "left" : "right";
        }
        intervalsByVisualSide[visualSide].push(bottleInterval);
      });
    });
  });
  const halfLabel = labelDegrees / 2;
  let leftDegrees = 0;
  let rightDegrees = 0;
  if (visual.tackMode === "leading") {
    const contactedDegrees = Math.min(labelDegrees, mergedIntervalLength(leadingIntervals));
    if (visual.direction === "rtl") {
      rightDegrees = Math.min(halfLabel, contactedDegrees);
      leftDegrees = Math.min(halfLabel, Math.max(0, contactedDegrees - halfLabel));
    } else {
      leftDegrees = Math.min(halfLabel, contactedDegrees);
      rightDegrees = Math.min(halfLabel, Math.max(0, contactedDegrees - halfLabel));
    }
  } else {
    leftDegrees = Math.min(halfLabel, mergedIntervalLength(intervalsByVisualSide.left));
    rightDegrees = Math.min(halfLabel, mergedIntervalLength(intervalsByVisualSide.right));
  }
  const leftPercent = Math.max(0, Math.min(100, 100 * leftDegrees / halfLabel));
  const rightPercent = Math.max(0, Math.min(100, 100 * rightDegrees / halfLabel));
  const percentage = (leftPercent + rightPercent) / 2;
  const stagedBackspinPercent = visual.tackMode === "leading"
    ? Math.min(percentage, visual.backspinPercent)
    : 0;
  const backspinFillPercent = visual.tackMode === "leading" && visual.backspinPercent > 0
    ? Math.max(0, Math.min(100, 100 * stagedBackspinPercent / visual.backspinPercent))
    : 0;
  const mainWipePercent = visual.tackMode === "leading"
    ? Math.max(0, Math.min(100 - visual.backspinPercent, percentage - visual.backspinPercent))
    : 0;
  return { percentage, leftPercent, rightPercent, backspinFillPercent, mainWipePercent };
}

function wipeVisualApplication(section, labelLengthMm) {
  const neckLeading = section === "neck" && state.buildInputs.neckApplication === "Leading Edge";
  const tackMode = section === "neck" && !neckLeading ? "center" : "leading";
  const direction = state.direction === "cw" ? "ltr" : "rtl";
  const backspinMm = section === "neck"
    ? num(state.buildInputs.neckContactMm, 0)
    : section === "body"
      ? num(state.buildInputs.bodyContactMm, 5)
      : section === "back"
        ? num(state.buildInputs.backContactMm, 5)
        : 0;
  const backspinPercent = labelLengthMm > 0 ? Math.max(0, Math.min(100, 100 * backspinMm / labelLengthMm)) : 0;
  return { tackMode, direction, backspinMm, backspinPercent };
}

function wipeDownTelemetry(program = currentProgram(), tableAngle = state.previewAngle) {
  const segments = programSegments(program);
  const active = activeSegmentForProgram(program, tableAngle);
  const activePhysical = wipeStationContextAtAngle(tableAngle);
  const activeExplicitSection = /wipe|brush/i.test(String(active?.action || "")) ? wipeSectionFromRow(active) : null;
  const wipeRows = segments.map((row) => ({ row, context: wipeContextForSegment(row) })).filter(({ row, context }) => Number(row.cmd) === 7 && context?.section);
  let context = activePhysical || (activeExplicitSection ? { section: activeExplicitSection, station: Number(active?.station) || null } : null);
  if (!context?.section) {
    const nearby = [...wipeRows].reverse().find(({ row }) => Number(row.tableAngle) <= tableAngle) || wipeRows.find(({ row }) => Number(row.tableAngle) > tableAngle);
    context = nearby?.context || null;
  }
  const section = context?.section || null;
  const station = Number.isFinite(Number(context?.station)) ? Number(context.station) : null;
  const labelLengthMm = wipeLabelLengthMm(section);
  const visual = wipeVisualApplication(section, labelLengthMm);
  const coverage = section ? contactedLabelCoverage(program, section, station, tableAngle, visual) : { percentage: 0, leftPercent: 0, rightPercent: 0 };
  const sectionLabel = section ? `${section[0].toUpperCase()}${section.slice(1)} label${station ? ` • Station ${station}` : ""}` : "Waiting for label";
  return {
    section,
    station,
    sectionLabel,
    labelLengthMm,
    currentTurn: String(active?.action || "Waiting for wipe-down"),
    plateAngle: plateAngleAt(tableAngle, program),
    ...coverage,
    ...visual
  };
}

function renderWipeDownData() {
  if (!els.wipeDownDataPanel) return;
  const data = wipeDownTelemetry();
  const percentage = Math.round(data.percentage * 10) / 10;
  els.wipeLabelSection.textContent = data.sectionLabel;
  els.wipeLabelLength.textContent = data.labelLengthMm > 0 ? `${fmt(data.labelLengthMm, 1)} mm` : "-";
  els.wipeCurrentTurn.textContent = data.currentTurn;
  els.wipePlateAngle.textContent = `${fmt(data.plateAngle, 1)}°`;
  els.wipePercent.textContent = `${fmt(percentage, 1)}%`;
  els.wipeProgressText.textContent = `${fmt(percentage, 1)}% wiped`;
  if (data.tackMode === "leading") {
    els.wipeLeftSurfaceFill.style.width = `${data.mainWipePercent}%`;
    els.wipeRightSurfaceFill.style.width = "0%";
    els.wipeBackspinFill.style.width = `${data.backspinFillPercent}%`;
  } else {
    els.wipeLeftSurfaceFill.style.width = `${data.leftPercent / 2}%`;
    els.wipeRightSurfaceFill.style.width = `${data.rightPercent / 2}%`;
    els.wipeBackspinFill.style.width = "0%";
  }
  els.wipeLabelGraphic.classList.toggle("wipe-mode-center", data.tackMode === "center");
  els.wipeLabelGraphic.classList.toggle("wipe-mode-leading", data.tackMode === "leading");
  els.wipeLabelGraphic.classList.toggle("wipe-direction-rtl", data.direction === "rtl");
  els.wipeLabelGraphic.classList.toggle("wipe-direction-ltr", data.direction === "ltr");
  els.wipeLabelGraphic.style.setProperty("--backspin-width", `${data.backspinPercent}%`);
  els.wipeTackLine.hidden = data.tackMode !== "center";
  els.wipeLeadingBackspin.hidden = data.tackMode !== "leading";
  els.wipeTackText.textContent = "Center tack";
  els.wipeBackspinText.textContent = `${fmt(data.backspinMm, 1)} mm backspin`;
  if (data.tackMode === "center") {
    els.wipeLeftEdge.textContent = `Left • ${fmt(data.leftPercent, 1)}%`;
    els.wipeRightEdge.textContent = `Right • ${fmt(data.rightPercent, 1)}%`;
    els.wipeDirectionText.textContent = "Center → edges";
    els.wipeApplicationText.textContent = "Center tack";
  } else if (data.direction === "rtl") {
    els.wipeLeftEdge.textContent = `Trailing • ${fmt(data.leftPercent, 1)}%`;
    els.wipeRightEdge.textContent = `Leading • ${fmt(data.rightPercent, 1)}%`;
    els.wipeDirectionText.textContent = "Right → left";
    els.wipeApplicationText.textContent = "Leading edge";
  } else {
    els.wipeLeftEdge.textContent = `Leading • ${fmt(data.leftPercent, 1)}%`;
    els.wipeRightEdge.textContent = `Trailing • ${fmt(data.rightPercent, 1)}%`;
    els.wipeDirectionText.textContent = "Left → right";
    els.wipeApplicationText.textContent = "Leading edge";
  }
  const directionDescription = data.tackMode === "center" ? "from the center tack toward both edges" : data.direction === "rtl" ? "from the right leading edge toward the left" : "from the left leading edge toward the right";
  els.wipeLabelGraphic.setAttribute("aria-label", `${fmt(percentage, 1)}% total ${data.sectionLabel.toLowerCase()} surface wiped ${directionDescription}; left side ${fmt(data.leftPercent, 1)}%, right side ${fmt(data.rightPercent, 1)}%`);
}

function renderTopControls() {
  const showSimulationActions = state.activeTab === "simulation";
  els.loadGeneratedTurns.hidden = !showSimulationActions;
  els.clearCustomTurns.hidden = !showSimulationActions;
}

function renderAnimationFrame() {
  // Animation-only rendering must stay lightweight. Rebuilding validation on
  // every frame can stall the browser and make playback appear frozen.
  els.previewAngle.value = fmt(state.previewAngle, 3);
  if (els.tableAngleJump && document.activeElement !== els.tableAngleJump) {
    els.tableAngleJump.value = fmt(norm(state.previewAngle), 1);
  }
  updateMapAnimationFrame();
  updateActiveServoProgramRow();
  renderWipeDownData();
  if (state.activeTab === "simulation") updateSimulationAnimationFrame();
  els.playPause.textContent = state.isPlaying ? "Pause" : "Play";
}

function render() {
  ensurePersistentApplicationMaps();
  ensureSelectedBrandForApplication();
  applyLabelLengthStationRules();
  syncApplicationMapToLegacyState();
  syncMapPointsFromAssemblies();
  applyGeneratedServoProfile();
  renderMap();
  if (els.stations) renderStations();
  renderBottleSpecs();
  renderLabelSpecs();
  renderBuildInputs();
  renderProgram();
  renderSimulation();
  renderHeads();
  renderValidation();
  renderTopControls();
}
