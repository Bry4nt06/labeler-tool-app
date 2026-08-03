"use strict";

(async function startServoForge() {
  const progress = window.ServoForgeStartupProgress;
  try {
    progress?.set(12, "Loading profile engine…");
    if (window.ServoForgeProfileGenerationReady) await window.ServoForgeProfileGenerationReady;

    progress?.set(25, "Loading geometry and planning…");
    if (window.ServoForgeGeometryPlanningReady) await window.ServoForgeGeometryPlanningReady;

    progress?.set(39, "Loading Map Builder…");
    if (window.ServoForgeMapBuilderReady) await window.ServoForgeMapBuilderReady;

    progress?.set(53, "Loading feature integrations…");
    if (window.ServoForgeFeatureIntegrationsReady) await window.ServoForgeFeatureIntegrationsReady;

    progress?.set(67, "Loading workspace controllers…");
    if (window.ServoForgeBootstrapReady) await window.ServoForgeBootstrapReady;
    if (typeof initializeLabelerApp !== "function") {
      throw new Error("initializeLabelerApp is not loaded.");
    }

    const initialized = await initializeLabelerApp();
    if (initialized === false) return;
    progress?.complete("ServoForge ready");
  } catch (error) {
    progress?.fail(error);
    if (typeof showStartupError === "function" && !document.querySelector(".startup-error")) showStartupError(error);
    else console.error("ServoForge startup is unavailable.", error);
  }
})();
