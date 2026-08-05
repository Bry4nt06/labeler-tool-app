"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app", "controllers", "map-builder-popup-controller.js"), "utf8");
const bootstrapSource = fs.readFileSync(path.join(root, "app", "bootstrap.js"), "utf8");

class FakeClassList {
  constructor() { this.values = new Set(); }
  toggle(name, enabled) {
    if (enabled) this.values.add(name);
    else this.values.delete(name);
  }
  contains(name) { return this.values.has(name); }
}

class FakeElement {
  constructor(id) {
    this.id = id;
    this.hidden = id === "applicationSetupDialog";
    this.classList = new FakeClassList();
    this.attributes = {};
    this.children = [];
    this.innerHTML = "";
    this.textContent = "";
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  closest(selector) { return selector === `#${this.id}` ? this : null; }
  focus() {}
}

const controls = Object.fromEntries([
  "wipeDownBuilderButton",
  "applicationSetupDialog",
  "closeApplicationSetup",
  "applyApplicationSetup",
  "mapRightRail",
  "labelerMapReference",
  "wipeBuilderList",
  "builderStatus"
].map((id) => [id, new FakeElement(id)]));

const body = new FakeElement("body");
const listeners = [];
const calls = { ensure: 0, render: 0, save: 0, fullRender: 0 };
const state = {
  wipeBuilderOpen: false,
  activeMapId: "map-1",
  mapLibrary: [{ id: "map-1", name: "Test Map", objects: [] }]
};

const document = {
  body,
  querySelector(selector) { return controls[selector.replace(/^#/, "")] || null; },
  addEventListener(type, handler, options) { listeners.push({ type, handler, options }); }
};

const sandbox = {
  window: null,
  globalThis: null,
  state,
  document,
  Element: FakeElement,
  console,
  ensurePersistentApplicationMaps() { calls.ensure += 1; },
  activeMachineMap() { return state.mapLibrary[0]; },
  renderWipeDownBuilder() {
    calls.render += 1;
    controls.wipeBuilderList.children = [new FakeElement("map-object")];
  },
  saveCurrentSettings() { calls.save += 1; },
  render() { calls.fullRender += 1; },
  requestAnimationFrame(callback) { callback(); }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "map-builder-popup-controller.js" });

assert.ok(sandbox.LabelerMapBuilderPopupController?.installed);
assert.strictEqual(listeners.filter((entry) => entry.type === "click").length, 1);

sandbox.LabelerMapBuilderPopupController.open();
assert.strictEqual(state.wipeBuilderOpen, true);
assert.strictEqual(controls.applicationSetupDialog.hidden, false);
assert.strictEqual(controls.mapRightRail.classList.contains("builder-open"), true);
assert.strictEqual(controls.wipeDownBuilderButton.attributes["aria-expanded"], "true");
assert.ok(calls.ensure >= 1);
assert.ok(calls.render >= 1);
assert.ok(calls.save >= 1);

sandbox.LabelerMapBuilderPopupController.close();
assert.strictEqual(state.wipeBuilderOpen, false);
assert.strictEqual(controls.applicationSetupDialog.hidden, true);
assert.strictEqual(controls.mapRightRail.classList.contains("builder-open"), false);

let prevented = false;
let stopped = false;
listeners.find((entry) => entry.type === "click").handler({
  target: controls.wipeDownBuilderButton,
  preventDefault() { prevented = true; },
  stopImmediatePropagation() { stopped = true; }
});
assert.strictEqual(state.wipeBuilderOpen, true);
assert.strictEqual(prevented, true);
assert.strictEqual(stopped, true);

const popupIndex = bootstrapSource.indexOf("app/controllers/map-builder-popup-controller.js");
const generalIndex = bootstrapSource.indexOf("app/controllers/setup-event-controller-integration.js");
assert.ok(popupIndex >= 0 && popupIndex < generalIndex, "The popup controller must own Map Builder clicks before the general event boundary.");

console.log("Map Builder popup controller regression passed.");
