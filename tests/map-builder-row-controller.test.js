"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app", "controllers", "map-builder-row-controller.js"), "utf8");
const rendererSource = fs.readFileSync(path.join(root, "app", "map-builder-renderer.js"), "utf8");
const bootstrapSource = fs.readFileSync(path.join(root, "app", "bootstrap.js"), "utf8");
const startupSource = fs.readFileSync(path.join(root, "app", "startup-runtime.js"), "utf8");

class FakeElement {
  constructor({ dataset = {}, value = "", checked = false, row = null } = {}) {
    this.dataset = dataset;
    this.value = value;
    this.checked = checked;
    this.row = row;
  }

  closest(selector) {
    if (selector === ".wipe-builder-row[data-builder-object-id]") return this.row;
    return null;
  }

  matches(selector) {
    return selector === "[data-station-section]" && Object.hasOwn(this.dataset, "stationSection");
  }
}

const summaryName = { textContent: "Pad A" };
const row = {
  dataset: { builderObjectId: "pad-1" },
  querySelector(selector) {
    return selector === "summary strong" ? summaryName : null;
  }
};
const listeners = new Map();
const calls = { history: [], refresh: 0, renderBuilder: 0, renderMap: 0 };
const machineMap = {
  applicationMode: "apl",
  stationCount: 2,
  enabledStations: [true, true],
  aggregateAngles: { "1": 10, "2": 40 },
  stationSections: {},
  objects: [
    { id: "pad-1", name: "Pad A", kind: "pad", application: "apl", station: 1, side: "outer", start: 20, end: 30 }
  ]
};
const state = {
  applicationMode: "apl",
  selectedMapObjectId: null
};

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
  renderMap: () => { calls.renderMap += 1; },
  num(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  },
  deepClone: (value) => JSON.parse(JSON.stringify(value)),
  uniqueMapId: (() => {
    let id = 1;
    return () => `copy-${id++}`;
  })(),
  activeSlotNumbers: (slots) => slots.map((enabled, index) => enabled ? index + 1 : null).filter(Boolean),
  itemApplicationMode: (item) => item.application || "apl",
  prompt: () => "2",
  alert() {},
  requestAnimationFrame(callback) { callback(); }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

assert.doesNotThrow(() => vm.runInContext(source, sandbox, { filename: "map-builder-row-controller.js" }));
const controller = sandbox.LabelerMapBuilderRowController;
assert.strictEqual(controller.installed, true);

const nameInput = new FakeElement({ dataset: { builderField: "name" }, value: "Updated Pad", row });
assert.strictEqual(controller.recordFieldHistory(nameInput), true);
assert.strictEqual(controller.recordFieldHistory(nameInput), true);
assert.deepStrictEqual(calls.history, ["Edit Pad A"]);
assert.strictEqual(controller.updateField(nameInput, false), true);
assert.strictEqual(machineMap.objects[0].name, "Updated Pad");
assert.strictEqual(summaryName.textContent, "Updated Pad");

const startInput = new FakeElement({ dataset: { builderField: "start" }, value: "42.5", row });
assert.strictEqual(controller.updateField(startInput, true), true);
assert.strictEqual(machineMap.objects[0].start, 42.5);

const sectionSelect = new FakeElement({ dataset: { stationSection: "" }, value: "body", row });
assert.strictEqual(controller.updateStationSection(sectionSelect), true);
assert.strictEqual(machineMap.stationSections["1"], "body");

assert.strictEqual(controller.duplicateObject("pad-1"), true);
assert.strictEqual(machineMap.objects.length, 2);
assert.strictEqual(machineMap.objects[1].name, "Updated Pad Copy");
assert.strictEqual(controller.removeObject(machineMap.objects[1].id), true);
assert.strictEqual(machineMap.objects.length, 1);

assert.strictEqual(controller.duplicateStation(1), true);
assert.strictEqual(machineMap.objects.length, 2);
assert.strictEqual(machineMap.objects[1].station, 2);
assert.strictEqual(machineMap.objects[1].start, 72.5);
assert.strictEqual(machineMap.objects[1].end, 60);

assert.strictEqual(controller.selectObject("pad-1"), true);
assert.strictEqual(state.selectedMapObjectId, "pad-1");
assert.strictEqual(calls.renderMap, 1);

["focus", "input", "change", "click"].forEach((type) => {
  assert.ok(listeners.has(type), `${type} must be delegated.`);
  assert.strictEqual(listeners.get(type).options, true, `${type} must use capture ownership.`);
});

assert.ok(!rendererSource.includes("addEventListener("), "Map Builder rendering must remain listener-free.");
assert.ok(rendererSource.includes('data-builder-field="name"'));
assert.ok(rendererSource.includes("data-station-section"));
assert.ok(rendererSource.includes("builder-duplicate"));
assert.ok(rendererSource.includes("builder-remove"));
assert.ok(rendererSource.includes("builder-duplicate-station"));
assert.ok(!rendererSource.includes("recordBuilderHistory("), "History ownership belongs to the delegated row controller.");
assert.ok(!rendererSource.includes("refreshAfterBuilderEdit("), "Row mutation ownership belongs to the delegated row controller.");

const rowControllerPath = "app/controllers/map-builder-row-controller.js";
assert.ok(bootstrapSource.includes(rowControllerPath));
assert.ok(bootstrapSource.indexOf("app/controllers/map-builder-event-controller.js") < bootstrapSource.indexOf(rowControllerPath));
assert.ok(bootstrapSource.indexOf(rowControllerPath) < bootstrapSource.indexOf("app/controllers/setup-event-controller-integration.js"));
assert.ok(startupSource.includes("LabelerMapBuilderRowController?.installed"));

console.log("Dynamic Map Builder row controller regression passed.");
