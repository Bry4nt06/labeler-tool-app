"use strict";

const RELEASE_VERSION = "0.9.4";
const CACHE_NAME = "servoforge-labeler-v0.9.4-production-84131f0";
const CACHE_PREFIX = "servoforge-labeler-";
const APP_SHELL_URL = new URL("./index.html", self.registration.scope).href;

const CORE_ASSETS = Object.freeze([
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./assets/labeler-tool-icon.svg",
  "./update-manifest.json",
  "./release-notes.json",
  "./recovery.html",
  "./config/company-default-settings.json",
  "./drivers/geometry/label-geometry-driver.js",
  "./drivers/application/application-mode-driver.js",
  "./drivers/mechanical/mechanical-motion-driver.js",
  "./drivers/mechanical/cold-glue-motion-driver.js",
  "./drivers/servo/servo-command-driver.js",
  "./drivers/planning/motion-planner-driver.js",
  "./drivers/planning/mechanical-event-planner-driver.js",
  "./drivers/planning/incremental-rotation-driver.js",
  "./drivers/translation/profile-translator-driver.js",
  "./drivers/validation/motion-validation-driver.js",
  "./drivers/validation/servo-pipeline-validator-driver.js",
  "./drivers/validation/machine-family-grammar-driver.js",
  "./drivers/simulation/servo-replay-driver.js",
  "./drivers/optimization/program-optimizer-driver.js",
  "./drivers/quality/release-readiness-driver.js",
  "./drivers/profile/apl-profile-driver.js",
  "./app/defaults.js",
  "./app/persistence.js",
  "./app/zone-site-configuration.js",
  "./app/geometry-and-planning.js",
  "./app/profile-generation.js",
  "./app/simulation-engine.js",
  "./app/assemblies.js",
  "./app/wipe-down-builder.js",
  "./app/validation.js",
  "./app/setup-bindings.js",
  "./app/map-rendering.js",
  "./app/table-rendering.js",
  "./app/bootstrap.js",
  "./app/motion-planner-ui.js",
  "./app/profile-translator-integration.js",
  "./app/servo-pipeline-validator-integration.js",
  "./app/milestone-6-7-integration.js",
  "./app/machine-family-grammar-integration.js",
  "./app/servo-replay-integration.js",
  "./app/machine-terminal-policy-integration.js",
  "./app/topmodul-double-correction-integration.js",
  "./app/program-optimizer-integration.js",
  "./app/release-readiness-integration.js",
  "./app/diagnostics-workspace-integration.js",
  "./app/workspace-developer-integration.js",
  "./app/incremental-rotation-integration.js",
  "./app/simulation-collapsible-integration.js",
  "./app/simulation-collapsible-core.js",
  "./app/servo-replay-loop-controls-integration.js",
  "./app/spec-row-duplicate-integration.js",
  "./app/remove-zone-site-integration.js",
  "./app/multi-map-lock-import-integration-v2.js",
  "./app/map-object-wipe-definition-integration.js",
  "./app/apl-neck-pad-center-tack-integration.js",
  "./app/apl-single-cycle-transition-guard.js",
  "./app/apl-neck-final-pad-completion-integration.js",
  "./app/apl-body-back-two-label-transition-integration.js",
  "./app/apl-back-wipe-direction-correction-integration.js",
  "./app/apl-label-sensor-reference-integration.js",
  "./app/map-object-servo-orientation-integration.js",
  "./app/map-object-coder-after-wipe-integration.js",
  "./app/map-object-orientation-controls-integration.js",
  "./app/cold-glue-label-geometry-fallback-integration.js",
  "./app/cold-glue-center-out-brush-integration.js",
  "./app/cold-glue-gripper-channel-integration.js",
  "./app/cold-glue-parameter-editor-integration.js",
  "./app/cold-glue-neck-left-right-integration.js",
  "./app/cold-glue-gripper-sequence-integration-v2.js",
  "./app/map-builder-station-authority-integration.js",
  "./app/map-object-builder-selection-integration.js",
  "./app/map-object-double-click-open-fix-integration.js",
  "./app/label-spec-section-selection-integration.js",
  "./app/optimizer-map-contact-integration.js",
  "./app/optimizer-brush-channel-expansion-integration.js",
  "./app/update-manager.js",
  "./app.js"
]);

function normalizedRequest(source) {
  const url = new URL(typeof source === "string" ? source : source.url, self.registration.scope);
  url.search = "";
  url.hash = "";
  return new Request(url.href, { method: "GET" });
}

async function cacheResponse(url, response) {
  if (!response?.ok) return response;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(normalizedRequest(url), response.clone());
  return response;
}

async function cachedFallback(url, navigation = false) {
  const cache = await caches.open(CACHE_NAME);
  const direct = await cache.match(normalizedRequest(url), { ignoreSearch: true });
  if (direct) return direct;
  return navigation ? cache.match(normalizedRequest(APP_SHELL_URL), { ignoreSearch: true }) : null;
}

async function cacheStatus() {
  const cache = await caches.open(CACHE_NAME);
  const checks = await Promise.all(CORE_ASSETS.map(async (asset) => ({
    asset,
    cached: Boolean(await cache.match(normalizedRequest(new URL(asset, self.registration.scope).href), { ignoreSearch: true }))
  })));
  const cached = checks.filter((item) => item.cached).length;
  return { ok: true, version: RELEASE_VERSION, cacheName: CACHE_NAME, total: checks.length, cached, complete: cached === checks.length, missing: checks.filter((item) => !item.cached).map((item) => item.asset) };
}

async function prepareOffline(requestedAssets = []) {
  const assets = [...new Set([...CORE_ASSETS, ...(Array.isArray(requestedAssets) ? requestedAssets : [])])];
  for (const asset of assets) {
    const url = new URL(asset, self.registration.scope).href;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Unable to cache ${asset}: ${response.status}.`);
    await cacheResponse(url, response);
  }
  return cacheStatus();
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  const type = event.data?.type;
  const reply = (payload) => event.ports?.[0].postMessage(payload);
  if (type === "SKIP_WAITING") {
    self.skipWaiting();
    reply({ ok: true, version: RELEASE_VERSION });
  } else if (type === "GET_CACHE_STATUS") {
    event.waitUntil(cacheStatus().then(reply).catch((error) => reply({ ok: false, version: RELEASE_VERSION, message: error.message })));
  } else if (type === "PREPARE_OFFLINE") {
    event.waitUntil(prepareOffline(event.data?.assets).then(reply).catch((error) => reply({ ok: false, version: RELEASE_VERSION, message: error.message })));
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request, { cache: "no-store" })
      .then((response) => cacheResponse(event.request.mode === "navigate" ? APP_SHELL_URL : url.href, response))
      .catch(async () => {
        const cached = await cachedFallback(url.href, event.request.mode === "navigate");
        if (cached) return cached;
        throw new Error(`Offline resource unavailable: ${event.request.url}`);
      })
  );
});