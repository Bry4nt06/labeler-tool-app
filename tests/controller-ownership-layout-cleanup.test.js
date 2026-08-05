"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const setupSource = read("app", "controllers", "setup-event-controller-integration.js");
const layoutSource = read("app", "controllers", "map-builder-layout-controller.js");
const controlsSource = read("app", "map-builder-controls.js");
const validationUiSource = read("app", "controllers", "validation-panel-ui-controller.js");
const stationEventSource = read("app", "controllers", "station-table-event-controller.js");
const programEventSource = read("app", "controllers", "servo-program-event-controller.js");
const bootstrapSource = read("app", "bootstrap.js");
const startupSource = read("app", "startup-runtime.js");

[
  ["setup-event-controller-integration.js", setupSource],
  ["map-builder-layout-controller.js", layoutSource],
  ["map-builder-controls.js", controlsSource],
  ["validation-panel-ui-controller.js", validationUiSource],
  ["station-table-event-controller.js", stationEventSource],
  ["servo-program-event-controller.js", programEventSource],
  ["bootstrap.js", bootstrapSource],
  ["startup-runtime.js", startupSource]
].forEach(([filename, source]) => {
  assert.doesNotThrow(() => new vm.Script(source, { filename }), `${filename} must parse.`);
});

assert.ok(!setupSource.includes("handleSpecChange"), "The central setup boundary must not route Specs field changes.");
assert.ok(!setupSource.includes("labelKeys"), "Positional Label Spec field keys must remain removed.");
assert.ok(!setupSource.includes('querySelectorAll("input")'), "Specs routing must not depend on positional input indexes.");
assert.ok(!setupSource.includes("handleStationChange"), "Station table fields require a focused event owner.");
assert.ok(!setupSource.includes("handleProgramChange"), "Servo Program fields require a focused event owner.");
assert.ok(!setupSource.includes('target.dataset?.programField === "action"'), "Servo Program action editing must not return to the central boundary.");
assert.ok(setupSource.includes("specs.addBottle()"));
assert.ok(setupSource.includes("specs.deleteLabel("));

assert.ok(stationEventSource.includes("LabelerStationTableEventController"));
assert.ok(stationEventSource.includes('document.addEventListener("change"'));
assert.ok(stationEventSource.includes("stations.updateName"));
assert.ok(stationEventSource.includes("stations.updateAngle"));

assert.ok(programEventSource.includes("LabelerServoProgramEventController"));
assert.ok(programEventSource.includes('document.addEventListener("change"'));
assert.ok(programEventSource.includes('document.addEventListener("input"'));
assert.ok(programEventSource.includes("program.updateCommand"));
assert.ok(programEventSource.includes("program.updateOverride"));
assert.ok(programEventSource.includes("program.updateAction"));

assert.ok(controlsSource.includes('data-aggregate-angle="${aggregate}"'));
assert.ok(controlsSource.includes('data-machine-slot="${slotType}"'));
assert.ok(!controlsSource.includes("addEventListener("), "Map Builder layout rendering must remain listener-free.");
assert.ok(!controlsSource.includes("refreshAfterBuilderEdit("), "Map Builder layout mutation belongs to its controller.");
assert.ok(!controlsSource.includes("saveCurrentSettings("), "Map Builder layout persistence belongs to its controller.");

assert.ok(layoutSource.includes('document.addEventListener("input"'));
assert.ok(layoutSource.includes('document.addEventListener("change"'));
assert.ok(layoutSource.includes("updateAggregateAngle"));
assert.ok(layoutSource.includes("updateMachineSlot"));
assert.ok(layoutSource.includes("At least one ${slotType} must remain active."));

assert.ok(validationUiSource.includes("overflow-x: clip !important"));
assert.ok(validationUiSource.includes("overflow-y: auto !important"));
assert.ok(validationUiSource.includes("contain: inline-size"));
assert.ok(validationUiSource.includes("grid-template-columns: minmax(0, 1fr)"));
assert.ok(validationUiSource.includes("justify-self: stretch"));
assert.ok(validationUiSource.includes(".pipeline-validation-summary > strong,"));
assert.ok(validationUiSource.includes("width: auto !important"));
assert.ok(validationUiSource.includes("text-align: left !important"));
assert.ok(validationUiSource.includes("word-break: break-word"));
assert.ok(validationUiSource.includes(".validation-head-actions"));
assert.ok(!validationUiSource.includes("flex: 1 1 0"), "Pipeline metrics must not share a horizontal flex row.");
assert.ok(!validationUiSource.includes(".pipeline-validation-summary {\n        display: grid !important;\n        grid-template-columns: minmax(0, 1fr) !important;\n        width: 100% !important"), "Pipeline cards must size from the parent grid rather than force their own width.");

const validationPath = "app/controllers/validation-panel-ui-controller.js";
const layoutPath = "app/controllers/map-builder-layout-controller.js";
const stationEventPath = "app/controllers/station-table-event-controller.js";
const programEventPath = "app/controllers/servo-program-event-controller.js";
assert.ok(bootstrapSource.includes(validationPath));
assert.ok(bootstrapSource.includes(layoutPath));
assert.ok(bootstrapSource.includes(stationEventPath));
assert.ok(bootstrapSource.includes(programEventPath));
assert.ok(bootstrapSource.indexOf("app/controllers/health-status-ui-controller.js") < bootstrapSource.indexOf(validationPath));
assert.ok(bootstrapSource.indexOf("app/controllers/servo-program-controller.js") < bootstrapSource.indexOf(programEventPath));
assert.ok(bootstrapSource.indexOf("app/controllers/station-table-controller.js") < bootstrapSource.indexOf(stationEventPath));
assert.ok(bootstrapSource.indexOf("app/controllers/map-builder-event-controller.js") < bootstrapSource.indexOf(layoutPath));
assert.ok(bootstrapSource.indexOf(layoutPath) < bootstrapSource.indexOf("app/controllers/map-builder-row-controller.js"));
assert.ok(startupSource.includes("LabelerValidationPanelUiController?.installed"));
assert.ok(startupSource.includes("LabelerMapBuilderLayoutController?.installed"));
assert.ok(startupSource.includes("LabelerStationTableEventController?.installed"));
assert.ok(startupSource.includes("LabelerServoProgramEventController?.installed"));

class FakeElement {
  constructor({ dataset = {}, value = "", checked = false, type = "" } = {}) {
    this.dataset = dataset;
    this.value = value;
    this.checked = checked;
    this.type = type;
  }
  matches(selector) {
    if (selector === "[data-aggregate-angle]") return Object.hasOwn(this.dataset, "aggregateAngle");
    if (selector === "[data-machine-slot][data-slot-number]") {
      return Object.hasOwn(this.dataset, "machineSlot") && Object.hasOwn(this.dataset, "slotNumber");
    }
    return false;
  }
}

const listeners = new Map();
const calls = { refresh: 0, load: 0, save: 0, render: 0, alerts: [] };
const machineMap = {
  applicationMode: "apl",
  aggregateCount: 2,
  stationCount: 2,
  enabledAggregates: [true, true],
  enabledStations: [true, true],
  aggregateAngles: { "1": 10, "2": 40 },
  stationAngles: { "1": 10, "2": 40 },
  objects: []
};
const aggregateControl = new FakeElement({ dataset: { aggregateAngle: "1" }, value: "22.5" });
const stationControl = new FakeElement({ dataset: { machineSlot: "station", slotNumber: "2" }, checked: false });
const aggregateContainer = { contains: (node) => node === aggregateControl };
const stationContainer = { contains: (node) => node === stationControl };

const sandbox = {
  window: null,
  globalThis: null,
  document: {
    addEventListener(type, handler, options) { listeners.set(type, { handler, options }); }
  },
  Element: FakeElement,
  console,
  els: {
    aggregateAngleEditor: aggregateContainer,
    aggregateToggleList: { contains: () => false },
    stationToggleList: stationContainer
  },
  editableMachineMap: () => machineMap,
  normalizeAggregateAngles: (angles) => ({ ...angles }),
  normalizeStationAngles: (angles) => ({ ...angles }),
  normalizeEnabledSlots: (slots) => [...slots],
  num(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  },
  refreshAfterBuilderEdit: () => { calls.refresh += 1; },
  ensureAplObjectsForNewStations() {},
  loadMachineMapIntoRuntime: () => { calls.load += 1; },
  saveCurrentSettings: () => { calls.save += 1; },
  renderWipeDownBuilder: () => { calls.render += 1; },
  alert: (message) => calls.alerts.push(message)
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(layoutSource, sandbox, { filename: "map-builder-layout-controller.js" });

const controller = sandbox.LabelerMapBuilderLayoutController;
assert.ok(controller?.installed);
assert.strictEqual(controller.updateAggregateAngle(aggregateControl), true);
assert.strictEqual(machineMap.aggregateAngles["1"], 22.5);
assert.strictEqual(machineMap.stationAngles["1"], 22.5);
assert.strictEqual(calls.refresh, 1);

assert.strictEqual(controller.updateMachineSlot(stationControl), true);
assert.deepStrictEqual(machineMap.enabledStations, [true, false]);
assert.strictEqual(machineMap.stationCount, 1);
assert.strictEqual(calls.load, 1);
assert.strictEqual(calls.save, 1);
assert.strictEqual(calls.render, 1);

stationControl.checked = false;
assert.strictEqual(controller.updateMachineSlot(stationControl), true);
assert.strictEqual(stationControl.checked, true);
assert.strictEqual(calls.alerts.length, 1);

["input", "change"].forEach((type) => {
  assert.ok(listeners.has(type), `${type} must be delegated.`);
  assert.strictEqual(listeners.get(type).options, true, `${type} must use capture ownership.`);
});

console.log("Controller ownership and intrinsic Validation width regression passed.");
