"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const files = [
  "geometry-primitives.js",
  "label-specification-service.js",
  "label-station-planning-service.js",
  "label-sensor-geometry-service.js",
  "wipe-analysis-service.js",
  "program-summary-service.js",
  "cold-glue-map-service.js"
];

const sandbox = {
  console,
  Math,
  Number,
  String,
  Boolean,
  Array,
  Object,
  Map,
  Set,
  RegExp,
  state: {
    direction: "cw",
    zeroAngle: 0,
    applicationMode: "apl",
    selectedBottle: "Bottle A",
    selectedBrand: "Brand A",
    bottleSpecs: [{ bottleType: "Bottle A", diameterMm: 70 }],
    labelSpecs: [{ brand: "Brand A", bottleType: "Bottle A", applicationMode: "APL", neckLengthMm: 20, neckBottomCurveMm: 0, neckBottomCircumferenceMm: 100, bodyLengthMm: 120, backLengthMm: 80, codeBoxCenterMm: 10 }],
    assemblies: [
      { station: 1, enabled: true, type: "rollers", sides: ["outer", "inner"], labelSection: "neck" },
      { station: 3, enabled: true, type: "pads", sides: ["outer", "inner"], labelSection: "body" },
      { station: 5, enabled: true, type: "pads", sides: ["outer", "inner"], labelSection: "back" }
    ],
    buildInputs: {
      neckContactMm: 5,
      bodyContactMm: 5,
      backContactMm: 5,
      neckOverWipeDeg: 10,
      bodyOverWipeDeg: 10,
      backOverWipeDeg: 10,
      neckApplication: "Center",
      plateStartPositionDeg: 0,
      neckSpenderPlateDeg: 90,
      backInspectionOffsetMm: 0
    },
    program: [],
    coldGlueMap: [],
    mapPoints: [],
    headCount: 45,
    autoScaleTableMap: true,
    referencePitchRadiusMm: 100,
    tablePitchRadiusMm: 80,
    encoderCountsPerRev: 4096,
    servoGearRatio: 2
  },
  num(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  },
  normalizeAssembly(value) {
    return { sides: [], enabled: false, type: "none", ...value };
  },
  assemblyAngles(assembly, side) {
    const ranges = {
      1: { outer: [10, 20], inner: [30, 40] },
      3: { outer: [100, 110], inner: [120, 130] },
      5: { outer: [200, 210], inner: [220, 230] }
    };
    if (side) return ranges[assembly.station]?.[side] || [];
    return Object.values(ranges[assembly.station] || {}).flat();
  },
  activeMachineMap() { return { stationSections: { "1": "neck", "3": "body", "5": "back" } }; },
  inferAplStationSections(map) { return map.stationSections; },
  programSegments(program) { return program; },
  applicationMapPointRows() { return []; },
  LabelerAplProfileDriver: { stationWindows: { 1: { waypointStart: 1, waypointEnd: 2, moveStart: 1, moveEnd: 2 } } },
  LabelerGeometryDriver: {
    effectiveDiameterMm(spec) { return Number(spec?.diameterMm) || null; },
    bodyCircumferenceMm(spec) { return Number(spec?.diameterMm) * Math.PI; },
    solveSection(input) {
      const labelDeg = 360 * input.labelLengthMm / input.circumferenceMm;
      if (input.mode === "center-tack-two-stage") {
        return {
          totalRequired: labelDeg + input.overWipeDeg,
          stages: [
            { key: "outer", requiredRotation: labelDeg / 2 },
            { key: "inner", requiredRotation: labelDeg / 2 + input.overWipeDeg }
          ]
        };
      }
      return { totalRequired: labelDeg + input.overWipeDeg, stages: [] };
    }
  }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const file of files) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../app", file), "utf8"), sandbox, { filename: file });
}

assert.equal(sandbox.norm(-10), 350);
const cwPoint = sandbox.angleToXY(0, 10);
assert.ok(Math.abs(cwPoint.x + 10) < 1e-9);
assert.ok(Math.abs(cwPoint.y) < 1e-9);
assert.equal(sandbox.angleToSvgRotation(90), 90);

sandbox.state.direction = "ccw";
const ccwPoint = sandbox.angleToXY(0, 10);
assert.ok(Math.abs(ccwPoint.x - 10) < 1e-9);
assert.ok(Math.abs(ccwPoint.y) < 1e-9);
assert.equal(sandbox.angleToSvgRotation(90), 90);

assert.equal(sandbox.normalizeLabelApplicationMode("Cold Glue"), "cold-glue");
assert.equal(sandbox.selectedLabelSpec().brand, "Brand A");
assert.equal(sandbox.ensureSelectedBrandForApplication().brand, "Brand A");

assert.equal(sandbox.labelSensorInspectionCenter("body", 100, 40), 120);
assert.equal(sandbox.labelSensorInspectionCenter("neck", 100, 40), 100);
assert.equal(sandbox.labelSensorVisibility(100, 100, 40).percent, 100);
const sensorTarget = sandbox.nearestLabelSensorTarget(200, 100, 40, 100);
assert.equal(sensorTarget.target, 100);
assert.equal(sensorTarget.visibility.percent, 100);

assert.equal(sandbox.labelSectionForStation(3), "body");
assert.equal(sandbox.stationIsOperational(sandbox.state.assemblies[1]), true);
const inactiveRows = sandbox.inactiveMovementRows();
assert.equal(inactiveRows.size, 0);

const neckPlan = sandbox.sectionWipePlan("neck");
assert.equal(neckPlan.stages.length, 2);
const wipe = sandbox.stationWipeAnalysis(sandbox.state.assemblies[0], [
  { action: "Wipe Turn 1 Forward - Agg 1", cmd: 7, tableAngle: 10, tableTravel: 10, plateTravel: 36 },
  { action: "Wipe Turn 2 Reverse - Agg 1", cmd: 7, tableAngle: 30, tableTravel: 10, plateTravel: -46 }
]);
assert.equal(wipe.active, true);
assert.equal(wipe.contactRotation, 82);
assert.equal(wipe.outsideRotation, 0);

assert.equal(sandbox.degFromMm(50, 100), 180);
assert.equal(sandbox.buildProgramSummary().rows.length, 26);

sandbox.state.coldGlueMap = [
  { id: "a", kind: "wipe", name: "Legacy", start: 1, end: 2 },
  { id: "b", kind: "coding", name: "Ignore", start: 3, end: 4 }
];
assert.equal(sandbox.coldGlueMapObjects().length, 1);
assert.equal(sandbox.coldGlueMapObjects()[0].kind, "brush");
assert.equal(sandbox.coldGlueMapRows().length, 2);
assert.equal(sandbox.finishAngle(12.26), 12.5);

console.log("Geometry and planning services regression passed.");
