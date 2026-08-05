"use strict";

const assert = require("assert");
const policy = require("../drivers/profile/sensor-target-policy-driver.js");

const map = {
  enabledStations: [true, true, true, true, true, true],
  aggregateAngles: { "1": 68.5, "2": 108.5, "3": 148.5, "4": 188.5, "5": 229.5, "6": 269.5 },
  stationSections: { "1": "neck", "2": "neck", "3": "body", "4": "body", "5": "back", "6": "back" },
  objects: [
    { kind: "pad", station: 1, labelSection: "neck", start: 72, end: 100 },
    { kind: "pad", station: 2, labelSection: "neck", start: 112, end: 140 },
    { kind: "pad", station: 3, labelSection: "body", start: 149, end: 169 },
    { kind: "pad", station: 4, labelSection: "body", start: 189, end: 209 },
    { kind: "pad", station: 5, labelSection: "back", start: 230, end: 250 },
    { kind: "pad", station: 6, labelSection: "back", start: 270, end: 290 }
  ]
};
const activeApplications = { neck: true, body: true, back: true };
const stationSections = map.stationSections;

const neckBodySensor = { kind: "sensor", station: 4, angle: 216, orientationLabelSection: "back" };
assert.deepStrictEqual(
  policy.eligibleSections({ item: neckBodySensor, map, activeApplications, stationSections }),
  ["neck", "body"],
  "The 216-degree inspection must only offer labels completed before it."
);
assert.strictEqual(
  policy.normalizeSelection({ selection: "back", item: neckBodySensor, map, activeApplications, stationSections }),
  "body",
  "An invalid Back selection at 216 degrees must fall back to the latest completed Body label."
);
assert.strictEqual(
  policy.normalizeSelection({ selection: "neck", item: neckBodySensor, map, activeApplications, stationSections }),
  "neck",
  "A valid explicit Neck inspection must remain selected."
);

const backCoder = { kind: "coding", start: 304, end: 315, orientationLabelSection: "auto" };
assert.strictEqual(
  policy.latestEligibleSection({ item: backCoder, map, activeApplications, stationSections }),
  "back",
  "The 304-degree coder must resolve Auto to the completed Back label."
);

console.log("Sensor target policy regression passed.");
