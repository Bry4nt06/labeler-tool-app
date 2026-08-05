"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../app/profile-translator-validation.js"), "utf8");
const sandbox = {
  console,
  state: {
    motionTranslation: { machineProfile: "AUTOCOL", rows: [] }
  },
  setTimeout() {
    throw new Error("validation module should install without retry in this fixture");
  },
  validate() {
    return [["ok", "base validation"]];
  },
  LabelerProfileTranslatorDriver: {
    validate() {
      return [{ level: "warn", message: "translator warning" }];
    }
  },
  LabelerServoCommandDriver: {
    moveDefinition(command) {
      return Number.isFinite(Number(command)) ? { name: `CMD ${command}` } : null;
    },
    profileSupportsMove() {
      return true;
    },
    validateReferences() {
      return [];
    }
  }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

assert.equal(sandbox.LabelerServoCommandDriver.translatorAwareValidation, true);
const rows = [
  { hmi: 1, cmd: 1, tableAngle: 0, terminalRest: false },
  { hmi: 2, cmd: 3, tableAngle: 10, action: "End Curve - Rest", terminalRest: true }
];
assert.equal(sandbox.LabelerServoCommandDriver.validateReferences(rows).length, 0);
const notes = sandbox.validate();
assert.equal(notes.length, 2);
assert.equal(notes[1][0], "warn");
assert.equal(notes[1][1], "translator warning");
assert.equal(sandbox.validate.profileTranslationValidationInstalled, true);

console.log("Profile translator validation behavior regression passed.");
