"use strict";

const assert = require("assert");
const driver = require("../drivers/profile/map-object-orientation-driver.js");

const rows = [
  {
    cmd: 3,
    tableAngle: 187.5,
    plateAngle: -54,
    section: "body",
    station: 4,
    action: "Hold for Body Application - Agg 4"
  },
  {
    cmd: 3,
    tableAngle: 209,
    plateAngle: 141,
    section: "body",
    station: 4,
    stage: "complete",
    action: "Hold for Back Application - Agg 5"
  }
];

assert.strictEqual(
  driver.applicationSection(rows[1]),
  "back",
  "The section-boundary Rest must identify the next Back application target."
);

assert.strictEqual(
  driver.applicationTarget({
    section: "body",
    rows,
    before: 214.5,
    seedTarget: 0
  }),
  -54,
  "A Body sensor after Aggregate 4 must retain the actual Body application reference."
);

assert.strictEqual(
  driver.applicationTarget({
    section: "back",
    rows,
    before: 214.5,
    seedTarget: 0
  }),
  141,
  "The same boundary Rest may still serve as the upcoming Back application reference."
);

console.log("Body sensor application handoff regression passed.");
