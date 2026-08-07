"use strict";

const assert = require("node:assert/strict");

const schema = {
  MACHINE_MAP_SCHEMA_VERSION: 11,
  STELLA_330_FULL_WRAP_CALIBRATION_VERSION: 2,
  BLANK_MAP_SEED_VERSION: 1,
  inferredMachineMapApplicationMode(map) {
    if (map?.applicationMode === "cold-glue") return "cold-glue";
    return /cold[ -]?glue|(^|[\s_-])cg([\s_-]|$)/i.test(String(map?.name || "")) ? "cold-glue" : "apl";
  },
  normalizeSpenderPlateAngles(value) {
    const source = value && typeof value === "object" ? value : {};
    return Object.fromEntries(Array.from({ length: 6 }, (_, index) => {
      const key = String(index + 1);
      const parsed = Number(source[key]);
      const valueDeg = Number.isFinite(parsed) ? parsed : 75;
      return [key, Math.max(0, Math.min(180, valueDeg))];
    }));
  }
};
global.LabelerMapSchemaDriver = schema;
const migration = require("../drivers/map/map-migration-driver.js");

function createMap(input = {}) {
  return {
    schemaVersion: 11,
    id: input.id || "generated",
    name: input.name || "Map",
    applicationMode: input.applicationMode === "cold-glue" ? "cold-glue" : "apl",
    aggregateAngles: input.aggregateAngles || {},
    objects: Array.isArray(input.objects) ? input.objects.map((item) => ({ ...item })) : [],
    restoreDefaultObjects: input.restoreDefaultObjects !== false,
    blankSeedVersion: input.blankSeedVersion || 0,
    ...input
  };
}
const dependencies = {
  createMap,
  mapLocationFor: (map) => ({ zone: map?.zone || "Zone 1", site: map?.site || "Site 1" }),
  normalizeAggregateAngles: (value) => ({ ...(value || {}) }),
  normalizeColdGlueObjects: (objects) => (objects || []).map((item) => ({
    ...item,
    kind: item.kind === "wipe" ? "brush" : item.kind,
    application: "cold-glue"
  }))
};

const current = createMap({ id: "map-current", name: "45H TopModul", zone: "Zone 1", site: "Site 1" });
const result = migration.migrateLibrary({ maps: [current], activeMapId: current.id }, dependencies);
assert.equal(result.maps[0], current, "current-schema map identity must be preserved");
assert.equal(result.activeMap, current);
assert.equal(result.maps[0].spenderPlateAngles["1"], 75);
assert.ok(result.maps.some((map) => map.id === "map-blank-apl"));

const retired = migration.migrateLibrary({
  maps: [
    createMap({ id: "map-blank-cold-glue", applicationMode: "cold-glue" }),
    createMap({ id: "map-cold-glue-default", name: "Cold Glue 3-Aggregate", applicationMode: "cold-glue" }),
    createMap({ id: "operator-cg", name: "Operator Cold Glue", applicationMode: "cold-glue", objects: [{ kind: "wipe", station: 1 }] })
  ],
  activeMapId: "operator-cg"
}, dependencies);
assert.deepEqual(retired.maps.filter((map) => map.applicationMode === "cold-glue").map((map) => map.id), ["operator-cg"]);
assert.equal(retired.activeMap.objects[0].kind, "brush");

const legacyBlank = createMap({
  id: "map-blank-apl-template",
  name: "Old Blank",
  objects: [{ kind: "pad" }],
  blankSeedVersion: 0
});
const blankResult = migration.migrateLibrary({ maps: [legacyBlank], activeMapId: legacyBlank.id }, dependencies);
assert.equal(legacyBlank.id, "map-blank-apl");
assert.equal(legacyBlank.headCount, 45);
assert.deepEqual(legacyBlank.objects, []);
assert.equal(blankResult.activeMapId, "map-blank-apl");

function legacyBrush(station, side, start, end) {
  return { kind: "brush", application: "cold-glue", station, side, start, end };
}
const stella = createMap({
  id: "stella",
  name: "60H CG MAB1",
  applicationMode: "cold-glue",
  objects: [
    legacyBrush(1, "outer", 87, 150), legacyBrush(1, "inner", 87, 150),
    legacyBrush(3, "outer", 159, 205.1), legacyBrush(3, "inner", 159, 205.1),
    legacyBrush(5, "outer", 237, 279.6), legacyBrush(5, "inner", 237, 279.6)
  ]
});
const stellaResult = migration.migrateLibrary({ maps: [stella], activeMapId: stella.id }, dependencies);
assert.equal(stellaResult.forceReload, true);
assert.equal(stella.stella330FullWrapCalibrationVersion, 2);
assert.deepEqual(migration.brushesByStation(stella, 1).map((brush) => [brush.start, brush.end]), [[161, 174], [210, 227]]);
assert.deepEqual(migration.brushesByStation(stella, 3).map((brush) => [brush.start, brush.end]), [[235, 247], [265, 273]]);
assert.deepEqual(migration.brushesByStation(stella, 5).map((brush) => [brush.start, brush.end]), [[285.8, 298], [300, 314]]);

const empty = migration.migrateLibrary({ maps: [], legacyAplObjects: [{ kind: "pad", station: 1 }] }, dependencies);
assert.equal(empty.maps[0].id, "map-apl-default");
assert.equal(empty.maps[0].objects[0].application, "apl");
assert.ok(empty.maps.some((map) => map.id === "map-blank-apl"));

console.log("Map migration driver regression passed.");
