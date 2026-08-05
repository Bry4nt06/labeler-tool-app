"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const driver = read("drivers/map/map-schema-driver.js");
const migrationDriver = read("drivers/map/map-migration-driver.js");
const adapter = read("app/map-schema-adapter-integration.js");
const migrationService = read("app/map-migration-service.js");
const runtimeService = read("app/map-runtime-service.js");
const loader = read("app/wipe-down-builder.js");
const featureLoader = read("app/simulation-collapsible-integration.js");
const serviceWorker = read("service-worker.js");
const controls = read("app/map-builder-controls.js");
const history = read("app/map-builder-history-service.js");
const renderer = read("app/map-builder-renderer.js");
const controller = read("app/map-builder-controller.js");
const uiSources = [controls, history, renderer, controller];

const schemaPath = "drivers/map/map-schema-driver.js";
const migrationPath = "drivers/map/map-migration-driver.js";
const adapterPath = "app/map-schema-adapter-integration.js";
const runtimePath = "app/map-runtime-service.js";
const migrationServicePath = "app/map-migration-service.js";
const uiPaths = [
  "app/map-builder-controls.js",
  "app/map-builder-history-service.js",
  "app/map-builder-renderer.js",
  "app/map-builder-controller.js"
];

[schemaPath, migrationPath, adapterPath, runtimePath, migrationServicePath, ...uiPaths].forEach((file) => {
  assert.match(loader, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(serviceWorker, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
assert.ok(loader.indexOf(schemaPath) < loader.indexOf(migrationPath));
assert.ok(loader.indexOf(migrationPath) < loader.indexOf(adapterPath));
assert.ok(loader.indexOf(adapterPath) < loader.indexOf(runtimePath));
assert.ok(loader.indexOf(runtimePath) < loader.indexOf(migrationServicePath));
assert.ok(loader.indexOf(migrationServicePath) < loader.indexOf(uiPaths[0]));
for (let index = 1; index < uiPaths.length; index += 1) {
  assert.ok(loader.indexOf(uiPaths[index - 1]) < loader.indexOf(uiPaths[index]));
}

[schemaPath, migrationPath, adapterPath, migrationServicePath].forEach((file) => {
  assert.doesNotMatch(featureLoader, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${file} must not be loaded twice`);
});

[
  "normalizeBuilderObject",
  "normalizeEnabledSlots",
  "normalizeAggregateAngles",
  "normalizeStationAngles",
  "inferAplStationSections",
  "createMachineMap"
].forEach((name) => {
  assert.match(driver, new RegExp(`function ${name}\\(`), `${name} must be implemented by map.schema`);
  assert.match(adapter, new RegExp(`${name}\\(`), `${name} must be routed through the browser adapter`);
  assert.doesNotMatch(loader, new RegExp(`function ${name}\\(`));
  uiSources.forEach((source) => assert.doesNotMatch(source, new RegExp(`function ${name}\\(`)));
});

assert.match(migrationDriver, /function migrateLibrary\(/);
assert.match(migrationService, /ensurePersistentApplicationMapsWithMigrationService/);
assert.doesNotMatch(loader, /function ensurePersistentApplicationMaps\(/);
uiSources.forEach((source) => assert.doesNotMatch(source, /function ensurePersistentApplicationMaps\(/));
assert.match(runtimeService, /function loadMachineMapIntoRuntime\(/);
assert.match(runtimeService, /function syncApplicationMapToLegacyState\(/);
uiSources.forEach((source) => {
  assert.doesNotMatch(source, /function loadMachineMapIntoRuntime\(/);
  assert.doesNotMatch(source, /function syncApplicationMapToLegacyState\(/);
});

assert.match(driver, /direction: input\.machineSettings\?\.direction === "cw" \? "cw" : "ccw"/);
assert.match(runtimeService, /state\.direction = settings\.direction === "cw" \? "cw" : "ccw"/);
assert.doesNotMatch(driver, /physicalDirection|storedDirection|reverseDirection/);
assert.doesNotMatch(runtimeService, /physicalDirection|storedDirection|reverseDirection/);
assert.match(adapter, /LabelerMapSchemaAdapter/);
assert.match(adapter, /driver: "map\.schema"/);
assert.match(serviceWorker, /map-builder-modules-v1/);

console.log("Map schema and migration ownership regression passed.");
