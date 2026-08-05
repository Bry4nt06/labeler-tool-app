"use strict";

const assert = require("node:assert/strict");
const driver = require("../drivers/servo/rest-correction-grammar-driver.js");

// Reproduces the original LandShark/body-and-back failure: three consecutive
// Rest rows, including a coding-release row downgraded from CMD 7 to CMD 3.
const downgradedReleaseRows = [
  { hmi: 21, plc: 20, cmd: 7, tableAngle: 210, plateAngle: 0, action: "Final Back Wipe Turn" },
  { hmi: 22, plc: 21, cmd: 3, tableAngle: 220, plateAngle: 151.5, action: "Wipe Hold Back - Agg 6", wipeReference: true },
  { hmi: 23, plc: 22, cmd: 3, tableAngle: 230, plateAngle: 151.5, action: "Hold Back Code Box Centerline at Coder", codingHold: true },
  { hmi: 24, plc: 23, cmd: 3, tableAngle: 240, plateAngle: 0, action: "Return Bottle to End Curve Reference After Coding", codingRelease: true },
  { hmi: 25, plc: 24, cmd: 3, tableAngle: 359, plateAngle: 0, action: "End Curve - Rest", terminalRest: true }
];

const restoredRelease = driver.reconcile(downgradedReleaseRows, { shouldRepair: () => false });
assert.deepEqual(restoredRelease.rows.map((row) => row.cmd), [7, 3, 7, 3]);
assert.equal(restoredRelease.rows.length, 4);
assert.equal(restoredRelease.rows[1].codingHold, true);
assert.equal(restoredRelease.rows[1].wipeReference, true);
assert.equal(restoredRelease.rows[2].codingRelease, true);
assert.equal(restoredRelease.rows[2].plateAngle, 151.5);
assert.equal(restoredRelease.rows.some((row, index) => Number(row.cmd) === 3 && Number(restoredRelease.rows[index + 1]?.cmd) === 3), false);

// Reproduces the currently observed output: two consecutive Rest commands at
// the same 208-degree bottle-plate reference even when no release marker is
// available to anchor the cleanup.
const equivalentRestRows = [
  { hmi: 21, plc: 20, cmd: 7, tableAngle: 210, plateAngle: 150, action: "Final Back Wipe Turn" },
  { hmi: 22, plc: 21, cmd: 3, tableAngle: 220, plateAngle: 208, action: "Wipe Hold Back", wipeReference: true },
  { hmi: 23, plc: 22, cmd: 3, tableAngle: 230, plateAngle: 208, action: "Hold Back Code Box Centerline at Coder", codingHold: true },
  { hmi: 24, plc: 23, cmd: 7, tableAngle: 240, plateAngle: 208, action: "Move to End Reference" },
  { hmi: 25, plc: 24, cmd: 3, tableAngle: 359, plateAngle: 0, action: "End Curve - Rest", terminalRest: true }
];

const collapsedEquivalent = driver.reconcile(equivalentRestRows, { shouldRepair: () => false });
assert.deepEqual(collapsedEquivalent.rows.map((row) => row.cmd), [7, 3, 7, 3]);
assert.equal(collapsedEquivalent.rows.length, 4);
assert.equal(collapsedEquivalent.rows[1].plateAngle, 208);
assert.equal(collapsedEquivalent.rows[1].codingHold, true);
assert.equal(collapsedEquivalent.rows[1].wipeReference, true);
assert.equal(collapsedEquivalent.rows[1].tableAngle, 220, "The earlier Rest must remain the physical stop point.");
assert.equal(collapsedEquivalent.rows[2].tableAngle, 240, "The following movement timing must remain unchanged.");
assert.equal(collapsedEquivalent.rows.some((row, index) => Number(row.cmd) === 3 && Number(collapsedEquivalent.rows[index + 1]?.cmd) === 3), false);
assert.equal(collapsedEquivalent.repairs.some((repair) => repair.strategy === "merge-equivalent-coding-rests"), true);

console.log("LandShark Rest-block regressions passed.");
