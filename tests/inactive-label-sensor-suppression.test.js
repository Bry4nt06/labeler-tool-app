"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const orientation = require("../drivers/profile/map-object-orientation-driver.js");

const landSharkApplications = { neck: false, body: true, back: true };

assert.equal(
  orientation.resolveSection({
    item: { kind: "sensor", station: 2, orientationLabelSection: "neck" },
    activeApplications: landSharkApplications,
    stationSections: { "2": "neck" }
  }),
  "none",
  "A Neck sensor must not create orientation work when the selected brand has no neck label."
);

assert.equal(
  orientation.resolveSection({
    item: { kind: "sensor", station: 2, orientationLabelSection: "auto" },
    activeApplications: landSharkApplications,
    stationSections: { "2": "neck" }
  }),
  "none",
  "An inherited Neck sensor must also be ignored for a brand without a neck label."
);

assert.equal(
  orientation.resolveSection({
    item: { kind: "coding", orientationLabelSection: "neck" },
    activeApplications: landSharkApplications
  }),
  "back",
  "Coders retain their existing fallback behavior and retarget to the latest active label."
);

const source = fs.readFileSync(
  path.resolve(__dirname, "../app/inactive-label-sensor-suppression-integration.js"),
  "utf8"
);

const context = {
  console,
  state: { selectedBrand: "LandShark" },
  activeMachineMap() {
    return {
      stationSections: { "2": "neck", "4": "body" },
      objects: [
        { id: "neck-sensor", kind: "sensor", station: 2, orientationLabelSection: "neck" },
        { id: "body-sensor", kind: "sensor", station: 4, orientationLabelSection: "body" }
      ]
    };
  },
  selectedLabelApplicationState() {
    return { neck: false, body: true, back: true };
  },
  inferAplStationSections(map) {
    return map.stationSections;
  },
  labelSectionForStation(station) {
    return station === 2 ? "neck" : station === 4 ? "body" : "none";
  },
  validate() {
    return [
      ["bad", "Neck Sensor at Station 2 is assigned to a label that is not active.", { objectId: "neck-sensor" }],
      ["warn", "Neck Sensor overlaps another object.", { objectId: "neck-sensor" }],
      ["warn", "Body Sensor visibility needs review.", { objectId: "body-sensor" }],
      ["bad", "Unrelated program fault."]
    ];
  },
  applyGeneratedServoProfile() {},
  renderValidation() {},
  setTimeout(callback) { callback(); }
};
context.window = context;

vm.createContext(context);
vm.runInContext(source, context);

assert.deepEqual(
  JSON.parse(JSON.stringify(context.validate())),
  [
    ["warn", "Body Sensor visibility needs review.", { objectId: "body-sensor" }],
    ["bad", "Unrelated program fault."]
  ],
  "All diagnostics tied to an inactive-label sensor must be suppressed without hiding active sensor or general faults."
);

console.log("Inactive label sensor suppression regression passed.");
