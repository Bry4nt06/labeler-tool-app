"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const legacy = read("app/map-rendering.js");
const bottle = read("app/bottle-visual-renderer.js");
const overlays = read("app/map-overlay-renderer.js");
const animation = read("app/map-animation-renderer.js");
const references = read("app/map-reference-presenter.js");
const motionDriver = read("drivers/servo/production-motion-pattern-driver.js");
const motionReference = read("app/production-motion-profile-reference-integration.js");
const manifest = read("app/simulation-collapsible-integration.js");

[
  [bottle, ["bottleLocalArcPath", "bottleLabelApplications", "bottlePreviewAngle", "drawBottleLabelIndicators"]],
  [overlays, ["drawMapQuadrantReferences", "drawAggregateSpacingOverlay"]],
  [animation, ["updateAnimatedSvg", "updateMapAnimationFrame", "updateSimulationAnimationFrame"]],
  [references, ["applicationMapPointRows", "labelerMapReferenceRows", "renderLabelerMapReference"]]
].forEach(([source, functions]) => {
  functions.forEach((name) => assert.match(source, new RegExp(`function ${name}\\(`), `${name} must have a focused owner.`));
  assert.doesNotMatch(source, /addEventListener\(/, "Map presentation modules must not attach event handlers.");
  assert.doesNotMatch(source, /saveCurrentSettings\(/, "Map presentation modules must not own persistence.");
});

assert.match(legacy, /function renderMap\(/, "Mechanical scene remains in the staged source fallback.");
assert.match(legacy, /function renderSimulationMap\(/, "Simulation scene remains in the staged source fallback.");
assert.match(legacy, /function drawBottleLabelIndicators\(/, "Bottle visual fallback remains for browser verification.");
assert.match(legacy, /function updateAnimatedSvg\(/, "Animation fallback remains for browser verification.");

const driverIndex = manifest.indexOf("drivers/servo/production-motion-pattern-driver.js");
const bottleIndex = manifest.indexOf("app/bottle-visual-renderer.js");
const overlayIndex = manifest.indexOf("app/map-overlay-renderer.js");
const animationIndex = manifest.indexOf("app/map-animation-renderer.js");
const referenceIndex = manifest.indexOf("app/map-reference-presenter.js");
const workspaceIndex = manifest.indexOf("app/assembly-driver-adapter.js");
const profileReferenceIndex = manifest.indexOf("app/production-motion-profile-reference-integration.js");
const workbenchIndex = manifest.indexOf("app/motion-profile-workbench-integration.js");
const coordinatorIndex = manifest.indexOf("app/rendering-coordinator-integration.js");
const diagnosticsIndex = manifest.indexOf("app/validation-diagnostics-integration.js");
assert.ok(driverIndex >= 0, "Production motion pattern driver must load.");
assert.ok(bottleIndex >= 0 && overlayIndex > bottleIndex && animationIndex > overlayIndex && referenceIndex > animationIndex, "Focused map presentation modules must load in dependency order.");
assert.ok(workspaceIndex > referenceIndex, "Focused map presentation owners must load before workspace integrations.");
assert.ok(profileReferenceIndex >= 0 && workbenchIndex > profileReferenceIndex, "Production reference profile must seed before the Profile Manager installs.");
assert.ok(coordinatorIndex > workbenchIndex, "Render coordinator must install after feature wrappers.");
assert.ok(diagnosticsIndex > coordinatorIndex, "Diagnostics must remain the final feature stage.");

const registry = new Map();
const sandbox = {
  window: {},
  LabelerServoCommandDriver: {
    commandForIntent(intent) {
      return ({ Hold: 3, Startup: 1, Continuous: 5, Changeover: 6, End: 2, Correction: 7 })[intent] ?? null;
    }
  },
  LabelerDriverRegistry: {
    register(name, api, metadata) { registry.set(name, { api, metadata }); }
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(motionDriver, sandbox);

const driver = sandbox.LabelerProductionMotionPatternDriver;
assert.ok(driver, "Production motion pattern driver must install.");
assert.deepStrictEqual(Array.from(driver.PATTERNS.CONTINUOUS_SPEED_CHANGE.commands), [3, 1, 5, 6, 5, 2, 3]);
assert.deepStrictEqual(Array.from(driver.PATTERNS.CONTINUOUS_SPEED_CHANGE.intents), ["Hold", "Startup", "Continuous", "Changeover", "Continuous", "End", "Hold"]);
assert.strictEqual(driver.validateCommands([3, 1, 5, 6, 5, 2, 3]).valid, true, "Observed production chain must validate.");
assert.strictEqual(driver.validateCommands([3, 1, 6, 5, 2, 3]).valid, false, "Startup must transition to Continuous before Changeover.");
assert.strictEqual(driver.validateCommands([1, 5, 2]).valid, false, "Reference chains must start and finish at Rest.");
assert.strictEqual(driver.validateIntents(["Hold", "Startup", "Continuous", "Changeover", "Continuous", "End", "Hold"]).valid, true);
assert.ok(registry.has("servo.production-pattern"), "Production pattern must register as a driver.");

assert.match(motionReference, /production-continuous-reference-v1/, "Reference profile identity must remain stable.");
assert.match(motionReference, /Rest \(3\).*Startup \(1\).*Continuous \(5\).*Changeover \(6\).*End \(2\).*Rest \(3\)/s, "Reference profile must describe the observed chain.");
assert.match(motionReference, /Preview\/reference only/, "Reference profile must not claim live generation support.");
assert.match(motionReference, /builtIn: true/, "Reference profile must be protected from normal custom-profile deletion.");

console.log("Map rendering ownership and production motion reference regression passed.");
