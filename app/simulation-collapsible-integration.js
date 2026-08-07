"use strict";

(function loadServoForgeFeatureIntegrations() {
  const FEATURE_GROUPS = Object.freeze({
    coreDrivers: Object.freeze([
      "drivers/core/driver-registry.js?v=0.9.6-refactor-1",
      "drivers/core/legacy-driver-bridge.js?v=0.9.6-refactor-1",
      "drivers/validation/validation-issue-driver.js?v=0.9.7-validation-diagnostics-v1",
      "drivers/validation/validation-result-aggregator-driver.js?v=0.9.7-validation-diagnostics-v1",
      "drivers/assembly/assembly-model-driver.js?v=0.9.7-assembly-drivers-v1",
      "drivers/assembly/assembly-geometry-driver.js?v=0.9.7-assembly-drivers-v1",
      "drivers/rendering/render-cycle-driver.js?v=0.9.7-rendering-coordinator-v1",
      "drivers/profile/coder-orientation-driver.js?v=0.9.6-coder-driver-v1",
      "drivers/profile/map-object-orientation-driver.js?v=0.9.8-active-coder-fallback-v2",
      "drivers/profile/coder-handoff-driver.js?v=0.9.6-orientation-drivers-v1",
      "drivers/profile/map-object-row-builder-driver.js?v=0.9.6-orientation-row-drivers-v1",
      "drivers/profile/orientation-issue-factory-driver.js?v=0.9.6-orientation-row-drivers-v1",
      "drivers/profile/profile-pipeline-driver.js?v=0.9.6-profile-pipeline-v1",
      "drivers/servo/rest-correction-grammar-driver.js?v=0.9.6-rest-grammar-v4",
      "drivers/servo/production-motion-pattern-driver.js?v=0.9.7-production-motion-reference-v1"
    ]),

    presentationCore: Object.freeze([
      "app/table-presentation-helpers.js?v=0.9.7-table-rendering-retired-v1",
      "app/specification-table-renderer.js?v=0.9.7-table-rendering-split-v1",
      "app/build-inputs-renderer.js?v=0.9.7-table-rendering-split-v1",
      "app/machine-data-table-renderer.js?v=0.9.7-table-rendering-retired-v1",
      "app/servo-command-presentation.js?v=0.9.7-servo-table-split-v1",
      "app/servo-program-active-row-renderer.js?v=0.9.7-table-rendering-retired-v1",
      "app/servo-program-table-renderer.js?v=0.9.7-servo-table-split-v1",
      "app/simulation-table-renderer.js?v=0.9.7-servo-table-split-v1",
      "app/wipe-telemetry-service.js?v=0.9.7-table-rendering-retired-v1",
      "app/wipe-telemetry-renderer.js?v=0.9.7-table-rendering-retired-v1",
      "app/workspace-status-renderer.js?v=0.9.7-table-rendering-retired-v1",
      "app/bottle-visual-renderer.js?v=0.9.7-map-rendering-split-v1",
      "app/map-overlay-renderer.js?v=0.9.7-map-rendering-split-v1",
      "app/map-reference-presenter.js?v=0.9.7-map-rendering-split-v1",
      "app/mechanical-map-scene-renderer.js?v=0.9.7-map-rendering-retired-v1",
      "app/simulation-map-scene-renderer.js?v=0.9.7-map-rendering-retired-v1",
      "app/map-animation-renderer.js?v=0.9.7-map-rendering-split-v1"
    ]),

    workspaceCore: Object.freeze([
      "app/assembly-driver-adapter.js?v=0.9.7-assembly-drivers-v1",
      "app/assembly-editor-controller.js?v=0.9.7-assembly-ui-split-v1",
      "app/assembly-map-renderer.js?v=0.9.10-spender-v35",
      "app/simulation-collapsible-core.js?v=0.9.3-direct",
      "app/servo-replay-loop-controls-integration.js?v=0.9.3-replay-icons-loop",
      "app/release-readiness-staging-alignment-integration.js?v=0.9.3-staging-readiness-v2",
      "app/spec-row-duplicate-integration.js?v=0.9.3-spec-row-duplicate",
      "app/remove-zone-site-integration.js?v=0.9.3-global-map-library",
      "app/multi-map-lock-import-integration-v2.js?v=0.9.3-map-import-router"
    ]),

    aplGeneration: Object.freeze([
      "app/map-object-wipe-definition-integration.js?v=0.9.3-object-wipes",
      "app/apl-neck-pad-center-tack-integration.js?v=0.9.3-neck-pad-center-tack-v1",
      "app/apl-single-cycle-transition-guard.js?v=0.9.3-dual-neck-pad-cycle",
      "app/apl-neck-final-pad-completion-integration.js?v=0.9.3-neck-final-pad-full-label-v2",
      "app/apl-body-back-two-label-transition-integration.js?v=0.9.3-no-neck-body-back-v3",
      "app/apl-back-wipe-direction-correction-integration.js?v=0.9.3-back-wipe-direction-v4",
      "app/apl-label-sensor-reference-integration.js?v=0.9.3-active-sensor-reference"
    ]),

    profilePipeline: Object.freeze([
      "app/map-object-servo-orientation-integration.js?v=0.9.6-profile-pipeline-v2",
      "app/map-object-coder-after-wipe-integration.js?v=0.9.6-profile-pipeline-v2",
      "app/map-object-orientation-controls-integration.js?v=0.9.4-coder-orientation-off-v1",
      "app/motion-profile-regeneration-integration.js?v=0.9.4-motion-profile-regeneration-v1",
      "app/apl-continuous-motion-integration.js?v=0.9.4-apl-continuous-motion-v2"
    ]),

    coldGlue: Object.freeze([
      "app/cold-glue-label-geometry-fallback-integration.js?v=0.9.3-cold-glue-shared-geometry",
      "app/cold-glue-center-out-brush-integration.js?v=0.9.3-cold-glue-channel-90",
      "app/cold-glue-gripper-channel-integration.js?v=0.9.3-gripper-label-length",
      "app/cold-glue-parameter-editor-integration.js?v=0.9.3-cold-glue-parameters",
      "app/cold-glue-neck-left-right-integration.js?v=0.9.3-neck-parameter-driven-v2",
      "app/cold-glue-gripper-sequence-integration-v2.js?v=0.9.3-station-safe-grippers-v2"
    ]),

    mapBuilder: Object.freeze([
      "app/map-builder-station-authority-integration.js?v=0.9.3-station-authority",
      "app/map-object-builder-selection-integration.js?v=0.9.8-runtime-object-double-click-v4",
      "app/map-object-double-click-open-fix-integration.js?v=0.9.3-map-object-double-press-v4",
      "app/label-spec-section-selection-integration.js?v=0.9.8-label-dimension-presence-v1"
    ]),

    catalogs: Object.freeze([
      "app/company-default-programs-integration.js?v=0.9.5-company-defaults-v2",
      "app/workbook-reference-map-library-integration.js?v=0.9.4-workbook-map-library-v1",
      "app/locked-map-brand-selector-integration.js?v=0.9.7-map-library-selector-v1"
    ]),

    finalProfileStages: Object.freeze([
      "app/clockwise-code-box-orientation-integration.js?v=0.9.6-profile-pipeline-v1",
      "app/coder-rest-grammar-repair-integration.js?v=0.9.8-segment-command-finalizer-v2",
      "app/profile-pipeline-orchestrator-integration.js?v=0.9.6-profile-pipeline-v1",
      "app/production-motion-profile-reference-integration.js?v=0.9.7-production-motion-reference-v1",
      "app/motion-profile-workbench-integration.js?v=0.9.6-refactor-1"
    ]),

    optimization: Object.freeze([
      "app/optimizer-map-contact-integration.js?v=0.9.3-map-contact",
      "app/optimizer-brush-channel-expansion-integration.js?v=0.9.3-brush-channel-contact"
    ]),

    rendering: Object.freeze([
      "app/rendering-coordinator-integration.js?v=0.9.7-rendering-coordinator-v1"
    ]),

    diagnostics: Object.freeze([
      "app/validation-diagnostics-integration.js?v=0.9.10-validation-summary-stack-v3"
    ])
  });

  function featureEntries() {
    return Object.entries(FEATURE_GROUPS);
  }

  function orderedModules() {
    return featureEntries().flatMap(([, modules]) => modules);
  }

  function readiness(name) {
    const value = window[name];
    return value && typeof value.then === "function" ? value : Promise.resolve();
  }

  function waitForRuntimeOwners() {
    return Promise.all([
      readiness("ServoForgeGeometryPlanningReady"),
      readiness("ServoForgeProfileGenerationReady"),
      readiness("ServoForgeMapBuilderReady")
    ]);
  }

  function loadScript(source, feature) {
    return new Promise((resolve, reject) => {
      const expected = new URL(`./${source}`, window.location.href).href;
      const existing = [...document.scripts].find((script) => script.src === expected);
      if (existing) {
        if (existing.dataset.loaded === "true") resolve();
        else {
          existing.addEventListener("load", resolve, { once: true });
          existing.addEventListener("error", reject, { once: true });
        }
        return;
      }

      const script = document.createElement("script");
      script.src = `./${source}`;
      script.async = false;
      script.dataset.servoforgeFeature = feature;
      script.addEventListener("load", () => {
        script.dataset.loaded = "true";
        resolve();
      }, { once: true });
      script.addEventListener("error", reject, { once: true });
      document.body.appendChild(script);
    });
  }

  function loadFeature(feature, modules) {
    return modules.reduce(
      (promise, source) => promise.then(() => loadScript(source, feature)),
      Promise.resolve()
    );
  }

  function loadAllFeatures() {
    return featureEntries().reduce(
      (promise, [feature, modules]) => promise.then(() => loadFeature(feature, modules)),
      Promise.resolve()
    );
  }

  window.LabelerIntegrationFeatureManifest = Object.freeze({
    groups: FEATURE_GROUPS,
    features: Object.freeze(featureEntries().map(([feature]) => feature)),
    orderedModules: Object.freeze(orderedModules())
  });

  window.ServoForgeFeatureIntegrationsReady = waitForRuntimeOwners().then(loadAllFeatures);
  window.ServoForgeFeatureIntegrationsReady.catch((error) => {
    console.error("Staging integration load failed", error);
  });
})();
