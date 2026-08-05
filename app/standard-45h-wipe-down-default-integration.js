"use strict";

(function installStandard45HWipeDownDefault(global) {
  const MAP_ID = "map-45h-topmodul-3-label-apl-wipe-down-pads";
  const MAP_NAME = "Standard 45H TopModul Wipe-Down Pads";
  const SOURCE = "./config/default-programs/map-45h-topmodul-3-label-apl-wipe-down-pads.json";
  const CATALOG_VERSION = 12;
  const RETRY_MS = 50;
  let installed = false;
  let replacing = null;

  const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
  const key = (value) => String(value ?? "").trim().toLowerCase();

  async function loadPackagedMap() {
    const response = await fetch(SOURCE, { cache: "no-store" });
    if (!response.ok) throw new Error(`${SOURCE} returned ${response.status}.`);
    const map = await response.json();
    if (key(map?.id) !== key(MAP_ID)) throw new Error("The packaged wipe-down default has an unexpected map id.");
    return {
      ...clone(map),
      id: MAP_ID,
      name: MAP_NAME,
      companyDefaultProgram: true,
      companyDefaultProgramVersion: CATALOG_VERSION,
      protectedDefaultMap: true,
      defaultCatalogVersion: CATALOG_VERSION
    };
  }

  function currentVersion(map) {
    return Math.max(
      Number(map?.defaultCatalogVersion || 0),
      Number(map?.companyDefaultProgramVersion || 0)
    );
  }

  function requiresReplacement(current) {
    if (!current) return true;
    return currentVersion(current) < CATALOG_VERSION
      || current.name !== MAP_NAME
      || current.protectedDefaultMap !== true;
  }

  async function replaceDefaultMap({ persist = true, render = true } = {}) {
    if (replacing) return replacing;
    replacing = (async () => {
      if (!global.state) return { changed: false, reason: "state-unavailable" };
      if (!Array.isArray(global.state.mapLibrary)) global.state.mapLibrary = [];

      const index = global.state.mapLibrary.findIndex((map) => key(map?.id) === key(MAP_ID));
      const current = index >= 0 ? global.state.mapLibrary[index] : null;
      if (!requiresReplacement(current)) return { changed: false, reason: "current" };

      const replacement = await loadPackagedMap();
      if (index >= 0) global.state.mapLibrary.splice(index, 1, replacement);
      else global.state.mapLibrary.push(replacement);

      const active = key(global.state.activeMapId) === key(MAP_ID);
      if (active) {
        global.state.activeMapId = MAP_ID;
        global.state.selectedMapObjectId = "";
        global.state.builderHistory = { undo: [], redo: [] };
        if (typeof global.loadMachineMapIntoRuntime === "function") {
          global.loadMachineMapIntoRuntime(replacement, false);
        }
      }

      if (persist && typeof global.saveCurrentSettings === "function") global.saveCurrentSettings();
      if (active && typeof global.applyGeneratedServoProfile === "function" && global.state.selectedBrand) {
        global.applyGeneratedServoProfile();
      }
      if (render && typeof global.render === "function") global.render();

      return { changed: true, active, map: replacement };
    })().finally(() => { replacing = null; });
    return replacing;
  }

  function wrapCompanyDefaults() {
    const service = global.LabelerCompanyDefaultsService;
    if (!service?.reconcile) return false;
    if (service.standard45HWipeDownDefaultV12) return true;
    const baseReconcile = service.reconcile.bind(service);
    global.LabelerCompanyDefaultsService = Object.freeze({
      ...service,
      async reconcile(...args) {
        const result = await baseReconcile(...args);
        const replacement = await replaceDefaultMap({ persist: true, render: false });
        if (replacement.changed && typeof global.render === "function") global.render();
        return {
          ...result,
          changed: Boolean(result?.changed || replacement.changed),
          standard45HWipeDownDefaultReplaced: replacement.changed,
          companyDefaultsVersion: Math.max(Number(result?.version || 0), CATALOG_VERSION)
        };
      },
      standard45HWipeDownDefaultV12: true
    });
    return true;
  }

  function install() {
    if (installed) return true;
    if (!global.state || !wrapCompanyDefaults()) return false;
    installed = true;
    global.LabelerStandard45HWipeDownDefault = Object.freeze({
      MAP_ID,
      MAP_NAME,
      SOURCE,
      CATALOG_VERSION,
      loadPackagedMap,
      replaceDefaultMap
    });
    global.setTimeout(() => {
      replaceDefaultMap({ persist: true, render: true }).catch((error) => {
        console.error("Unable to replace the Standard 45H wipe-down default.", error);
      });
    }, 0);
    return true;
  }

  function wait() {
    if (!install()) global.setTimeout(wait, RETRY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait, { once: true });
  else wait();
})(typeof window !== "undefined" ? window : globalThis);
