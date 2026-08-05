"use strict";

(function loadServoForgeProfileGenerationModules() {
  const version = document.querySelector('meta[name="application-version"]')?.content || "0.9.2";
  const modules = Object.freeze([
    "drivers/profile/apl-contact-window-driver.js",
    "app/sensor-station-cycle-anchor-integration.js",
    "app/apl-seed-profile.js",
    "app/cold-glue-profile-generation.js",
    "app/apl-map-profile-generation.js",
    "app/apl-overlapping-pad-handoff-integration.js",
    "app/profile-routing.js",
    "app/machine-profile-framing.js",
    "app/servo-overrides.js",
    "app/profile-translation-service.js",
    "app/profile-translator-validation.js"
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
      script.src = `./${path}?v=${encodeURIComponent(version)}`;
      script.async = false;
      script.dataset.profileGenerationModule = path;
      script.addEventListener("load", () => {
        script.dataset.loaded = "true";
        resolve();
      }, { once: true });
      script.addEventListener("error", () => reject(new Error(`Unable to load ${path}.`)), { once: true });
      document.body.appendChild(script);
    });
  }

  window.ServoForgeProfileGenerationModules = modules;
  window.ServoForgeProfileGenerationReady = modules.reduce(
    (promise, path) => promise.then(() => loadScript(path)),
    Promise.resolve()
  );
})();
