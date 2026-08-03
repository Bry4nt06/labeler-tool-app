"use strict";

// Global browser actions are owned by focused controllers loaded through the
// bootstrap pipeline. This compatibility function intentionally registers no
// listeners and performs no state mutation, persistence, regeneration, or
// rendering work.
function bindGlobalActions() {
  return true;
}

window.LabelerGlobalActions = Object.freeze({
  bind: bindGlobalActions,
  compatibilityOnly: true,
  owners: Object.freeze({
    settings: "LabelerSettingsController",
    panels: "LabelerWorkspacePanelController",
    tabs: "LabelerTabsController",
    transfer: "LabelerTransferController",
    simulation: "LabelerSimulationController",
    events: "LabelerSetupEventControllers",
    state: "LabelerSetupStateController"
  })
});
