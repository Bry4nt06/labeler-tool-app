"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app", "apl-post-wipe-sensor-hold-integration.js"), "utf8");
const startup = fs.readFileSync(path.join(root, "app.js"), "utf8");

assert.doesNotThrow(() => new vm.Script(source));
assert.match(source, /motion\.apl-post-wipe-sensor-hold/);
assert.match(source, /version:\s*2/);
assert.match(source, /HOLD_TRAVEL_DEG\s*=\s*0\.5/);
assert.match(source, /isMovingWipeHold/);
assert.match(source, /maxConsecutiveCorrections/);
assert.match(source, /wipeSensorSetupHold/);
assert.match(source, /sensorSetupAfterHold/);
assert.match(startup, /apl-post-wipe-sensor-hold-v24-production/);
assert.match(startup, /apl-post-wipe-sensor-hold-integration\.js/);

const stages = new Map([
  ["orientation.map-objects", { id: "orientation.map-objects", order: 300, process: (rows) => rows }]
]);
const pipeline = {
  getStage(id) { return stages.get(id) || null; },
  registerStage(stage) { stages.set(stage.id, stage); return stage; }
};
const context = {
  console,
  state: { motionPlan: {} },
  finishAngle(value) { return Math.round(Number(value) * 10) / 10; },
  applyGeneratedServoProfile() {},
  renderProgram() {},
  renderValidation() {},
  setTimeout(callback) { callback(); },
  LabelerDriverRegistry: {
    resolve(name) { return name === "profile.pipeline" ? pipeline : null; }
  }
};
context.window = context;
context.globalThis = context;
vm.runInNewContext(source, context);

const api = context.LabelerAplPostWipeSensorHold;
assert.equal(api.installed, true);
assert.equal(api.version, 2);
assert.equal(stages.get("motion.apl-post-wipe-sensor-hold").order, 350);

const sourceRows = [
  {
    hmi: 20,
    plc: 19,
    cmd: 3,
    tableAngle: 268.5,
    plateAngle: 134.5,
    action: "Hold for Back Label Application - Agg 6",
    station: 6,
    section: "back",
    applicationReference: true
  },
  {
    hmi: 21,
    plc: 20,
    cmd: 7,
    tableAngle: 270,
    plateAngle: 134.5,
    action: "Wipe Turn 1 Back - Agg 6",
    station: 6,
    section: "back",
    stage: "set-down"
  },
  {
    hmi: 22,
    plc: 21,
    cmd: 7,
    tableAngle: 271.5,
    plateAngle: 124.5,
    action: "Wipe Turn 2 Back - Agg 6",
    station: 6,
    section: "back",
    stage: "wipe"
  },
  {
    hmi: 23,
    plc: 22,
    cmd: 7,
    tableAngle: 290,
    plateAngle: 235,
    action: "Wipe Hold Back - Agg 6",
    station: 6,
    section: "back",
    stage: "complete",
    mapObjectOrientation: true,
    orientationConstraintPlanner: true,
    orientationConstraintContinuation: true,
    orientationObjectId: "back-sensor",
    orientationObjectIds: ["back-sensor"],
    sensorId: "back-sensor",
    sensorIds: ["back-sensor"]
  },
  {
    hmi: 24,
    plc: 23,
    cmd: 3,
    tableAngle: 294.5,
    plateAngle: 225,
    action: "Hold Back Orientation Through Back Label Sensor",
    station: 6,
    section: "back",
    orientationHold: true,
    orientationObjectId: "back-sensor",
    orientationObjectIds: ["back-sensor"],
    sensorId: "back-sensor",
    sensorIds: ["back-sensor"],
    inspectionWindowStart: 294.5,
    inspectionWindowStop: 297.5
  },
  {
    hmi: 25,
    plc: 24,
    cmd: 7,
    tableAngle: 298,
    plateAngle: 225,
    action: "Orient Back Label for Back Label Coding",
    station: 6,
    section: "back"
  },
  {
    hmi: 26,
    plc: 25,
    cmd: 3,
    tableAngle: 359,
    plateAngle: 157.5,
    action: "Hold for Coding",
    terminalRest: true
  }
];

const result = api.repair(sourceRows);
assert.deepEqual(
  Array.from(result.rows, (row) => Number(row.cmd)),
  [3, 7, 7, 3, 7, 3, 7, 3],
  "The actual Landshark sequence must close the two-command wipe pair with CMD 3 before the sensor turn."
);
assert.equal(result.maxConsecutiveCorrections, 2);
assert.equal(result.changes.length, 1);
assert.equal(result.unresolved.length, 0);

const wipeHold = result.rows.find((row) => row.wipeSensorSetupHold === true);
assert.ok(wipeHold);
assert.equal(wipeHold.cmd, 3);
assert.equal(wipeHold.tableAngle, 290);
assert.equal(wipeHold.plateAngle, 235);
assert.equal(wipeHold.sensorId, undefined, "The stopped wipe reference must not retain sensor-turn metadata.");

const sensorTurn = result.rows.find((row) => row.sensorSetupAfterHold === true);
assert.ok(sensorTurn);
assert.equal(sensorTurn.cmd, 7);
assert.equal(sensorTurn.tableAngle, 290.5);
assert.equal(sensorTurn.plateAngle, 235);
assert.equal(sensorTurn.sensorId, "back-sensor");
assert.match(sensorTurn.action, /Orient Back Label for Back Label Sensor/);
assert.equal(Number(sensorTurn.plannedRotation.toFixed(1)), -10);

const originalSensorHold = result.rows.find((row) => row.orientationHold === true);
assert.ok(originalSensorHold);
assert.equal(originalSensorHold.tableAngle, 294.5);
assert.equal(originalSensorHold.sensorId, "back-sensor", "The manually configured sensor position must remain unchanged.");
assert.deepEqual(sourceRows.map((row) => row.cmd), [3, 7, 7, 7, 3, 7, 3], "The repair must not mutate the source rows.");

const tooTight = api.repair([
  sourceRows[1],
  sourceRows[2],
  { ...sourceRows[3], tableAngle: 294.4 },
  { ...sourceRows[4], tableAngle: 294.5 }
]);
assert.equal(tooTight.changes.length, 0);
assert.equal(tooTight.unresolved.length, 1);
assert.match(tooTight.unresolved[0].message, /Move the back sensor later/);

const noMatch = api.repair([
  { cmd: 3, tableAngle: 0, plateAngle: 0, action: "Zero Line" },
  { cmd: 7, tableAngle: 10, plateAngle: 0, action: "General Correction" },
  { cmd: 3, tableAngle: 20, plateAngle: 20, action: "Reference" }
]);
assert.equal(noMatch.changes.length, 0);
assert.equal(noMatch.rows.length, 3);

console.log("Production APL post-wipe sensor hold regression passed for the actual Landshark sequence.");
