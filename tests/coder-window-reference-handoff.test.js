"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(
  path.join(root, "app", "coder-window-reference-handoff-integration.js"),
  "utf8"
);
const startup = fs.readFileSync(path.join(root, "app.js"), "utf8");

assert.doesNotThrow(() => new vm.Script(source));
assert.match(source, /function supersedableCodingReference/);
assert.match(source, /function removeSupersededCodingReferences/);
assert.match(source, /function ensureExplicitCodingHolds/);
assert.match(source, /explicitCodingWindowHold:\s*true/);
assert.match(source, /codingHold:\s*true/);
assert.match(source, /terminalRest:\s*true/);
assert.match(startup, /coder-window-reference-handoff-v21/);
assert.match(
  startup,
  /orientation-constraint-program-planner\.js[\s\S]*coder-window-reference-handoff-integration\.js[\s\S]*orientation-constraint-planner-integration\.js/,
  "The coder handoff wrapper must install before the planner pipeline captures its process function."
);

const map = {
  applicationMode: "apl",
  machineType: "TopModul",
  objects: [{
    id: "default-back-coding",
    name: "Back Label Coding",
    kind: "coding",
    start: 312.2,
    end: 317.2,
    orientBottle: true,
    orientationLabelSection: "back"
  }]
};
const capturedInputs = [];
const state = { motionPlan: {} };
const basePlanner = {
  process(rows) {
    capturedInputs.push(rows.map((row) => ({ ...row })));
    state.motionPlan.orientationConstraintPlans = [{
      objectId: "default-back-coding",
      kind: "coding",
      name: "Back Label Coding",
      section: "back",
      targetPlateAngle: 162.5,
      windowStart: map.objects[0].start,
      windowStop: map.objects[0].end,
      satisfiedByExistingMotion: true
    }];
    state.motionPlan.rows = rows;
    return rows;
  }
};
const context = {
  console,
  state,
  LabelerOrientationConstraintProgramPlanner: basePlanner,
  LabelerOrientationConstraintTargetService: {
    activeMap: () => map,
    windowFor: (item) => ({ start: item.start, end: item.end })
  }
};
context.window = context;
context.globalThis = context;
vm.runInNewContext(source, context);

assert.equal(context.LabelerCoderWindowReferenceHandoff.installed, true);
assert.equal(context.LabelerOrientationConstraintProgramPlanner.coderWindowReferenceHandoffV1, true);

const movedCoderRows = [
  { hmi: 24, plc: 23, cmd: 3, tableAngle: 299, plateAngle: 162.5, action: "Hold Back Label Through Back Sensor" },
  { hmi: 25, plc: 24, cmd: 3, tableAngle: 315, plateAngle: 325, action: "End Curve - Rest" },
  { hmi: 26, plc: 25, cmd: 3, tableAngle: 359, plateAngle: 375, action: "End Curve - Rest", terminalRest: true }
];
const movedOutput = context.LabelerOrientationConstraintProgramPlanner.process(movedCoderRows);
assert.equal(
  capturedInputs[0].some((row) => Number(row.tableAngle) === 315),
  false,
  "A generic 315° end-curve reference inside the moved 312.2°–317.2° coder window must be absorbed."
);
assert.equal(
  capturedInputs[0].some((row) => Number(row.tableAngle) === 359),
  true,
  "A terminal reference outside the coder window must remain available to downstream policy."
);
const movedHold = movedOutput.find((row) => row.codingHold === true);
assert.ok(movedHold, "The moved coder must receive an explicit hold row.");
assert.equal(movedHold.tableAngle, 312.2);
assert.equal(movedHold.plateAngle, 162.5);
assert.equal(movedHold.cmd, 3);
assert.equal(movedHold.terminalRest, true);
assert.equal(movedHold.codingObjectId, "default-back-coding");
assert.match(movedHold.action, /Hold Back Code Box Through Back Label Coding/);

map.objects[0].start = 309;
map.objects[0].end = 314;
const satisfiedOutput = context.LabelerOrientationConstraintProgramPlanner.process([
  { hmi: 24, plc: 23, cmd: 3, tableAngle: 299, plateAngle: 162.5, action: "Back Sensor Hold" },
  { hmi: 25, plc: 24, cmd: 3, tableAngle: 315, plateAngle: 162.5, action: "End Curve - Rest" }
]);
const satisfiedHold = satisfiedOutput.find((row) => row.codingHold === true);
assert.ok(satisfiedHold, "A coder already satisfied by the previous move still needs an explicit coding hold.");
assert.equal(satisfiedHold.tableAngle, 309);
assert.equal(satisfiedHold.plateAngle, 162.5);
assert.equal(satisfiedHold.satisfiedByExistingMotion, true);

map.objects[0].start = 312.2;
map.objects[0].end = 317.2;
const protectedResult = context.LabelerCoderWindowReferenceHandoff.removeSupersededCodingReferences([
  { cmd: 7, tableAngle: 315, plateAngle: 10, action: "Orient for a real servo event" },
  { cmd: 3, tableAngle: 316, plateAngle: 10, action: "Sensor Hold", sensorId: "back-sensor" }
], map);
assert.equal(protectedResult.rows.length, 2, "Real correction and sensor rows must continue to block the coder window.");
assert.equal(protectedResult.removed.length, 0);

console.log("Coder window reference handoff regression passed.");
