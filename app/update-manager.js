"use strict";

(function installServoForgeUpdateManager() {
  const RELEASE_VERSION = "0.9.2";
  const APP_SCOPE = new URL("./", window.location.href).href;
  const CACHE_PREFIX = "servoforge-labeler-";

  window.SERVOFORGE_RELEASE_VERSION = RELEASE_VERSION;

  function currentVersion() {
    return document.querySelector('meta[name="application-version"]')?.content || RELEASE_VERSION;
  }
  function manifestUrl() {
    return document.querySelector('meta[name="update-manifest-url"]')?.content?.trim() || "./update-manifest.json";
  }
  function setStatus(message, buttonText = "Check for Updates", disabled = false) {
    const status = typeof els !== "undefined" ? els.updateCheckStatus : document.querySelector("#updateCheckStatus");
    const button = typeof els !== "undefined" ? els.checkForUpdates : document.querySelector("#checkForUpdates");
    if (status) status.textContent = message;
    if (button) { button.textContent = buttonText; button.disabled = disabled; }
  }
  function enforceReleaseVersion() {
    const meta = document.querySelector('meta[name="application-version"]');
    if (meta && meta.content !== RELEASE_VERSION) meta.content = RELEASE_VERSION;
    const status = typeof els !== "undefined" ? els.updateCheckStatus : document.querySelector("#updateCheckStatus");
    const text = status?.textContent || "";
    const releaseText = `Version ${RELEASE_VERSION} • Updates are checked automatically.`;
    if (status && /^Version\s+\d+/i.test(text) && !/available|downloading|applying|checking|up to date/i.test(text) && text !== releaseText) status.textContent = releaseText;
  }
  function versionParts(value) { return String(value || "0").split(".").map((part) => Number.parseInt(part, 10) || 0); }
  function compareVersions(left, right) {
    const a = versionParts(left), b = versionParts(right);
    for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
      if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) > (b[index] || 0) ? 1 : -1;
    }
    return 0;
  }
  function destinationUrl(rawUrl, version) {
    let destination;
    try { destination = new URL(rawUrl || APP_SCOPE, APP_SCOPE); } catch { destination = new URL(APP_SCOPE); }
    destination.searchParams.set("version", String(version || RELEASE_VERSION));
    destination.searchParams.set("updated", Date.now().toString());
    return destination.toString();
  }
  async function clearStaleRuntime() {
    const tasks = [];
    if ("serviceWorker" in navigator) tasks.push(navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(registrations.filter((registration) => registration.scope.startsWith(APP_SCOPE)).map((registration) => registration.unregister()))));
    if ("caches" in window) tasks.push(caches.keys().then((names) => Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX)).map((name) => caches.delete(name)))));
    await Promise.allSettled(tasks);
  }
  function saveBeforeNavigation() {
    try { if (typeof saveCurrentSettings === "function") saveCurrentSettings(); } catch (error) { console.warn("Settings could not be saved before update navigation.", error); }
  }
  function navigate(rawUrl, version) {
    saveBeforeNavigation();
    window.location.replace(destinationUrl(rawUrl, version));
  }

  showPendingToolUpdate = function showManagedPendingUpdate() {
    setStatus("A browser update is ready. Apply it in this window.", "Apply Update", false);
  };
  registerToolUpdateService = async function registerManagedToolUpdateService() {
    enforceReleaseVersion();
    if (!("serviceWorker" in navigator) || window.location.protocol === "file:") return;
    try {
      updateServiceWorkerRegistration = await navigator.serviceWorker.register(`./service-worker.js?v=${RELEASE_VERSION}`, { scope: "./", updateViaCache: "none" });
      updateServiceWorkerRegistration.update().catch(() => {});
    } catch (error) {
      console.warn("Service worker registration is unavailable; same-window updates remain enabled.", error);
    }
  };
  checkForToolUpdates = async function checkForManagedToolUpdates() {
    const installedVersion = currentVersion();
    setStatus("Checking for updates…", "Check for Updates", true);
    try {
      const source = manifestUrl();
      const response = await fetch(`${source}${source.includes("?") ? "&" : "?"}t=${Date.now()}`, { cache: "no-store", headers: { "Cache-Control": "no-cache" } });
      if (!response.ok) throw new Error(`Update server returned ${response.status}.`);
      const manifest = await response.json();
      const latestVersion = String(manifest?.version || "").trim();
      if (!latestVersion) throw new Error("Update manifest does not contain a version.");
      if (compareVersions(latestVersion, installedVersion) <= 0) {
        setStatus(`Up to date • Version ${installedVersion}`);
        return;
      }
      setStatus(`Applying version ${latestVersion} in this window…`, "Applying Update", true);
      saveBeforeNavigation();
      await clearStaleRuntime();
      navigate(String(manifest.releaseUrl || manifest.downloadUrl || APP_SCOPE).trim(), latestVersion);
    } catch (error) {
      console.error("Update check failed", error);
      setStatus("Unable to apply the update. Check the connection and try again.");
    }
  };

  enforceReleaseVersion();
  const meta = document.querySelector('meta[name="application-version"]');
  const status = document.querySelector("#updateCheckStatus");
  const observer = new MutationObserver(enforceReleaseVersion);
  if (meta) observer.observe(meta, { attributes: true, attributeFilter: ["content"] });
  if (status) observer.observe(status, { childList: true, subtree: true, characterData: true });
  window.addEventListener("load", enforceReleaseVersion, { once: true });
})();

(function loadReleaseFeatureModules() {
  const RELEASE_VERSION = "0.9.2";
  const modules = [
    "app/diagnostics-workspace-integration.js",
    "drivers/planning/incremental-rotation-driver.js",
    "app/incremental-rotation-integration.js",
    "app/simulation-collapsible-integration.js"
  ];

  function loadScript(path) {
    return new Promise((resolve, reject) => {
      const existing = [...document.scripts].find((script) => {
        try { return new URL(script.src, location.href).pathname.endsWith(`/${path}`); } catch { return false; }
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
      script.src = `./${path}?v=${RELEASE_VERSION}`;
      script.async = false;
      script.dataset.releaseManagedFeature = "true";
      script.addEventListener("load", () => { script.dataset.loaded = "true"; resolve(); }, { once: true });
      script.addEventListener("error", () => reject(new Error(`Unable to load ${path}.`)), { once: true });
      document.body.appendChild(script);
    });
  }

  modules.reduce((promise, path) => promise.then(() => loadScript(path)), Promise.resolve())
    .catch((error) => console.error("Release feature module load failed", error));
})();
