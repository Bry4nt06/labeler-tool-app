"use strict";

// Compatibility-only API for settings created before machine maps became
// global records. Active DOM enforcement, storage cleanup, save/delete
// interception, and runtime wrappers live in remove-zone-site-integration.js.

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

  document
    .querySelectorAll(".zone-site-editor,.zone-site-selection,.developer-menu-actions")
    .forEach((node) => node.remove());
}

// Retained no-op compatibility functions for older modules and imported
// settings. New code must not use Zone/Site as map identity.
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
