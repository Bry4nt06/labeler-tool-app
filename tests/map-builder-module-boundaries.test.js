"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const loader = read("app/wipe-down-builder.js");
const controls = read("app/map-builder-controls.js");
const history = read("app/map-builder-history-service.js");
const renderer = read("app/map-builder-renderer.js");
const controller = read("app/map-builder-controller.js");
const defaults = read("app/map-defaults-service.js");
const library = read("app/map-library-service.js");
const runtime = read("app/map-runtime-service.js");
const migration = read("app/map-migration-service.js");
const optimization = read("app/map-cold-glue-optimization-service.js");
const features = read("app/simulation-collapsible-integration.js");
const app = read("app.js");
const serviceWorker = read("service-worker.js");

const modules = [
  "drivers/map/map-schema-driver.js",
  "drivers/map/map-migration-driver.js",
  "app/map-defaults-service.js",
  "app/map-library-service.js",
  "app/map-schema-adapter-integration.js",
  "app/map-runtime-service.js",
  "app/map-migration-service.js",
  "app/map-cold-glue-optimization-service.js",
  "app/map-builder-controls.js",
  "app/map-builder-history-service.js",
  "app/map-builder-renderer.js",
  "app/map-builder-controller.js"
];
modules.forEach((module) => assert.match(loader, new RegExp(module.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
for (let index = 1; index < modules.length; index += 1) {
  assert.ok(loader.indexOf(modules[index - 1]) < loader.indexOf(modules[index]), `${modules[index - 1]} must load before ${modules[index]}`);
}
assert.match(loader, /ServoForgeMapBuilderReady/);
assert.match(app, /await window\.ServoForgeMapBuilderReady/);

[
  "normalizeBuilderObject",
  "createMachineMap",
  "ensurePersistentApplicationMaps",
  "loadMachineMapIntoRuntime",
  "syncApplicationMapToLegacyState",
  "renderWipeDownBuilder",
  "bindWipeDownBuilder"
].forEach((name) => assert.doesNotMatch(loader, new RegExp(`function ${name}\\(`)));

assert.match(defaults, /function defaultAplMapObjects\(/);
assert.match(library, /function mapLocationFor\(/);
assert.match(runtime, /function loadMachineMapIntoRuntime\(/);
assert.match(runtime, /function syncApplicationMapToLegacyState\(/);
assert.match(migration, /ensurePersistentApplicationMapsWithMigrationService/);
assert.doesNotMatch(migration, /\n\s*migratePersistentMaps\(\);\s*\n\}\)\(/, "migration must not run eagerly before saved settings load");
assert.match(optimization, /function optimizeColdGlueMapExample\(/);
assert.match(controls, /function renderMapLibraryControls\(/);
assert.match(history, /function recordBuilderHistory\(/);
assert.match(renderer, /function renderWipeDownBuilder\(/);
assert.match(controller, /function bindWipeDownBuilder\(/);
[controls, history, renderer, controller].forEach((source) => {
  assert.doesNotMatch(source, /function normalizeBuilderObject\(/);
  assert.doesNotMatch(source, /function ensurePersistentApplicationMaps\(/);
  assert.doesNotMatch(source, /function loadMachineMapIntoRuntime\(/);
  assert.doesNotMatch(source, /function syncApplicationMapToLegacyState\(/);
});

[
  "drivers/map/map-schema-driver.js",
  "drivers/map/map-migration-driver.js",
  "app/map-schema-adapter-integration.js",
  "app/map-migration-service.js"
].forEach((pathName) => assert.doesNotMatch(features, new RegExp(pathName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${pathName} must have one loader owner`));

modules.forEach((module) => assert.match(serviceWorker, new RegExp(module.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
assert.match(serviceWorker, /map-builder-modules-v1/);

console.log("Map Builder module boundary regression passed.");
