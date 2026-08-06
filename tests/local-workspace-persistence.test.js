"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const source = read("app/controllers/local-persistence-controller.js");
assert.doesNotThrow(() => new vm.Script(source));

const storage = new Map();
const documentListeners = new Map();
const windowListeners = new Map();
const intervals = [];
const timeouts = new Map();
let timeoutId = 0;
let writes = 0;

const state = {
  previewAngle: 0,
  previewBottleAngle: null,
  builderSaveState: "saved",
  mapLibrary: [{ id: "custom-map", name: "Custom Map" }],
  servoProfileLibrary: [{ id: "profile-1", name: "Brand Servo Profile" }],
  labelSpecs: [{ id: 1, brand: "Test Brand" }],
  bottleSpecs: [{ id: 1, bottleType: "Test Bottle" }],
  servoOverrides: {}
};

const snapshot = () => JSON.parse(JSON.stringify({
  previewAngle: state.previewAngle,
  previewBottleAngle: state.previewBottleAngle,
  mapLibrary: state.mapLibrary,
  servoProfileLibrary: state.servoProfileLibrary,
  labelSpecs: state.labelSpecs,
  bottleSpecs: state.bottleSpecs,
  servoOverrides: state.servoOverrides
}));

const context = {
  console,
  SETTINGS_KEY: "labelerToolSettings",
  state,
  els: { builderStatus: { textContent: "" } },
  settingsSnapshot: snapshot,
  readStorage(key) {
    return storage.has(key) ? storage.get(key) : null;
  },
  writeStorage(key, value) {
    storage.set(key, value);
    writes += 1;
    return true;
  },
  document: {
    visibilityState: "visible",
    addEventListener(type, listener) {
      documentListeners.set(type, listener);
    },
    removeEventListener(type) {
      documentListeners.delete(type);
    }
  },
  addEventListener(type, listener) {
    windowListeners.set(type, listener);
  },
  removeEventListener(type) {
    windowListeners.delete(type);
  },
  setTimeout(callback) {
    timeoutId += 1;
    timeouts.set(timeoutId, callback);
    return timeoutId;
  },
  clearTimeout(id) {
    timeouts.delete(id);
  },
  setInterval(callback) {
    intervals.push(callback);
    return intervals.length;
  },
  clearInterval() {}
};
context.window = context;

vm.createContext(context);
new vm.Script(source).runInContext(context);

const controller = context.LabelerLocalPersistenceController;
assert.equal(controller.installed, true);
assert.equal(controller.initialize(), true);
assert.equal(controller.initialized, true);
assert.equal(writes, 1, "startup should persist the reconciled in-memory workspace");

let saved = JSON.parse(storage.get("labelerToolSettings"));
assert.equal(saved.mapLibrary[0].name, "Custom Map");
assert.equal(saved.servoProfileLibrary[0].name, "Brand Servo Profile");

state.mapLibrary[0].name = "Edited Custom Map";
intervals[0]();
assert.equal(writes, 2, "programmatic nested map edits should be detected");
saved = JSON.parse(storage.get("labelerToolSettings"));
assert.equal(saved.mapLibrary[0].name, "Edited Custom Map");

state.previewAngle = 125.5;
intervals[0]();
assert.equal(writes, 2, "animation-only preview movement should not cause storage churn");

state.servoProfileLibrary.push({ id: "profile-2", name: "Second Profile" });
windowListeners.get("pagehide")();
assert.equal(writes, 3, "page exit should synchronously flush durable profile changes");

controller.suspend();
state.labelSpecs[0].brand = "Should Not Save During Reset";
windowListeners.get("pagehide")();
assert.equal(writes, 3, "explicit reset suspension must block the final pagehide save");

const bootstrap = read("app/bootstrap.js");
const startup = read("app/startup-runtime.js");
const reset = read("app/controllers/settings-reset-controller.js");
const persistence = read("app/persistence.js");

assert.match(bootstrap, /app\/controllers\/local-persistence-controller\.js/);
assert.match(startup, /LabelerLocalPersistenceController\.initialize\(\)/);
assert.match(reset, /LabelerLocalPersistenceController/);
assert.match(reset, /\.suspend\(\)/);
assert.match(persistence, /mapLibrary: state\.mapLibrary/);
assert.match(persistence, /servoProfileLibrary: state\.servoProfileLibrary/);
assert.match(persistence, /labelSpecs: state\.labelSpecs/);
assert.match(persistence, /bottleSpecs: state\.bottleSpecs/);
assert.match(persistence, /servoOverrides: state\.servoOverrides/);

console.log("Local workspace persistence regression passed.");
