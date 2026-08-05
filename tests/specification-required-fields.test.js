"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(
  path.join(root, "app", "controllers", "specification-required-fields-controller.js"),
  "utf8"
);
assert.doesNotThrow(() => new vm.Script(source, { filename: "specification-required-fields-controller.js" }));

const sandbox = { window: null, globalThis: null, console };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "specification-required-fields-controller.js" });

const requirements = sandbox.LabelerSpecificationRequirements;
assert.ok(requirements?.blankOnly);
assert.ok(requirements?.zeroIsComplete);

const zeroState = {
  bottleSpecs: [{
    bottleType: "Zero Bottle",
    diameterTargetMm: 0,
    radiusReductionMm: 0
  }],
  labelSpecs: [{
    brand: "Zero Brand",
    specNumber: "0",
    applicationMode: "apl",
    bodyLengthMm: 0,
    backLengthMm: 0,
    neckHeightMm: 0,
    neckLengthMm: 0,
    neckBottomCurveMm: 0,
    neckBottomCircumferenceMm: 0,
    codeBoxCenterMm: 0
  }]
};
assert.strictEqual(requirements.validateState(zeroState).length, 0, "Every numeric zero must count as completed.");

const blankLabel = JSON.parse(JSON.stringify(zeroState));
blankLabel.labelSpecs[0].neckHeightMm = "";
assert.ok(requirements.validateState(blankLabel).some((issue) => issue.field === "neckHeightMm"));

const blankBottle = JSON.parse(JSON.stringify(zeroState));
blankBottle.bottleSpecs[0].diameterTargetMm = null;
assert.ok(requirements.validateState(blankBottle).some((issue) => issue.field === "diameterTargetMm"));

const invalidNumeric = JSON.parse(JSON.stringify(zeroState));
invalidNumeric.labelSpecs[0].bodyLengthMm = "not-a-number";
assert.ok(requirements.validateState(invalidNumeric).some((issue) => issue.field === "bodyLengthMm"));

const bootstrap = fs.readFileSync(path.join(root, "app", "bootstrap.js"), "utf8");
const legacyIndex = bootstrap.indexOf("app/controllers/specification-sensor-guidance-controller.js");
const requiredIndex = bootstrap.indexOf("app/controllers/specification-required-fields-controller.js");
const sensorIndex = bootstrap.indexOf("app/controllers/sensor-activation-controller.js");
assert.ok(legacyIndex >= 0 && requiredIndex > legacyIndex && requiredIndex < sensorIndex);

console.log("Blank-only required specification regression passed.");
