"use strict";

(function installServoForgeUpdateManager() {
  const RELEASE_VERSION = "0.9.9";
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
    if (typeof els !== "undefined" && els.updateCheckStatus) els.updateCheckStatus.textContent = message;
    if (typeof els !== "undefined" && els.checkForUpdates) {
      els.checkForUpdates.textContent = buttonText;
      els.checkForUpdates.disabled = disabled;
    }
  }

  function enforceReleaseVersion() {
    const meta = document.querySelector('meta[name="application-version"]');
    if (meta && meta.content !== RELEASE_VERSION) meta.content = RELEASE_VERSION;
    const status = typeof els !== "undefined" ? els.updateCheckStatus : document.querySelector("#updateCheckStatus");
    const currentText = status?.textContent || "";
    const releaseText = `Version ${RELEASE_VERSION} • Updates are checked automatically.`;
    const idle = /^Version\s+\d+/i.test(currentText)
      && !/available|downloading|applying|checking|up to date/i.test(currentText);
    if (status && idle && currentText !== releaseText) status.textContent = releaseText;
  }

  function versionParts(value) {
    return String(value || "0").split(".").map((part) => Number.parseInt(part, 10) || 0);
  }

  function compareVersions(left, right) {
    const a = versionParts(left);
    const b = versionParts(right);
    for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
      const av = a[index] || 0;
      const bv = b[index] || 0;
      if (av !== bv) return av > bv ? 1 : -1;
    }
    return 0;
  }

  function destinationUrl(rawUrl, version) {
    let destination;
    try {
      destination = new URL(rawUrl || APP_SCOPE, APP_SCOPE);
    } catch {
      destination = new URL(APP_SCOPE);
    }
    destination.searchParams.set("version", String(version || RELEASE_VERSION));
    destination.searchParams.set("updated", Date.now().toString());
    return destination.toString();
  }

  async function clearStaleRuntime() {
    const tasks = [];
    if ("serviceWorker" in navigator) {
      tasks.push(navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(
        registrations
          .filter((registration) => registration.scope.startsWith(APP_SCOPE))
          .map((registration) => registration.unregister())
      )));
    }
    if ("caches" in window) {
      tasks.push(caches.keys().then((names) => Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX))
          .map((name) => caches.delete(name))
      )));
    }
    await Promise.allSettled(tasks);
  }

  function saveBeforeNavigation() {
    try {
      if (typeof saveCurrentSettings === "function") saveCurrentSettings();
    } catch (error) {
      console.warn("Settings could not be saved before update navigation.", error);
    }
  }

  function navigateInCurrentWindow(rawUrl, version) {
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
      updateServiceWorkerRegistration = await navigator.serviceWorker.register(`./service-worker.js?v=${RELEASE_VERSION}`, {
        scope: "./",
        updateViaCache: "none"
      });
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
      const response = await fetch(`${source}${source.includes("?") ? "&" : "?"}t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" }
      });
      if (!response.ok) throw new Error(`Update server returned ${response.status}.`);
      const manifest = await response.json();
      const latestVersion = String(manifest?.version || "").trim();
      if (!latestVersion) throw new Error("Update manifest does not contain a version.");
      if (compareVersions(latestVersion, installedVersion) <= 0) {
        setStatus(`Up to date • Version ${installedVersion}`, "Check for Updates", false);
        return;
      }
      const destination = String(manifest.releaseUrl || manifest.downloadUrl || APP_SCOPE).trim();
      setStatus(`Applying version ${latestVersion} in this window…`, "Applying Update", true);
      saveBeforeNavigation();
      await clearStaleRuntime();
      navigateInCurrentWindow(destination, latestVersion);
    } catch (error) {
      console.error("Update check failed", error);
      setStatus("Unable to apply the update. Check the connection and try again.", "Check for Updates", false);
    }
  };

  enforceReleaseVersion();
  const versionMeta = document.querySelector('meta[name="application-version"]');
  const versionStatus = document.querySelector("#updateCheckStatus");
  const versionObserver = new MutationObserver(enforceReleaseVersion);
  if (versionMeta) versionObserver.observe(versionMeta, { attributes: true, attributeFilter: ["content"] });
  if (versionStatus) versionObserver.observe(versionStatus, { childList: true, subtree: true, characterData: true });
  window.addEventListener("load", enforceReleaseVersion, { once: true });
})();

(function loadStagingFeatureModules() {
  const RELEASE_VERSION = "0.9.9";
  const modules = [
    "app/diagnostics-workspace-integration.js",
    "app/workspace-developer-integration.js",
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
      script.addEventListener("load", () => {
        script.dataset.loaded = "true";
        resolve();
      }, { once: true });
      script.addEventListener("error", () => reject(new Error(`Unable to load ${path}.`)), { once: true });
      document.body.appendChild(script);
    });
  }

  modules.reduce((promise, path) => promise.then(() => loadScript(path)), Promise.resolve())
    .catch((error) => console.error("Staging feature module load failed", error));
})();

(function scopeReleaseReadinessAssetVersions() {
  const driver = window.LabelerReleaseReadinessDriver;
  if (!driver?.run || driver.releaseManagedAssetScopeV3) return;

  const baseRun = driver.run.bind(driver);
  const appPath = new URL("./", window.location.href).pathname;
  const RELEASE_MANAGED_PATHS = Object.freeze([
    "styles.css",
    "drivers/geometry/label-geometry-driver.js",
    "drivers/application/application-mode-driver.js",
    "drivers/mechanical/mechanical-motion-driver.js",
    "drivers/mechanical/cold-glue-motion-driver.js",
    "drivers/servo/servo-command-driver.js",
    "drivers/planning/motion-planner-driver.js",
    "drivers/planning/mechanical-event-planner-driver.js",
    "drivers/planning/incremental-rotation-driver.js",
    "drivers/translation/profile-translator-driver.js",
    "drivers/validation/motion-validation-driver.js",
    "drivers/validation/servo-pipeline-validator-driver.js",
    "drivers/validation/machine-family-grammar-driver.js",
    "drivers/simulation/servo-replay-driver.js",
    "drivers/optimization/program-optimizer-driver.js",
    "drivers/quality/release-readiness-driver.js",
    "drivers/profile/apl-profile-driver.js",
    "app/defaults.js",
    "app/persistence.js",
    "app/zone-site-configuration.js",
    "app/geometry-and-planning.js",
    "app/profile-generation.js",
    "app/simulation-engine.js",
    "app/assemblies.js",
    "app/wipe-down-builder.js",
    "app/validation.js",
    "app/setup-bindings.js",
    "app/map-rendering.js",
    "app/table-rendering.js",
    "app/bootstrap.js",
    "app/motion-planner-ui.js",
    "app/profile-translator-integration.js",
    "app/servo-pipeline-validator-integration.js",
    "app/milestone-6-7-integration.js",
    "app/machine-family-grammar-integration.js",
    "app/servo-replay-integration.js",
    "app/machine-terminal-policy-integration.js",
    "app/topmodul-double-correction-integration.js",
    "app/program-optimizer-integration.js",
    "app/release-readiness-integration.js",
    "app/diagnostics-workspace-integration.js",
    "app/workspace-developer-integration.js",
    "app/incremental-rotation-integration.js",
    "app/simulation-collapsible-integration.js",
    "app/update-manager.js",
    "app.js"
  ]);

  function relativePath(source) {
    try {
      const url = new URL(source, window.location.href);
      return url.pathname.startsWith(appPath) ? url.pathname.slice(appPath.length) : url.pathname.replace(/^\//, "");
    } catch {
      return "";
    }
  }

  function assetReport(expectedVersion) {
    const byPath = new Map();
    document.querySelectorAll('script[src*="?v="],link[rel="stylesheet"][href*="?v="]').forEach((node) => {
      const source = node.src || node.href;
      const path = relativePath(source);
      if (!RELEASE_MANAGED_PATHS.includes(path)) return;
      let version = "";
      try { version = new URL(source, window.location.href).searchParams.get("v") || ""; } catch { version = ""; }
      if (!byPath.has(path)) byPath.set(path, []);
      byPath.get(path).push({ source, path, version });
    });

    const mismatches = [];
    let duplicateTagCount = 0;
    RELEASE_MANAGED_PATHS.forEach((path) => {
      const records = byPath.get(path) || [];
      duplicateTagCount += Math.max(0, records.length - 1);
      if (records.some((entry) => entry.version === expectedVersion)) return;
      mismatches.push({
        path,
        source: records[0]?.source || "",
        expectedVersion,
        observedVersions: [...new Set(records.map((entry) => entry.version).filter(Boolean))],
        missing: records.length === 0
      });
    });
    return { mismatches, duplicateTagCount, requiredCount: RELEASE_MANAGED_PATHS.length };
  }

  function replaceAssetResult(report) {
    if (!report || !Array.isArray(report.results)) return report;
    const expectedVersion = report.version || window.SERVOFORGE_RELEASE_VERSION || "0.9.2";
    const assets = assetReport(expectedVersion);
    const replacement = {
      id: "version-assets",
      category: "release",
      level: assets.mismatches.length ? "fail" : "pass",
      message: assets.mismatches.length
        ? `${assets.mismatches.length} required release asset${assets.mismatches.length === 1 ? " is" : "s are"} missing or not aligned to ${expectedVersion}.`
        : `${assets.requiredCount} required release assets are aligned to ${expectedVersion}; ${assets.duplicateTagCount} duplicate legacy tag${assets.duplicateTagCount === 1 ? " was" : "s were"} ignored because an aligned instance is loaded.`,
      expected: expectedVersion,
      mismatches: assets.mismatches,
      duplicateTagCount: assets.duplicateTagCount,
      requiredCount: assets.requiredCount
    };
    const index = report.results.findIndex((item) => item?.id === "version-assets");
    if (index >= 0) report.results.splice(index, 1, replacement);
    else report.results.push(replacement);
    const aggregate = driver.summarize(report.results);
    report.summary = aggregate.summary;
    report.categories = aggregate.categories;
    report.status = aggregate.status;
    return report;
  }

  window.LabelerReleaseReadinessDriver = Object.freeze({
    ...driver,
    releaseManagedAssetScopeV3: true,
    async run(options = {}) {
      return replaceAssetResult(await baseRun(options));
    }
  });
})();
