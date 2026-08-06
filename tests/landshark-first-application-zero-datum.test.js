"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app", "first-application-zero-datum-integration.js"), "utf8");
const startup = fs.readFileSync(path.join(root, "app.js"), "utf8");

assert.doesNotThrow(() => new vm.Script(source));
assert.match(source, /DEFAULT_SERVO_START_DEG\s*=\s*0/);
assert.match(source, /DEFAULT_FRONT_CENTERLINE_DEG\s*=\s*0/);
assert.match(source, /function resolveApplicationDatum/);
assert.match(source, /bodyApplicationTarget/);
assert.match(source, /applicationDatumOffset/);
assert.match(startup, /first-application-zero-datum-v26/);
assert.match(
  startup,
  /orientation-constraint-target-service\.js[\s\S]*first-application-zero-datum-integration\.js[\s\S]*orientation-constraint-program-planner\.js/,
  "The zero-datum policy must install after target services exist and before the orientation planner captures them."
);

const state = {
  applicationMode: "apl",
  selectedBrand: "12oz LandShark (LN)",
  buildInputs: {
    neckSpenderPlateDeg: 75,
    neckApplication: "Center",
    plateStartPositionDeg: 15
  },
  labelSpecs: [{
    applicationMode: "apl",
    brand: "12oz LandShark (LN)",
    neckBottomCurveMm: 0,
    neckBottomCircumferenceMm: 0,
    bodyLengthMm: 64.897,
    backLengthMm: 47.498
  }],
  motionPlan: null
};

const map = {
  applicationMode: "apl",
  stationSections: {
    "1": "neck",
    "2": "neck",
    "3": "body",
    "4": "body",
    "5": "back",
    "6": "back"
  },
  objects: [
    { kind: "roller", station: 1 },
    { kind: "roller", station: 2 },
    { kind: "pad", station: 3 },
    { kind: "pad", station: 4 },
    { kind: "pad", station: 5 },
    { kind: "pad", station: 6 }
  ]
};

const inputs = new Map();
const document = {
  getElementById(id) {
    if (!inputs.has(id)) inputs.set(id, { id, value: "" });
    return inputs.get(id);
  }
};

const context = {
  console,
  document,
  state,
  setTimeout(callback) { callback(); },
  saveCurrentSettings() {},
  applyGeneratedServoProfile() {},
  render() {},
  selectedLabelApplicationState() {
    return { neck: false, body: true, back: true };
  },
  inferAplStationSections(machineMap) {
    return { ...machineMap.stationSections };
  },
  labelSectionForStation(station) {
    return station <= 2 ? "neck" : station <= 4 ? "body" : "back";
  },
  buildProgramSummary() {
    const legacyFront = -(90 - Number(state.buildInputs.neckSpenderPlateDeg))
      + Number(state.buildInputs.plateStartPositionDeg);
    return {
      rows: [
        ["Center Line Front (deg)", legacyFront, "legacy formula"],
        ["Center Line Back (deg)", legacyFront + 180, "legacy formula"]
      ]
    };
  },
  generatedAplSeedProfile() {
    const front = context.buildProgramSummary().rows.find((row) => row[0] === "Center Line Front (deg)")[1];
    const seed = Array(22).fill(null);
    seed[1] = { plateAngle: front };
    seed[11] = { plateAngle: front - 52 };
    seed[21] = { plateAngle: front + 128 };
    return seed;
  },
  generatedAplMapDrivenProfile(machineMap) {
    const seed = context.generatedAplSeedProfile();
    const start = Number(state.buildInputs.plateStartPositionDeg);
    const bodyTarget = Number(seed[11].plateAngle);
    const rows = [{
      hmi: 1,
      plc: 0,
      cmd: 3,
      tableAngle: 0,
      plateAngle: start,
      action: "Zero Line"
    }];
    if (Math.abs(bodyTarget - start) > 0.001) {
      rows.push({
        hmi: 2,
        plc: 1,
        cmd: 7,
        tableAngle: 0.5,
        plateAngle: start,
        action: "Hold for Body Application - Agg 3"
      });
    }
    rows.push({
      hmi: rows.length + 1,
      plc: rows.length,
      cmd: 3,
      tableAngle: 147.5,
      plateAngle: bodyTarget,
      action: "Hold for Body Application - Agg 3",
      station: 3,
      section: "body"
    });
    state.motionPlan = { rows };
    return rows;
  },
  renderBuildInputs() {},
  loadSavedSettings() {},
  LabelerBuildInputsController: {
    updateCalculatedField(id, value) {
      return { id, value };
    }
  },
  LabelerWorkspaceActionService: {
    execute({ mutate }) {
      mutate();
      return true;
    }
  }
};
context.window = context;
context.globalThis = context;
context.LabelerAplMapProfileGenerator = Object.freeze({
  generate: context.generatedAplMapDrivenProfile
});

vm.runInNewContext(source, context);

const api = context.LabelerFirstApplicationZeroDatum;
assert.equal(api.installed, true);
assert.equal(state.buildInputs.plateStartPositionDeg, 0, "The previous untouched 15° default must migrate to servo zero.");
assert.equal(state.buildInputs.centerLineFrontDeg, 0, "The front centerline must remain an explicit zero-degree datum.");

const summary = context.buildProgramSummary();
assert.equal(summary.rows.find((row) => row[0] === "Center Line Front (deg)")[1], 0);
assert.equal(summary.rows.find((row) => row[0] === "Center Line Back (deg)")[1], 180);

const rawSeed = context.generatedAplSeedProfile();
const datum = api.resolveApplicationDatum(map, rawSeed, state);
assert.equal(datum.firstStation, 3);
assert.equal(datum.firstSection, "body");
assert.equal(datum.rawTargets.body, -52);
assert.equal(datum.offset, -52);
assert.equal(datum.rebasedTargets.body, 0);
assert.equal(datum.rebasedTargets.back, 180);

const rows = context.generatedAplMapDrivenProfile(map);
const firstBodyReference = rows.find((row) => row.action === "Hold for Body Application - Agg 3");
assert.ok(firstBodyReference);
assert.equal(firstBodyReference.cmd, 3, "The first active Body application must be a stopped reference, not a pre-turn.");
assert.equal(firstBodyReference.tableAngle, 147.5);
assert.equal(firstBodyReference.plateAngle, 0);
assert.equal(firstBodyReference.initialApplicationDatum, true);
assert.equal(
  rows.some((row) => Number(row.cmd) === 7 && Number(row.tableAngle) < 147.5),
  false,
  "Landshark must not rotate from the Zero Line to Aggregate 3 before any label contact."
);
assert.equal(state.motionPlan.initialApplicationSection, "body");
assert.equal(state.motionPlan.initialApplicationStation, 3);
assert.equal(state.motionPlan.bodyApplicationTarget, 0);
assert.equal(state.motionPlan.backApplicationTarget, 180);

context.LabelerBuildInputsController.updateCalculatedField("programCenterLineFrontDeg", 7);
assert.equal(state.buildInputs.centerLineFrontDeg, 7);
assert.equal(state.buildInputs.plateStartPositionDeg, 0, "Editing centerline must not move the servo starting position.");
context.LabelerBuildInputsController.updateCalculatedField("programCenterLineBackDeg", 190);
assert.equal(state.buildInputs.centerLineFrontDeg, 10);
assert.equal(state.buildInputs.plateStartPositionDeg, 0);

const customState = {
  applicationMode: "apl",
  selectedBrand: "Custom",
  labelSpecs: [{ brand: "Custom", applicationMode: "apl" }],
  buildInputs: {
    neckSpenderPlateDeg: 75,
    neckApplication: "Center",
    plateStartPositionDeg: 8,
    centerLineFrontDeg: 0
  }
};
api.ensureBuildInputDefaults(customState);
assert.equal(customState.buildInputs.plateStartPositionDeg, 8, "A deliberate non-default servo start must remain editable.");

const micDatum = api.resolveApplicationDatum(
  map,
  (() => {
    const seed = Array(22).fill(null);
    seed[1] = { plateAngle: 0 };
    seed[11] = { plateAngle: -52 };
    seed[21] = { plateAngle: 128 };
    return seed;
  })(),
  {
    ...state,
    selectedBrand: "MIC",
    buildInputs: { ...state.buildInputs, plateStartPositionDeg: 0 }
  }
);
assert.equal(micDatum.firstSection, "body", "The active-section resolver remains driven by the current recipe state in this Landshark test context.");

console.log("Landshark first-application zero-datum regression passed.");
