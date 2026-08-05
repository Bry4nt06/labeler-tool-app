"use strict";

const assert = require("node:assert/strict");
const rows = require("../drivers/profile/map-object-row-builder-driver.js");
const issues = require("../drivers/profile/orientation-issue-factory-driver.js");

const formatter = (value) => Math.round(Number(value) * 10) / 10;
const item = { id: "coder-1", kind: "coding", station: 6 };
const metadata = rows.metadata({
  item,
  section: "back",
  extras: { coderAfterWipeHandoff: true }
});
assert.equal(metadata.codingObjectId, "coder-1");
assert.equal(metadata.orientationObjectId, "coder-1");
assert.equal(metadata.coderAfterWipeHandoff, true);

const turn = rows.turn({
  tableAngle: 220.54,
  plateAngle: 208.04,
  action: "Orient Back Code Box",
  metadata,
  rotation: 42,
  ratio: 2.1,
  formatter
});
assert.deepEqual(
  { cmd: turn.cmd, table: turn.tableAngle, plate: turn.plateAngle, rotation: turn.plannedRotation, ratio: turn.plannedRatio },
  { cmd: 7, table: 220.5, plate: 208, rotation: 42, ratio: 2.1 }
);

const hold = rows.hold({
  tableAngle: 230,
  plateAngle: 250,
  action: "Hold Back Code Box Through Coder",
  metadata,
  window: { start: 230, end: 235 },
  formatter,
  extras: { codingReadyTableAngle: 230 }
});
assert.equal(hold.cmd, 3);
assert.equal(hold.orientationHold, true);
assert.equal(hold.inspectionWindowStart, 230);
assert.equal(hold.inspectionWindowStop, 235);

const continuation = rows.continuation({
  tableAngle: 235.5,
  plateAngle: 250,
  action: "Continue After Coder",
  metadata,
  rotation: -42,
  ratio: 1.75,
  formatter,
  marker: "coderAfterWipeContinuation"
});
assert.equal(continuation.cmd, 7);
assert.equal(continuation.coderAfterWipeContinuation, true);

const plan = rows.coderHandoffPlan({
  item,
  label: "Coder",
  section: "back",
  target: { target: 250, mode: "code-box" },
  window: { start: 230, end: 235 },
  holdTable: 220,
  readyTable: 230,
  rotation: 42,
  formatter
});
assert.equal(plan.rowBuilderDriver, "profile.mapObjectRowBuilder");
assert.equal(plan.handoffDriver, "profile.coderHandoff");

const overlap = issues.physicalWipeOverlap({
  item,
  section: "back",
  label: "Coder",
  action: "Wipe Turn 2 Back"
});
assert.equal(overlap.code, "map-object-overlaps-physical-wipe");
assert.match(overlap.message, /Wipe Turn 2 Back/);
assert.equal(overlap.issueFactoryDriver, "profile.orientationIssueFactory");

const capacity = issues.orientationCapacity({
  item,
  section: "back",
  label: "Coder",
  rotation: 42,
  span: 10,
  ratio: 4.2,
  limit: 21
});
assert.equal(capacity.message, "Coder requires 42.0° bottle rotation in 10.0° table travel (4.20:1; limit 21.0:1).");

const handoff = issues.coderHandoffCapacity({
  baseIssue: { level: "bad", recommendation: "Move the coder." },
  item,
  section: "back",
  label: "Coder",
  action: "Wipe Turn 2 Back",
  holdTable: 220,
  rotation: 42,
  windowEnd: 235
});
assert.equal(handoff.code, "coder-handoff-capacity");
assert.equal(handoff.recommendation, "Move the coder.");
assert.match(handoff.message, /42\.0°/);

console.log("Map-object row builder and issue factory regressions passed.");
