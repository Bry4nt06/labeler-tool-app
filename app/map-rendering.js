"use strict";

// Map rendering is owned by focused presentation modules loaded through the
// readiness-gated feature manifest. This compatibility marker intentionally
// defines no renderers, event handlers, state mutations, or persistence.
window.LabelerMapRenderingCompatibility = Object.freeze({
  owners: Object.freeze([
    "LabelerBottleVisualRenderer",
    "LabelerMapOverlayRenderer",
    "LabelerMapReferencePresenter",
    "LabelerMechanicalMapSceneRenderer",
    "LabelerSimulationMapSceneRenderer",
    "LabelerMapAnimationRenderer"
  ])
});
