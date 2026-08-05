"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const driverSource = fs.readFileSync(path.join(root, "drivers", "rendering", "render-cycle-driver.js"), "utf8");
const coordinatorSource = fs.readFileSync(path.join(root, "app", "rendering-coordinator-integration.js"), "utf8");
const assemblyCompatibilitySource = fs.readFileSync(path.join(root, "app", "assemblies.js"), "utf8");
const manifestSource = fs.readFileSync(path.join(root, "app", "simulation-collapsible-integration.js"), "utf8");
const tableRenderingSource = fs.readFileSync(path.join(root, "app", "table-rendering.js"), "utf8");

const calls = [];
const registered = new Map();
const sandbox = {
  window: {},
  els: { stations: {} },
  LabelerDriverRegistry: {
    register(name, api, metadata) { registered.set(name, { api, metadata }); }
  }
};
[
  "ensurePersistentApplicationMaps",
  "ensureSelectedBrandForApplication",
  "applyLabelLengthStationRules",
  "syncApplicationMapToLegacyState",
  "syncMapPointsFromAssemblies",
  "applyGeneratedServoProfile",
  "renderMap",
  "renderStations",
  "renderBottleSpecs",
  "renderLabelSpecs",
  "renderBuildInputs",
  "renderProgram",
  "renderSimulation",
  "renderHeads",
  "renderValidation",
  "renderTopControls"
].forEach((name) => {
  sandbox[name] = () => calls.push(name);
});
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(driverSource, sandbox);
vm.runInContext(coordinatorSource, sandbox);

assert.ok(registered.has("render.cycle"));
assert.strictEqual(sandbox.render.renderingCoordinator, true);
const result = sandbox.render();
assert.deepStrictEqual(calls, [
  "ensurePersistentApplicationMaps",
  "ensureSelectedBrandForApplication",
  "applyLabelLengthStationRules",
  "syncApplicationMapToLegacyState",
  "syncMapPointsFromAssemblies",
  "applyGeneratedServoProfile",
  "renderMap",
  "renderStations",
  "renderBottleSpecs",
  "renderLabelSpecs",
  "renderBuildInputs",
  "renderProgram",
  "renderSimulation",
  "renderHeads",
  "renderValidation",
  "renderTopControls"
]);
assert.deepStrictEqual(Array.from(result.prepared), calls.slice(0, 6));
assert.deepStrictEqual(Array.from(result.presented), calls.slice(6));

calls.length = 0;
sandbox.els.stations = null;
sandbox.render();
assert.ok(!calls.includes("renderStations"), "Station rendering must remain conditional when its workspace is absent.");
assert.strictEqual(calls[0], "ensurePersistentApplicationMaps");
assert.strictEqual(calls[calls.length - 1], "renderTopControls");

assert.doesNotMatch(assemblyCompatibilitySource, /function\s+(normalizeAssembly|assemblyStatus|assemblySpan)\s*\(/);
assert.match(assemblyCompatibilitySource, /assembly-model-and-geometry-owned-by-drivers/);

const renderDriverIndex = manifestSource.indexOf("drivers/rendering/render-cycle-driver.js");
const presentationIndex = manifestSource.indexOf("presentationCore");
const statusRendererIndex = manifestSource.indexOf("app/workspace-status-renderer.js");
const coordinatorIndex = manifestSource.indexOf("app/rendering-coordinator-integration.js");
const diagnosticsIndex = manifestSource.indexOf("app/validation-diagnostics-integration.js");
assert.ok(renderDriverIndex >= 0, "The render-cycle driver must be loaded by the feature manifest.");
assert.ok(presentationIndex > renderDriverIndex, "Focused presentation owners must load after render drivers.");
assert.ok(statusRendererIndex > presentationIndex, "Workspace status rendering must be part of presentation core.");
assert.ok(coordinatorIndex > statusRendererIndex, "The browser coordinator must load after all focused presentation owners.");
assert.ok(diagnosticsIndex > coordinatorIndex, "Validation diagnostics must remain the final feature stage.");
assert.doesNotMatch(tableRenderingSource, /function\s+render\s*\(/, "The source-level render fallback must be physically removed.");
assert.match(tableRenderingSource, /table-rendering-owned-by-focused-presenters/, "The retired source must identify its authoritative owners.");
assert.match(coordinatorSource, /renderApplication\.renderingCoordinator = true/, "The active render owner must be marked.");

console.log("Rendering coordinator and retired table source regression passed.");
