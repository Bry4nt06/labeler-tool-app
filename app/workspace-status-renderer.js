"use strict";

function renderValidation() {
  els.pitchReadout.textContent = `${fmt(360 / state.headCount, 3)} deg/head`;
  els.playPause.textContent = state.isPlaying ? "Pause" : "Play";
  els.validationDetails.innerHTML = `<div><span>Brand</span><strong>${state.selectedBrand || "-"}</strong></div><div><span>Bottle</span><strong>${state.selectedBottle || "-"}</strong></div><div><span>Application</span><strong>${state.applicationMode === "cold-glue" ? "Cold Glue" : "APL"}</strong></div>${state.simulation.useCustom ? '<div><span>Preview</span><strong>Custom servo turns</strong></div>' : ""}`;
  const visibleIssues = validate().filter(([type, text]) => type !== "ok" || /Label Sensor.*can view/i.test(String(text)));
  els.validationList.innerHTML = visibleIssues.map(([type, text, meta]) => `<div class="notice ${type === "bad" ? "bad" : type === "warn" ? "warn" : ""}${meta?.objectId ? " clickable-validation" : ""}"${meta?.objectId ? ` data-validation-object-id="${meta.objectId}" title="Open this object in Map Builder"` : ""}>${text}</div>`).join("");
  renderWipeDownData();
}

function renderTopControls() {
  const showSimulationActions = state.activeTab === "simulation";
  els.loadGeneratedTurns.hidden = !showSimulationActions;
  els.clearCustomTurns.hidden = !showSimulationActions;
}

function renderAnimationFrame() {
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

window.LabelerWorkspaceStatusRenderer = Object.freeze({
  renderValidation,
  renderTopControls,
  renderAnimationFrame
});
