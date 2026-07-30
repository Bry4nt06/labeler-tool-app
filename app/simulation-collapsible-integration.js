"use strict";

(function loadSimulationAndMapAccessIntegrations() {
  const modules = [
    "app/simulation-collapsible-core.js?v=0.9.3-direct",
    "app/multi-map-lock-import-integration-v2.js?v=0.9.3-map-import-router",
    "app/map-object-wipe-definition-integration.js?v=0.9.3-object-wipes",
    "app/apl-single-cycle-transition-guard.js?v=0.9.3-dual-neck-pad-cycle",
    "app/cold-glue-label-geometry-fallback-integration.js?v=0.9.3-cold-glue-shared-geometry",
    "app/cold-glue-center-out-brush-integration.js?v=0.9.3-cold-glue-channel-90",
    "app/cold-glue-gripper-channel-integration.js?v=0.9.3-gripper-label-length",
    "app/cold-glue-parameter-editor-integration.js?v=0.9.3-cold-glue-parameters",
    "app/cold-glue-neck-left-right-integration.js?v=0.9.3-neck-parameter-driven-v2",
    "app/cold-glue-gripper-sequence-integration-v2.js?v=0.9.3-station-safe-grippers-v2",
    "app/optimizer-map-contact-integration.js?v=0.9.3-map-contact",
    "app/optimizer-brush-channel-expansion-integration.js?v=0.9.3-brush-channel-contact"
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
    .catch((error) => console.error("Staging integration load failed", error));
})();
