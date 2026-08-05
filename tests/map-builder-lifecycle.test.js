"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.resolve(__dirname, "../app/controllers/map-controller.js"), "utf8");
const calls = [];
const machineMap = {
  id: "map-1",
  name: "Lifecycle Test Map",
  objects: [{ id: "pad-1", kind: "pad", application: "apl", station: 1 }]
};

function element() {
  return {
    hidden: false,
    textContent: "",
    innerHTML: "",
    childElementCount: 0,
    options: [],
    classList: { toggle() {}, add() {}, remove() {} },
    setAttribute() {},
    contains() { return false; }
  };
}

const els = {
  builderStatus: element(),
  mapLibrarySelect: element(),
  aggregateToggleList: element(),
  stationToggleList: element(),
  wipeBuilderList: element(),
  addBuilderObject: element(),
  applicationSetupDialog: element(),
  mapRightRail: element(),
  labelerMapReference: element(),
  mapLockToggle: element(),
  mapSvg: element(),
  previewAngle: element(),
  tableAngleJump: element(),
  playPause: element()
};

const state = {
  activeMapId: "missing-map",
  mapLibrary: [machineMap],
  wipeBuilderOpen: false,
  mapLocked: true,
  previewAngle: 0,
  direction: "ccw",
  zeroAngle: 0,
  mapZoom: 1,
  mapPanX: 0,
  builderHistory: { undo: [], redo: [] }
};

let bindCount = 0;
let renderCount = 0;
const actions = {
  number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  },
  call(name, ...args) {
    calls.push([name, ...args]);
    if (name === "activeMachineMap") return state.mapLibrary.find((entry) => entry.id === state.activeMapId) || state.mapLibrary[0];
    if (name === "loadMachineMapIntoRuntime") {
      state.activeMapId = args[0].id;
      return;
    }
    if (name === "renderWipeDownBuilder") {
      renderCount += 1;
      els.mapLibrarySelect.options = [{ value: machineMap.id }];
      els.aggregateToggleList.childElementCount = 1;
      els.stationToggleList.childElementCount = 1;
      els.wipeBuilderList.childElementCount = 1;
      return;
    }
    if (name === "bindWipeDownBuilder") {
      bindCount += 1;
      return;
    }
    if (name === "norm") return ((Number(args[0]) % 360) + 360) % 360;
    if (name === "fmt") return String(args[0]);
    return undefined;
  },
  execute(options = {}) {
    const result = options.mutate?.();
    options.after?.();
    return result;
  },
  render() {}
};

const sandbox = {
  window: {},
  state,
  els,
  console,
  Math,
  Number,
  String,
  Boolean,
  Error,
  LabelerWorkspaceActionService: actions,
  requestAnimationFrame(callback) { callback(); }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

assert.ok(sandbox.LabelerMapController, "Map controller should install.");
assert.strictEqual(sandbox.LabelerMapController.populateBuilder({ bind: true }), true);
assert.strictEqual(state.activeMapId, machineMap.id, "Invalid active map should fall back to the first saved map.");
assert.strictEqual(renderCount, 1, "Builder should render once during direct population.");
assert.strictEqual(bindCount, 1, "Builder controls should bind once.");
assert.match(els.builderStatus.textContent, /STAGING 0\.9\.8/);
assert.match(els.builderStatus.textContent, /Lifecycle Test Map/);

sandbox.LabelerMapController.populateBuilder({ bind: true });
assert.strictEqual(bindCount, 1, "Repeated population must not duplicate direct bindings.");

sandbox.LabelerMapController.setBuilderOpen(true);
assert.strictEqual(state.wipeBuilderOpen, true);
assert.strictEqual(els.applicationSetupDialog.hidden, false);
assert.ok(renderCount >= 3, "Opening the drawer should populate immediately and once more on the next frame.");

console.log("Map Builder lifecycle regression passed.");
