"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = (name) => fs.readFileSync(path.join(root, "app", name), "utf8");
const core = source("assemblies.js");
const editor = source("assembly-editor-controller.js");
const renderer = source("assembly-map-renderer.js");
const manifest = source("simulation-collapsible-integration.js");

const editorOwners = [
  "configureSetupDialogMode",
  "renderAssemblyEditor",
  "renderObjectLocationEditor",
  "applyApplicationPreset"
];
const rendererOwners = [
  "drawMapObjectLabel",
  "activeAggregateDefinitions",
  "aggregateCenterlineGaps",
  "drawIndependentAggregates",
  "labelSensorMapStatus",
  "labelSensorMapColor",
  "drawConfiguredAssemblies"
];
const removedFallbackOwners = [
  "normalizeAssembly",
  "mmToTableDegrees",
  "padStartAngle",
  "padAnglesForSide",
  "padProfileTableAngles",
  "assemblyAngles",
  "assemblySpan",
  "syncMapPointsFromAssemblies",
  "mapPointStation",
  "assemblyRequiredRatio",
  "assemblyStatus",
  "assemblyTypeLabel",
  "assemblyPositionLabel",
  "assemblySelectValue"
];

for (const name of editorOwners) {
  assert.match(editor, new RegExp(`function ${name}\\(`), `${name} must be owned by the assembly editor/controller module.`);
  assert.doesNotMatch(core, new RegExp(`function ${name}\\(`), `${name} must not return to assemblies.js.`);
  assert.doesNotMatch(renderer, new RegExp(`function ${name}\\(`), `${name} must not be duplicated in the renderer.`);
}

for (const name of rendererOwners) {
  assert.match(renderer, new RegExp(`function ${name}\\(`), `${name} must be owned by the assembly renderer module.`);
  assert.doesNotMatch(core, new RegExp(`function ${name}\\(`), `${name} must not return to assemblies.js.`);
  assert.doesNotMatch(editor, new RegExp(`function ${name}\\(`), `${name} must not be duplicated in the editor/controller.`);
}

for (const name of removedFallbackOwners) {
  assert.doesNotMatch(core, new RegExp(`function ${name}\\(`), `${name} must be owned only by the registered assembly drivers and adapter.`);
}
assert.match(core, /assembly-model-and-geometry-owned-by-drivers/, "assemblies.js must remain only as a compatibility marker.");
assert.ok(core.split(/\r?\n/).length < 20, "assemblies.js must remain a tiny compatibility marker.");
assert.ok(editor.split(/\r?\n/).length < 300, "The editor/controller module must remain focused.");
assert.ok(renderer.split(/\r?\n/).length < 220, "The map renderer module must remain focused.");

const adapterIndex = manifest.indexOf("app/assembly-driver-adapter.js");
const editorIndex = manifest.indexOf("app/assembly-editor-controller.js");
const rendererIndex = manifest.indexOf("app/assembly-map-renderer.js");
const nextFeatureIndex = manifest.indexOf("app/simulation-collapsible-core.js");
assert.ok(adapterIndex >= 0, "Assembly driver adapter must be present in the feature manifest.");
assert.ok(editorIndex > adapterIndex, "Assembly editor/controller must load after the driver adapter.");
assert.ok(rendererIndex > editorIndex, "Assembly renderer must load after the editor/controller.");
assert.ok(nextFeatureIndex > rendererIndex, "Assembly ownership modules must finish before unrelated workspace features.");

console.log("Final assembly ownership and UI/renderer boundary regression passed.");
