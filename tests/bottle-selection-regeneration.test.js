"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const controllerSource = fs.readFileSync(
  path.join(root, "app", "controllers", "build-inputs-controller.js"),
  "utf8"
);
const labelServiceSource = fs.readFileSync(
  path.join(root, "app", "label-specification-service.js"),
  "utf8"
);
const eventControllerSource = fs.readFileSync(
  path.join(root, "app", "controllers", "setup-event-controller-integration.js"),
  "utf8"
);

assert.doesNotThrow(() => new vm.Script(controllerSource, { filename: "build-inputs-controller.js" }));
assert.doesNotThrow(() => new vm.Script(labelServiceSource, { filename: "label-specification-service.js" }));
assert.doesNotThrow(() => new vm.Script(eventControllerSource, { filename: "setup-event-controller-integration.js" }));

class FakeElement {
  constructor(id, value = "") {
    this.id = id;
    this.value = value;
    this.checked = false;
    this.dataset = {};
  }

  closest() { return null; }
}

const listeners = new Map();
const calls = [];
const scheduledFrames = [];
const scheduledTimers = [];
let execution = null;
const document = {
  addEventListener(type, handler, options) {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push({ handler, options });
  }
};

const sandbox = {
  window: null,
  globalThis: null,
  document,
  Element: FakeElement,
  state: {
    applicationMode: "apl",
    selectedBrand: "Test Brand",
    selectedBottle: "Bottle A",
    selectedSite: "Site A",
    labelSpecs: [
      { applicationMode: "apl", brand: "Test Brand", bottleType: "Bottle A" }
    ],
    bottleSpecs: [
      { id: 1, bottleType: "Bottle A", diameterTargetMm: 60, radiusReductionMm: 0.3 },
      { id: 2, bottleType: "Bottle B ", diameterTargetMm: 75, radiusReductionMm: 0.5 }
    ],
    buildInputs: {}
  },
  els: {},
  requestAnimationFrame(callback) {
    scheduledFrames.push(callback);
    return scheduledFrames.length;
  },
  setTimeout(callback) {
    scheduledTimers.push(callback);
    return scheduledTimers.length;
  },
  clearTimeout() {},
  LabelerWorkspaceActionService: {
    execute(options) {
      execution = options;
      const result = options.mutate?.();
      if (options.regenerate) calls.push("regenerate");
      if (options.persist) calls.push("persist");
      if (options.render) calls.push(`render:${options.render}`);
      return result;
    },
    render(targets) {
      calls.push(`deferred-render:${targets}`);
    },
    call(name, ...args) {
      const handler = sandbox[name];
      return typeof handler === "function" ? handler(...args) : undefined;
    },
    number(value, fallback = 0) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    }
  },
  LabelerSettingsController: {},
  LabelerMapController: {},
  LabelerSpecsController: {},
  LabelerTabsController: {},
  LabelerTransferController: {},
  LabelerSimulationController: {},
  LabelerServoProgramController: {},
  LabelerSimulationEditorController: {},
  LabelerStationTableController: {},
  LabelerApplicationController: {},
  console
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(labelServiceSource, sandbox, { filename: "label-specification-service.js" });
vm.runInContext(controllerSource, sandbox, { filename: "build-inputs-controller.js" });

const directResult = sandbox.LabelerBuildInputsController.selectBottle(" bottle b ");
assert.strictEqual(directResult, undefined);
assert.strictEqual(sandbox.state.selectedBottle, "Bottle B ", "Bottle Type matching must tolerate case and surrounding spaces.");
assert.strictEqual(
  sandbox.state.labelSpecs[0].bottleType,
  "Bottle B ",
  "Selecting a Bottle Type must update the active brand's bottle association."
);
assert.strictEqual(execution?.regenerate, true, "Bottle Type selection must regenerate the Servo Program.");
assert.strictEqual(execution?.persist, true, "Bottle Type selection must persist immediately.");
assert.strictEqual(execution?.render, "all", "Direct Bottle Type selection must rerender the workspace by default.");
assert.ok(calls.includes("regenerate"));
assert.ok(calls.includes("persist"));
assert.ok(calls.includes("render:all"));

sandbox.ensureSelectedBrandForApplication();
assert.strictEqual(
  sandbox.state.selectedBottle,
  "Bottle B ",
  "Render preparation must preserve the newly associated Bottle Type."
);

sandbox.LabelerBuildInputsController.selectSite("Site B");
assert.strictEqual(execution?.render, null, "An explicit null render target must suppress synchronous workspace replacement.");
assert.strictEqual(sandbox.state.selectedSite, "Site B");

sandbox.state.selectedBottle = "Bottle A";
sandbox.state.labelSpecs[0].bottleType = "Bottle A";
execution = null;
calls.length = 0;
vm.runInContext(eventControllerSource, sandbox, { filename: "setup-event-controller-integration.js" });

function dispatchChange(target) {
  const event = {
    target,
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopImmediatePropagation() { this.propagationStopped = true; }
  };
  (listeners.get("change") || []).forEach(({ handler }) => handler(event));
  return event;
}

const bottleSelect = new FakeElement("bottleSelect", "Bottle B ");
const changeEvent = dispatchChange(bottleSelect);
assert.strictEqual(changeEvent.propagationStopped, true, "The Bottle Type UI event must be owned by the setup controller.");
assert.strictEqual(sandbox.state.selectedBottle, "Bottle B ", "The #bottleSelect change event must update application state.");
assert.strictEqual(sandbox.state.labelSpecs[0].bottleType, "Bottle B ", "The UI change must persist the brand-to-bottle relationship.");
assert.strictEqual(execution?.regenerate, true);
assert.strictEqual(execution?.persist, true);
assert.strictEqual(execution?.render, null, "The native select must not be replaced during its own change event.");
assert.strictEqual(bottleSelect.value, "Bottle B ", "The selected option must remain visible while the native menu closes.");
assert.ok(!calls.includes("render:all"), "No synchronous full render may run while the native Bottle Type menu is closing.");
assert.ok(!calls.includes("deferred-render:all"));
assert.strictEqual(scheduledFrames.length, 1, "The workspace rebuild must wait for the next animation frame.");

scheduledFrames.shift()(0);
assert.strictEqual(scheduledTimers.length, 1, "The workspace rebuild must be deferred beyond the native menu close frame.");
assert.ok(!calls.includes("deferred-render:all"));
scheduledTimers.shift()();
assert.ok(calls.includes("deferred-render:all"), "The full workspace must rerender after the native menu has closed.");

execution = null;
const invalidResult = sandbox.LabelerBuildInputsController.selectBottle("Missing Bottle");
assert.strictEqual(invalidResult, false, "Unknown Bottle Type values must be rejected.");
assert.strictEqual(sandbox.state.selectedBottle, "Bottle B ");
assert.strictEqual(sandbox.state.labelSpecs[0].bottleType, "Bottle B ");
assert.strictEqual(execution, null, "Rejected values must not persist or rerender.");

console.log("Bottle Type native selection, regeneration, deferred rendering, and brand persistence regression passed.");
