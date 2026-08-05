"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app", "controllers", "sensor-activation-controller.js"), "utf8");
assert.doesNotThrow(() => new vm.Script(source, { filename: "sensor-activation-controller.js" }));

[
  "data-sensor-enabled",
  "Not shown on the map because the selected Brand has no",
  "sensor?.enabled !== false",
  "shownOnMap",
  "node.style.display = current.shownOnMap",
  "withActiveSensors",
  "filterDisabledSensorNotes",
  "pruneMotionIssues",
  "generatedAplMapDrivenProfileWithSensorActivation",
  "profile.mapObjectOrientation",
  "inline-size: 14px !important"
].forEach((token) => assert.ok(source.includes(token), `Missing sensor activation behavior: ${token}`));

const bootstrap = fs.readFileSync(path.join(root, "app", "bootstrap.js"), "utf8");
const guidanceIndex = bootstrap.indexOf("app/controllers/specification-sensor-guidance-controller.js");
const activationIndex = bootstrap.indexOf("app/controllers/sensor-activation-controller.js");
const codingIndex = bootstrap.indexOf("app/controllers/coding-cycle-normalization-controller.js");
const buildIndex = bootstrap.indexOf("app/controllers/build-inputs-controller.js");
assert.ok(guidanceIndex >= 0 && activationIndex > guidanceIndex && codingIndex > activationIndex && codingIndex < buildIndex);

const startup = fs.readFileSync(path.join(root, "app", "startup-runtime.js"), "utf8");
assert.ok(startup.includes("LabelerSensorActivationController?.installed"));
assert.ok(startup.includes("LabelerSensorActivationController.refresh()"));

console.log("Recipe-aware sensor activation regression passed.");
