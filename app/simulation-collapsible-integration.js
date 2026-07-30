"use strict";

(function loadSimulationAndMapAccessIntegrations() {
  const modules = [
    "app/workspace-developer-integration.js?v=0.9.2-production",
    "app/simulation-collapsible-core.js?v=0.9.2-production",
    "app/multi-map-lock-import-integration-v2.js?v=0.9.2-production",
    "app/map-object-wipe-definition-integration.js?v=0.9.2-production",
    "app/cold-glue-production-integration.js?v=0.9.2-production",
    "app/optimizer-brush-channel-expansion-integration.js?v=0.9.2-production"
  ];

  function loadScript(source) {
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
      script.addEventListener("load", () => { script.dataset.loaded = "true"; resolve(); }, { once: true });
      script.addEventListener("error", reject, { once: true });
      document.body.appendChild(script);
    });
  }

  modules.reduce((promise, source) => promise.then(() => loadScript(source)), Promise.resolve())
    .catch((error) => console.error("ServoForge 0.9.2 integration load failed", error));
})();
