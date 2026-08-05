"use strict";

const assert = require("assert");

global.LabelerMapObjectOrientationDriver = {
  objectWindow({ item }) {
    const point = Number(item.angle ?? item.start);
    return { start: point - 1.5, end: point + 1.5 };
  }
};
global.LabelerDriverRegistry = {
  resolve() { return global.LabelerMapObjectOrientationDriver; },
  register(_name, api) { global.LabelerMapObjectOrientationDriver = api; }
};

require("../app/sensor-station-cycle-anchor-integration.js");

const rows = [
  { cmd: 3, tableAngle: 269.5, plateAngle: 40, station: 6, section: "back", action: "Hold for Back Application - Agg 6" }
];
const wrapped = global.LabelerMapObjectOrientationDriver;

const afterWrap = wrapped.objectWindow({
  item: { kind: "sensor", station: 6, angle: 10 },
  rows
});
assert.strictEqual(afterWrap.start, 368.5, "A Station 6 sensor at 10° belongs after the Station 6 application, not at the beginning of the current cycle.");
assert.strictEqual(afterWrap.end, 371.5);

const sameCycle = wrapped.objectWindow({
  item: { kind: "sensor", station: 6, angle: 304 },
  rows
});
assert.strictEqual(sameCycle.start, 302.5, "A normally placed back sensor must remain in the current table cycle.");
assert.strictEqual(sameCycle.end, 305.5);

console.log("Sensor station cycle anchor regression passed.");
