"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../app/map-runtime-service.js"), "utf8");
let renderCount = 0;
let brandCount = 0;
let persistenceCount = 0;
const map = {
  id: "map-45h",
  zone: "ZONE",
  site: "SITE",
  applicationMode: "apl",
  headCount: 45,
  enabledAggregates: [true, false, false, false, false, false],
  enabledStations: [true, false, false, false, false, false],
  aggregateAngles: { "1": 75 },
  stationAngles: { "1": 75 },
  stationSections: { "1": "body" },
  machineSettings: {
    direction: "cw",
    radius: 250,
    referencePitchRadiusMm: 572.958,
    encoderCountsPerRev: 10000,
    servoGearRatio: 1,
    autoScaleTableMap: true,
    zeroAngle: 0,
    maxMoveRatio: 21
  },
  depths: { spender: 100 },
  objects: [
    { id: "pad-1", name: "Station 1 Outside", kind: "pad", application: "apl", station: 1, side: "outer", start: 80, end: 90 },
    { id: "code", name: "Coding", kind: "coding", application: "apl", station: null, side: "outer", start: 304, end: 309 }
  ]
};
const state = {
  mapLibrary: [map],
  activeMapId: map.id,
  selectedZone: "",
  selectedSite: "",
  applicationMode: "apl",
  headCount: 60,
  direction: "ccw",
  radius: 200,
  referencePitchRadiusMm: 500,
  encoderCountsPerRev: 5000,
  servoGearRatio: 2,
  autoScaleTableMap: false,
  zeroAngle: 10,
  maxMoveRatio: 15,
  depths: { spender: 50 },
  padClearanceMm: 2,
  assemblies: [],
  aplMapObjects: [],
  coldGlueMap: []
};
const sandbox = {
  console,
  state,
  defaultAssemblies: [{ station: 1, spenderAngle: 75, innerRollerAngles: [0, 0], outerRollerAngles: [0, 0] }],
  els: {},
  ensurePersistentApplicationMaps() { persistenceCount += 1; },
  mapLocationFor: () => ({ zone: "ZONE", site: "SITE" }),
  inferredMachineMapApplicationMode: (entry) => entry.applicationMode === "cold-glue" ? "cold-glue" : "apl",
  normalizeBuilderObject: (item) => ({ ...item, application: item.application || "apl" }),
  activeAplStationNumbers: () => [1],
  inferAplStationSections: () => ({ "1": "body" }),
  isStationEnabled: (_entry, station) => station === 1,
  normalizeAssembly: (assembly) => ({ ...assembly, innerRollerAngles: [...(assembly.innerRollerAngles || [0, 0])], outerRollerAngles: [...(assembly.outerRollerAngles || [0, 0])] }),
  labelSectionForStation: () => "body",
  mmToTableDegrees: (value) => value,
  num: (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback,
  norm: (value) => ((Number(value) % 360) + 360) % 360,
  ensureSelectedBrandForApplication() { brandCount += 1; },
  render() { renderCount += 1; }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

sandbox.loadMachineMapIntoRuntime(map, false);
assert.equal(state.activeMapId, map.id);
assert.equal(state.direction, "cw", "stored direction must remain cw without reinterpretation");
assert.equal(map.machineSettings.direction, "cw");
assert.equal(sandbox.LabelerMapRuntimeService.currentMapId(), map.id);
assert.equal(state.aplMapObjects.length, 2);
assert.equal(renderCount, 0);
assert.equal(brandCount, 1);

state.direction = "ccw";
sandbox.syncApplicationMapToLegacyState();
assert.equal(map.machineSettings.direction, "ccw", "runtime-to-map sync must preserve stored ccw");
assert.equal(sandbox.activeMachineMap(), map);
assert.equal(persistenceCount, 1);

sandbox.LabelerMapRuntimeService.invalidateRuntimeMap();
assert.equal(sandbox.LabelerMapRuntimeService.currentMapId(), null);

console.log("Map runtime service regression passed.");
