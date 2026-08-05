"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const specsSource = fs.readFileSync(path.join(root, "app", "controllers", "specs-controller.js"), "utf8");
const eventSource = fs.readFileSync(path.join(root, "app", "controllers", "specification-event-controller.js"), "utf8");
const rendererSource = fs.readFileSync(path.join(root, "app", "specification-table-renderer.js"), "utf8");
const bootstrapSource = fs.readFileSync(path.join(root, "app", "bootstrap.js"), "utf8");
const startupSource = fs.readFileSync(path.join(root, "app", "startup-runtime.js"), "utf8");

class FakeElement {
  constructor(row, field, value = "") {
    this.row = row;
    this.dataset = field ? { specField: field } : {};
    this.value = value;
  }

  closest(selector) {
    return selector === "tbody tr[data-spec-index]" ? this.row : null;
  }
}

const listeners = [];
const updates = [];
const sandbox = {
  window: null,
  globalThis: null,
  Element: FakeElement,
  document: {
    addEventListener(type, handler, options) {
      listeners.push({ type, handler, options });
    }
  },
  LabelerSpecsController: {
    updateBottle(...args) { updates.push(["bottle", ...args]); },
    updateLabel(...args) { updates.push(["label", ...args]); }
  },
  console
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

assert.doesNotThrow(() => vm.runInContext(eventSource, sandbox, { filename: "specification-event-controller.js" }));
assert.strictEqual(sandbox.LabelerSpecificationEventController.installed, true);

function dispatch(target) {
  const event = {
    target,
    stopped: false,
    stopImmediatePropagation() { this.stopped = true; }
  };
  const listener = listeners.find((entry) => entry.type === "change");
  assert.ok(listener, "Specification controller must register a delegated change listener.");
  listener.handler(event);
  return event;
}

const labelRow = { dataset: { specIndex: "2", specLibrary: "label" } };
let event = dispatch(new FakeElement(labelRow, "bodyLengthMm", "123.456"));
assert.deepStrictEqual(updates.at(-1), ["label", 2, "bodyLengthMm", "123.456"]);
assert.strictEqual(event.stopped, true);

event = dispatch(new FakeElement(labelRow, "neckBottomCircumferenceMm", "188.2"));
assert.deepStrictEqual(updates.at(-1), ["label", 2, "neckBottomCircumferenceMm", "188.2"]);

const bottleRow = { dataset: { specIndex: "1", specLibrary: "bottle" } };
event = dispatch(new FakeElement(bottleRow, "diameterTargetMm", "66.7"));
assert.deepStrictEqual(updates.at(-1), ["bottle", 1, "diameterTargetMm", "66.7"]);

const updateCount = updates.length;
const sectionCheckbox = new FakeElement(labelRow, null, "on");
sectionCheckbox.dataset = { labelSection: "neck" };
event = dispatch(sectionCheckbox);
assert.strictEqual(updates.length, updateCount, "Section checkboxes must not be treated as specification fields.");
assert.strictEqual(event.stopped, false, "Section checkbox integration must retain its own change event.");

assert.ok(rendererSource.includes('data-spec-field="bodyLengthMm"'));
assert.ok(rendererSource.includes('data-spec-field="neckBottomCircumferenceMm"'));
assert.ok(rendererSource.includes('data-spec-field="diameterTargetMm"'));
assert.ok(rendererSource.includes('tr.dataset.specIndex = String(index)'));
assert.ok(specsSource.includes("bodyLengthMm: null"), "New label measurements must start blank.");
assert.ok(specsSource.includes("diameterTargetMm: null"), "New bottle measurements must start blank.");
assert.ok(specsSource.includes("labelNumericFields.has(key)"), "Label numeric parsing must be based on named fields.");
assert.ok(specsSource.includes("bottleNumericFields.has(key)"), "Bottle numeric parsing must be based on named fields.");

const specsIndex = bootstrapSource.indexOf("app/controllers/specs-controller.js");
const bindingIndex = bootstrapSource.indexOf("app/controllers/specification-event-controller.js");
const legacyBoundaryIndex = bootstrapSource.indexOf("app/controllers/setup-event-controller-integration.js");
assert.ok(specsIndex >= 0 && specsIndex < bindingIndex);
assert.ok(bindingIndex < legacyBoundaryIndex, "Named specification binding must intercept before the legacy boundary.");
assert.ok(startupSource.includes("LabelerSpecificationEventController?.installed"));

console.log("Specification field binding regression passed.");
