"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const pipeline = require("../drivers/profile/profile-pipeline-driver.js");

pipeline.reset();
const calls = [];

[
  {
    id: "grammar.coder-rest",
    phase: "grammar",
    order: 600,
    process(rows) {
      calls.push("grammar.coder-rest");
      return [...rows, { cmd: 3, tableAngle: 20, plateAngle: 10 }];
    }
  },
  {
    id: "orientation.physical-code-box",
    phase: "orientation",
    order: 500,
    process(rows) {
      calls.push("orientation.physical-code-box");
      return rows.map((row) => ({ ...row, physicalCodeBox: true }));
    }
  },
  {
    id: "orientation.coder-handoff",
    phase: "orientation",
    order: 400,
    process(rows) {
      calls.push("orientation.coder-handoff");
      return rows.map((row) => ({ ...row, coderHandoff: true }));
    }
  },
  {
    id: "orientation.map-objects",
    phase: "orientation",
    order: 300,
    process(rows) {
      calls.push("orientation.map-objects");
      return rows.map((row) => ({ ...row, mapObjects: true }));
    }
  }
].forEach((stage) => pipeline.registerStage(stage));

const expectedOrder = [
  "orientation.map-objects",
  "orientation.coder-handoff",
  "orientation.physical-code-box",
  "grammar.coder-rest"
];
const result = pipeline.run([{ cmd: 7, tableAngle: 10, plateAngle: 0 }]);

assert.deepEqual(calls, expectedOrder);
assert.deepEqual(result.stageIds, expectedOrder);
assert.equal(result.rows[0].mapObjects, true);
assert.equal(result.rows[0].coderHandoff, true);
assert.equal(result.rows[0].physicalCodeBox, true);
assert.equal(result.rows[1].cmd, 3);
assert.deepEqual(result.trace.map((entry) => [entry.id, entry.beforeRows, entry.afterRows]), [
  ["orientation.map-objects", 1, 1],
  ["orientation.coder-handoff", 1, 1],
  ["orientation.physical-code-box", 1, 1],
  ["grammar.coder-rest", 1, 2]
]);

pipeline.registerStage({
  id: "orientation.coder-handoff",
  phase: "orientation",
  order: 450,
  process(rows) {
    return rows.map((row) => ({ ...row, replacement: true }));
  }
});
assert.equal(pipeline.getStage("orientation.coder-handoff").order, 450);
assert.equal(pipeline.run([{ cmd: 3 }]).rows[0].replacement, true);

const mapIntegration = fs.readFileSync(
  path.join(__dirname, "../app/map-object-servo-orientation-integration.js"),
  "utf8"
);
const handoffIntegration = fs.readFileSync(
  path.join(__dirname, "../app/map-object-coder-after-wipe-integration.js"),
  "utf8"
);
assert.match(mapIntegration, /STAGE_ID = "orientation\.map-objects"/);
assert.match(mapIntegration, /order:\s*300/);
assert.match(mapIntegration, /installLegacyWrapper/);
assert.match(handoffIntegration, /STAGE_ID = "orientation\.coder-handoff"/);
assert.match(handoffIntegration, /order:\s*400/);
assert.match(handoffIntegration, /installLegacyWrapper/);

assert.throws(() => pipeline.registerStage({ id: "invalid" }), /process function/);
assert.throws(
  () => {
    pipeline.registerStage({ id: "bad-return", order: 700, process: () => null });
    pipeline.run([]);
  },
  /did not return a row array/
);

console.log("Ordered profile pipeline regression passed.");
