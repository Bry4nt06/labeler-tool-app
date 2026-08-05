"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const selectionSource = read("app", "map-object-builder-selection-integration.js");
const orientationSource = read("drivers", "profile", "map-object-orientation-driver.js");
const grammarSource = read("app", "coder-rest-grammar-repair-integration.js");

[
  ["map-object-builder-selection-integration.js", selectionSource],
  ["map-object-orientation-driver.js", orientationSource],
  ["coder-rest-grammar-repair-integration.js", grammarSource]
].forEach(([filename, source]) => {
  assert.doesNotThrow(() => new vm.Script(source, { filename }), `${filename} must parse.`);
});

assert.ok(selectionSource.includes("runtimeObjectLists"));
assert.ok(selectionSource.includes("state.aplMapObjects"));
assert.ok(selectionSource.includes("state.coldGlueMapObjects"));
assert.ok(selectionSource.includes("pointer-events:all"));
assert.ok(selectionSource.includes('document.addEventListener("dblclick", openOnDoubleClick, true)'));
assert.ok(selectionSource.includes("event.stopImmediatePropagation()"));

const orientationSandbox = { window: null, globalThis: null, console };
orientationSandbox.window = orientationSandbox;
orientationSandbox.globalThis = orientationSandbox;
vm.createContext(orientationSandbox);
vm.runInContext(orientationSource, orientationSandbox, { filename: "map-object-orientation-driver.js" });
const orientation = orientationSandbox.LabelerMapObjectOrientationDriver;
assert.ok(orientation);
assert.strictEqual(orientation.resolveSection({
  item: { kind: "coding", orientationLabelSection: "back" },
  activeApplications: { neck: true, body: true, back: false }
}), "body", "A coder saved to Back must fall back to Body for a neck/body recipe.");
assert.strictEqual(orientation.resolveSection({
  item: { kind: "coding", orientationLabelSection: "body" },
  activeApplications: { neck: true, body: false, back: false }
}), "neck", "A coder must fall back to Neck when it is the only active label.");
assert.strictEqual(orientation.resolveSection({
  item: { kind: "sensor", orientationLabelSection: "back" },
  activeApplications: { neck: true, body: true, back: false }
}), "back", "Physical sensors must remain assigned to their configured section.");

let grammarStage = null;
const grammarDriver = {
  reconcile(rows) {
    return { rows: rows.map((row) => ({ ...row })), repairs: [] };
  }
};
const pipeline = {
  registerStage(stage) {
    grammarStage = stage;
  }
};
const grammarSandbox = {
  window: null,
  globalThis: null,
  console,
  state: { motionPlan: {} },
  generatedServoProfile() { return []; },
  document: { readyState: "complete", addEventListener() {} },
  setTimeout(callback) { callback(); },
  LabelerServoCommandDriver: { MOVE_TYPES: { REST: 3, CORRECTION: 7 } },
  LabelerDriverRegistry: {
    resolve(name) {
      if (name === "profile.pipeline") return pipeline;
      if (name === "servo.restCorrectionGrammar") return grammarDriver;
      return null;
    }
  }
};
grammarSandbox.window = grammarSandbox;
grammarSandbox.globalThis = grammarSandbox;
vm.createContext(grammarSandbox);
vm.runInContext(grammarSource, grammarSandbox, { filename: "coder-rest-grammar-repair-integration.js" });
assert.ok(grammarStage?.process, "The final grammar stage must register.");

const finalized = grammarStage.process([
  { hmi: 18, cmd: 3, tableAngle: 210, plateAngle: 100, action: "Rest" },
  { hmi: 19, cmd: 3, tableAngle: 212, plateAngle: 138.5, action: "Coder target" },
  { hmi: 20, cmd: 7, tableAngle: 220, plateAngle: 138.5, action: "End Curve - Rest", terminalRest: true }
]);
assert.deepStrictEqual(finalized.map((row) => row.cmd), [7, 3, 3]);
assert.strictEqual(finalized[0].segmentCommandFinalized, true);
assert.strictEqual(grammarSandbox.state.motionPlan.segmentCommandFinalized, true);

console.log("Map double-click, active coder fallback, and segment grammar regression passed.");
