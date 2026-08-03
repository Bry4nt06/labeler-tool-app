"use strict";

(function installWorkspacePanelController(global) {
  if (global.LabelerWorkspacePanelController?.installed) return;

  const WIPE_DATA_VISIBILITY_KEY = "servoforgeWipeDataPanelVisible";

  function readWipeDataVisibility() {
    try {
      const saved = global.localStorage?.getItem(WIPE_DATA_VISIBILITY_KEY);
      return saved === null || saved === undefined ? true : saved !== "false";
    } catch {
      return true;
    }
  }

  function persistWipeDataVisibility(visible) {
    try {
      global.localStorage?.setItem(WIPE_DATA_VISIBILITY_KEY, String(Boolean(visible)));
    } catch {
      // The panel remains usable when browser storage is unavailable.
    }
  }

  function removeEmptyValidationActions() {
    const actions = document.querySelector(".validation-head-actions");
    if (actions && actions.childElementCount === 0) actions.remove();
  }

  function ensureAggregateOverlayControl() {
    let input = document.querySelector("#showAggregateSpacingOverlay");
    const legacyButton = document.querySelector("#toggleAggregateSpacing") || els.toggleAggregateSpacing;

    if (!input) {
      const panel = document.querySelector(".map-overlay-control");
      if (!panel) return null;
      const label = document.createElement("label");
      label.className = "switch-setting";
      label.htmlFor = "showAggregateSpacingOverlay";
      label.innerHTML = `
        <span class="switch-copy"><strong>Aggregate travel distance</strong><small>Show the travel distance between active aggregates on the mechanical map.</small></span>
        <span class="switch-control"><input id="showAggregateSpacingOverlay" type="checkbox" /><span class="switch-track" aria-hidden="true"></span></span>`;
      panel.appendChild(label);
      input = label.querySelector("#showAggregateSpacingOverlay");
    }

    legacyButton?.remove();
    removeEmptyValidationActions();
    if (input) {
      input.checked = Boolean(state.showAggregateSpacingOverlay);
      els.showAggregateSpacingOverlay = input;
    }
    return input;
  }

  function ensureWipeDataSetting() {
    let input = document.querySelector("#showWipeDataPanel");
    if (!input) {
      const settingsPanel = document.querySelector(".top-settings-panel");
      if (!settingsPanel) return null;
      const label = document.createElement("label");
      label.className = "switch-setting";
      label.htmlFor = "showWipeDataPanel";
      label.innerHTML = `
        <span class="switch-copy"><strong>Show Wipe Data panel</strong><small>Keep live label wipe-down telemetry visible in the workspace.</small></span>
        <span class="switch-control"><input id="showWipeDataPanel" type="checkbox" /><span class="switch-track" aria-hidden="true"></span></span>`;
      settingsPanel.insertBefore(label, els.saveSettings || null);
      input = label.querySelector("#showWipeDataPanel");
    }
    if (input) els.showWipeDataPanel = input;
    return input;
  }

  function normalizeWipeDataPanel() {
    const panel = els.wipeDownDataPanel || document.querySelector("#wipeDownDataPanel");
    document.querySelector("#showWipeDownData")?.remove();
    document.querySelector("#closeWipeDownData")?.remove();
    removeEmptyValidationActions();
    if (!panel) return null;
    panel.removeAttribute("role");
    panel.removeAttribute("aria-modal");
    panel.removeAttribute("aria-labelledby");
    panel.setAttribute("aria-label", "Label wipe-down data");
    panel.classList.add("persistent-wipe-data-panel");
    return panel;
  }

  function setWipeDataVisible(visible, options = {}) {
    const panel = els.wipeDownDataPanel || document.querySelector("#wipeDownDataPanel");
    const input = els.showWipeDataPanel || document.querySelector("#showWipeDataPanel");
    const active = Boolean(visible);
    state.showWipeDataPanel = active;
    if (panel) panel.hidden = !active;
    if (input) input.checked = active;
    if (options.persist !== false) persistWipeDataVisibility(active);
    if (active && typeof renderWipeDownData === "function") renderWipeDownData();
    return active;
  }

  function setAggregateSpacingVisible(visible) {
    const active = Boolean(visible);
    if (global.LabelerSettingsController?.setAggregateSpacing) {
      global.LabelerSettingsController.setAggregateSpacing(active);
    } else {
      state.showAggregateSpacingOverlay = active;
      if (typeof saveCurrentSettings === "function") saveCurrentSettings();
      if (typeof renderMap === "function") renderMap();
    }
    const input = els.showAggregateSpacingOverlay || document.querySelector("#showAggregateSpacingOverlay");
    if (input) input.checked = Boolean(state.showAggregateSpacingOverlay);
    return Boolean(state.showAggregateSpacingOverlay);
  }

  function initialize() {
    ensureAggregateOverlayControl();
    ensureWipeDataSetting();
    normalizeWipeDataPanel();
    const visible = state.showWipeDataPanel === undefined
      ? readWipeDataVisibility()
      : Boolean(state.showWipeDataPanel);
    setWipeDataVisible(visible, { persist: false });
  }

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.id === "showAggregateSpacingOverlay") {
      setAggregateSpacingVisible(target.checked);
    } else if (target.id === "showWipeDataPanel") {
      setWipeDataVisible(target.checked);
    } else {
      return;
    }

    event.stopImmediatePropagation();
  }, true);

  global.LabelerWorkspacePanelController = Object.freeze({
    installed: true,
    initialize,
    setWipeDataVisible,
    setAggregateSpacingVisible,
    ensureAggregateOverlayControl,
    ensureWipeDataSetting
  });
})(window);
