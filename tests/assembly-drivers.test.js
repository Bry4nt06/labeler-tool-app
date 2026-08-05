"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const modelSource = fs.readFileSync(path.join(root, "drivers", "assembly", "assembly-model-driver.js"), "utf8");
const geometrySource = fs.readFileSync(path.join(root, "drivers", "assembly", "assembly-geometry-driver.js"), "utf8");
const adapterSource = fs.readFileSync(path.join(root, "app", "assembly-driver-adapter.js"), "utf8");
const manifestSource = fs.readFileSync(path.join(root, "app", "simulation-collapsible-integration.js"), "utf8");
const compatibilitySource = fs.readFileSync(path.join(root, "app", "assemblies.js"), "utf8");
const editorSource = fs.readFileSync(path.join(root, "app", "assembly-editor-controller.js"), "utf8");

const defaultAssemblies = [{
  station: 1,
  enabled: true,
  type: "rollers",
  sides: ["inner", "outer"],
  spenderAngle: 68.5,
  innerRollerAngles: [89.5, 95],
  outerRollerAngles: [72, 77.5],
  padSpanDeg: 20,
  padSideOffsetDeg: 3,
  brushStartAngle: 72,
  brushEndAngle: 95,
  requiredPlateRotation: 360
}, {
  station: 2,
  enabled: true,
  type: "pads",
  sides: ["outer"],
  spenderAngle: 108.5,
  innerRollerAngles: [129.5, 135],
  outerRollerAngles: [112, 117.5],
  padSpanDeg: 20,
  padSideOffsetDeg: 3,
  brushStartAngle: 112,
  brushEndAngle: 135,
  requiredPlateRotation: 180
}];

const state = {
  tablePitchRadiusMm: 572.958,
  padClearanceMm: 5,
  maxMoveRatio: 21,
  applicationMode: "apl",
  assemblies: [{ ...defaultAssemblies[0] }],
  mapPoints: [
    { name: "Agg 1 Spender Plate Position", angle: 0 },
    { name: "Agg 1 Roller 1", angle: 0 },
    { name: "Agg 1 Roller 2", angle: 0 },
    { name: "Agg 1 Roller 3", angle: 0 },
    { name: "Agg 1 Roller 4", angle: 0 }
  ]
};

const registry = new Map();
const sandbox = {
  window: {},
  state,
  defaultAssemblies,
  num(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  },
  fmt(value, digits = 1) { return Number(value).toFixed(digits); },
  mapPointAngle(pattern, fallback = 0) {
    return state.mapPoints.find((point) => pattern.test(point.name))?.angle ?? fallback;
  },
  profileTiming: { wipe1Duration: 2.5 },
  LabelerDriverRegistry: {
    register(name, api, metadata) { registry.set(name, { api, metadata }); }
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(modelSource, sandbox);
vm.runInContext(geometrySource, sandbox);

const model = sandbox.LabelerAssemblyModelDriver;
const geometry = sandbox.LabelerAssemblyGeometryDriver;
const number = sandbox.num;
const normalized = model.normalizeAssembly({
  station: 1,
  enabled: true,
  type: "inner-pads",
  requiredPlateRotation: 180
}, { defaults: defaultAssemblies, number });
assert.strictEqual(normalized.type, "pads");
assert.deepStrictEqual(Array.from(normalized.sides), ["inner"]);
assert.deepStrictEqual(Array.from(normalized.outerRollerAngles), [72, 77.5]);
assert.deepStrictEqual(Array.from(normalized.innerRollerAngles), [89.5, 95]);

const geometryContext = { tablePitchRadiusMm: 572.958, padClearanceMm: 5, number };
const padAssembly = model.normalizeAssembly({
  station: 2,
  enabled: true,
  type: "pads",
  sides: ["outer", "inner"],
  spenderAngle: 108.5,
  padSpanDeg: 20,
  padSideOffsetDeg: 3,
  requiredPlateRotation: 180
}, { defaults: defaultAssemblies, number });
const outer = geometry.padAnglesForSide(padAssembly, "outer", geometryContext);
const inner = geometry.padAnglesForSide(padAssembly, "inner", geometryContext);
assert.ok(Math.abs((inner[0] - outer[0]) - 3) < 1e-9);
assert.ok(Math.abs(geometry.assemblySpan(padAssembly, geometryContext) - 23) < 1e-9);
assert.strictEqual(geometry.status(padAssembly, {
  ...geometryContext,
  maxMoveRatio: 21,
  format: (value, digits) => Number(value).toFixed(digits)
}).level, "ok");

vm.runInContext(adapterSource, sandbox);

assert.ok(registry.has("assembly.model"));
assert.ok(registry.has("assembly.geometry"));
assert.deepStrictEqual(Array.from(registry.get("assembly.geometry").metadata.dependencies), ["assembly.model"]);
assert.strictEqual(sandbox.normalizeAssembly({ station: 1, enabled: true, type: "inner-pads" }).type, "pads");
assert.strictEqual(sandbox.mapPointStation("Agg 4 Wipe Start"), 4);
sandbox.syncMapPointsFromAssemblies();
assert.strictEqual(state.mapPoints[0].angle, 68.5);
assert.deepStrictEqual(state.mapPoints.slice(1).map((point) => point.angle), [72, 77.5, 89.5, 95]);

const modelIndex = manifestSource.indexOf("drivers/assembly/assembly-model-driver.js");
const geometryIndex = manifestSource.indexOf("drivers/assembly/assembly-geometry-driver.js");
const adapterIndex = manifestSource.indexOf("app/assembly-driver-adapter.js");
assert.ok(modelIndex >= 0 && geometryIndex > modelIndex && adapterIndex > geometryIndex, "Assembly drivers and adapter must load in dependency order.");
assert.match(adapterSource, /install\("normalizeAssembly", normalize\)/, "The adapter must install the model owner.");
assert.match(adapterSource, /install\("assemblyStatus"/, "The adapter must install the status owner.");
assert.doesNotMatch(compatibilitySource, /function normalizeAssembly\(/, "The model fallback must be physically removed.");
assert.doesNotMatch(compatibilitySource, /function assemblyStatus\(/, "The geometry/status fallback must be physically removed.");
assert.match(compatibilitySource, /assembly-model-and-geometry-owned-by-drivers/, "The compatibility marker must identify the authoritative owners.");
assert.match(editorSource, /function renderAssemblyEditor\(/, "The extracted editor/controller must own assembly editing.");

console.log("Final assembly driver ownership and behavior regression passed.");
