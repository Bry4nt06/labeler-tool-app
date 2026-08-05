"use strict";

(function installGlobalMachineParameterDefaults(global) {
  if (global.LabelerGlobalMachineParameterDefaults) return;

  // Center Line Front is derived by the current APL model as:
  // -(90 - neckSpenderPlateDeg) + plateStartPositionDeg.
  // A 75-degree spender plate therefore uses a 15-degree starting position
  // to produce the requested zero-degree front centerline.
  const DEFAULT_BUILD_INPUTS = Object.freeze({
    neckSpenderPlateDeg: 75,
    neckApplication: "Center",
    plateStartPositionDeg: 15,
    neckContactMm: 0,
    bodyContactMm: 0,
    backContactMm: 0
  });

  const LEGACY_BUILD_INPUTS = Object.freeze({
    neckSpenderPlateDeg: 75,
    neckApplication: "Center",
    plateStartPositionDeg: 0,
    neckContactMm: 4.4,
    bodyContactMm: 5,
    backContactMm: 5
  });

  function apply(targetState) {
    if (!targetState || typeof targetState !== "object") return false;
    targetState.buildInputs = {
      ...(targetState.buildInputs || {}),
      ...DEFAULT_BUILD_INPUTS
    };
    return true;
  }

  function matchesLegacyDefaults(buildInputs = {}) {
    return Object.entries(LEGACY_BUILD_INPUTS)
      .every(([key, value]) => buildInputs?.[key] === value);
  }

  function migrateUntouchedLegacyDefaults(targetState) {
    if (!targetState || !matchesLegacyDefaults(targetState.buildInputs)) return false;
    return apply(targetState);
  }

  // Establish the new fallback before loadSavedSettings(). Saved build inputs
  // are merged afterward and remain authoritative.
  const applied = typeof state !== "undefined" ? apply(state) : false;

  // Existing workspaces that still contain the complete previous default tuple
  // are treated as untouched defaults and migrated. Any changed parameter makes
  // the tuple different, so explicit user settings are preserved.
  const baseLoadSavedSettings = global.loadSavedSettings;
  if (typeof baseLoadSavedSettings === "function" && !baseLoadSavedSettings.globalMachineDefaultsWrapped) {
    const wrappedLoadSavedSettings = function loadSavedSettingsWithMachineDefaults(...args) {
      const result = baseLoadSavedSettings.apply(this, args);
      if (typeof state !== "undefined") migrateUntouchedLegacyDefaults(state);
      return result;
    };
    wrappedLoadSavedSettings.globalMachineDefaultsWrapped = true;
    wrappedLoadSavedSettings.previousLoadSavedSettings = baseLoadSavedSettings;
    global.loadSavedSettings = wrappedLoadSavedSettings;
  }

  global.LabelerGlobalMachineParameterDefaults = Object.freeze({
    DEFAULT_BUILD_INPUTS,
    LEGACY_BUILD_INPUTS,
    apply,
    matchesLegacyDefaults,
    migrateUntouchedLegacyDefaults,
    applied
  });
})(typeof window !== "undefined" ? window : globalThis);
