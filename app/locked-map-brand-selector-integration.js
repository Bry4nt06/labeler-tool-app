"use strict";

(function installLockedMapBrandSelectorIntegration() {
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
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(preferences));
    } catch {
      // Browser storage may be unavailable. Runtime behavior still works.
    }
  }

  function normalizedMode(value) {
    try {
      if (typeof normalizeLabelApplicationMode === "function") {
        return normalizeLabelApplicationMode(value);
      }
    } catch { }
    return String(value || "apl").toLowerCase() === "cold-glue" ? "cold-glue" : "apl";
  }

  function compatibleBrandSpecs(map) {
    const mode = normalizedMode(map?.applicationMode);
    const seen = new Set();
    return (Array.isArray(state?.labelSpecs) ? state.labelSpecs : []).filter((spec) => {
      const brand = String(spec?.brand || "").trim();
      if (!brand || normalizedMode(spec?.applicationMode) !== mode) return false;
      const key = brand.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function lockedMaps() {
    const locked = new Set(readPreferences().lockedMapIds);
    return (Array.isArray(state?.mapLibrary) ? state.mapLibrary : [])
      .filter((map) => locked.has(String(map?.id || "")));
  }

  function purgeRetiredWorkbookFeature() {
    document.querySelectorAll(".workbook-reference-comparison,#workbookReferenceComparisonStyles")
      .forEach((node) => node.remove());

    try { localStorage.removeItem(RETIRED_ACTIVATION_KEY); } catch { }

    if (!Array.isArray(state?.mapLibrary)) return false;
    const previousLength = state.mapLibrary.length;
    const removedActiveMap = String(state.activeMapId || "") === RETIRED_MAP_ID;
    state.mapLibrary = state.mapLibrary.filter((map) => String(map?.id || "") !== RETIRED_MAP_ID);

    const preferences = readPreferences();
    const filteredLocks = preferences.lockedMapIds.filter((id) => id !== RETIRED_MAP_ID);
    if (filteredLocks.length !== preferences.lockedMapIds.length) {
      preferences.lockedMapIds = filteredLocks;
      savePreferences(preferences);
    }

    if (removedActiveMap && state.mapLibrary.length) {
      state.activeMapId = String(state.mapLibrary[0].id || "");
      try {
        if (typeof loadMachineMapIntoRuntime === "function") {
          loadMachineMapIntoRuntime(state.mapLibrary[0], false);
        }
      } catch { }
    }

    return previousLength !== state.mapLibrary.length;
  }

  function optionIdentity(option) {
    return `${String(option?.dataset?.mapId || "")}\u001f${String(option?.dataset?.brand || "")}`;
  }

  function expectedIdentities(maps) {
    return maps.flatMap((map) => {
      const specs = compatibleBrandSpecs(map);
      if (!specs.length) return [`${String(map.id)}\u001f`];
      return specs.map((spec) => `${String(map.id)}\u001f${String(spec.brand)}`);
    });
  }

  function viewerOptionsAreCurrent(select, maps) {
    const expected = expectedIdentities(maps);
    const current = [...select.options].map(optionIdentity);
    return expected.length === current.length
      && expected.every((identity, index) => identity === current[index]);
  }

  function createBrandOption(map, spec, multipleMaps) {
    const option = document.createElement("option");
    option.dataset.mapId = String(map.id || "");
    option.dataset.brand = String(spec?.brand || "");
    option.value = `${option.dataset.mapId}\u001f${option.dataset.brand}`;
    option.textContent = spec?.brand
      ? String(spec.brand)
      : multipleMaps ? String(map.name || "Machine Map") : "No compatible label specs";
    option.disabled = !spec?.brand;
    if (String(map.id) === String(state.activeMapId)
      && String(spec?.brand || "") === String(state.selectedBrand || "")) {
      option.selected = true;
    }
    return option;
  }

  function updateViewerLabel(viewer) {
    const label = viewer?.querySelector("label");
    if (label) {
      const text = [...label.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
      if (text && text.textContent !== "Locked Maps — Label Specs ") text.textContent = "Locked Maps — Label Specs ";
    }
    const badge = viewer?.querySelector(".locked-map-badge");
    if (badge && badge.textContent !== "Read Only Map • Inputs Editable") badge.textContent = "Read Only Map • Inputs Editable";
  }

  function renderBrandOptions() {
    const viewer = document.querySelector("#lockedMapViewer");
    const select = viewer?.querySelector("#lockedMapViewerSelect");
    if (!viewer || !select) return;

    const maps = lockedMaps();
    viewer.hidden = maps.length === 0;
    updateViewerLabel(viewer);
    if (!maps.length) return;

    if (!viewerOptionsAreCurrent(select, maps)) {
      const fragment = document.createDocumentFragment();
      const multipleMaps = maps.length > 1;
      maps.forEach((map) => {
        const specs = compatibleBrandSpecs(map);
        const parent = multipleMaps ? document.createElement("optgroup") : fragment;
        if (multipleMaps) parent.label = String(map.name || "Machine Map");
        if (specs.length) {
          specs.forEach((spec) => parent.appendChild(createBrandOption(map, spec, multipleMaps)));
        } else {
          parent.appendChild(createBrandOption(map, null, multipleMaps));
        }
        if (multipleMaps) fragment.appendChild(parent);
      });
      select.replaceChildren(fragment);
    }

    const selected = [...select.options].find((option) =>
      option.dataset.mapId === String(state.activeMapId || "")
      && option.dataset.brand === String(state.selectedBrand || "")
    );
    if (selected) select.value = selected.value;
    else {
      const activeMapOption = [...select.options].find((option) =>
        option.dataset.mapId === String(state.activeMapId || "") && !option.disabled
      );
      if (activeMapOption) select.value = activeMapOption.value;
    }
  }

  function unlockBuildInputs() {
    const surface = document.querySelector("#buildInputs");
    if (!surface) return;
    surface.classList.remove("read-only-surface");
    surface.querySelectorAll("input,select,textarea,button").forEach((control) => {
      if (!control.hasAttribute("data-developer-was-disabled")) return;
      control.disabled = control.dataset.developerWasDisabled === "true";
      delete control.dataset.developerWasDisabled;
    });

    const note = document.querySelector("#workspaceControlsCard .workspace-controls-note:last-child");
    const noteText = "Locked maps protect mechanical layout, Specs, and Servo Program edits. Build Inputs remain editable for brand selection and program generation.";
    if (note && note.textContent !== noteText) note.textContent = noteText;
  }

  function applySelectedBrand(option) {
    const mapId = String(option?.dataset?.mapId || "");
    const brand = String(option?.dataset?.brand || "");
    if (!mapId || !brand) return;

    const map = (state.mapLibrary || []).find((entry) => String(entry?.id || "") === mapId);
    const locked = readPreferences().lockedMapIds.includes(mapId);
    const spec = compatibleBrandSpecs(map).find((entry) => String(entry.brand) === brand);
    if (!map || !locked || !spec) return;

    try {
      if (String(state.activeMapId || "") !== mapId && typeof loadMachineMapIntoRuntime === "function") {
        loadMachineMapIntoRuntime(map, false);
      }
      state.selectedBrand = String(spec.brand);
      if (spec.bottleType) state.selectedBottle = String(spec.bottleType);
      if (state.simulation) state.simulation.useCustom = false;
      if (typeof clearServoSimulationForSelectedMap === "function") clearServoSimulationForSelectedMap();
      if (typeof applyGeneratedServoProfile === "function") applyGeneratedServoProfile();
      if (typeof render === "function") render();
      if (typeof saveCurrentSettings === "function") saveCurrentSettings();
    } finally {
      scheduleRefresh();
    }
  }

  function bindSelection() {
    if (document.documentElement.dataset.lockedMapBrandSelectorBound === "true") return;
    document.documentElement.dataset.lockedMapBrandSelectorBound = "true";
    document.addEventListener("change", (event) => {
      const select = event.target.closest?.("#lockedMapViewerSelect");
      if (!select) return;
      const option = select.selectedOptions?.[0];
      if (!option?.dataset?.mapId) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      applySelectedBrand(option);
    }, true);
  }

  function installStyles() {
    if (document.querySelector("#lockedMapBrandSelectorStyles")) return;
    const style = document.createElement("style");
    style.id = "lockedMapBrandSelectorStyles";
    style.textContent = `
      #lockedMapViewerSelect optgroup{font-weight:800;color:var(--map-label)}
      #lockedMapViewerSelect option{font-weight:500;color:var(--text)}
      #buildInputs:not(.read-only-surface) input:not(:disabled),
      #buildInputs:not(.read-only-surface) select:not(:disabled){opacity:1;cursor:auto}
    `;
    document.head.appendChild(style);
  }

  function refresh() {
    refreshPending = false;
    purgeRetiredWorkbookFeature();
    unlockBuildInputs();
    renderBrandOptions();
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
      attributeFilter: ["disabled", "class"]
    });
  }

  function install() {
    if (installed) return true;
    if (typeof state === "undefined"
      || typeof activeMachineMap !== "function"
      || !document.querySelector(".map-head")) return false;

    installed = true;
    const changed = purgeRetiredWorkbookFeature();
    bindSelection();
    installStyles();
    installObserver();
    unlockBuildInputs();
    renderBrandOptions();
    if (changed && typeof saveCurrentSettings === "function") saveCurrentSettings();
    window.setTimeout(scheduleRefresh, 250);
    window.setTimeout(scheduleRefresh, 1000);
    return true;
  }

  function wait() {
    if (!install()) window.setTimeout(wait, RETRY_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wait, { once: true });
  } else {
    wait();
  }
})();
