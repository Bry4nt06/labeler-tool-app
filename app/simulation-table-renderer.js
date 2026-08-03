"use strict";

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

function renderSimulation() {
  ensureSimulationRows();
  const simProgram = simulationProgram();
  const segments = programSegments(simProgram);
  const maxSpeed = segments.reduce((best, segment) => Number.isFinite(segment.absSpeed) && segment.absSpeed > (best?.absSpeed ?? -Infinity) ? segment : best, null);
  els.simulation.innerHTML = `${servoProfileLibraryMarkup()}
    <div class="sim-tools">
      <div class="sim-summary">${maxSpeed ? `Max custom speed: ${fmt(finishAngle(maxSpeed.absSpeed), 1)} deg bottle / 1 deg table at HMI ${maxSpeed.hmi}` : "Enter custom turns to calculate speed."}</div>
    </div>
    <table><thead><tr><th>HMI</th><th>PLC</th><th>${activeMachineUsesAutocolCommands() ? "Travel command" : "CMD"}</th><th class="num">Table angle</th><th class="num">Plate angle</th><th class="num">Table travel</th><th class="num">Plate travel</th><th class="num">Encoder travel</th><th>Status</th><th class="num">Turn speed</th><th>Action</th><th>Line</th></tr></thead><tbody></tbody></table>`;

  const body = els.simulation.querySelector("tbody");
  segments.forEach((row, index) => {
    const status = row.moveFault
      ? ["status-bad", `FAULT ${fmt(finishAngle(row.absSpeed), 1)} >= ${fmt(finishAngle(state.maxMoveRatio), 1)}`]
      : !Number.isFinite(row.plateAngle) && row.cmd !== 0
        ? ["status-warn", "Needs plate angle"]
        : ["status-ok", "OK"];
    const tr = document.createElement("tr");
    tr.dataset.simulationSourceIndex = String(row.simulationSourceIndex);
    if (row.moveFault) tr.classList.add("move-fault-row");
    const speedClass = maxSpeed && row.hmi === maxSpeed.hmi && row.absSpeed > 0 ? "speed-max" : "";
    const boundaryLine = ["start-shape", "end-curve"].includes(row.autocolBoundary);
    const lineControl = row.autocolBoundary === "end-curve"
      ? `<button class="small-button simulation-add-line" type="button" title="Add one simulator line above End curve">Add</button>`
      : row.autocolBoundary === "start-shape"
        ? ""
        : `<span class="simulation-line-actions"><button class="small-button simulation-insert-pair" type="button" data-simulation-line-index="${index}" title="Insert a Correction and Rest pair below this line" aria-label="Insert Correction and Rest below HMI ${row.hmi}">+</button><button class="danger small-button simulation-delete-line" type="button" title="Delete this simulator line">Delete</button></span>`;
    tr.innerHTML = `<td>${row.hmi}</td><td>${row.plc}</td><td>${servoCommandControl(row, true, 'data-simulation-field="command"')}</td><td><input class="num compact-input" data-simulation-field="tableAngle" type="number" step="0.5" value="${fmt(row.tableAngle, 1)}"${boundaryLine ? " readonly" : ""}></td><td><input class="num compact-input" data-simulation-field="plateAngle" type="number" step="0.5" value="${Number.isFinite(row.plateAngle) ? fmt(row.plateAngle, 1) : ""}"></td><td class="num">${fmt(row.tableTravel, 1)}</td><td class="num">${fmt(row.plateTravel, 1)}</td><td class="num">${Number.isFinite(row.plateTravel) ? fmt(finishAngle(window.LabelerGeometryDriver?.encoderCountsFromPlateDegrees(row.plateTravel, state.encoderCountsPerRev, state.servoGearRatio)), 1) : ""}</td><td class="${status[0]}">${status[1]}</td><td class="num ${speedClass}">${Number.isFinite(row.absSpeed) ? fmt(finishAngle(row.absSpeed), 1) : ""}</td><td><input data-simulation-field="action" value="${row.action}"${boundaryLine ? " readonly" : ""}></td><td>${lineControl}</td>`;
    body.appendChild(tr);
  });
}

window.LabelerSimulationTableRenderer = Object.freeze({
  escapeServoProfileHtml,
  servoProfileSavedDate,
  currentServoProfileContext,
  servoProfileLibraryMarkup,
  renderSimulation
});
