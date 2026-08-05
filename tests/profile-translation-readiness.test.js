"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app/profile-translation-service.js"), "utf8");
const loader = fs.readFileSync(path.join(root, "app/profile-generation.js"), "utf8");

assert.match(loader, /app\/profile-translation-service\.js/);
assert.match(loader, /app\/profile-translator-validation\.js/);
assert.match(source, /profileTranslationInstalled/);
assert.match(source, /motionEventId/);
assert.match(source, /state\.motionTranslation = result/);
assert.match(source, /servoforge:profile-translated/);

const baseRows = [
  { hmi: 1, plc: 0, cmd: 3, tableAngle: 0, plateAngle: 0, action: "Zero Line" },
  { hmi: 2, plc: 1, cmd: 7, tableAngle: 10, plateAngle: 0, action: "Wipe Turn 1 Body - Agg 3" },
  { hmi: 3, plc: 2, cmd: 3, tableAngle: 20, plateAngle: 40, action: "End Curve - Rest", terminalRest: true }
];
const events = [];
function CustomEvent(type, options) {
  this.type = type;
  this.detail = options?.detail;
}

const sandbox = {
  console,
  CustomEvent,
  state: {
    program: [],
    motionPlan: {},
    selectedMotionProfileId: "automatic",
    defaultMotionProfileId: "automatic"
  },
  dispatchEvent(event) {
    events.push(event);
  },
  allMotionProfiles: () => [{
    id: "automatic",
    name: "Automatic",
    machineProfile: "TOPMODUL",
    builtIn: true
  }],
  resolveProfileMachine: () => "TOPMODUL",
  normalizeServoProgramTableAngles: (rows) => ({
    rows,
    minimumStep: 0.5,
    adjustedRows: []
  }),
  applyGeneratedServoProfile() {
    sandbox.state.program = baseRows.map((row) => ({ ...row }));
  },
  LabelerMotionPlannerDriver: {
    buildPlan(rows) {
      return {
        profileId: "rest-correction",
        steps: rows.map((row, index) => ({
          eventId: index === 0 ? "ME-STARTUP-ZERO" : `ME-ROW-${index + 1}`,
          eventType: index === 0 ? "STARTUP" : "WIPE",
          recommendedCommand: row.cmd
        }))
      };
    }
  },
  LabelerProfileTranslatorDriver: {
    translate(rows, plan, options) {
      const translatedRows = rows.map((row, index) => ({
        ...row,
        motionEventId: plan.steps[index].eventId,
        motionEventType: plan.steps[index].eventType,
        plannerIntent: row.cmd === 7 ? "ROTATE" : "HOLD",
        plannerRecommendedCommand: row.cmd
      }));
      return {
        rows: translatedRows,
        plan,
        requestedProfileId: options.requestedProfileId,
        profileId: options.profileId,
        machineProfile: options.machineProfile,
        translated: true,
        translatedCount: translatedRows.length,
        advancedCommandsApplied: false,
        advancedCount: 0,
        fallbackCount: 0,
        commandSummary: {},
        issues: []
      };
    }
  }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

sandbox.applyGeneratedServoProfile();
assert.equal(sandbox.state.program[0].motionEventId, "ME-STARTUP-ZERO");
assert.equal(sandbox.state.program[1].motionEventId, "ME-ROW-2");
assert.equal(sandbox.state.motionPlan.planner.steps[2].eventId, "ME-ROW-3");
assert.equal(sandbox.state.motionTranslation.rows.length, 3);
assert.equal(sandbox.applyGeneratedServoProfile.profileTranslationInstalled, true);
assert.equal(sandbox.LabelerProfileTranslationService.selectedProfile().id, "automatic");
assert.equal(sandbox.LabelerProfileTranslationService.machineProfile(), "TOPMODUL");
assert.equal(events.length, 1);
assert.equal(events[0].type, "servoforge:profile-translated");
assert.equal(events[0].detail.rowCount, 3);

console.log("Profile translation readiness regression passed.");
