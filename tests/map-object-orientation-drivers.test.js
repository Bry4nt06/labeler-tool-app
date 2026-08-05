"use strict";

const assert = require("node:assert/strict");
const orientation = require("../drivers/profile/map-object-orientation-driver.js");
global.LabelerMapObjectOrientationDriver = orientation;
const handoff = require("../drivers/profile/coder-handoff-driver.js");

assert.equal(orientation.resolveSection({
  item: { kind: "sensor", station: 4, orientationLabelSection: "auto" },
  activeApplications: { neck: false, body: true, back: true },
  stationSections: { "4": "body" }
}), "body");
assert.equal(orientation.resolveSection({
  item: { kind: "coding", orientationLabelSection: "auto" },
  activeApplications: { neck: false, body: true, back: true }
}), "back");

const rows = [
  { cmd: 7, tableAngle: 200, plateAngle: 150, action: "Wipe Turn 2 Back", section: "back", station: 6, stage: "wipe" },
  { cmd: 3, tableAngle: 220, plateAngle: 208, action: "Wipe Hold Back", section: "back", station: 6, stage: "complete", wipeReference: true },
  { cmd: 3, tableAngle: 300, plateAngle: 208, action: "End Curve - Rest", terminalRest: true }
];

assert.deepEqual(orientation.objectWindow({
  item: { kind: "coding", start: 230, end: 250 },
  rows
}), { start: 230, end: 250 });
assert.equal(orientation.isPhysicalContactTransition(rows[0]), true);
assert.equal(orientation.samePhysicalMotion(rows[0], rows[1]), true);

const target = orientation.orientationTarget({
  item: { kind: "coding", orientationTarget: "code-box" },
  section: "back",
  currentPlate: 150,
  applicationTarget: 180,
  labelWidthDeg: 100,
  labelCenter: 230,
  coderCenterlineTarget: 208,
  codeBoxOffsetDeg: 20,
  inspectionOffsetDeg: 0
});
assert.equal(target.target, 208);
assert.equal(target.mode, "code-box");

// The 45H three-label back-sensor case can calculate a target that differs
// internally but rounds to the same 0.1-degree command value. That is already
// satisfied and must not create a zero-effective CMD 7 / CMD 3 pair.
assert.equal(orientation.commandAngle(234.54), 234.5);
assert.equal(orientation.sameCommandAngle(234.54, 234.5), true);
assert.equal(orientation.sameCommandAngle(234.56, 234.5), false);
const satisfiedSensorTarget = orientation.orientationTarget({
  item: { kind: "sensor", requiredVisibilityPercent: 50 },
  section: "back",
  currentPlate: 234.5,
  applicationTarget: 180,
  labelWidthDeg: 120,
  labelCenter: 230,
  sensorTarget: 234.54,
  sensorVisibilityPercent: 50
});
assert.equal(satisfiedSensorTarget.target, 234.5);
assert.equal(satisfiedSensorTarget.satisfiedAtCommandResolution, true);
const realSensorTarget = orientation.orientationTarget({
  item: { kind: "sensor", requiredVisibilityPercent: 50 },
  section: "back",
  currentPlate: 234.5,
  applicationTarget: 180,
  labelWidthDeg: 120,
  labelCenter: 230,
  sensorTarget: 234.56,
  sensorVisibilityPercent: 50
});
assert.equal(realSensorTarget.target, 234.56);
assert.equal(realSensorTarget.satisfiedAtCommandResolution, false);

const located = handoff.locateFinalWipe(rows, 230);
assert.deepEqual(located, { turnIndex: 0, holdIndex: 1 });
const timing = handoff.timing({
  holdTable: 220,
  window: { start: 230, end: 250 },
  rotation: 58,
  maxRatio: 21
});
assert.equal(timing.turnStart, 220.5);
assert.equal(timing.available, true);
assert.equal(timing.withinWindow, true);
assert.equal(handoff.interference(rows, {
  holdIndex: 1,
  holdTable: 220,
  readyTable: timing.readyTable
}), null);

const continuationRows = [
  { cmd: 3, tableAngle: 230, plateAngle: 208 },
  { cmd: 7, tableAngle: 250, plateAngle: 0 },
  { cmd: 3, tableAngle: 359, plateAngle: 0, terminalRest: true }
];
const continuation = handoff.continuationPlan({
  rows: continuationRows,
  followingIndex: 1,
  targetPlate: 208,
  window: { start: 230, end: 250 }
});
assert.equal(continuation.kind, "retarget");
assert.equal(continuation.row.plateAngle, 208);
assert.equal(continuation.row.plannedRotation, -208);
assert.ok(Math.abs(continuation.row.plannedRatio - (208 / 109)) < 1e-9);

console.log("Map-object orientation and coder-handoff driver regressions passed.");
