"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app", "controllers", "specification-sensor-guidance-controller.js"), "utf8");
assert.doesNotThrow(() => new vm.Script(source, { filename: "specification-sensor-guidance-controller.js" }));

const sandbox = { window: null, globalThis: null, console };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "specification-sensor-guidance-controller.js" });

const requirements = sandbox.LabelerSpecificationRequirements;
assert.ok(requirements, "Pure specification requirements API must be published.");

function validState() {
  return {
    bottleSpecs: [{ bottleType: "11.2 oz", diameterTargetMm: 60, radiusReductionMm: 0.3 }],
    labelSpecs: [{
      brand: "Stella",
      specNumber: "ST-112",
      applicationMode: "apl",
      bodyLengthMm: 85,
      backLengthMm: 76,
      neckHeightMm: 67,
      neckLengthMm: 109,
      neckBottomCurveMm: 110,
      neckBottomCircumferenceMm: 104,
      codeBoxCenterMm: 24
    }]
  };
}

assert.strictEqual(requirements.validateState(validState()).length, 0);

const missingSpec = validState();
missingSpec.labelSpecs[0].specNumber = "";
assert.ok(requirements.validateState(missingSpec).some((issue) => issue.field === "specNumber"));

const partialNeck = validState();
partialNeck.labelSpecs[0].neckHeightMm = 0;
assert.ok(requirements.validateState(partialNeck).some((issue) => issue.field === "neckHeightMm"));

const noNeck = validState();
Object.assign(noNeck.labelSpecs[0], {
  neckHeightMm: 0,
  neckLengthMm: 0,
  neckBottomCurveMm: 0,
  neckBottomCircumferenceMm: 0
});
assert.ok(!requirements.validateState(noNeck).some((issue) => issue.field.startsWith("neck")));

noNeck.labelSpecs[0].bodyLengthMm = 0.5;
assert.ok(requirements.validateState(noNeck).some((issue) => issue.field === "bodyLengthMm"));

[
  "plannedLabelVisibilityPercent",
  "mapObjectOrientationPlans",
  "normalizeSensorMotionGuidance",
  'notice.dataset.health = "info"',
  "planned servo-assist orientation"
].forEach((token) => assert.ok(source.includes(token), `Missing sensor-guidance behavior: ${token}`));

console.log("Specification requirements and sensor guidance regression passed.");
