"use strict";

const assert = require("assert");
const driver = require("../drivers/profile/apl-contact-window-driver.js");

const original = [
  { id: "outer", kind: "pad", application: "apl", side: "outer", station: 1, start: 69, end: 89 },
  { id: "inner", kind: "pad", application: "apl", side: "inner", station: 1, start: 88.044, end: 98.044 }
];
const prepared = driver.splitOverlappingPadObjects(original);

assert.strictEqual(prepared.adjustments.length, 1, "The overlapping Station 1 pad pair should receive one handoff adjustment.");
const outer = prepared.objects.find((item) => item.id === "outer");
const inner = prepared.objects.find((item) => item.id === "inner");
assert(outer.end < inner.start, "The generated contact windows must be strictly ordered.");
assert(inner.start - outer.end >= 0.5 - driver.EPS, "The pad handoff must preserve the 0.5° command gap.");
assert.strictEqual(original[0].end, 89, "The saved mechanical map must not be modified by profile preparation.");
assert.strictEqual(original[1].start, 88.044, "The saved inside-pad placement must remain unchanged.");

const separated = driver.splitOverlappingPadObjects([
  { id: "outer", kind: "pad", application: "apl", side: "outer", station: 1, start: 69, end: 89 },
  { id: "inner", kind: "pad", application: "apl", side: "inner", station: 1, start: 89.5, end: 99.5 }
]);
assert.strictEqual(separated.adjustments.length, 0, "Already ordered pad windows must be left alone.");

console.log("APL overlapping pad handoff regression passed.");
