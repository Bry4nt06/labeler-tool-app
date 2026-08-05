"use strict";

function runtimeReleaseVersion() {
  return window.SERVOFORGE_RELEASE_VERSION
    || document.querySelector('meta[name="application-version"]')?.content
    || "0.9.2";
}

function showStartupError(error) {
  console.error("Labeler tool startup failed", error);
  const mapPanel = document.querySelector(".map-panel");
  const validationList = document.querySelector("#validationList");
  const message = error && error.message ? error.message : String(error || "Unknown startup error");
  if (mapPanel) {
    const notice = document.createElement("div");
    notice.className = "startup-error";
    notice.innerHTML = `<strong>Tool startup error</strong><span>${message}</span>`;
    mapPanel.appendChild(notice);
  }
  if (validationList) validationList.innerHTML = `<div class="notice bad">Startup failed: ${message}</div>`;
}

function loadSimulatorRuntime() {
  const version = runtimeReleaseVersion();
  if (document.querySelector("script[data-servoforge-simulator]")) return;
  const script = document.createElement("script");
  script.src = `app/simulator-milestone.js?v=${encodeURIComponent(version)}`;
  script.dataset.servoforgeSimulator = version;
  document.head.appendChild(script);
}

async function initializeLabelerApp() {
  const progress = window.ServoForgeStartupProgress;
  try {
    progress?.set(70, "Verifying workspace controllers…");
    if (!window.LabelerSetupEventControllers?.installed) {
      throw new Error("Setup event controller boundary is not loaded.");
    }
    if (!window.LabelerSetupStateController?.initialize) {
      throw new Error("Setup state controller is not loaded.");
    }
    if (!window.LabelerWorkspacePanelController?.initialize) {
      throw new Error("Workspace panel controller is not loaded.");
    }
    if (!window.LabelerThemePresetsController?.installed) {
      throw new Error("Theme presets controller is not loaded.");
    }
    if (!window.LabelerHealthStatusUiController?.installed) {
      throw new Error("Health status visual controller is not loaded.");
    }
    if (!window.LabelerValidationPanelUiController?.installed) {
      throw new Error("Validation panel UI controller is not loaded.");
    }
    if (!window.LabelerSettingsResetController?.installed) {
      throw new Error("Settings reset controller is not loaded.");
    }
    if (!window.LabelerSpecificationEventController?.installed) {
      throw new Error("Specification field event controller is not loaded.");
    }
    if (!window.LabelerLabelSectionEventController?.installed) {
      throw new Error("Brand Recipe section event controller is not loaded.");
    }
    if (!window.LabelerSpecificationTableUiController?.installed) {
      throw new Error("Specs table UI controller is not loaded.");
    }
    if (!window.LabelerSpecificationSensorGuidanceController?.installed) {
      throw new Error("Specification and sensor guidance controller is not loaded.");
    }
    if (!window.LabelerSensorActivationController?.installed) {
      throw new Error("Recipe-aware sensor activation controller is not loaded.");
    }
    if (!window.LabelerCodingCycleNormalizationController?.installed) {
      throw new Error("Coding station cycle normalization controller is not loaded.");
    }
    if (!window.LabelerServoProgramEventController?.installed) {
      throw new Error("Servo Program event controller is not loaded.");
    }
    if (!window.LabelerStationTableEventController?.installed) {
      throw new Error("Station table event controller is not loaded.");
    }
    if (!window.LabelerMapBuilderActionController?.installed || !window.LabelerMapBuilderEventController?.installed) {
      throw new Error("Map Builder action and event controllers are not loaded.");
    }
    if (!window.LabelerMapBuilderLayoutController?.installed) {
      throw new Error("Map Builder layout controller is not loaded.");
    }
    if (!window.LabelerMapBuilderRowController?.installed) {
      throw new Error("Map Builder row event controller is not loaded.");
    }
    if (!window.LabelerMapController?.populateBuilder) {
      throw new Error("Map Builder lifecycle controller is not loaded.");
    }

    progress?.set(76, "Restoring saved settings…");
    loadSavedSettings();
    if (!window.LabelerCompanyDefaultsService?.reconcile) {
      throw new Error("Company catalog service is not loaded.");
    }

    progress?.set(82, "Loading company defaults…");
    window.ServoForgeCompanyDefaultsReady = window.LabelerCompanyDefaultsService.reconcile();
    await window.ServoForgeCompanyDefaultsReady;

    progress?.set(87, "Preparing machine maps…");
    ensurePersistentApplicationMaps();
    if (typeof initializeStella660ColdGlueExample === "function" && initializeStella660ColdGlueExample()) {
      saveCurrentSettings();
    }

    progress?.set(92, "Applying workspace settings…");
    window.LabelerSetupStateController.initialize();
    window.LabelerWorkspacePanelController.initialize();
    window.LabelerMapController.populateBuilder({ bind: true });

    progress?.set(96, "Rendering ServoForge workspace…");
    render();
    window.LabelerHealthStatusUiController.refresh();
    window.LabelerSensorActivationController.refresh();
    window.LabelerCodingCycleNormalizationController.refresh();
    startAnimationLoop();

    progress?.set(98, "Registering update service…");
    await registerToolUpdateService();
    loadSimulatorRuntime();
    return true;
  } catch (error) {
    showStartupError(error);
    progress?.fail(error);
    return false;
  }
}

window.LabelerStartupRuntime = Object.freeze({
  initialize: initializeLabelerApp,
  showError: showStartupError,
  loadSimulator: loadSimulatorRuntime,
  releaseVersion: runtimeReleaseVersion
});
