"use strict";

(function installGlobalMapLibraryIntegration() {
  const RETRY_MS = 50;
  let installed = false;
  let observer = null;

  function purge(target = window.state) {
    if (typeof purgeDeprecatedMapLocationMetadata === "function") {
      purgeDeprecatedMapLocationMetadata(target);
      return target;
    }
    if (!target || typeof target !== "object") return target;
    [
      "selected" + "Zone",
      "selected" + "Site",
      "mapLibrary" + "Zone",
      "mapLibrary" + "Site",
      "zoneSite" + "Configuration"
    ].forEach((key) => delete target[key]);
    (target.mapLibrary || []).forEach((map) => {
      if (!map || typeof map !== "object") return;
      delete map.zone;
      delete map.site;
    });
    return target;
  }

  function purgeStoredSettings() {
    try {
      const key = typeof SETTINGS_KEY === "string" ? SETTINGS_KEY : "labelerToolSettings";
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const saved = purge(JSON.parse(raw));
      localStorage.setItem(key, JSON.stringify(saved));
    } catch (error) {
      console.warn("Deprecated map location metadata could not be removed from browser storage.", error);
    }
  }

  function removeLocationControls() {
    ["#mapZone", "#mapSite"].forEach((selector) => {
      const control = document.querySelector(selector);
      const label = control?.closest("label");
      (label || control)?.remove();
    });
    document.querySelectorAll(".zone-site-editor,.zone-site-selection,.developer-menu-actions").forEach((node) => node.remove());
  }

  function stripMap(map) {
    if (!map || typeof map !== "object") return map;
    delete map.zone;
    delete map.site;
    return map;
  }

  function wrapCreateMachineMap() {
    const original = window.createMachineMap;
    if (typeof original !== "function" || original.globalMapLibraryWrapped) return;
    const wrapped = function createGlobalMachineMap(options = {}) {
      const clean = options && typeof options === "object" ? { ...options } : {};
      delete clean.zone;
      delete clean.site;
      return stripMap(original.call(this, clean));
    };
    wrapped.globalMapLibraryWrapped = true;
    wrapped.originalCreateMachineMap = original;
    window.createMachineMap = wrapped;
    try { createMachineMap = wrapped; } catch { /* global binding may be fixed */ }
  }

  function wrapLoadMachineMap() {
    const original = window.loadMachineMapIntoRuntime;
    if (typeof original !== "function" || original.globalMapLibraryWrapped) return;
    const wrapped = function loadGlobalMachineMap(map, ...args) {
      stripMap(map);
      const result = original.call(this, map, ...args);
      stripMap(map);
      purge();
      return result;
    };
    wrapped.globalMapLibraryWrapped = true;
    wrapped.originalLoadMachineMap = original;
    window.loadMachineMapIntoRuntime = wrapped;
    try { loadMachineMapIntoRuntime = wrapped; } catch { /* global binding may be fixed */ }
  }

  function wrapSettingsSnapshot() {
    const original = window.settingsSnapshot;
    if (typeof original !== "function" || original.globalMapLibraryWrapped) return;
    const wrapped = function globalSettingsSnapshot(...args) {
      return purge(original.apply(this, args));
    };
    wrapped.globalMapLibraryWrapped = true;
    wrapped.originalSettingsSnapshot = original;
    window.settingsSnapshot = wrapped;
    try { settingsSnapshot = wrapped; } catch { /* global binding may be fixed */ }
  }

  function wrapMapExport() {
    const original = window.exportSelectedMachineMap;
    if (typeof original !== "function" || original.globalMapLibraryWrapped) return;
    const wrapped = function exportGlobalMachineMap(...args) {
      purge();
      return original.apply(this, args);
    };
    wrapped.globalMapLibraryWrapped = true;
    wrapped.originalExportSelectedMachineMap = original;
    window.exportSelectedMachineMap = wrapped;
    try { exportSelectedMachineMap = wrapped; } catch { /* global binding may be fixed */ }
  }

  function saveMapWithoutLocationPrompt(event) {
    const button = event.target.closest?.("#saveMachineMap");
    if (!button) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    purge();
    if (typeof saveMapDefinitionFromControls === "function") {
      saveMapDefinitionFromControls({ type: "input" });
      purge();
      if (typeof saveCurrentSettings === "function") saveCurrentSettings();
      if (typeof renderWipeDownBuilder === "function") renderWipeDownBuilder();
    }
    return true;
  }

  function deleteMapWithoutLocationPrompt(event) {
    const button = event.target.closest?.("#deleteMachineMap");
    if (!button) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!Array.isArray(state.mapLibrary) || state.mapLibrary.length <= 1) {
      window.alert("At least one machine map must remain in the library.");
      return true;
    }
    const index = state.mapLibrary.findIndex((map) => map.id === state.activeMapId);
    const map = state.mapLibrary[index];
    if (!map || !window.confirm(`Delete map "${map.name}"? This cannot be undone.`)) return true;
    state.mapLibrary.splice(index, 1);
    purge();
    const replacement = state.mapLibrary[Math.max(0, index - 1)] || state.mapLibrary[0];
    if (typeof clearServoSimulationForSelectedMap === "function") clearServoSimulationForSelectedMap();
    if (typeof loadMachineMapIntoRuntime === "function") loadMachineMapIntoRuntime(replacement, true);
    if (typeof saveCurrentSettings === "function") saveCurrentSettings();
    if (typeof renderWipeDownBuilder === "function") renderWipeDownBuilder();
    return true;
  }

  function bindControls() {
    if (document.documentElement.dataset.globalMapLibraryBound === "true") return;
    document.documentElement.dataset.globalMapLibraryBound = "true";
    document.addEventListener("click", (event) => {
      if (saveMapWithoutLocationPrompt(event)) return;
      deleteMapWithoutLocationPrompt(event);
    }, true);
  }

  function installStyles() {
    if (document.querySelector("#globalMapLibraryStyles")) return;
    const style = document.createElement("style");
    style.id = "globalMapLibraryStyles";
    style.textContent = `
      #mapZone,#mapSite,
      label:has(>#mapZone),label:has(>#mapSite),
      .zone-site-editor,.zone-site-selection,.developer-menu-actions{display:none!important}
      .map-library-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
    `;
    document.head.appendChild(style);
  }

  function refresh() {
    purge();
    purgeStoredSettings();
    removeLocationControls();
    wrapCreateMachineMap();
    wrapLoadMachineMap();
    wrapSettingsSnapshot();
    wrapMapExport();
  }

  function install() {
    if (installed) return true;
    if (typeof state === "undefined"
      || typeof createMachineMap !== "function"
      || typeof saveCurrentSettings !== "function"
      || !document.querySelector("#applicationSetupDialog")) return false;
    installed = true;
    installStyles();
    bindControls();
    refresh();
    observer = new MutationObserver(() => window.requestAnimationFrame(refresh));
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("beforeunload", () => {
      purge();
      purgeStoredSettings();
    });
    return true;
  }

  function wait() {
    if (install()) return;
    window.setTimeout(wait, RETRY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait, { once: true });
  else wait();
})();
