"use strict";

(function loadServoForgeMapBuilderModules() {
  const releaseVersion = "0.9.10-spender-v35";
  const modulePaths = Object.freeze([
    "drivers/map/map-schema-driver.js",
    "drivers/map/map-migration-driver.js",
    "app/map-defaults-service.js",
    "app/map-library-service.js",
    "app/map-schema-adapter-integration.js",
    "app/map-runtime-service.js",
    "app/map-migration-service.js",
    "app/map-cold-glue-optimization-service.js",
    "app/map-builder-controls.js",
    "app/map-builder-history-service.js",
    "app/map-builder-renderer.js",
    "app/map-builder-controller.js"
  ]);

  function matchingScript(path) {
    const expected = new URL(`./${path}`, window.location.href);
    return [...document.scripts].find((script) => {
      if (!script.src) return false;
      const current = new URL(script.src, window.location.href);
      return current.origin === expected.origin && current.pathname === expected.pathname;
    });
  }

  function loadScript(path) {
    return new Promise((resolve, reject) => {
      const existing = matchingScript(path);
      if (existing) {
        if (existing.dataset.loaded === "true" || existing.readyState === "complete") {
          resolve();
          return;
        }
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", () => reject(new Error(`Unable to load ${path}.`)), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = `./${path}?v=${encodeURIComponent(releaseVersion)}-map-builder-v2`;
      script.async = false;
      script.dataset.servoforgeMapBuilderModule = path;
      script.addEventListener("load", () => {
        script.dataset.loaded = "true";
        resolve();
      }, { once: true });
      script.addEventListener("error", () => reject(new Error(`Unable to load ${path}.`)), { once: true });
      document.body.appendChild(script);
    });
  }

  const ready = modulePaths.reduce(
    (promise, path) => promise.then(() => loadScript(path)),
    Promise.resolve()
  );

  window.ServoForgeMapBuilderModules = modulePaths;
  window.ServoForgeMapBuilderReady = ready;
})();
