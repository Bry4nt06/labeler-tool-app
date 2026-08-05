"use strict";

(function installApprovedDefaultMapCatalog(global) {
  if (global.LabelerApprovedDefaultMapCatalog?.installed) return;

  const RETRY_MS = 50;
  const DEFAULT_MAP_IDS = Object.freeze([
    "map-apl-default",
    "map-45h-topmodul-3-label-apl-wipe-down-pads"
  ]);
  const LEGACY_PACKAGED_MAP_IDS = Object.freeze([
    "map-blank-apl",
    "map-l85-workbook-reference-3-label-apl",
    "machine-map-1784426568359-9375",
    "machine-map-1784427388958-9702",
    "machine-map-1784477554290-6537",
    "machine-map-1785590537632-2751",
    "machine-map-1785604940794-6949",
    "machine-map-1785604972525-2064"
  ]);
  const key = (value) => String(value ?? "").trim().toLowerCase();
  const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

  function approvedMaps(catalog) {
    const byId = new Map((Array.isArray(catalog?.maps) ? catalog.maps : [])
      .map((map) => [key(map?.id), map]));
    return DEFAULT_MAP_IDS
      .map((id) => byId.get(key(id)))
      .filter(Boolean)
      .map((map) => ({
        ...clone(map),
        companyDefaultProgram: true,
        protectedDefaultMap: true
      }));
  }

  function isRetiredPackagedMap(map) {
    const id = key(map?.id);
    return map?.companyDefaultProgram === true
      || map?.protectedDefaultMap === true
      || LEGACY_PACKAGED_MAP_IDS.some((legacyId) => key(legacyId) === id);
  }

  async function enforce({ persist = true, render = true } = {}) {
    const service = global.LabelerCompanyDefaultsService;
    if (!service?.loadCatalog || !global.state) {
      return { changed: false, reason: "service-unavailable" };
    }

    const catalog = await service.loadCatalog();
    const official = approvedMaps(catalog);
    if (official.length !== DEFAULT_MAP_IDS.length) {
      throw new Error(`The packaged map catalog must contain exactly ${DEFAULT_MAP_IDS.length} approved maps.`);
    }

    const reserved = new Set(DEFAULT_MAP_IDS.map(key));
    const current = Array.isArray(global.state.mapLibrary) ? global.state.mapLibrary : [];
    const custom = current.filter((map) =>
      !reserved.has(key(map?.id)) && !isRetiredPackagedMap(map)
    );
    const next = [...official, ...custom];
    const changed = !same(current, next);
    if (!changed) {
      return { changed: false, official: official.length, custom: custom.length };
    }

    const previousActiveId = key(global.state.activeMapId);
    global.state.mapLibrary = next;
    const active = next.find((map) => key(map?.id) === previousActiveId)
      || next.find((map) => key(map?.id) === key(catalog?.base?.settings?.activeMapId))
      || next[0];
    global.state.activeMapId = active?.id || "";
    global.state.selectedMapObjectId = "";
    global.state.builderHistory = { undo: [], redo: [] };

    if (active && typeof global.loadMachineMapIntoRuntime === "function") {
      global.loadMachineMapIntoRuntime(active, false);
    }
    if (persist && typeof global.saveCurrentSettings === "function") global.saveCurrentSettings();
    if (typeof global.applyGeneratedServoProfile === "function" && global.state.selectedBrand) {
      global.applyGeneratedServoProfile();
    }
    if (render && typeof global.render === "function") global.render();

    return {
      changed: true,
      official: official.length,
      custom: custom.length,
      activeMapId: global.state.activeMapId
    };
  }

  function install() {
    const service = global.LabelerCompanyDefaultsService;
    if (!service?.reconcile || !service?.loadCatalog || !global.state) return false;
    if (service.approvedDefaultMapCatalogV12) return true;

    const baseReconcile = service.reconcile.bind(service);
    global.LabelerCompanyDefaultsService = Object.freeze({
      ...service,
      async reconcile(...args) {
        const result = await baseReconcile(...args);
        const enforcement = await enforce({ persist: true, render: true });
        return {
          ...result,
          changed: Boolean(result?.changed || enforcement.changed),
          approvedDefaultMaps: DEFAULT_MAP_IDS.slice(),
          approvedDefaultMapCatalogEnforced: enforcement.changed,
          activeMapId: global.state.activeMapId
        };
      },
      approvedDefaultMapCatalogV12: true
    });

    global.LabelerApprovedDefaultMapCatalog = Object.freeze({
      installed: true,
      DEFAULT_MAP_IDS,
      LEGACY_PACKAGED_MAP_IDS,
      approvedMaps,
      isRetiredPackagedMap,
      enforce
    });
    return true;
  }

  function wait() {
    if (!install()) global.setTimeout(wait, RETRY_MS);
  }

  wait();
})(typeof window !== "undefined" ? window : globalThis);
