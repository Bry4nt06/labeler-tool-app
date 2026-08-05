"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const compatibility = read("app/table-rendering.js");
const machineData = read("app/machine-data-table-renderer.js");
const stationController = read("app/controllers/station-table-controller.js");
const activeRow = read("app/servo-program-active-row-renderer.js");
const wipeService = read("app/wipe-telemetry-service.js");
const wipeRenderer = read("app/wipe-telemetry-renderer.js");
const workspaceStatus = read("app/workspace-status-renderer.js");
const bootstrap = read("app/bootstrap.js");
const manifest = read("app/simulation-collapsible-integration.js");
const delegatedEvents = read("app/controllers/setup-event-controller-integration.js");

[
  "renderStations",
  "optionList",
  "renderBottleSpecs",
  "renderLabelSpecs",
  "renderBuildInputs",
  "activeMachineUsesAutocolCommands",
  "servoCommandControl",
  "renderProgram",
  "servoMovePairKey",
  "updateActiveServoProgramRow",
  "renderSimulation",
  "renderHeads",
  "renderValidation",
  "wipeDownTelemetry",
  "renderWipeDownData",
  "renderTopControls",
  "renderAnimationFrame",
  "render"
].forEach((name) => {
  assert.doesNotMatch(compatibility, new RegExp(`function\\s+${name}\\s*\\(`), `${name} must not return to table-rendering.js.`);
});
assert.match(compatibility, /table-rendering-owned-by-focused-presenters/);
assert.ok(compatibility.split(/\r?\n/).length < 30);

assert.match(machineData, /function renderStations\(/);
assert.match(machineData, /function renderHeads\(/);
assert.match(machineData, /data-station-row-index/);
assert.match(stationController, /function updateName\(/);
assert.match(stationController, /function updateAngle\(/);
assert.match(activeRow, /function updateActiveServoProgramRow\(/);
assert.match(wipeService, /function contactedLabelCoverage\(/);
assert.match(wipeService, /function wipeDownTelemetry\(/);
assert.match(wipeRenderer, /function renderWipeDownData\(/);
assert.match(workspaceStatus, /function renderValidation\(/);
assert.match(workspaceStatus, /function renderAnimationFrame\(/);

[machineData, wipeRenderer, workspaceStatus].forEach((source) => {
  assert.doesNotMatch(source, /addEventListener\(/);
  assert.doesNotMatch(source, /saveCurrentSettings\(/);
});
assert.match(delegatedEvents, /handleStationChange/);
assert.match(delegatedEvents, /LabelerStationTableController/);
assert.match(delegatedEvents, /data-validation-object-id/);

const stationControllerIndex = bootstrap.indexOf("app/controllers/station-table-controller.js");
const setupEventsIndex = bootstrap.indexOf("app/controllers/setup-event-controller-integration.js");
assert.ok(stationControllerIndex >= 0);
assert.ok(setupEventsIndex > stationControllerIndex);

const helperIndex = manifest.indexOf("app/table-presentation-helpers.js");
const machineIndex = manifest.indexOf("app/machine-data-table-renderer.js");
const activeRowIndex = manifest.indexOf("app/servo-program-active-row-renderer.js");
const wipeServiceIndex = manifest.indexOf("app/wipe-telemetry-service.js");
const wipeRendererIndex = manifest.indexOf("app/wipe-telemetry-renderer.js");
const statusIndex = manifest.indexOf("app/workspace-status-renderer.js");
const workspaceCoreIndex = manifest.indexOf("workspaceCore");
const coordinatorIndex = manifest.indexOf("app/rendering-coordinator-integration.js");
assert.ok(helperIndex >= 0);
assert.ok(machineIndex > helperIndex);
assert.ok(activeRowIndex > machineIndex);
assert.ok(wipeServiceIndex > activeRowIndex);
assert.ok(wipeRendererIndex > wipeServiceIndex);
assert.ok(statusIndex > wipeRendererIndex);
assert.ok(workspaceCoreIndex > statusIndex, "Presentation owners must exist before wrapper integrations install.");
assert.ok(coordinatorIndex > workspaceCoreIndex);

const telemetrySandbox = {
  window: {},
  state: {
    direction: "cw",
    buildInputs: {
      neckApplication: "Center",
      neckContactMm: 5,
      bodyContactMm: 5,
      backContactMm: 5
    }
  },
  num(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  },
  norm(value) { return ((Number(value) % 360) + 360) % 360; },
  signedAngleDifference(a, b) {
    return ((((Number(a) - Number(b)) % 360) + 540) % 360) - 180;
  }
};
telemetrySandbox.window = telemetrySandbox;
telemetrySandbox.globalThis = telemetrySandbox;
vm.createContext(telemetrySandbox);
vm.runInContext(wipeService, telemetrySandbox);
assert.strictEqual(telemetrySandbox.wipeSectionFromRow({ action: "Wipe Turn 1 Neck - Agg 1" }), "neck");
assert.strictEqual(telemetrySandbox.wipeSectionFromRow({ section: "body" }), "body");
assert.strictEqual(telemetrySandbox.mergedIntervalLength([[0, 10], [5, 20], [30, 35]]), 25);
assert.strictEqual(telemetrySandbox.tableAngleWithinObject(359, { angle: 0 }, 0.5), true);
assert.strictEqual(telemetrySandbox.wipeVisualApplication("neck", 50).tackMode, "center");
assert.strictEqual(telemetrySandbox.wipeVisualApplication("neck", 50).direction, "ltr");
telemetrySandbox.state.direction = "ccw";
assert.strictEqual(telemetrySandbox.wipeVisualApplication("body", 50).direction, "rtl");

const point = { name: "Custom Point", angle: 10, update(value) { this.angle = value; } };
const stationState = { mapPoints: [point] };
const calls = [];
const stationSandbox = {
  window: {},
  state: stationState,
  LabelerWorkspaceActionService: {
    call(name, ...args) {
      if (name === "applicationMapPointRows") return [point];
      if (name === "mapPointStation") return null;
      if (name === "syncMapPointsFromAssemblies") calls.push([name, ...args]);
      return undefined;
    },
    number(value, fallback = 0) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    },
    execute(options = {}) {
      options.mutate?.();
      calls.push(["execute", options.syncAssemblyMap, options.render]);
    }
  }
};
stationSandbox.window = stationSandbox;
stationSandbox.globalThis = stationSandbox;
vm.createContext(stationSandbox);
vm.runInContext(stationController, stationSandbox);
stationSandbox.LabelerStationTableController.updateName(0, "Renamed Point");
assert.strictEqual(point.name, "Renamed Point");
stationSandbox.LabelerStationTableController.updateAngle(0, "22.5");
assert.strictEqual(point.angle, 22.5);
assert.ok(calls.some((entry) => entry[0] === "execute" && entry[1] === true));

console.log("Table rendering retirement regression passed.");
