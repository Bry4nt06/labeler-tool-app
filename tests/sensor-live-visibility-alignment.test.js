"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app", "orientation-constraint-planner-integration.js"), "utf8");

assert.doesNotThrow(() => new vm.Script(source));
assert.match(source, /function sharedSensorStatus/);
assert.match(source, /global\.labelSensorMapStatus\s*=\s*sharedSensorStatus/);

const sensor = {
  id: "body-sensor",
  kind: "sensor",
  station: 4,
  angle: 218.4,
  start: 218.4,
  requiredVisibilityPercent: 53,
  orientationLabelSection: "body"
};
const map = { applicationMode: "apl", objects: [sensor] };

const context = {
  console,
  document: {
    readyState: "complete",
    querySelectorAll() { return []; },
    documentElement: {}
  },
  MutationObserver: function MutationObserver() {
    this.observe = () => {};
  },
  state: {
    program: [
      { cmd: 7, tableAngle: 209.5, plateAngle: 124 },
      { cmd: 3, tableAngle: 217, plateAngle: 104 },
      { cmd: 7, tableAngle: 220.5, plateAngle: 104 }
    ],
    motionPlan: {
      orientationConstraintPlans: [{
        objectId: "body-sensor",
        section: "body",
        autoTargetSource: "last-applied-label"
      }]
    }
  },
  labelSensorMapStatus() {
    return { passes: false, percent: 6.5, required: 53, section: "body" };
  },
  generatedServoProfile() { return []; },
  applyGeneratedServoProfile() {},
  render() {},
  renderValidation() {},
  validate() { return []; },
  labelSectionForStation() { return "body"; },
  setTimeout() {},
  LabelerDriverRegistry: {
    resolve(id) {
      if (id === "profile.orientationConstraintPlanner") {
        return {
          chooseSharedTarget() {},
          resolveSection() { return { section: "body", source: "station-pair" }; }
        };
      }
      if (id === "profile.pipeline") {
        return {
          registerStage() {},
          getStage() { return {}; }
        };
      }
      return null;
    }
  },
  LabelerOrientationConstraintProgramPlanner: {
    process(rows) { return rows; }
  },
  LabelerOrientationConstraintTargetService: {
    num(value, fallback) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    },
    activeMap() { return map; },
    applications() { return { neck: false, body: true, back: true }; },
    stationSections() { return { "4": "body" }; },
    plateAt() { return 104; },
    targetFor() {
      return { target: 104, center: 61.7, width: 122.6, required: 53 };
    },
    visibilityAt() { return 53; },
    done(value) { return Math.round(Number(value) * 10) / 10; },
    sectionName(value) { return value; }
  }
};
context.window = context;
context.globalThis = context;

vm.runInNewContext(source, context);

const status = context.labelSensorMapStatus(sensor);
assert.equal(status.percent, 53, "The Map Builder status must use the same visibility calculation as the orientation planner.");
assert.equal(status.required, 53);
assert.equal(status.passes, true);
assert.equal(status.section, "body");
assert.equal(status.targetPlateAngle, 104);
assert.equal(status.actualPlateAngle, 104);
assert.equal(
  context.LabelerOrientationConstraintPlannerDiagnostics.sensorStatus(sensor).percent,
  53,
  "The shared diagnostic API must report the planner-aligned visibility rather than the stale legacy value."
);

console.log("Sensor live visibility alignment regression passed.");
