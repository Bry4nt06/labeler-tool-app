"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const marker = read("app/map-rendering.js");
const bottle = read("app/bottle-visual-renderer.js");
const overlays = read("app/map-overlay-renderer.js");
const reference = read("app/map-reference-presenter.js");
const mechanical = read("app/mechanical-map-scene-renderer.js");
const simulation = read("app/simulation-map-scene-renderer.js");
const animation = read("app/map-animation-renderer.js");
const manifest = read("app/simulation-collapsible-integration.js");

assert.doesNotMatch(marker, /function\s+(renderMap|renderSimulationMap|applyMapView|updateAnimatedSvg|drawBottleLabelIndicators|drawMapQuadrantReferences|applicationMapPointRows)\b/,
  "The retired map-rendering source must not contain active implementations.");
assert.doesNotMatch(marker, /addEventListener\(|saveCurrentSettings\(|localStorage\./,
  "The compatibility marker must not own events or persistence.");

assert.match(bottle, /function drawBottleLabelIndicators\(/, "Bottle visuals must own label indicators.");
assert.match(overlays, /function drawMapQuadrantReferences\(/, "Overlay renderer must own quadrant references.");
assert.match(overlays, /function drawAggregateSpacingOverlay\(/, "Overlay renderer must own aggregate spacing.");
assert.match(reference, /function applicationMapPointRows\(/, "Reference presenter must own map-point rows.");
assert.match(reference, /function renderLabelerMapReference\(/, "Reference presenter must own the permanent reference table.");
assert.match(mechanical, /function applyMapView\(/, "Mechanical scene must own viewport application.");
assert.match(mechanical, /function renderMap\(/, "Mechanical scene must own renderMap.");
assert.match(simulation, /function renderSimulationMap\(/, "Simulation scene must own renderSimulationMap.");
assert.match(animation, /function updateAnimatedSvg\(/, "Animation renderer must own incremental SVG updates.");
assert.match(animation, /function updateMapAnimationFrame\(/, "Animation renderer must own mechanical animation updates.");
assert.match(animation, /function updateSimulationAnimationFrame\(/, "Animation renderer must own simulation animation updates.");

[mechanical, simulation, animation, bottle, overlays, reference].forEach((source) => {
  assert.doesNotMatch(source, /addEventListener\(/, "Map presentation modules must not attach browser events.");
  assert.doesNotMatch(source, /saveCurrentSettings\(/, "Map presentation modules must not own persistence.");
});

const bottleIndex = manifest.indexOf("app/bottle-visual-renderer.js");
const overlayIndex = manifest.indexOf("app/map-overlay-renderer.js");
const referenceIndex = manifest.indexOf("app/map-reference-presenter.js");
const mechanicalIndex = manifest.indexOf("app/mechanical-map-scene-renderer.js");
const simulationIndex = manifest.indexOf("app/simulation-map-scene-renderer.js");
const animationIndex = manifest.indexOf("app/map-animation-renderer.js");
const workspaceIndex = manifest.indexOf("workspaceCore: Object.freeze");
const coordinatorIndex = manifest.indexOf("app/rendering-coordinator-integration.js");
const diagnosticsIndex = manifest.indexOf("app/validation-diagnostics-integration.js");

assert.ok(bottleIndex >= 0 && overlayIndex > bottleIndex, "Map dependencies must load after bottle visuals.");
assert.ok(referenceIndex > overlayIndex, "Map reference presenter must load after shared overlays.");
assert.ok(mechanicalIndex > referenceIndex, "Mechanical scene must load after its reference presenter.");
assert.ok(simulationIndex > mechanicalIndex, "Simulation scene must load after the mechanical scene.");
assert.ok(animationIndex > simulationIndex, "Animation helpers must load after both scene builders.");
assert.ok(workspaceIndex > animationIndex, "All map presentation owners must exist before workspace integrations.");
assert.ok(coordinatorIndex > workspaceIndex, "Render coordinator must install after feature wrappers.");
assert.ok(diagnosticsIndex > coordinatorIndex, "Diagnostics must remain the final feature stage.");

assert.match(mechanical, /state\.direction === "cw" \? -1 : 1/,
  "Mechanical scene must preserve stored direction behavior.");
assert.match(simulation, /state\.direction === "cw" \? -1 : 1/,
  "Simulation scene must preserve stored direction behavior.");
assert.match(mechanical, /drawMoveDistanceOverlay\(add, moveDistanceLayer, program\)/,
  "Mechanical scene must retain active-move overlays.");
assert.match(simulation, /drawFaultOverlay\(add, faultLayer, program\)/,
  "Simulation scene must retain fault overlays.");

console.log("Map rendering retirement regression passed.");
