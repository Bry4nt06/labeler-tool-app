"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app", "controllers", "build-inputs-controller.js"), "utf8");
assert.doesNotThrow(
  () => new vm.Script(source, { filename: "build-inputs-controller.js" }),
  "Build Inputs controller must parse."
);

const calls = [];
let execution = null;
const sandbox = {
  window: null,
  globalThis: null,
  state: {
    selectedBrand: "Three Label",
    selectedBottle: "Bottle A",
    labelSpecs: [
      { brand: "Three Label", bottleType: "Bottle A", neckLengthMm: 40, bodyLengthMm: 90, backLengthMm: 50 },
      { brand: "Two Label", bottleType: "Bottle B", neckLengthMm: 40, bodyLengthMm: 90, backLengthMm: 0 }
    ],
    bottleSpecs: [{ bottleType: "Bottle A" }, { bottleType: "Bottle B" }],
    buildInputs: {}
  },
  LabelerWorkspaceActionService: {
    execute(options) {
      execution = options;
      const result = options.mutate?.();
      if (options.regenerate) calls.push("regenerate");
      if (options.persist) calls.push("persist");
      calls.push(`render:${options.render}`);
      return result;
    },
    call(name, ...args) {
      calls.push(name);
      if (name === "selectedLabelSpec") {
        return sandbox.state.labelSpecs.find((spec) => spec.brand === sandbox.state.selectedBrand);
      }
      if (name === "ensureBottleReferenceForLabel") {
        const spec = args[0];
        if (spec?.bottleType) sandbox.state.selectedBottle = spec.bottleType;
      }
      return undefined;
    },
    number(value, fallback = 0) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    }
  },
  console
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "build-inputs-controller.js" });

sandbox.LabelerBuildInputsController.selectBrand("Two Label");

assert.strictEqual(sandbox.state.selectedBrand, "Two Label");
assert.strictEqual(sandbox.state.selectedBottle, "Bottle B");
assert.strictEqual(execution?.regenerate, true, "Selecting a brand must regenerate its Servo Program.");
assert.strictEqual(execution?.persist, true, "Selecting a brand must persist the normalized selection.");
assert.strictEqual(execution?.render, "all", "Selecting a brand must rerender the workspace after regeneration.");
assert.ok(calls.includes("applyLabelLengthStationRules"), "Label-presence station rules must run before regeneration.");
assert.ok(calls.includes("regenerate"), "The action service must execute profile regeneration.");

console.log("Brand-selection profile regeneration regression passed.");
