"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const bootstrapSource = fs.readFileSync(path.join(root, "app", "bootstrap.js"), "utf8");
const globalActionsSource = fs.readFileSync(path.join(root, "app", "global-actions.js"), "utf8");
const mapBuilderDomainSource = fs.readFileSync(path.join(root, "app", "map-builder-controller.js"), "utf8");
const actionControllerSource = fs.readFileSync(path.join(root, "app", "controllers", "map-builder-action-controller.js"), "utf8");
const eventControllerSource = fs.readFileSync(path.join(root, "app", "controllers", "map-builder-event-controller.js"), "utf8");
const setupBoundarySource = fs.readFileSync(path.join(root, "app", "controllers", "setup-event-controller-integration.js"), "utf8");

class FakeElement {
  constructor(id, value = "") {
    this.id = id;
    this.value = value;
    this.checked = false;
  }

  closest(selector) {
    return selector === `#${this.id}` ? this : null;
  }
}

const listeners = new Map();
const calls = [];
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
  console,
  LabelerWorkspaceActionService: {
    call(name, ...args) {
      calls.push({ name, args });
      return true;
    }
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

assert.doesNotThrow(() => vm.runInContext(actionControllerSource, sandbox, { filename: "map-builder-action-controller.js" }));
assert.doesNotThrow(() => vm.runInContext(eventControllerSource, sandbox, { filename: "map-builder-event-controller.js" }));
assert.strictEqual(sandbox.LabelerMapBuilderActionController.installed, true);
assert.strictEqual(sandbox.LabelerMapBuilderEventController.installed, true);

function dispatch(type, target) {
  const event = {
    target,
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopImmediatePropagation() { this.propagationStopped = true; }
  };
  (listeners.get(type) || []).forEach(({ handler }) => handler(event));
  return event;
}

function assertLastCall(name, args = []) {
  const call = calls.at(-1);
  assert.strictEqual(call?.name, name);
  assert.strictEqual(JSON.stringify(call?.args || []), JSON.stringify(args));
}

let event = dispatch("input", new FakeElement("mapName", "Updated Map"));
assertLastCall("saveMapDefinitionFromControls", [{ type: "input" }]);
assert.strictEqual(event.propagationStopped, true);

event = dispatch("change", new FakeElement("builderObjectType", "roller"));
assertLastCall("updateBuilderTypeControls");
assert.strictEqual(event.propagationStopped, true);

event = dispatch("change", new FakeElement("mapDirection", "cw"));
assertLastCall("saveMapDefinitionFromControls", [{ type: "change" }]);

event = dispatch("click", new FakeElement("addBuilderObject"));
assertLastCall("addBuilderObjectFromControls");
assert.strictEqual(event.defaultPrevented, true);
assert.strictEqual(event.propagationStopped, true);

event = dispatch("click", new FakeElement("newMachineMap"));
assertLastCall("createMachineMapFromCurrent");

event = dispatch("click", new FakeElement("undoBuilderEdit"));
assertLastCall("restoreBuilderHistory", ["undo"]);

assert.ok(listeners.has("input"));
assert.ok(listeners.has("change"));
assert.ok(listeners.has("click"));
assert.ok((listeners.get("input") || []).every(({ options }) => options === true));
assert.ok((listeners.get("change") || []).every(({ options }) => options === true));
assert.ok((listeners.get("click") || []).every(({ options }) => options === true));

assert.ok(!mapBuilderDomainSource.includes("addEventListener("), "Map Builder domain logic must not register browser listeners.");
assert.ok(mapBuilderDomainSource.includes("function bindWipeDownBuilder()"));
assert.ok(mapBuilderDomainSource.includes("LabelerMapBuilderDomainActions"));
assert.ok(!globalActionsSource.includes("addEventListener("), "Global action compatibility must remain listener-free.");
assert.ok(setupBoundarySource.includes("LabelerSetupEventControllers"));

const orderedModules = [
  "app/controllers/workspace-action-service.js",
  "app/controllers/map-builder-action-controller.js",
  "app/controllers/map-builder-event-controller.js",
  "app/controllers/map-builder-popup-controller.js",
  "app/controllers/setup-event-controller-integration.js",
  "app/startup-runtime.js"
];
let previousIndex = -1;
orderedModules.forEach((file) => {
  const index = bootstrapSource.indexOf(file);
  assert.ok(index > previousIndex, `${file} must load in dependency order.`);
  previousIndex = index;
});

console.log("Setup and Map Builder event ownership regression passed.");
