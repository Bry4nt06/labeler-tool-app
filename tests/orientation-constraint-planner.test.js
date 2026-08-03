"use strict";

const assert = require("node:assert/strict");

const registry = new Map();
global.window = global;
global.document = {
  readyState: "complete",
  documentElement: {},
  querySelectorAll() { return []; },
  addEventListener() {}
};
global.MutationObserver = class MutationObserver { observe() {} };
global.CustomEvent = class CustomEvent {};
global.LabelerDriverRegistry = {
  register(id, api) { registry.set(id, api); },
  resolve(id) { return registry.get(id) || null; }
};

require("../drivers/profile/map-object-orientation-driver.js");
const orientation = require("../drivers/profile/orientation-constraint-planner-driver.js");
require("../drivers/profile/map-object-row-builder-driver.js");
require("../drivers/profile/orientation-issue-factory-driver.js");
require("../drivers/profile/profile-pipeline-driver.js");
global.LabelerProfilePipelineDriver.registerStage({
  id: "orientation.map-objects",
  phase: "orientation",
  order: 300,
  process: (rows) => rows
});

const applicationRows = [
  { cmd: 7, tableAngle: 10, plateAngle: 0, section: "neck", action: "Neck application" },
  { cmd: 3, tableAngle: 30, plateAngle: 80, section: "neck", action: "Neck wipe complete", stage: "complete" },
  { cmd: 7, tableAngle: 80, plateAngle: 80, section: "body", action: "Body application" },
  { cmd: 3, tableAngle: 120, plateAngle: 200, section: "body", action: "Body wipe hold", stage: "complete" },
  { cmd: 7, tableAngle: 200, plateAngle: 200, section: "back", action: "Back application" },
  { cmd: 3, tableAngle: 250, plateAngle: 320, section: "back", action: "Back wipe complete", stage: "complete" }
];
const activeApplications = { neck: true, body: true, back: true };

const automatic = orientation.resolveSection({
  item: { kind: "sensor", station: 6, orientationLabelSection: "auto" },
  rows: applicationRows,
  before: 150,
  activeApplications,
  stationSections: { 6: "back" }
});
assert.equal(automatic.section, "body");
assert.equal(automatic.source, "last-applied-label");

const manual = orientation.resolveSection({
  item: { kind: "sensor", station: 2, orientationLabelSection: "back" },
  rows: applicationRows,
  before: 150,
  activeApplications,
  stationSections: { 2: "body" }
});
assert.equal(manual.section, "back");
assert.equal(manual.source, "manual");

const wrapped = orientation.resolveSection({
  item: { kind: "coding", orientationLabelSection: "auto" },
  rows: applicationRows,
  before: 5,
  activeApplications
});
assert.equal(wrapped.section, "back");
assert.equal(wrapped.application.wrappedFromPreviousCycle, true);

const map = {
  applicationMode: "apl",
  stationSections: { 4: "body" },
  objects: [
    {
      id: "sensor-1",
      kind: "sensor",
      name: "Inspection Sensor",
      station: 4,
      angle: 306,
      orientBottle: true,
      requiredVisibilityPercent: 50,
      orientationLabelSection: "auto"
    },
    {
      id: "coder-1",
      kind: "coding",
      name: "Date Coder",
      station: 4,
      start: 304,
      end: 315,
      orientBottle: false,
      orientationLabelSection: "auto",
      orientationTarget: "code-box"
    }
  ]
};

global.state = {
  applicationMode: "apl",
  maxMoveRatio: 21,
  buildInputs: { backInspectionOffsetMm: 0 },
  motionPlan: {
    backApplicationTarget: 180,
    coderCenterlineTarget: 208.5,
    issues: [{ code: "map-object-window-overlap", message: "legacy overlap" }]
  },
  program: []
};
global.activeMachineMap = () => map;
global.selectedLabelApplicationState = () => activeApplications;
global.inferAplStationSections = () => ({ 4: "body" });
global.labelSectionForStation = () => "body";
global.generatedAplSeedProfile = () => Array.from({ length: 22 }, (_, index) => ({ plateAngle: index === 21 ? 180 : 0 }));
global.sectionWipePlan = (section) => ({ labelDeg: section === "back" ? 60 : 40 });
global.selectedLabelSpec = () => ({ codeBoxCenterMm: 10, neckBottomCircumferenceMm: 100 });
global.selectedBottleSpec = () => ({ diameterTargetMm: 60 });
global.bodyCircumference = () => 100;
global.degFromMm = () => 10;
global.labelSensorInspectionCenter = (_section, application, width) => application + width / 2;
global.nearestLabelSensorTarget = () => ({ target: 208.5, visibility: { percent: 100 } });
global.labelSensorVisibility = (_center, plate) => ({ percent: Math.abs(plate - 208.5) <= 0.2 ? 100 : 0 });
global.finishAngle = (value) => Math.round(Number(value) * 10) / 10;
global.sectionLabel = (section) => section[0].toUpperCase() + section.slice(1);
global.plateAngleAt = (table, rows) => {
  const sorted = [...rows].sort((left, right) => left.tableAngle - right.tableAngle);
  let index = -1;
  sorted.forEach((row, candidate) => { if (row.tableAngle <= table) index = candidate; });
  if (index < 0) return sorted[0]?.plateAngle || 0;
  const row = sorted[index];
  const next = sorted[index + 1];
  if (Number(row.cmd) !== 7 || !next) return row.plateAngle;
  const progress = Math.max(0, Math.min(1, (table - row.tableAngle) / (next.tableAngle - row.tableAngle)));
  return row.plateAngle + (next.plateAngle - row.plateAngle) * progress;
};
global.generatedServoProfile = () => [];
global.applyGeneratedServoProfile = () => {};
global.render = () => {};
global.renderValidation = () => {};
global.validate = () => [];
global.LabelerServoCommandDriver = { finalize: (rows) => rows };

require("../app/orientation-constraint-target-service.js");
require("../app/orientation-constraint-program-planner.js");
require("../app/orientation-constraint-planner-integration.js");

const source = [
  { cmd: 3, tableAngle: 0, plateAngle: 0, action: "Zero" },
  { cmd: 7, tableAngle: 270, plateAngle: 0, section: "back", action: "Back wipe turn", wipeMotion: true },
  { cmd: 3, tableAngle: 290, plateAngle: 100, section: "back", action: "Back wipe complete", stage: "complete", wipeReference: true },
  { cmd: 3, tableAngle: 304, plateAngle: 208.5, section: "back", action: "Hold Back Code Box Through Coder", codingHold: true },
  { cmd: 3, tableAngle: 309, plateAngle: 208.5, section: "back", action: "Return Bottle", codingRelease: true },
  { cmd: 3, tableAngle: 359, plateAngle: 360, action: "End Curve", terminalRest: true }
];

const output = global.LabelerOrientationConstraintPlannerProcessor(source);
const plans = state.motionPlan.orientationConstraintPlans;
assert.equal(plans.length, 2);
assert.ok(plans.every((plan) => plan.section === "back"));
assert.ok(plans.every((plan) => plan.autoTargetSource === "last-applied-label"));
assert.ok(plans.every((plan) => plan.mergedConstraintGroup === true));

const sharedTurn = output.find((row) => row.orientationConstraintMerged
  && Number(row.cmd) === 7
  && row.orientationObjectIds?.length === 2);
assert.ok(sharedTurn, "sensor and coder should share one orientation turn");
const sharedHold = output.find((row) => row.orientationConstraintMerged
  && Number(row.cmd) === 3
  && row.orientationObjectIds?.length === 2);
assert.ok(sharedHold, "sensor and coder should share one orientation hold");
assert.equal(sharedHold.plateAngle, 208.5);

assert.ok(!output.some((row) => row.codingRelease || row.action === "Return Bottle"));
assert.ok(output.some((row) => Number(row.cmd) === 7
  && row.orientationConstraintContinuation
  && row.tableAngle > 315));

for (let index = 0; index < output.length - 1; index += 1) {
  const row = output[index];
  const next = output[index + 1];
  if (Number(row.cmd) === 3) {
    assert.equal(row.plateAngle, next.plateAngle, `CMD 3 at ${row.tableAngle} must not change the plate`);
  }
}

console.log("Orientation constraint planner regression passed.");
