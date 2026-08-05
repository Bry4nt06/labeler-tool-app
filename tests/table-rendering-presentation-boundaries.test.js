"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const readApp = (name) => fs.readFileSync(path.join(root, "app", name), "utf8");

const compatibility = readApp("table-rendering.js");
const helpers = readApp("table-presentation-helpers.js");
const specs = readApp("specification-table-renderer.js");
const build = readApp("build-inputs-renderer.js");
const machineData = readApp("machine-data-table-renderer.js");
const wipeService = readApp("wipe-telemetry-service.js");
const wipeRenderer = readApp("wipe-telemetry-renderer.js");
const statusRenderer = readApp("workspace-status-renderer.js");
const manifest = readApp("simulation-collapsible-integration.js");
const delegatedEvents = readApp(path.join("controllers", "setup-event-controller-integration.js"));
const stationController = readApp(path.join("controllers", "station-table-controller.js"));
const specsController = readApp(path.join("controllers", "specs-controller.js"));
const buildController = readApp(path.join("controllers", "build-inputs-controller.js"));

["renderBottleSpecs", "renderLabelSpecs"].forEach((name) => {
  assert.match(specs, new RegExp(`function ${name}\\(`), `${name} must be owned by the specification table renderer.`);
});
assert.match(build, /function renderBuildInputs\(/, "Build Inputs must be owned by its focused renderer.");
assert.match(machineData, /function renderStations\(/, "Machine data renderer must own the station table.");
assert.match(machineData, /function renderHeads\(/, "Machine data renderer must own the head table.");
assert.match(wipeService, /function wipeDownTelemetry\(/, "Wipe telemetry calculations require one service owner.");
assert.match(wipeRenderer, /function renderWipeDownData\(/, "Wipe telemetry presentation requires one renderer owner.");
assert.match(statusRenderer, /function renderValidation\(/, "Workspace status renderer must own validation presentation.");
assert.match(statusRenderer, /function renderAnimationFrame\(/, "Workspace status renderer must own animation-frame presentation.");
assert.match(helpers, /function optionList\(/, "Shared table option markup requires one helper owner.");

[specs, build, machineData, wipeRenderer, statusRenderer].forEach((source) => {
  assert.doesNotMatch(source, /addEventListener\(/, "Presentation modules must not attach row-level event handlers.");
  assert.doesNotMatch(source, /saveCurrentSettings\(/, "Presentation modules must not own persistence.");
  assert.doesNotMatch(source, /\brender\(\)/, "Presentation modules must not recursively own the application render cycle.");
});

assert.match(specs, /id="addBottleSpec"/, "Bottle add control ID must remain stable for delegated events.");
assert.match(specs, /id="addLabelSpec"/, "Label add control ID must remain stable for delegated events.");
assert.match(specs, /label-specs-table/, "Label specification table styling contract must remain stable.");
assert.match(build, /id="zoneSelect"/, "Zone selector ID must remain stable.");
assert.match(build, /id="brandSelect"/, "Brand selector ID must remain stable.");
assert.match(build, /id="programMaxMoveRatio"/, "Calculated Build Input IDs must remain stable.");
assert.match(build, /Workbook Feed Check/, "Workbook summary presentation must remain present.");
assert.match(machineData, /data-station-field="name"/, "Station names require delegated field metadata.");
assert.match(machineData, /data-station-field="angle"/, "Station angles require delegated field metadata.");

assert.match(specsController, /function addBottle\(/, "Specs controller must own bottle creation.");
assert.match(specsController, /function updateLabel\(/, "Specs controller must own label mutation.");
assert.match(buildController, /function updateCalculatedField\(/, "Build Inputs controller must own calculated field mutation.");
assert.match(stationController, /function updateAngle\(/, "Station controller must own station angle mutation.");
assert.match(delegatedEvents, /handleSpecChange/, "Delegated event integration must own specification changes.");
assert.match(delegatedEvents, /handleStationChange/, "Delegated event integration must own station-table changes.");
assert.match(delegatedEvents, /data-validation-object-id/, "Delegated event integration must own validation-card navigation.");

const helperIndex = manifest.indexOf("app/table-presentation-helpers.js");
const specIndex = manifest.indexOf("app/specification-table-renderer.js");
const buildIndex = manifest.indexOf("app/build-inputs-renderer.js");
const machineIndex = manifest.indexOf("app/machine-data-table-renderer.js");
const wipeServiceIndex = manifest.indexOf("app/wipe-telemetry-service.js");
const statusIndex = manifest.indexOf("app/workspace-status-renderer.js");
const coordinatorIndex = manifest.indexOf("app/rendering-coordinator-integration.js");
const diagnosticsIndex = manifest.indexOf("app/validation-diagnostics-integration.js");
assert.ok(helperIndex >= 0, "Presentation helpers must be present in the feature manifest.");
assert.ok(specIndex > helperIndex, "Specification renderer must load after shared helpers.");
assert.ok(buildIndex > specIndex, "Build Inputs renderer must load after the specification renderer.");
assert.ok(machineIndex > buildIndex, "Machine data tables must load after shared table owners.");
assert.ok(wipeServiceIndex > machineIndex, "Wipe telemetry must load after machine table presentation.");
assert.ok(statusIndex > wipeServiceIndex, "Workspace status rendering must load after wipe telemetry.");
assert.ok(coordinatorIndex > statusIndex, "Render coordinator must install after every focused presentation owner.");
assert.ok(diagnosticsIndex > coordinatorIndex, "Diagnostics must remain the final feature stage.");

assert.match(compatibility, /table-rendering-owned-by-focused-presenters/);
assert.doesNotMatch(compatibility, /function\s+render/);
assert.doesNotMatch(compatibility, /addEventListener\(/);
assert.ok(compatibility.split(/\r?\n/).length < 30, "The retired table-rendering source must remain a compact compatibility marker.");
assert.ok(specs.split(/\r?\n/).length < 60, "Specification renderer must remain focused.");
assert.ok(build.split(/\r?\n/).length < 110, "Build Inputs renderer must remain focused.");

console.log("Final table presentation ownership regression passed.");
