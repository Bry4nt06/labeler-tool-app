"use strict";

const assert = require("node:assert/strict");
const driver = require("../drivers/profile/coder-orientation-driver.js");

assert.equal(driver.physicalDirection("cw"), "ccw");
assert.equal(driver.physicalDirection("ccw"), "cw");
assert.equal(driver.resolveSection("auto", { neck: true, body: true, back: true }), "back");
assert.equal(driver.resolveSection("body", { neck: true, body: true, back: true }), "body");

const counterClockwise = driver.codeBoxTarget({
  section: "body",
  applicationTarget: 0,
  labelWidthDeg: 100,
  codeBoxOffsetDeg: 20,
  inspectionOffsetDeg: 0,
  storedDirection: "cw",
  currentPlateAngle: 0
});
assert.equal(counterClockwise.physicalDirection, "ccw");
assert.equal(counterClockwise.center, 50);
assert.equal(counterClockwise.leftEdgeOffset, 30);
assert.equal(counterClockwise.target, 80);

const clockwise = driver.codeBoxTarget({
  section: "body",
  applicationTarget: 0,
  labelWidthDeg: 100,
  codeBoxOffsetDeg: 20,
  inspectionOffsetDeg: 0,
  storedDirection: "ccw",
  currentPlateAngle: 0
});
assert.equal(clockwise.physicalDirection, "cw");
assert.equal(clockwise.target, 20);

assert.equal(driver.nearestEquivalent(20, 370), 380);
console.log("coder-orientation-driver tests passed");
