"use strict";

// Compatibility-only migration for settings created before maps became
// global records. New maps and exports do not retain location metadata.
function purgeDeprecatedMapLocationMetadata(target = state) {
  if (!target || typeof target !== "object") return target;
  [
    "selected" + "Zone",
    "selected" + "Site",
    "mapLibrary" + "Zone",
    "mapLibrary" + "Site",
    "zoneSite" + "Configuration"
  ].forEach((key) => delete target[key]);
  if (Array.isArray(target.mapLibrary)) {
    target.mapLibrary.forEach((map) => {
      if (!map || typeof map !== "object") return;
      delete map.zone;
      delete map.site;
    });
  }
  return target;
}

function removeDeprecatedLocationControls() {
  ["#mapZone", "#mapSite"].forEach((selector) => {
    const control = document.querySelector(selector);
    (control?.closest("label") || control)?.remove();
  });
  document.querySelectorAll(".zone-site-editor,.zone-site-selection,.developer-menu-actions").forEach((node) => node.remove());
}

function normalizedZoneSiteName() {
  return "";
}

function normalizeZoneSiteConfiguration() {
  return { zones: {} };
}

function zoneNames() {
  return [];
}

function sitesForZone() {
  return [];
}

function ensureSelectedZoneAndSite() {
  purgeDeprecatedMapLocationMetadata();
}

function zoneSiteConfigurationDocument() {
  return {
    format: "servoforge-retired-location-metadata",
    version: 1,
    exportedAt: new Date().toISOString()
  };
}

function saveZoneSiteConfiguration() {
  purgeDeprecatedMapLocationMetadata();
  if (typeof saveCurrentSettings === "function") saveCurrentSettings();
}

function renderZoneSiteDeveloperMenu() {
  removeDeprecatedLocationControls();
}

function importZoneSiteConfigurationFile() {
  window.alert("Location configuration is no longer used. Maps are available globally by map name.");
}

function bindZoneSiteDeveloperMenu() {
  purgeDeprecatedMapLocationMetadata();
  removeDeprecatedLocationControls();
}

function bindRetiredLocationPromptGuard() {
  if (document.documentElement.dataset.retiredLocationPromptGuard === "true") return;
  document.documentElement.dataset.retiredLocationPromptGuard = "true";
  document.addEventListener("click", (event) => {
    const saveButton = event.target.closest?.("#saveMachineMap");
    if (saveButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      purgeDeprecatedMapLocationMetadata();
      if (typeof saveMapDefinitionFromControls === "function") {
        saveMapDefinitionFromControls({ type: "input" });
        purgeDeprecatedMapLocationMetadata();
        if (typeof saveCurrentSettings === "function") saveCurrentSettings();
        if (typeof renderWipeDownBuilder === "function") renderWipeDownBuilder();
      }
      return;
    }

    const deleteButton = event.target.closest?.("#deleteMachineMap");
    if (!deleteButton) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!Array.isArray(state.mapLibrary) || state.mapLibrary.length <= 1) {
      window.alert("At least one machine map must remain in the library.");
      return;
    }
    const index = state.mapLibrary.findIndex((map) => map.id === state.activeMapId);
    const map = state.mapLibrary[index];
    if (!map || !window.confirm(`Delete map "${map.name}"? This cannot be undone.`)) return;
    state.mapLibrary.splice(index, 1);
    purgeDeprecatedMapLocationMetadata();
    const replacement = state.mapLibrary[Math.max(0, index - 1)] || state.mapLibrary[0];
    if (typeof clearServoSimulationForSelectedMap === "function") clearServoSimulationForSelectedMap();
    if (typeof loadMachineMapIntoRuntime === "function") loadMachineMapIntoRuntime(replacement, true);
    if (typeof saveCurrentSettings === "function") saveCurrentSettings();
    if (typeof renderWipeDownBuilder === "function") renderWipeDownBuilder();
  }, true);
}

purgeDeprecatedMapLocationMetadata();
removeDeprecatedLocationControls();
bindRetiredLocationPromptGuard();
