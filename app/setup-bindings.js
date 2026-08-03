"use strict";

// Setup state hydration and browser events are owned by focused controllers
// loaded through the bootstrap pipeline. This compatibility marker defines no
// listeners, mutations, persistence, or rendering behavior.
window.LabelerSetupBindingsCompatibility = Object.freeze({
  stateOwner: "LabelerSetupStateController",
  eventOwner: "LabelerSetupEventControllers",
  mapOwner: "LabelerMapController",
  settingsOwner: "LabelerSettingsController"
});
