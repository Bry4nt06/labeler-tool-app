"use strict";

(function installMachineMapSelectorIntegration() {
  const RETRY_MS = 50;
  const PREFS_KEY = "servoforge-developer-preferences-v1";
  const RETIRED_MAP_ID = "map-workbook-3-label-apl-reference";
  const RETIRED_ACTIVATION_KEY = "servoforgeWorkbookReferenceMapV1Activated";
  let installed = false;
  let refreshPending = false;
  let observer = null;

  function readPreferences() {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
      return {
        ...saved,
        lockedMapIds: Array.isArray(saved?.lockedMapIds)
          ? [...new Set(saved.lockedMapIds.map(String))]
          : [],
        hiddenPanels: Array.isArray(saved?.hiddenPanels)
          ? [...new Set(saved.hiddenPanels.map(String))]
          : []
      };
    } catch {
      return { lockedMapIds: [], hiddenPanels: [] };
    }
  }

  function savePreferences(preferences) {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(preferences)); }
    catch { }
  }

  function maps() {
    return Array.isArray(state?.mapLibrary) ? state.mapLibrary : [];
  }

  function activeMap() {
    try { return typeof activeMachineMap === "function" ? activeMachineMap() : null; }
    catch { return null; }
  }

  function mapIsLocked(map) {
    return Boolean(map?.id && readPreferences().lockedMapIds.includes(String(map.id)));
  }

  function purgeRetiredWorkbookFeature() {
    document.querySelectorAll(".workbook-reference-comparison,#workbookReferenceComparisonStyles")
      .forEach((node) => node.remove());
    try { localStorage.removeItem(RETIRED_ACTIVATION_KEY); } catch { }

    const library = maps();
    const previousLength = library.length;
    const removedActiveMap = String(state.activeMapId || "") === RETIRED_MAP_ID;
    state.mapLibrary = library.filter((map) => String(map?.id || "") !== RETIRED_MAP_ID);

    const preferences = readPreferences();
    const filteredLocks = preferences.lockedMapIds.filter((id) => id !== RETIRED_MAP_ID);
    if (filteredLocks.length !== preferences.lockedMapIds.length) {
      preferences.lockedMapIds = filteredLocks;
      savePreferences(preferences);
    }

    if (removedActiveMap && state.mapLibrary.length) {
      state.activeMapId = String(state.mapLibrary[0].id || "");
      if (typeof loadMachineMapIntoRuntime === "function") {
        loadMachineMapIntoRuntime(state.mapLibrary[0], false);
      }
    }
    return previousLength !== state.mapLibrary.length;
  }

  function restoreSurfaceControls(surface) {
    if (!surface) return;
    surface.classList.remove("read-only-surface");
    surface.querySelectorAll("input,select,textarea,button").forEach((control) => {
      if (!control.hasAttribute("data-developer-was-disabled")) return;
      control.disabled = control.dataset.developerWasDisabled === "true";
      delete control.dataset.developerWasDisabled;
    });
  }

  function unlockEditableSurfaces() {
    restoreSurfaceControls(document.querySelector("#specs"));
    restoreSurfaceControls(document.querySelector("#buildInputs"));

    const note = document.querySelector("#workspaceControlsCard .workspace-controls-note:last-child");
    const noteText = "Locked maps protect the mechanical map, Map Builder, and Servo Program edits. Specs and Build Inputs remain editable.";
    if (note && note.textContent.trim() !== noteText) note.textContent = noteText;

    const help = document.querySelector("#workspaceMapLockHelp");
    if (help && mapIsLocked(activeMap())) {
      help.textContent = "The selected mechanical map is protected. Specs and Build Inputs remain editable.";
    }
  }

  function optionFor(map, lockedIds) {
    const option = document.createElement("option");
    const id = String(map?.id || "");
    option.value = id;
    option.dataset.mapId = id;
    option.dataset.locked = String(lockedIds.has(id));
    option.textContent = `${lockedIds.has(id) ? "🔒 " : ""}${String(map?.name || "Machine Map")}`;
    option.selected = id === String(state.activeMapId || "");
    return option;
  }

  function updateViewerCopy(viewer, map) {
    const label = viewer?.querySelector("label");
    if (label) {
      const text = [...label.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
      if (text && text.textContent !== "Machine Map ") text.textContent = "Machine Map ";
    }

    const badge = viewer?.querySelector(".locked-map-badge");
    if (!badge) return;
    const locked = mapIsLocked(map);
    badge.textContent = locked ? "Map Locked • Specs & Inputs Editable" : "Map Editable";
    badge.dataset.state = locked ? "locked" : "editable";
  }

  function renderMapOptions() {
    const viewer = document.querySelector("#lockedMapViewer");
    const select = viewer?.querySelector("#lockedMapViewerSelect");
    if (!viewer || !select) return;

    const library = maps();
    viewer.hidden = library.length === 0;
    if (!library.length) {
      select.replaceChildren();
      updateViewerCopy(viewer, null);
      return;
    }

    const lockedIds = new Set(readPreferences().lockedMapIds);
    const expected = library.map((map) => `${String(map?.id || "")}\u001f${lockedIds.has(String(map?.id || ""))}`);
    const current = [...select.options].map((option) => `${String(option.dataset.mapId || "")}\u001f${String(option.dataset.locked || "false") === "true"}`);

    if (expected.length !== current.length || expected.some((identity, index) => identity !== current[index])) {
      const fragment = document.createDocumentFragment();
      library.forEach((map) => fragment.appendChild(optionFor(map, lockedIds)));
      select.replaceChildren(fragment);
    }

    const selectedId = library.some((map) => String(map?.id || "") === String(state.activeMapId || ""))
      ? String(state.activeMapId || "")
      : String(library[0]?.id || "");
    select.value = selectedId;
    updateViewerCopy(viewer, library.find((map) => String(map?.id || "") === selectedId));
  }

  function applySelectedMap(mapId) {
    const map = maps().find((entry) => String(entry?.id || "") === String(mapId || ""));
    if (!map || String(map.id) === String(state.activeMapId || "")) {
      renderMapOptions();
      return;
    }

    if (typeof loadMachineMapIntoRuntime === "function") loadMachineMapIntoRuntime(map, true);
    else state.activeMapId = String(map.id);

    if (state.simulation) state.simulation.useCustom = false;
    if (typeof clearServoSimulationForSelectedMap === "function") clearServoSimulationForSelectedMap();
    if (typeof applyGeneratedServoProfile === "function") applyGeneratedServoProfile();
    if (typeof render === "function") render();
    if (typeof saveCurrentSettings === "function") saveCurrentSettings();
    scheduleRefresh();
  }

  function bindSelection() {
    if (document.documentElement.dataset.machineMapSelectorBound === "true") return;
    document.documentElement.dataset.machineMapSelectorBound = "true";
    document.addEventListener("change", (event) => {
      const select = event.target.closest?.("#lockedMapViewerSelect");
      if (!select) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      applySelectedMap(select.value);
    }, true);
  }

  function installStyles() {
    if (document.querySelector("#machineMapSelectorStyles")) return;
    document.querySelector("#lockedMapBrandSelectorStyles")?.remove();
    const style = document.createElement("style");
    style.id = "machineMapSelectorStyles";
    style.textContent = `
      #lockedMapViewerSelect option{font-weight:500;color:var(--text)}
      .locked-map-badge[data-state="editable"]{border-color:var(--green);color:var(--green)}
      #specs:not(.read-only-surface) input:not(:disabled),
      #specs:not(.read-only-surface) select:not(:disabled),
      #buildInputs:not(.read-only-surface) input:not(:disabled),
      #buildInputs:not(.read-only-surface) select:not(:disabled){opacity:1;cursor:auto}
    `;
    document.head.appendChild(style);
  }

  function refresh() {
    refreshPending = false;
    purgeRetiredWorkbookFeature();
    unlockEditableSurfaces();
    renderMapOptions();
  }

  function scheduleRefresh() {
    if (refreshPending) return;
    refreshPending = true;
    window.requestAnimationFrame(refresh);
  }

  function installObserver() {
    if (observer) return;
    observer = new MutationObserver(scheduleRefresh);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["disabled", "class", "hidden"]
    });
  }

  function install() {
    if (installed) return true;
    if (typeof state === "undefined" || typeof activeMachineMap !== "function" || !document.querySelector(".map-head")) return false;

    installed = true;
    const changed = purgeRetiredWorkbookFeature();
    bindSelection();
    installStyles();
    installObserver();
    unlockEditableSurfaces();
    renderMapOptions();
    if (changed && typeof saveCurrentSettings === "function") saveCurrentSettings();
    window.setTimeout(scheduleRefresh, 250);
    window.setTimeout(scheduleRefresh, 1000);
    return true;
  }

  function wait() {
    if (!install()) window.setTimeout(wait, RETRY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait, { once: true });
  else wait();
})();
