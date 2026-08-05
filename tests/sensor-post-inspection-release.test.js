"use strict";

const assert = require("node:assert/strict");

const driver = require("../drivers/profile/sensor-post-inspection-release-driver.js");

const sourceRows = [
  {
    cmd: 3,
    tableAngle: 209,
    plateAngle: 131.5,
    section: "body",
    station: 4,
    action: "Hold for Body Application - Agg 4"
  },
  {
    cmd: 7,
    tableAngle: 229,
    plateAngle: -63.5,
    section: "back",
    station: 5,
    action: "Wipe Turn 1 Back - Agg 5",
    wipeMotion: true
  },
  {
    cmd: 3,
    tableAngle: 240,
    plateAngle: 73.5,
    section: "back",
    station: 5,
    action: "Wipe Turn 1 Back Complete - Agg 5",
    stage: "complete"
  }
];

const delayedPlannerRows = [
  {
    cmd: 7,
    tableAngle: 216.5,
    plateAngle: 131.5,
    section: "body",
    station: 4,
    action: "Orient Body Label for Body Sensor",
    sensorId: "body-sensor",
    sensorIds: ["body-sensor"],
    orientationObjectId: "body-sensor",
    orientationObjectIds: ["body-sensor"],
    mapObjectOrientation: true,
    orientationConstraintPlanner: true
  },
  {
    cmd: 3,
    tableAngle: 218.5,
    plateAngle: -24,
    section: "body",
    station: 4,
    action: "Hold Body Orientation Through Body Sensor",
    sensorId: "body-sensor",
    sensorIds: ["body-sensor"],
    orientationObjectId: "body-sensor",
    orientationObjectIds: ["body-sensor"],
    mapObjectOrientation: true,
    orientationConstraintPlanner: true,
    orientationHold: true,
    inspectionWindowStart: 218.5,
    inspectionWindowStop: 221.5
  },
  {
    cmd: 7,
    tableAngle: 229,
    plateAngle: -24,
    section: "body",
    station: 4,
    action: "Wipe Turn 1 Back - Agg 5",
    wipeMotion: true,
    sensorId: "body-sensor",
    sensorIds: ["body-sensor"],
    orientationObjectId: "body-sensor",
    orientationObjectIds: ["body-sensor"],
    mapObjectOrientation: true,
    orientationConstraintPlanner: true,
    orientationConstraintContinuation: true,
    plannedRotation: 97.5,
    plannedRatio: 8.86
  },
  sourceRows[2]
];

const result = driver.apply({
  sourceRows,
  outputRows: delayedPlannerRows,
  maxMoveRatio: 21,
  formatter: (value) => Math.round(Number(value) * 10) / 10
});

assert.equal(result.releases.length, 1, "the body sensor must create one release move");

const release = result.rows.find((row) => row.postInspectionRelease);
assert.ok(release, "a release correction must be inserted after the sensor pass point");
assert.equal(release.sensorInspectionTableAngle, 220, "the inspection point must be the center of the sensor window");
assert.equal(release.tableAngle, 220.5, "setup must begin immediately after the 220° sensor pass plus the 0.5° command gap");
assert.equal(release.plateAngle, -24, "the release correction must start from the verified sensor orientation");
assert.equal(release.releaseDestinationTableAngle, 229);
assert.equal(release.releaseDestinationPlateAngle, -63.5);
assert.match(release.action, /Begin Next Setup After Body Sensor/);

const nextAggregate = result.rows.find((row) => row.action === "Wipe Turn 1 Back - Agg 5");
assert.ok(nextAggregate, "the next aggregate command must remain present");
assert.equal(nextAggregate.plateAngle, -63.5, "the next aggregate must regain its original setup orientation");
assert.equal(nextAggregate.section, "back", "the next aggregate must not inherit the body sensor section");
assert.equal(nextAggregate.station, 5, "the next aggregate must not inherit the body sensor station");
assert.equal(nextAggregate.orientationConstraintContinuation, undefined, "the next aggregate must no longer be marked as the sensor continuation");
assert.equal(nextAggregate.sensorId, undefined, "sensor metadata must be removed from the restored aggregate command");

const holdIndex = result.rows.findIndex((row) => row.orientationHold);
const releaseIndex = result.rows.findIndex((row) => row.postInspectionRelease);
const aggregateIndex = result.rows.findIndex((row) => row.action === "Wipe Turn 1 Back - Agg 5");
assert.ok(holdIndex < releaseIndex && releaseIndex < aggregateIndex, "the release move must occur between sensor verification and the next aggregate");

const noChange = driver.apply({
  sourceRows: [{ cmd: 7, tableAngle: 229, plateAngle: -24, action: "Next setup" }],
  outputRows: [
    {
      cmd: 3,
      tableAngle: 218.5,
      plateAngle: -24,
      action: "Hold Body Orientation Through Body Sensor",
      orientationHold: true,
      inspectionWindowStop: 221.5,
      sensorId: "body-sensor",
      orientationObjectId: "body-sensor"
    },
    {
      cmd: 7,
      tableAngle: 229,
      plateAngle: -24,
      action: "Next setup",
      orientationConstraintContinuation: true,
      sensorId: "body-sensor",
      orientationObjectId: "body-sensor"
    }
  ]
});
assert.equal(noChange.releases.length, 0, "no extra correction is needed when the next setup already uses the sensor orientation");

console.log("Post-inspection sensor release regression passed.");
