"use strict";

(function installMapMigrationDriver(global) {
  if (global.LabelerMapMigrationDriver) return;

  const schema = global.LabelerDriverRegistry?.resolve("map.schema")
    || global.LabelerMapSchemaDriver;
  if (!schema) throw new Error("Map migration driver requires map.schema.");

  const LEGACY_BLANK_APL_IDS = Object.freeze([
    "map-blank-apl-template",
    "map-blank-template"
  ]);
  const RETIRED_COLD_GLUE_IDS = Object.freeze([
    "map-blank-cold-glue",
    "map-blank-cold-glue-template"
  ]);

  function finite(value, fallback = NaN) {
    if (value === null || value === undefined || value === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function matchesBrushWindow(brushes, start, end, tolerance = 0.25) {
    return Array.isArray(brushes)
      && brushes.length === 2
      && brushes.every((brush) =>
        Math.abs(finite(brush?.start, 0) - start) < tolerance
        && Math.abs(finite(brush?.end, 0) - end) < tolerance
      );
  }

  function brushesByStation(map, station) {
    return (Array.isArray(map?.objects) ? map.objects : [])
      .filter((item) => item?.kind === "brush" && Number(item?.station) === station)
      .sort((a, b) => String(a?.side) === "outer"
        ? -1
        : String(b?.side) === "outer"
          ? 1
          : finite(a?.start, 0) - finite(b?.start, 0));
  }

  function isLegacyStella330Layout(map) {
    if (String(map?.name || "").trim().toLowerCase() !== "60h cg mab1") return false;
    return matchesBrushWindow(brushesByStation(map, 1), 87, 150)
      && matchesBrushWindow(brushesByStation(map, 3), 159, 205.1)
      && matchesBrushWindow(brushesByStation(map, 5), 237, 279.6);
  }

  function calibrateStella330Map(map) {
    if (!isLegacyStella330Layout(map)) return false;

    function setBrushPair(brushes, processWindow, finalWindow, processCoverage = 50) {
      Object.assign(brushes[0], {
        start: processWindow[0],
        end: processWindow[1],
        side: "outer",
        role: "process",
        coveragePercent: processCoverage
      });
      Object.assign(brushes[1], {
        start: finalWindow[0],
        end: finalWindow[1],
        side: "inner",
        role: "final",
        coveragePercent: 100 - processCoverage
      });
    }

    setBrushPair(brushesByStation(map, 1), [161, 174], [210, 227], 50);
    setBrushPair(brushesByStation(map, 3), [235, 247], [265, 273]);
    setBrushPair(brushesByStation(map, 5), [285.8, 298], [300, 314]);
    map.stella330FullWrapCalibrationVersion = schema.STELLA_330_FULL_WRAP_CALIBRATION_VERSION;
    return true;
  }

  function isRetiredColdGlueMap(map) {
    if (RETIRED_COLD_GLUE_IDS.includes(map?.id)) return true;
    return map?.id === "map-cold-glue-default"
      && map?.name === "Cold Glue 3-Aggregate";
  }

  function normalizeMapRecord(map, {
    createMap,
    mapLocationFor,
    normalizeAggregateAngles
  } = {}) {
    const applicationMode = schema.inferredMachineMapApplicationMode(map);
    if (map && Number(map.schemaVersion) === schema.MACHINE_MAP_SCHEMA_VERSION) {
      map.applicationMode = applicationMode;
      map.isTemplate = false;
      map.aggregateAngles = normalizeAggregateAngles(map.aggregateAngles, applicationMode, map.objects);
      Object.assign(map, mapLocationFor(map));
      return { map, replaced: false };
    }
    return {
      map: createMap({ ...(map || {}), applicationMode }),
      replaced: true
    };
  }

  function repairBlankAplMap(map, { createMap } = {}) {
    const id = "map-blank-apl";
    const needsReset = map
      && (map.id !== id || Number(map.blankSeedVersion) !== schema.BLANK_MAP_SEED_VERSION);

    if (needsReset) {
      Object.assign(map, {
        id,
        name: "Blank APL Map",
        applicationMode: "apl",
        headCount: 45,
        aggregateCount: 1,
        stationCount: 1,
        enabledAggregates: [true, false, false, false, false, false],
        enabledStations: [true, false, false, false, false, false],
        objects: [],
        restoreDefaultObjects: false,
        isTemplate: false,
        schemaVersion: schema.MACHINE_MAP_SCHEMA_VERSION,
        blankSeedVersion: schema.BLANK_MAP_SEED_VERSION
      });
    }

    if (!map) {
      map = createMap({
        id,
        name: "Blank APL Map",
        applicationMode: "apl",
        headCount: 45,
        aggregateCount: 1,
        stationCount: 1,
        enabledAggregates: [true, false, false, false, false, false],
        enabledStations: [true, false, false, false, false, false],
        objects: [],
        restoreDefaultObjects: false,
        isTemplate: false,
        blankSeedVersion: schema.BLANK_MAP_SEED_VERSION
      });
    }

    map.isTemplate = false;
    map.restoreDefaultObjects = false;
    map.blankSeedVersion = schema.BLANK_MAP_SEED_VERSION;
    return map;
  }

  function migrateLibrary({
    maps,
    legacyAplObjects = [],
    activeMapId = ""
  } = {}, {
    createMap,
    mapLocationFor,
    normalizeAggregateAngles,
    normalizeColdGlueObjects
  } = {}) {
    if (typeof createMap !== "function") throw new TypeError("createMap dependency is required.");
    if (typeof mapLocationFor !== "function") throw new TypeError("mapLocationFor dependency is required.");
    if (typeof normalizeAggregateAngles !== "function") throw new TypeError("normalizeAggregateAngles dependency is required.");
    if (typeof normalizeColdGlueObjects !== "function") throw new TypeError("normalizeColdGlueObjects dependency is required.");

    const source = Array.isArray(maps) ? maps : [];
    let library;
    const replacedIds = [];
    const forceReloadIds = new Set();

    if (!source.length) {
      library = [createMap({
        id: "map-apl-default",
        name: "APL 6-Aggregate",
        applicationMode: "apl",
        aggregateCount: 6,
        stationCount: 6,
        objects: (Array.isArray(legacyAplObjects) ? legacyAplObjects : [])
          .map((item) => ({ ...item, application: "apl" }))
      })];
    } else {
      library = source.map((map) => {
        const normalized = normalizeMapRecord(map, {
          createMap,
          mapLocationFor,
          normalizeAggregateAngles
        });
        if (normalized.replaced && map?.id) replacedIds.push(map.id);
        return normalized.map;
      });
    }

    library = library.filter((map) => !isRetiredColdGlueMap(map));

    library.filter((map) => map?.applicationMode === "cold-glue").forEach((map) => {
      map.objects = normalizeColdGlueObjects(map.objects);
      map.restoreDefaultObjects = false;
      if (calibrateStella330Map(map)) forceReloadIds.add(map.id);
    });

    let blank = library.find((entry) =>
      entry?.id === "map-blank-apl" || LEGACY_BLANK_APL_IDS.includes(entry?.id)
    );
    blank = repairBlankAplMap(blank, { createMap });
    if (!library.includes(blank)) library.push(blank);

    let selectedId = activeMapId;
    if (!selectedId || !library.some((map) => map.id === selectedId)) {
      selectedId = library[0]?.id || "";
    }
    const activeMap = library.find((map) => map.id === selectedId) || library[0] || null;

    return {
      maps: library,
      activeMapId: activeMap?.id || "",
      activeMap,
      forceReload: Boolean(activeMap && forceReloadIds.has(activeMap.id)),
      forceReloadIds: [...forceReloadIds],
      replacedIds
    };
  }

  const api = Object.freeze({
    LEGACY_BLANK_APL_IDS,
    RETIRED_COLD_GLUE_IDS,
    finite,
    matchesBrushWindow,
    brushesByStation,
    isLegacyStella330Layout,
    calibrateStella330Map,
    isRetiredColdGlueMap,
    normalizeMapRecord,
    repairBlankAplMap,
    migrateLibrary
  });

  global.LabelerMapMigrationDriver = api;
  global.LabelerDriverRegistry?.register("map.migration", api, {
    dependencies: ["map.schema"],
    source: "drivers/map/map-migration-driver.js",
    replace: true
  });

  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
