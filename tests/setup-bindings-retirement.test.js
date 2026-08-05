"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const marker = read("app/setup-bindings.js");
const initializer = read("app/controllers/setup-state-controller.js");
const mapController = read("app/controllers/map-controller.js");
const delegatedEvents = read("app/controllers/setup-event-controller-integration.js");
const bootstrap = read("app/bootstrap.js");
const startup = read("app/startup-runtime.js");

assert.doesNotMatch(marker, /function\s+bindSetup\s*\(/, "Legacy bindSetup implementation must remain retired.");
assert.doesNotMatch(marker, /addEventListener\s*\(/, "Setup compatibility marker must not attach listeners.");
assert.doesNotMatch(marker, /saveCurrentSettings\s*\(/, "Setup compatibility marker must not persist state.");
assert.doesNotMatch(marker, /\brender(?:Map|SimulationMap|AnimationFrame)?\s*\(/, "Setup compatibility marker must not render.");
assert.match(marker, /LabelerSetupBindingsCompatibility/, "Setup compatibility marker must identify active owners.");

assert.match(initializer, /function initialize\s*\(/, "Setup state controller must expose initialization.");
assert.doesNotMatch(initializer, /addEventListener\s*\(/, "Setup state initializer must not attach listeners.");
assert.doesNotMatch(initializer, /saveCurrentSettings\s*\(/, "Setup state initializer must not persist startup state.");
assert.match(initializer, /map\.updateLockUi\(\)/, "Setup initialization must restore map lock presentation.");
assert.match(initializer, /showMoveDistanceOverlay/, "Setup initialization must restore movement-overlay state.");
assert.match(initializer, /showAllProgramMovesOverlay/, "Setup initialization must restore all-moves overlay state.");
assert.match(initializer, /wipeBuilderOpen/, "Setup initialization must restore builder visibility.");

assert.match(mapController, /function beginPointer\s*\(/, "Map controller must own pointer start.");
assert.match(mapController, /function movePointer\s*\(/, "Map controller must own pointer movement.");
assert.match(mapController, /function finishPointer\s*\(/, "Map controller must own pointer completion.");
assert.match(mapController, /function zoom\s*\(/, "Map controller must own map zoom.");
assert.match(mapController, /function toggleLock\s*\(/, "Map controller must own map locking.");
assert.match(delegatedEvents, /document\.addEventListener\("wheel"/, "Delegated boundary must own wheel events.");
assert.match(delegatedEvents, /document\.addEventListener\("pointerdown"/, "Delegated boundary must own pointer events.");
assert.match(delegatedEvents, /settings\.setMovementOverlay/, "Delegated boundary must own overlay changes.");
assert.match(delegatedEvents, /map\.setDirection/, "Delegated boundary must own direction changes.");

const stateIndex = bootstrap.indexOf("app/controllers/setup-state-controller.js");
const eventIndex = bootstrap.indexOf("app/controllers/setup-event-controller-integration.js");
const startupIndex = bootstrap.indexOf("app/startup-runtime.js");
assert.ok(stateIndex >= 0, "Setup state controller must load through bootstrap.");
assert.ok(eventIndex > stateIndex, "Delegated events must load after state initialization ownership.");
assert.ok(startupIndex > eventIndex, "Startup runtime must load after setup controllers.");
assert.doesNotMatch(startup, /\bbindSetup\s*\(/, "Startup must not invoke the retired setup binding.");
assert.match(startup, /LabelerSetupStateController\.initialize\(\)/, "Startup must hydrate setup controls through the state controller.");

const element = () => ({ value: "", checked: false, hidden: false, textContent: "", classList: { toggle() {} }, setAttribute() {} });
const els = {
  themePreset: element(), workspaceView: element(), headCount: element(), radius: element(), zeroAngle: element(),
  referencePitchRadiusMm: element(), encoderCountsPerRev: element(), servoGearRatio: element(), previewAngle: element(),
  tableAngleJump: element(), previewBottleAngle: element(), animationSpeed: element(), maxMoveRatio: element(),
  spenderDepth: element(), opRollerDepth: element(), nonOpRollerDepth: element(), wipeInnerDepth: element(), wipeOuterDepth: element(),
  direction: element(), tablePitchRadiusMm: element(), padClearanceMm: element(), autoScaleTableMap: element(),
  showQuadrantReferences: element(), showMoveDistanceOverlay: element(), showAllProgramMovesOverlay: element(),
  animationStepReadout: element(), applicationSetupDialog: element(), mapRightRail: element(), labelerMapReference: element(),
  labelerMapButton: element()
};
let lockUpdates = 0;
const sandbox = {
  window: {},
  state: {
    themePreset: "graphite", workspaceView: "direct", headCount: 45, radius: 280, zeroAngle: 0,
    referencePitchRadiusMm: 350, encoderCountsPerRev: 4096, servoGearRatio: 1, previewAngle: 81,
    previewBottleAngle: null, animationSpeed: 10, maxMoveRatio: 21, tablePitchRadiusMm: 420, padClearanceMm: 2,
    autoScaleTableMap: true, showQuadrantReferences: false, showMoveDistanceOverlay: true,
    showAllProgramMovesOverlay: false, direction: "cw", wipeBuilderOpen: true,
    depths: { spender: 10, opRoller: 20, nonOpRoller: 30, wipeInner: 40, wipeOuter: 50 }
  },
  els,
  LabelerMapController: { updateLockUi() { lockUpdates += 1; } },
  setThemePreset() {},
  setWorkspaceView() {},
  fmt(value) { return Number(value).toFixed(1); },
  norm(value) { return ((Number(value) % 360) + 360) % 360; },
  Number,
  String,
  Boolean,
  Error,
  Object
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(initializer, sandbox);
sandbox.LabelerSetupStateController.initialize();
assert.strictEqual(els.headCount.value, "45");
assert.strictEqual(els.previewAngle.value, "81");
assert.strictEqual(els.showMoveDistanceOverlay.checked, true);
assert.strictEqual(els.showAllProgramMovesOverlay.checked, false);
assert.strictEqual(els.applicationSetupDialog.hidden, false);
assert.strictEqual(lockUpdates, 1);

console.log("Setup bindings retirement regression passed.");
