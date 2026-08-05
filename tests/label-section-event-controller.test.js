"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const controllerPath = path.join(root, "app", "controllers", "label-section-event-controller.js");
const bootstrapPath = path.join(root, "app", "bootstrap.js");
const startupPath = path.join(root, "app", "startup-runtime.js");
const controllerSource = fs.readFileSync(controllerPath, "utf8");
const bootstrapSource = fs.readFileSync(bootstrapPath, "utf8");
const startupSource = fs.readFileSync(startupPath, "utf8");

class FakeElement {
  constructor(section, checked, row = null) {
    this.dataset = section ? { labelSection: section } : {};
    this.checked = checked;
    this.row = row;
  }

  closest(selector) {
    return selector === 'tbody tr[data-spec-library="label"][data-spec-index]' ? this.row : null;
  }
}

const listeners = [];
let saveCount = 0;
let renderCount = 0;
let alertCount = 0;
const row = { dataset: { specLibrary: "label", specIndex: "0" } };
const state = {
  labelSpecs: [{
    brand: "Test Brand",
    neckLengthMm: 25,
    bodyLengthMm: 100,
    backLengthMm: 90,
    enabledLabelSections: { neck: true, body: true, back: true }
  }]
};
const document = {
  addEventListener(type, handler, options) {
    listeners.push({ type, handler, options });
  }
};
const sandbox = {
  window: null,
  globalThis: null,
  document,
  Element: FakeElement,
  state,
  saveCurrentSettings() { saveCount += 1; },
  render() { renderCount += 1; },
  alert() { alertCount += 1; },
  console
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

assert.doesNotThrow(() => vm.runInContext(controllerSource, sandbox, { filename: controllerPath }));
assert.strictEqual(sandbox.LabelerLabelSectionEventController.installed, true);

function dispatch(target) {
  const event = {
    target,
    stopped: false,
    stopImmediatePropagation() { this.stopped = true; }
  };
  listeners.filter((entry) => entry.type === "change").forEach((entry) => entry.handler(event));
  return event;
}

const bodyCheckbox = new FakeElement("body", false, row);
let event = dispatch(bodyCheckbox);
assert.strictEqual(state.labelSpecs[0].enabledLabelSections.body, false);
assert.strictEqual(saveCount, 1);
assert.strictEqual(renderCount, 1);
assert.strictEqual(event.stopped, true);

const neckCheckbox = new FakeElement("neck", false, row);
dispatch(neckCheckbox);
assert.strictEqual(state.labelSpecs[0].enabledLabelSections.neck, false);

const backCheckbox = new FakeElement("back", false, row);
event = dispatch(backCheckbox);
assert.strictEqual(state.labelSpecs[0].enabledLabelSections.back, true, "The final active section must remain selected.");
assert.strictEqual(backCheckbox.checked, true);
assert.strictEqual(alertCount, 1);
assert.strictEqual(event.stopped, true);

const unrelatedInput = new FakeElement(null, false, row);
event = dispatch(unrelatedInput);
assert.strictEqual(event.stopped, false, "Ordinary Label Spec inputs must remain owned by the specification field controller.");

const labelSectionIndex = bootstrapSource.indexOf("app/controllers/label-section-event-controller.js");
const setupBoundaryIndex = bootstrapSource.indexOf("app/controllers/setup-event-controller-integration.js");
assert.ok(labelSectionIndex >= 0 && labelSectionIndex < setupBoundaryIndex, "Brand Recipe section events must load before the legacy setup boundary.");
assert.ok(startupSource.includes("LabelerLabelSectionEventController?.installed"));

console.log("Brand Recipe section checkbox regression passed.");
