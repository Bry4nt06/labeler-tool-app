"use strict";

(function installMapMigrationService(global) {
  const migration = global.LabelerDriverRegistry?.resolve("map.migration")
    || global.LabelerMapMigrationDriver;
  const schema = global.LabelerDriverRegistry?.resolve("map.schema")
    || global.LabelerMapSchemaDriver;
  const runtime = global.LabelerMapRuntimeService;
  if (!migration || !schema || !runtime) {
    throw new Error("Map migration service requires map.schema, map.migration, and the map runtime service.");
  }

  let running = false;

  function coldGlueObjects(objects) {
    if (typeof normalizeColdGlueMap === "function") return normalizeColdGlueMap(objects);
    return (Array.isArray(objects) ? objects : []).map((item) =>
      normalizeBuilderObject({
        ...item,
        kind: item?.kind === "wipe" ? "brush" : item?.kind
      }, "cold-glue", 6)
    );
  }

  function migratePersistentMaps() {
    if (running) {
      return state.mapLibrary?.find((map) => map.id === state.activeMapId)
        || state.mapLibrary?.[0]
        || null;
    }
    running = true;
    try {
      const result = migration.migrateLibrary({
        maps: state.mapLibrary,
        legacyAplObjects: Array.isArray(state.aplMapObjects) && state.aplMapObjects.length
          ? state.aplMapObjects
          : (typeof defaultAplMapObjects === "function" ? defaultAplMapObjects() : []),
        activeMapId: state.activeMapId
      }, {
        createMap: (input) => createMachineMap(input),
        mapLocationFor: (map) => mapLocationFor(map),
        normalizeAggregateAngles: (value, mode, objects) =>
          normalizeAggregateAngles(value, mode, objects),
        normalizeColdGlueObjects: coldGlueObjects
      });

      state.mapLibrary = result.maps;
      state.activeMapId = result.activeMapId;
      const selected = result.activeMap;
      if (selected && (result.forceReload || runtime.currentMapId() !== selected.id)) {
        runtime.loadMachineMapIntoRuntime(selected, false);
      }
      return selected;
    } finally {
      running = false;
    }
  }

  const implementation = function ensurePersistentApplicationMapsWithMigrationService() {
    return migratePersistentMaps();
  };
  implementation.mapMigrationInstalled = true;
  implementation.driver = "map.migration";

  global.ensurePersistentApplicationMaps = implementation;
  global.LabelerMapMigrationService = Object.freeze({
    driver: "map.migration",
    schemaVersion: schema.MACHINE_MAP_SCHEMA_VERSION,
    migratePersistentMaps,
    ensurePersistentApplicationMaps: implementation
  });
})(typeof window !== "undefined" ? window : globalThis);
