"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const driverSource = fs.readFileSync(path.join(root, "drivers/map/map-schema-driver.js"), "utf8");
const adapterSource = fs.readFileSync(path.join(root, "app/map-schema-adapter-integration.js"), "utf8");

const sandbox = {
  console,
  Date,
  Math,
  state: {
    mapLibrary: [{ name: "Map" }],
    headCount: 45,
    radius: 250,
    referencePitchRadiusMm: 572.958,
    encoderCountsPerRev: 10000,
    servoGearRatio: 1,
    zeroAngle: 0,
    maxMoveRatio: 21,
    depths: { spender: 20 }
  },
  defaultAplAggregateAngles: () => ({ "1": 10, "2": 20, "3": 30, "4": 40, "5": 50, "6": 60 }),
  defaultAplStationAngles: () => ({ "1": 10, "2": 20, "3": 30, "4": 40, "5": 50, "6": 60 }),
  defaultAplMapObjects: () => [],
  deepClone: (value) => JSON.parse(JSON.stringify(value)),
  mapLocationFor: () => ({ zone: "Zone", site: "Site" }),
  LabelerDriverRegistry: {
    register() {},
    resolve(name) { return name === "map.schema" ? sandbox.LabelerMapSchemaDriver : null; }
  },
  uniqueMapName: () => "legacy",
  normalizeBuilderObject: () => ({ legacy: true }),
  createMachineMap: () => ({ legacy: true })
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(driverSource, sandbox);
vm.runInContext(adapterSource, sandbox);

assert.equal(sandbox.uniqueMapName("Map"), "Map 2");
assert.equal(sandbox.normalizeBuilderObject({ kind: "sensor", angle: 25 }, "apl", 6).end, 28);
const map = sandbox.createMachineMap({ id: "map-1", applicationMode: "apl", objects: [] });
assert.equal(map.schemaVersion, 11);
assert.equal(map.zone, "Zone");
assert.equal(map.site, "Site");
assert.equal(sandbox.LabelerMapSchemaAdapter.driver, "map.schema");
assert.ok(sandbox.LabelerMapSchemaAdapter.functions.includes("inferAplStationSections"));

console.log("Map schema adapter regressions passed.");