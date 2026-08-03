"use strict";

(function loadGeometryAndPlanningModules() {
  const version = document.querySelector('meta[name="application-version"]')?.content || "0.9.2";
  const modules = Object.freeze([
    "app/geometry-primitives.js",
    "app/label-specification-service.js",
    "app/label-station-planning-service.js",
    "app/label-sensor-geometry-service.js",
    "app/wipe-analysis-service.js",
    "app/program-summary-service.js",
    "app/cold-glue-map-service.js"
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
      script.dataset.geometryPlanningModule = path;
      script.addEventListener("load", () => {
        script.dataset.loaded = "true";
        resolve();
      }, { once: true });
      script.addEventListener("error", () => reject(new Error(`Unable to load ${path}.`)), { once: true });
      document.body.appendChild(script);
    });
  }

  window.ServoForgeGeometryPlanningModules = modules;
  window.ServoForgeGeometryPlanningReady = modules.reduce(
    (promise, path) => promise.then(() => loadScript(path)),
    Promise.resolve()
  );
})();
