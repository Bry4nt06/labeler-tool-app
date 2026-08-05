"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app", "controllers", "coding-cycle-normalization-controller.js"), "utf8");
assert.doesNotThrow(() => new vm.Script(source, { filename: "coding-cycle-normalization-controller.js" }));

const orientation = {
  objectWindow({ item }) {
    return { start: Number(item.start), end: Number(item.end) };
  }
};
const handoff = {
  locateFinalWipe() { return { turnIndex: 0, holdIndex: 1 }; }
};
const sandbox = {
  console,
  document: { readyState: "complete", addEventListener() {} },
  setTimeout() {},
  state: { motionPlan: { issues: [] } },
  validate() { return []; },
  applyGeneratedServoProfile() {},
  render() {},
  LabelerMapObjectOrientationDriver: orientation,
  LabelerCoderHandoffDriver: handoff,
  LabelerDriverRegistry: {
    resolve(name) {
      if (name === "profile.mapObjectOrientation") return orientation;
      if (name === "profile.coderHandoff") return handoff;
      return null;
    },
    register() {}
  }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "coding-cycle-normalization-controller.js" });

const api = sandbox.LabelerCodingCycleNormalizationController;
assert.ok(api?.installed);
assert.strictEqual(api.nextEquivalentAfter(304, 929), 1024);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(api.normalizeWindowAfter({ start: 304, end: 315 }, 929))),
  { start: 1024, end: 1035, physicalStart: 304, physicalEnd: 315, cycleOffset: 720 }
);
assert.strictEqual(
  api.falseCycleMessage("Coding starts at 304.0 deg, before the final label motion ends at 929.0 deg. Move the Coding Station later or finish the final wipe earlier."),
  true
);
assert.strictEqual(api.falseCycleMessage("Coding starts at 304.0 deg, before the final label motion ends at 290.0 deg."), false);

const bootstrap = fs.readFileSync(path.join(root, "app", "bootstrap.js"), "utf8");
assert.ok(bootstrap.includes("app/controllers/coding-cycle-normalization-controller.js"));
assert.ok(bootstrap.includes("defaults-sensors-coding-20260804-v2"));

console.log("Coding station cycle normalization regression passed.");
