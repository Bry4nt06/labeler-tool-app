"use strict";

(function installSettingsResetController(global) {
  if (global.LabelerSettingsResetController?.installed) return;

  const BUTTON_ID = "resetAllSettings";
  const NOTE_ID = "resetAllSettingsNote";

  function installButton() {
    const panel = document.querySelector(".top-settings-panel");
    if (!panel || document.getElementById(BUTTON_ID)) return false;

    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.className = "danger";
    button.textContent = "Reset All Settings";

    const note = document.createElement("small");
    note.id = NOTE_ID;
    note.className = "settings-reset-note";
    note.textContent = "Restores packaged maps, Bottle Specs, Label Specs, profiles, and workspace preferences.";

    const feedback = panel.querySelector("#giveFeedback");
    panel.insertBefore(button, feedback || null);
    panel.insertBefore(note, feedback || null);
    return true;
  }

  function confirmReset() {
    return global.confirm(
      "Reset ServoForge to the packaged defaults?\n\n"
      + "This removes saved custom maps, Bottle Specs, Label Specs, servo profiles, overrides, and workspace preferences from this browser. "
      + "This action cannot be undone unless you exported your settings."
    );
  }

  function restoreResetButton(button) {
    if (!button) return;
    button.disabled = false;
    button.textContent = "Reset All Settings";
  }

  function reset() {
    if (!confirmReset()) return false;
    const button = document.getElementById(BUTTON_ID);
    if (button) {
      button.disabled = true;
      button.textContent = "Resetting…";
    }

    const persistence = global.LabelerLocalPersistenceController;
    persistence?.suspend();

    const service = global.LabelerCompanyDefaultsService;
    if (!service?.resetToDefaults) {
      persistence?.resume({ flushNow: false });
      restoreResetButton(button);
      global.alert("Company defaults are still loading. Try the reset again after ServoForge finishes starting.");
      return false;
    }

    try {
      service.resetToDefaults();
      return true;
    } catch (error) {
      persistence?.resume({ flushNow: false });
      restoreResetButton(button);
      global.alert(`Unable to reset ServoForge: ${error?.message || error}`);
      return false;
    }
  }

  document.addEventListener("click", (event) => {
    const button = event.target?.closest?.(`#${BUTTON_ID}`);
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    reset();
  }, true);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installButton, { once: true });
  } else {
    installButton();
  }

  global.LabelerSettingsResetController = Object.freeze({
    installed: true,
    installButton,
    reset
  });
})(window);
