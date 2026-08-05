"use strict";

(function loadServoForgeBootstrapModules() {
  const version = "0.9.10";
  const build = "defaults-sensors-coding-20260804-v3";
  window.SERVOFORGE_RELEASE_VERSION = version;
  const banner = document.querySelector(".staging-environment-banner");
  if (banner) banner.textContent = `STAGING ${version} / TEST BUILD — NOT PRODUCTION`;
  const modules = Object.freeze([
    "app/export-service.js",
    "app/controllers/workspace-action-service.js",
    "app/controllers/theme-presets-controller.js",
    "app/controllers/health-status-ui-controller.js",
    "app/controllers/validation-panel-ui-controller.js",
    "app/controllers/settings-controller.js",
    "app/controllers/settings-reset-controller.js",
    "app/controllers/map-controller.js",
    "app/controllers/specs-controller.js",
    "app/controllers/specification-event-controller.js",
    "app/controllers/label-section-event-controller.js",
    "app/controllers/specification-table-ui-controller.js",
    "app/controllers/specification-sensor-guidance-controller.js",
    "app/controllers/specification-required-fields-controller.js",
    "app/controllers/sensor-activation-controller.js",
    "app/controllers/coding-cycle-normalization-controller.js",
    "app/controllers/build-inputs-controller.js",
    "app/controllers/tabs-controller.js",
    "app/controllers/transfer-controller.js",
    "app/controllers/simulation-controller.js",
    "app/controllers/servo-program-controller.js",
    "app/controllers/servo-program-event-controller.js",
    "app/controllers/simulation-editor-controller.js",
    "app/controllers/station-table-controller.js",
    "app/controllers/station-table-event-controller.js",
    "app/controllers/application-controller.js",
    "app/controllers/setup-state-controller.js",
    "app/controllers/workspace-panel-controller.js",
    "app/controllers/map-builder-action-controller.js",
    "app/controllers/map-builder-event-controller.js",
    "app/controllers/map-builder-layout-controller.js",
    "app/controllers/map-builder-row-controller.js",
    "app/controllers/map-builder-popup-controller.js",
    "app/controllers/setup-event-controller-integration.js",
    "app/global-actions.js",
    "app/animation-runtime.js",
    "app/startup-runtime.js"
  ]);

  function loadScript(path) {
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
      script.dataset.bootstrapModule = path;
      script.dataset.bootstrapBuild = build;
      script.addEventListener("load", () => {
        script.dataset.loaded = "true";
        resolve();
      }, { once: true });
      script.addEventListener("error", () => reject(new Error(`Unable to load ${path}.`)), { once: true });
      document.body.appendChild(script);
    });
  }

  window.ServoForgeBootstrapModules = modules;
  window.ServoForgeBootstrapBuild = build;
  window.ServoForgeBootstrapReady = modules.reduce(
    (promise, path) => promise.then(() => loadScript(path)),
    Promise.resolve()
  );
})();
