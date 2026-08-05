"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.resolve(__dirname, "../app/machine-terminal-policy-integration.js"),
  "utf8"
);

const context = {
  console,
  state: {
    applicationMode: "apl",
    program: [],
    motionPlan: {
      rows: [],
      termination: { section: "coding", command: "Rest" }
    },
    motionTranslation: null,
    plannerPreview: null,
    tableAngleSequence: null
  },
  activeMachineMap() {
    return { machineType: "TopModul", applicationMode: "apl" };
  },
  applyGeneratedServoProfile() {
    context.state.program = [
      { hmi: 1, plc: 0, cmd: 3, tableAngle: 0, plateAngle: 15, action: "Zero Line" },
      {
        hmi: 25,
        plc: 24,
        cmd: 7,
        tableAngle: 298,
        plateAngle: 225,
        action: "Orient Back Code Box for Back Label Coding",
        codingObjectId: "default-back-coding",
        plannedRotation: -67.5
      },
      {
        hmi: 26,
        plc: 25,
        cmd: 3,
        tableAngle: 304,
        plateAngle: 157.5,
        action: "Hold Back Code Box Through Back Label Coding",
        orientationHold: true,
        codingObjectId: "default-back-coding",
        codingReadyTableAngle: 304
      },
      {
        hmi: 27,
        plc: 26,
        cmd: 3,
        tableAngle: 315,
        plateAngle: 157.5,
        action: "Return Bottle to End Curve Reference After Coding",
        orientationConstraintContinuation: true,
        codingObjectId: "default-back-coding"
      },
      {
        hmi: 28,
        plc: 27,
        cmd: 3,
        tableAngle: 359,
        plateAngle: 375,
        action: "End Curve - Rest",
        terminalRest: true
      }
    ];
    context.state.motionPlan.rows = context.state.program;
    return context.state.program;
  },
  document: {
    querySelector() { return null; }
  },
  setTimeout(callback) { callback(); }
};

context.window = context;
context.LabelerMachineFamilyGrammarDriver = {
  resolveFamily() { return "TOPMODUL"; },
  annotateCorrectionChains(rows) {
    return { rows, family: "TOPMODUL", rule: "test", chains: [] };
  }
};
context.LabelerServoPipelineValidator = {
  analyze() {
    return { issues: [], summary: { bad: 0, warn: 0, ok: 0, total: 0 } };
  }
};
context.LabelerServoCommandDriver = {
  moveDefinition(command) {
    return command === 3 ? { name: "Rest" } : { name: `CMD ${command}` };
  }
};

vm.createContext(context);
vm.runInContext(source, context);
context.applyGeneratedServoProfile();

assert.equal(context.state.program.length, 3);
assert.equal(context.state.program.at(-1).tableAngle, 304);
assert.equal(context.state.program.at(-1).cmd, 3);
assert.equal(context.state.program.at(-1).action, "Hold for Coding");
assert.equal(context.state.program.at(-1).codingHold, true);
assert.equal(context.state.program.at(-1).terminalRest, true);
assert.equal(context.state.program.at(-1).motionSource, "terminal-coding-rest");
assert.equal(context.state.program.some((row) => row.tableAngle === 315), false);
assert.equal(context.state.program.some((row) => row.tableAngle === 359), false);
assert.equal(context.state.motionPlan.termination.tableAngle, 304);

console.log("TopModul rebuilt coding hold terminal regression passed.");
