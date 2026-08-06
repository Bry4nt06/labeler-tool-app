"use strict";

(function seedDefaultWorkspacePanelVisibility() {
  const preferencesKey = "servoforge-developer-preferences-v1";
  const migrationKey = "servoforge-default-hidden-panels-v2-applied";
  const defaultHiddenPanels = ["simulation", "diagnostics"];

  try {
    if (localStorage.getItem(migrationKey) === "true") return;
    const parsed = JSON.parse(localStorage.getItem(preferencesKey) || "{}");
    const preferences = parsed && typeof parsed === "object" ? parsed : {};
    const hiddenPanels = new Set(Array.isArray(preferences.hiddenPanels) ? preferences.hiddenPanels.map(String) : []);
    defaultHiddenPanels.forEach((panel) => hiddenPanels.add(panel));
    localStorage.setItem(preferencesKey, JSON.stringify({
      ...preferences,
      hiddenPanels: [...hiddenPanels]
    }));
    localStorage.setItem(migrationKey, "true");
  } catch {
    // Storage may be unavailable in a restricted browser context. The normal
    // workspace controls remain usable without persisted visibility defaults.
  }
})();

(async function startServoForge() {
  const progress = window.ServoForgeStartupProgress;
  const build = "first-application-zero-datum-v26-workspace-visibility-v1";

  function loadScript(path, version) {
    return new Promise((resolve, reject) => {
      const expected = new URL(`./${path}`, window.location.href).pathname;
      const existing = [...document.scripts].find((script) => {
        try { return new URL(script.src, window.location.href).pathname === expected; }
        catch { return false; }
      });
      if (existing) {
        if (existing.dataset.loaded === "true") resolve();
        else {
          existing.addEventListener("load", resolve, { once: true });
          existing.addEventListener("error", reject, { once: true });
        }
        return;
      }
      const script = document.createElement("script");
      script.src = `./${path}?v=${encodeURIComponent(version)}&build=${encodeURIComponent(build)}`;
      script.async = false;
      script.dataset.orientationConstraintModule = path;
      script.dataset.orientationConstraintBuild = build;
      script.addEventListener("load", () => {
        script.dataset.loaded = "true";
        resolve();
      }, { once: true });
      script.addEventListener("error", () => reject(new Error(`Unable to load ${path}.`)), { once: true });
      document.body.appendChild(script);
    });
  }

  async function loadOrientationConstraintPlanner() {
    const version = document.querySelector('meta[name="application-version"]')?.content || "0.9.10";
    await loadScript("app/global-machine-parameter-defaults-integration.js", version);
    await loadScript("drivers/profile/orientation-constraint-planner-driver.js", version);
    await loadScript("drivers/profile/sensor-target-policy-driver.js", version);
    await loadScript("drivers/profile/sensor-station-label-driver.js", version);
    await loadScript("drivers/profile/sensor-post-inspection-release-driver.js", version);
    await loadScript("app/orientation-constraint-target-service.js", version);
    await loadScript("app/first-application-zero-datum-integration.js", version);
    await loadScript("app/orientation-constraint-program-planner.js", version);
    await loadScript("app/coder-window-reference-handoff-integration.js", version);
    await loadScript("app/sensor-editor-focus-guard-integration.js", version);

    try {
      await loadScript("app/orientation-constraint-planner-integration.js", version);
      await loadScript("app/sensor-post-inspection-release-integration.js", version);
      await loadScript("app/apl-post-wipe-sensor-hold-integration.js", version);
      await loadScript("app/sensor-orientation-default-map-fix-integration.js", version);
      await loadScript("app/standard-45h-wipe-down-default-integration.js", version);
      await loadScript("app/sensor-station-label-inheritance-integration.js", version);
      await loadScript("app/inactive-label-sensor-suppression-integration.js", version);
      await loadScript("app/company-default-map-catalog-integration.js", version);
      await loadScript("app/default-bottle-spec-retirement-integration.js", version);
      await loadScript("app/protected-default-map-integration.js", version);
      await loadScript("app/repository-brand-download-integration.js", version);
      await loadScript("app/workspace-panel-visibility-guard-integration.js", version);
      await loadScript("app/optimizer-post-wipe-coverage-fix-integration.js", version);
      await window.LabelerSensorEditorFocusGuard?.waitForScopedObservers?.(2, 2000);
    } finally {
      window.LabelerSensorEditorFocusGuard?.restoreMutationObserver?.();
    }

    await loadScript("app/sensor-editor-compact-interaction-integration.js", version);
    const ready = window.ServoForgeOrientationConstraintPlannerReady;
    if (ready && typeof ready.then === "function") {
      await Promise.race([
        ready,
        new Promise((resolve) => window.setTimeout(resolve, 2000))
      ]);
    }
  }

  try {
    progress?.set(12, "Loading profile engine…");
    if (window.ServoForgeProfileGenerationReady) await window.ServoForgeProfileGenerationReady;

    progress?.set(25, "Loading geometry and planning…");
    if (window.ServoForgeGeometryPlanningReady) await window.ServoForgeGeometryPlanningReady;

    progress?.set(39, "Loading Map Builder…");
    if (window.ServoForgeMapBuilderReady) await window.ServoForgeMapBuilderReady;

    progress?.set(53, "Loading feature integrations…");
    if (window.ServoForgeFeatureIntegrationsReady) await window.ServoForgeFeatureIntegrationsReady;

    progress?.set(61, "Applying compact sensor controls…");
    await loadOrientationConstraintPlanner();

    progress?.set(70, "Loading workspace controllers…");
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
