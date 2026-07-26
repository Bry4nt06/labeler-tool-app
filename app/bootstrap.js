"use strict";

let lastAnimationTime = performance.now();
let animationTimerId = null;

const STAGING_RELEASE_VERSION = "0.8.3";
const STAGING_CACHE_PREFIX = "servoforge-labeler-staging-";

function currentApplicationVersion() {
  return document.querySelector('meta[name="application-version"]')?.content || STAGING_RELEASE_VERSION;
}

function configuredUpdateManifestUrl() {
  return document.querySelector('meta[name="update-manifest-url"]')?.content?.trim() || "./update-manifest.json";
}

function setToolUpdateUi(message, buttonText = "Check for Updates", disabled = false) {
  if (els.updateCheckStatus) els.updateCheckStatus.textContent = message;
  if (els.checkForUpdates) {
    els.checkForUpdates.textContent = buttonText;
    els.checkForUpdates.disabled = disabled;
  }
}

function updateDestinationUrl(rawUrl, version) {
  let destination;
  try {
    destination = new URL(rawUrl || "./", window.location.href);
  } catch {
    destination = new URL("./", window.location.href);
  }
  destination.searchParams.set("version", String(version || Date.now()));
  destination.searchParams.set("updated", Date.now().toString());
  return destination.toString();
}

async function clearStaleStagingRuntime() {
  const appScope = new URL("./", window.location.href).href;
  const tasks = [];

  if ("serviceWorker" in navigator) {
    tasks.push(
      navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(
        registrations
          .filter((registration) => registration.scope.startsWith(appScope))
          .map((registration) => registration.unregister())
      ))
    );
  }

  if ("caches" in window) {
    tasks.push(
      caches.keys().then((names) => Promise.all(
        names
          .filter((name) => name.startsWith(STAGING_CACHE_PREFIX))
          .map((name) => caches.delete(name))
      ))
    );
  }

  await Promise.allSettled(tasks);
}

function navigateToUpdateInCurrentWindow(rawUrl, version) {
  if (typeof saveCurrentSettings === "function") saveCurrentSettings();
  window.location.replace(updateDestinationUrl(rawUrl, version));
}

function showPendingToolUpdate() {
  setToolUpdateUi("A browser update is ready. Apply it in this window.", "Apply Update", false);
}

async function registerToolUpdateService() {
  const meta = document.querySelector('meta[name="application-version"]');
  if (meta) meta.content = STAGING_RELEASE_VERSION;
  if (!("serviceWorker" in navigator) || window.location.protocol === "file:") return;

  try {
    updateServiceWorkerRegistration = await navigator.serviceWorker.register(
      `./service-worker.js?v=${STAGING_RELEASE_VERSION}`,
      { scope: "./", updateViaCache: "none" }
    );
  } catch (error) {
    console.warn("Service worker registration is unavailable. Same-window updates remain enabled.", error);
  }
}

async function checkForToolUpdates() {
  const currentVersion = currentApplicationVersion();
  const manifestUrl = configuredUpdateManifestUrl();
  setToolUpdateUi("Checking for updates…", "Check for Updates", true);

  try {
    const response = await fetch(`${manifestUrl}${manifestUrl.includes("?") ? "&" : "?"}t=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" }
    });
    if (!response.ok) throw new Error(`Update server returned ${response.status}.`);

    const manifest = await response.json();
    const latestVersion = String(manifest?.version || "").trim();
    if (!latestVersion) throw new Error("Update manifest has no version.");

    if (compareApplicationVersions(latestVersion, currentVersion) <= 0) {
      setToolUpdateUi(`Up to date • Version ${currentVersion}`, "Check for Updates", false);
      return;
    }

    const destination = String(manifest.releaseUrl || manifest.downloadUrl || "./").trim();
    setToolUpdateUi(`Applying version ${latestVersion} in this window…`, "Applying Update", true);
    if (typeof saveCurrentSettings === "function") saveCurrentSettings();

    // The updater no longer waits for an installing or waiting service worker.
    // That wait was the source of the recurring Downloading timeout. Clear the
    // stale worker/cache state and navigate directly in this same window.
    await clearStaleStagingRuntime();
    navigateToUpdateInCurrentWindow(destination, latestVersion);
  } catch (error) {
    console.error("Update check failed", error);
    setToolUpdateUi("Unable to apply the update. Check the connection and try again.", "Check for Updates", false);
  }
}

function download(name, type, content) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function oneDecimalOutput(value) {
  return Number.isFinite(value) ? (Math.round(Number(value) * 2) / 2).toFixed(1) : "";
}

function roundedServoExportRow(row) {
  return {
    ...row,
    tableAngle: Number.isFinite(row.tableAngle) ? Number(oneDecimalOutput(row.tableAngle)) : null,
    plateAngle: Number.isFinite(row.plateAngle) ? Number(oneDecimalOutput(row.plateAngle)) : null,
    tableTravel: Number.isFinite(row.tableTravel) ? Number(oneDecimalOutput(row.tableTravel)) : null,
    plateTravel: Number.isFinite(row.plateTravel) ? Number(oneDecimalOutput(row.plateTravel)) : null,
    speed: Number.isFinite(row.speed) ? Number(oneDecimalOutput(row.speed)) : null,
    absSpeed: Number.isFinite(row.absSpeed) ? Number(oneDecimalOutput(row.absSpeed)) : null
  };
}

function bindGlobalActions() {
  if (els.toggleAggregateSpacing) {
    els.toggleAggregateSpacing.setAttribute("aria-pressed", String(Boolean(state.showAggregateSpacingOverlay)));
    els.toggleAggregateSpacing.addEventListener("click", () => {
      state.showAggregateSpacingOverlay = !state.showAggregateSpacingOverlay;
      els.toggleAggregateSpacing.setAttribute("aria-pressed", String(state.showAggregateSpacingOverlay));
      saveCurrentSettings();
      renderMap();
    });
  }

  const setWipeDownPopupOpen = (open) => {
    if (!els.wipeDownDataPanel) return;
    els.wipeDownDataPanel.hidden = !open;
    els.showWipeDownData?.setAttribute("aria-expanded", String(open));
    if (open) renderWipeDownData();
  };
  els.showWipeDownData?.addEventListener("click", () => setWipeDownPopupOpen(els.wipeDownDataPanel?.hidden !== false));
  els.closeWipeDownData?.addEventListener("click", () => setWipeDownPopupOpen(false));

  [els.tablePitchRadiusMm, els.padClearanceMm].forEach((control) => {
    control?.addEventListener("change", () => {
      state.tablePitchRadiusMm = Math.max(0.001, num(els.tablePitchRadiusMm.value, state.tablePitchRadiusMm));
      state.padClearanceMm = Math.max(0, num(els.padClearanceMm.value, state.padClearanceMm));
      syncMapPointsFromAssemblies();
      render();
      renderAssemblyEditor();
    });
  });

  document.querySelector("#exportJson").addEventListener("click", () => {
    download("labeler-servo-map.json", "application/json", JSON.stringify({ ...state, heads: heads(), program: programSegments().map(roundedServoExportRow) }, null, 2));
  });

  els.exportSettings?.addEventListener("click", () => {
    saveCurrentSettings();
    const portable = {
      format: "labeler-tool-portable-settings",
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: settingsSnapshot()
    };
    download("labeler-tool-settings.json", "application/json", JSON.stringify(portable, null, 2));
  });
  els.importSettings?.addEventListener("change", () => importPortableSettingsFile(els.importSettings.files?.[0]));
  bindZoneSiteDeveloperMenu();

  document.querySelector("#exportCsv").addEventListener("click", () => {
    const autocol = activeMachineUsesAutocolCommands();
    const rows = [["HMI", "PLC", autocol ? "Travel Command" : "CMD", "Table Angle", "Plate Angle", "Table Travel", "Plate Travel", "Turn Speed", "Action"]];
    programSegments(state.program).forEach((row) => rows.push([row.hmi, row.plc, autocol ? autocolCommandLabel(row) : row.cmd, oneDecimalOutput(row.tableAngle), oneDecimalOutput(row.plateAngle), oneDecimalOutput(row.tableTravel), oneDecimalOutput(row.plateTravel), oneDecimalOutput(row.absSpeed), row.action]));
    download("labeler-servo-program.csv", "text/csv", rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n"));
  });

  els.saveSettings.addEventListener("click", saveCurrentSettings);
  els.checkForUpdates?.addEventListener("click", () => checkForToolUpdates());
  els.simulation?.addEventListener("click", (event) => {
    const insertButton = event.target.closest(".simulation-insert-pair");
    if (!insertButton) return;
    const lineIndex = Number(insertButton.dataset.simulationLineIndex);
    if (!Number.isInteger(lineIndex)) return;
    insertSimulationPairAfter(lineIndex);
    render();
  });
  els.importFaultConfig.addEventListener("change", () => importFaultConfigFile(els.importFaultConfig.files?.[0]));

  els.loadGeneratedTurns.addEventListener("click", () => {
    state.simulation.turns = state.program.map((row) => Number.isFinite(row.plateAngle) ? row.plateAngle : null);
    state.simulation.rows = state.program.map((row) => ({ cmd: row.cmd, tableAngle: row.tableAngle, action: row.action }));
    state.simulation.deletedRows = [];
    state.simulation.lines = state.program.map((row) => ({ ...row }));
    state.simulation.useCustom = true;
    render();
  });

  els.clearCustomTurns.addEventListener("click", () => {
    state.simulation.turns = state.program.map(() => null);
    state.simulation.rows = [];
    state.simulation.deletedRows = [];
    state.simulation.lines = [];
    state.simulation.useCustom = false;
    render();
  });

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      state.activeTab = tab.dataset.tab;
      document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".table-wrap").forEach((panel) => panel.classList.remove("active"));
      tab.classList.add("active");
      document.querySelector(`#${tab.dataset.tab}`)?.classList.add("active");
      render();
    });
  });
}

function animationFrame(now) {
  if (animationTimerId === null) return;
  const elapsedSeconds = Math.min(0.05, Math.max(0, now - lastAnimationTime) / 1000);
  lastAnimationTime = now;
  if (state.isPlaying) {
    const degreesPerSecond = Math.min(50, Math.max(1, num(state.animationSpeed, 10)));
    state.previewAngle = norm(state.previewAngle + degreesPerSecond * elapsedSeconds);
    try {
      renderAnimationFrame();
    } catch (error) {
      console.error("Animation frame render failed", error);
    }
  }
  animationTimerId = window.requestAnimationFrame(animationFrame);
}

function startAnimationLoop() {
  if (animationTimerId !== null) window.cancelAnimationFrame(animationTimerId);
  lastAnimationTime = performance.now();
  animationTimerId = window.requestAnimationFrame(animationFrame);
}

function showStartupError(error) {
  console.error("Labeler tool startup failed", error);
  const mapPanel = document.querySelector(".map-panel");
  const validationList = document.querySelector("#validationList");
  const message = error && error.message ? error.message : String(error || "Unknown startup error");
  if (mapPanel) {
    const notice = document.createElement("div");
    notice.className = "startup-error";
    notice.innerHTML = `<strong>Tool startup error</strong><span>${message}</span>`;
    mapPanel.appendChild(notice);
  }
  if (validationList) validationList.innerHTML = `<div class="notice bad">Startup failed: ${message}</div>`;
}

async function initializeLabelerApp() {
  try {
    loadSavedSettings();
    await applyCompanySettingsSeed();
    ensurePersistentApplicationMaps();
    if (typeof initializeStella660ColdGlueExample === "function" && initializeStella660ColdGlueExample()) saveCurrentSettings();
    bindSetup();
    bindWipeDownBuilder();
    bindGlobalActions();
    render();
    startAnimationLoop();
    registerToolUpdateService();
  } catch (error) {
    showStartupError(error);
  }
}

(function loadSimulatorMilestone() {
  if (document.querySelector('script[data-servoforge-simulator="0.7.99"]')) return;
  const script = document.createElement("script");
  script.src = "app/simulator-milestone.js?v=0.7.99";
  script.dataset.servoforgeSimulator = "0.7.99";
  document.head.appendChild(script);
})();
