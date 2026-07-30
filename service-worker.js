"use strict";

const RELEASE_VERSION = "0.9.2";
const CACHE_NAME = "servoforge-labeler-v0.9.2-map-access-cold-glue";
const CACHE_PREFIX = "servoforge-labeler-";
const APP_SHELL_URL = new URL("./index.html", self.registration.scope).href;
const UPDATE_MANIFEST_URL = new URL("./update-manifest.json", self.registration.scope).href;
const SERVICE_WORKER_URL = new URL("./service-worker.js", self.registration.scope).href;

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
  "./app/incremental-rotation-integration.js",
  "./app/simulation-collapsible-integration.js",
  "./app/workspace-developer-integration.js",
  "./app/simulation-collapsible-core.js",
  "./app/multi-map-lock-import-integration-v2.js",
  "./app/map-object-wipe-definition-integration.js",
  "./app/cold-glue-production-integration.js",
  "./app/optimizer-brush-channel-expansion-integration.js",
  "./app/update-manager.js",
  "./app.js"
]);

function absoluteAsset(asset) {
  return new URL(asset, self.registration.scope).href;
}

function normalizedRequest(requestOrUrl) {
  const source = typeof requestOrUrl === "string" ? requestOrUrl : requestOrUrl.url;
  const url = new URL(source, self.registration.scope);
  url.search = "";
  url.hash = "";
  return new Request(url.href, { method: "GET" });
}

async function cacheStatus() {
  const cache = await caches.open(CACHE_NAME);
  const checks = await Promise.all(CORE_ASSETS.map(async (asset) => ({
    asset,
    cached: Boolean(await cache.match(normalizedRequest(absoluteAsset(asset)), { ignoreSearch: true }))
  })));
  const cached = checks.filter((item) => item.cached).length;
  return {
    ok: true,
    version: RELEASE_VERSION,
    cacheName: CACHE_NAME,
    total: checks.length,
    cached,
    complete: cached === checks.length,
    missing: checks.filter((item) => !item.cached).map((item) => item.asset)
  };
}

async function prepareOffline(requestedAssets = [], requestedVersion = RELEASE_VERSION) {
  if (String(requestedVersion || RELEASE_VERSION) !== RELEASE_VERSION) {
    throw new Error(`Offline cache version ${requestedVersion} does not match service worker ${RELEASE_VERSION}.`);
  }
  const allowed = new Set(CORE_ASSETS);
  const additions = (Array.isArray(requestedAssets) ? requestedAssets : []).filter((asset) => allowed.has(asset));
  const assets = [...new Set([...CORE_ASSETS, ...additions])];
  const cache = await caches.open(CACHE_NAME);

  for (const asset of assets) {
    const url = absoluteAsset(asset);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Unable to cache ${asset}: ${response.status}.`);
    await cache.put(normalizedRequest(url), response.clone());
    if (asset === "./" || asset === "./index.html") {
      await cache.put(normalizedRequest(APP_SHELL_URL), response.clone());
    }
  }

  return cacheStatus();
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  const type = event.data?.type;
  const reply = (payload) => event.ports?.[0]?.postMessage(payload);

  if (type === "SKIP_WAITING") {
    self.skipWaiting();
    reply({ ok: true, version: RELEASE_VERSION });
    return;
  }

  if (type === "GET_CACHE_STATUS") {
    event.waitUntil(
      cacheStatus()
        .then(reply)
        .catch((error) => reply({ ok: false, version: RELEASE_VERSION, message: error.message }))
    );
    return;
  }

  if (type === "PREPARE_OFFLINE") {
    event.waitUntil(
      prepareOffline(event.data?.assets, event.data?.version)
        .then((status) => reply({ ...status, ok: true }))
        .catch((error) => reply({ ok: false, version: RELEASE_VERSION, message: error.message }))
    );
  }
});

function isReleaseControlRequest(requestUrl, request) {
  return request.mode === "navigate"
    || requestUrl.href.split("?")[0] === APP_SHELL_URL
    || requestUrl.href.split("?")[0] === UPDATE_MANIFEST_URL
    || requestUrl.href.split("?")[0] === SERVICE_WORKER_URL;
}

async function cacheSuccessfulResponse(requestUrl, response) {
  if (!response.ok) return response;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(normalizedRequest(requestUrl.href), response.clone());
  return response;
}

async function cachedResponse(requestUrl, navigation = false) {
  const cache = await caches.open(CACHE_NAME);
  const direct = await cache.match(normalizedRequest(requestUrl.href), { ignoreSearch: true });
  if (direct) return direct;
  if (navigation) return cache.match(normalizedRequest(APP_SHELL_URL), { ignoreSearch: true });
  return null;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (isReleaseControlRequest(requestUrl, event.request)) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .then((response) => cacheSuccessfulResponse(
          event.request.mode === "navigate" ? new URL(APP_SHELL_URL) : requestUrl,
          response
        ))
        .catch(async () => {
          const cached = await cachedResponse(requestUrl, event.request.mode === "navigate");
          if (cached) return cached;
          throw new Error(`Release resource unavailable: ${event.request.url}`);
        })
    );
    return;
  }

  event.respondWith(
    fetch(event.request, { cache: "no-store" })
      .then((response) => cacheSuccessfulResponse(requestUrl, response))
      .catch(async () => {
        const cached = await cachedResponse(requestUrl, false);
        if (cached) return cached;
        throw new Error(`Offline resource unavailable: ${event.request.url}`);
      })
  );
});
