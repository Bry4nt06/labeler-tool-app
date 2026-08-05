"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app", "controllers", "map-builder-row-controller.js"), "utf8");
assert.doesNotThrow(() => new vm.Script(source, { filename: "map-builder-row-controller.js" }));

class FakeElement {
  constructor({ textContent = "", dataset = {}, id = "" } = {}) {
    this.textContent = textContent;
    this.dataset = dataset;
    this.id = id;
  }

  closest() { return null; }
  matches() { return false; }
  getAttribute() { return ""; }
}

const listeners = new Map();
const calls = { history: [], refresh: 0, renderBuilder: 0 };
const machineMap = {
  applicationMode: "apl",
  stationCount: 2,
  enabledStations: [true, true],
  stationSections: { "1": "body", "2": "back" },
  aggregateAngles: { "1": 10, "2": 40 },
  objects: [
    { id: "pad-1", name: "Pad 1", kind: "pad", application: "apl", station: 1, start: 10, end: 20 },
    { id: "roller-1", name: "Roller 1", kind: "roller", application: "apl", station: 1, start: 21, end: 25 },
    { id: "pad-2", name: "Pad 2", kind: "pad", application: "apl", station: 2, start: 40, end: 50 },
    { id: "coder", name: "Coder", kind: "coding", application: "apl", station: null, start: 300, end: 300 }
  ]
};
const state = { applicationMode: "apl", selectedMapObjectId: "pad-1" };

const sandbox = {
  window: null,
  globalThis: null,
  document: {
    addEventListener(type, handler, options) {
      listeners.set(type, { handler, options });
    }
  },
  Element: FakeElement,
  console,
  state,
  els: { wipeBuilderList: { contains: () => true } },
  builderExpandedStation: null,
  editableMachineMap: () => machineMap,
  normalizeBuilderObject: (item) => ({ ...item }),
  recordBuilderHistory: (label) => calls.history.push(label),
  refreshAfterBuilderEdit: () => { calls.refresh += 1; },
  renderWipeDownBuilder: () => { calls.renderBuilder += 1; },
  renderMap() {},
  num(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  },
  deepClone: (value) => JSON.parse(JSON.stringify(value)),
  uniqueMapId: () => "copy",
  activeSlotNumbers: (slots) => slots.map((enabled, index) => enabled ? index + 1 : null).filter(Boolean),
  itemApplicationMode: (item) => item.application || "apl",
  requestAnimationFrame(callback) { callback(); },
  alert() {},
  confirm: () => true,
  prompt: () => "2"
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "map-builder-row-controller.js" });

const controller = sandbox.LabelerMapBuilderRowController;
assert.ok(controller?.installed);
assert.strictEqual(controller.isDeleteObjectControl(new FakeElement({ textContent: "Delete Object" })), true);
assert.strictEqual(controller.isDeleteStationControl(new FakeElement({ textContent: "Delete Station" })), true);

assert.strictEqual(controller.deleteObject("pad-1", false), true);
assert.strictEqual(machineMap.objects.some((item) => item.id === "pad-1"), false);
assert.strictEqual(state.selectedMapObjectId, "");
assert.ok(calls.history.includes("Delete Pad 1"));

assert.strictEqual(controller.deleteStation(1, false), true);
assert.strictEqual(machineMap.objects.some((item) => Number(item.station) === 1), false);
assert.strictEqual(machineMap.objects.some((item) => item.id === "pad-2"), true);
assert.strictEqual(machineMap.objects.some((item) => item.id === "coder"), true);
assert.strictEqual(machineMap.enabledStations[0], false);
assert.strictEqual(machineMap.enabledStations[1], true);
assert.strictEqual(machineMap.stationCount, 1);
assert.strictEqual(Object.hasOwn(machineMap.stationSections, "1"), false);
assert.strictEqual(machineMap.stationSections["2"], "back");
assert.ok(calls.history.includes("Delete Station 1"));
assert.ok(calls.refresh >= 2);
assert.ok(calls.renderBuilder >= 2);

assert.ok(source.includes("deleteObjectSelectors"));
assert.ok(source.includes("deleteStationSelectors"));
assert.ok(source.includes("data-action='delete-object'"));
assert.ok(source.includes("data-action='delete-station'"));
assert.ok(source.includes("state.selectedMapObjectId = \"\""));

console.log("Map Builder object and station deletion regression passed.");
