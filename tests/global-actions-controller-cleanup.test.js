"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const panelPath = path.join(root, "app", "controllers", "workspace-panel-controller.js");
const globalActionsPath = path.join(root, "app", "global-actions.js");
const setupStatePath = path.join(root, "app", "controllers", "setup-state-controller.js");
const startupPath = path.join(root, "app", "startup-runtime.js");
const bootstrapPath = path.join(root, "app", "bootstrap.js");

const panelSource = fs.readFileSync(panelPath, "utf8");
const globalActionsSource = fs.readFileSync(globalActionsPath, "utf8");
const setupStateSource = fs.readFileSync(setupStatePath, "utf8");
const startupSource = fs.readFileSync(startupPath, "utf8");
const bootstrapSource = fs.readFileSync(bootstrapPath, "utf8");

class FakeElement {}
const listeners = [];
const storage = new Map();
let renderCount = 0;
let aggregateUpdates = 0;
let removedPopupControls = 0;

const classNames = new Set();
const panel = {
  hidden: true,
  removeAttribute() {},
  setAttribute() {},
  classList: { add(value) { classNames.add(value); } }
};
const aggregateInput = { id: "showAggregateSpacingOverlay", checked: false };
const wipeSettingInput = { id: "showWipeDataPanel", checked: false };
const removableControl = { remove() { removedPopupControls += 1; } };
const selectorResults = new Map([
  ["#showAggregateSpacingOverlay", aggregateInput],
  ["#showWipeDataPanel", wipeSettingInput],
  ["#wipeDownDataPanel", panel],
  ["#showWipeDownData", removableControl],
  ["#closeWipeDownData", removableControl],
  ["#toggleAggregateSpacing", null],
  [".validation-head-actions", null]
]);

const state = {
  showAggregateSpacingOverlay: false
};
const els = {
  wipeDownDataPanel: panel,
  showAggregateSpacingOverlay: aggregateInput,
  showWipeDataPanel: wipeSettingInput,
  saveSettings: null
};
const document = {
  addEventListener(type, handler, options) { listeners.push({ type, handler, options }); },
  querySelector(selector) { return selectorResults.get(selector) || null; },
  createElement() { throw new Error("Existing regression controls should be reused."); }
};
const sandbox = {
  window: null,
  globalThis: null,
  document,
  Element: FakeElement,
  localStorage: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, value); }
  },
  state,
  els,
  LabelerSettingsController: {
    setAggregateSpacing(value) {
      aggregateUpdates += 1;
      state.showAggregateSpacingOverlay = Boolean(value);
    }
  },
  renderWipeDownData() { renderCount += 1; },
  console
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

assert.doesNotThrow(() => vm.runInContext(panelSource, sandbox, { filename: panelPath }));
assert.strictEqual(sandbox.LabelerWorkspacePanelController.installed, true);

sandbox.LabelerWorkspacePanelController.initialize();
assert.strictEqual(panel.hidden, false, "Wipe Data must be visible by default.");
assert.strictEqual(wipeSettingInput.checked, true);
assert.strictEqual(renderCount, 1);
assert.strictEqual(removedPopupControls, 2, "Legacy Wipe Data open and close controls must be removed.");
assert.ok(classNames.has("persistent-wipe-data-panel"));

sandbox.LabelerWorkspacePanelController.setWipeDataVisible(false);
assert.strictEqual(panel.hidden, true);
assert.strictEqual(wipeSettingInput.checked, false);
assert.strictEqual(storage.get("servoforgeWipeDataPanelVisible"), "false");

sandbox.LabelerWorkspacePanelController.setWipeDataVisible(true);
assert.strictEqual(panel.hidden, false);
assert.strictEqual(renderCount, 2);

sandbox.LabelerWorkspacePanelController.setAggregateSpacingVisible(true);
assert.strictEqual(aggregateUpdates, 1);
assert.strictEqual(state.showAggregateSpacingOverlay, true);
assert.strictEqual(aggregateInput.checked, true);
assert.ok(listeners.some((entry) => entry.type === "change" && entry.options === true));
assert.ok(!listeners.some((entry) => entry.type === "click"), "Workspace panels must no longer use popup click controls.");

assert.ok(panelSource.includes(".map-overlay-control"));
assert.ok(panelSource.includes("Show Wipe Data panel"));
assert.ok(panelSource.includes("Aggregate travel distance"));
assert.ok(!globalActionsSource.includes("addEventListener"), "global-actions.js must not register browser listeners.");
assert.ok(!globalActionsSource.includes("state."), "global-actions.js must not mutate application state.");
assert.ok(globalActionsSource.includes("compatibilityOnly: true"));
assert.ok(setupStateSource.includes("bindZoneSiteDeveloperMenu"));
assert.ok(startupSource.includes("LabelerWorkspacePanelController.initialize()"));
assert.ok(!startupSource.includes("bindGlobalActions();"));

const panelIndex = bootstrapSource.indexOf("app/controllers/workspace-panel-controller.js");
const eventIndex = bootstrapSource.indexOf("app/controllers/setup-event-controller-integration.js");
const startupIndex = bootstrapSource.indexOf("app/startup-runtime.js");
assert.ok(panelIndex >= 0 && panelIndex < eventIndex, "Workspace panel controller must load before the delegated event boundary.");
assert.ok(eventIndex < startupIndex, "Delegated events must load before startup.");

console.log("Workspace panel organization regression passed.");
