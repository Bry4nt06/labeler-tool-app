"use strict";

const assert = require("node:assert/strict");
const map = require("../config/default-programs/map-apl-6-aggregate.json");

assert.equal(map.id, "map-apl-default");
assert.equal(map.name, "APL 6-Aggregate");
assert.equal(map.companyDefaultProgram, true);
assert.equal(map.protectedDefaultMap, true);
assert.equal(map.companyDefaultProgramVersion, 12);
assert.equal(map.defaultCatalogVersion, 12);
assert.equal(map.objects.length, 16);
assert.deepEqual(map.aggregateAngles, {
  "1": 68.5,
  "2": 108.5,
  "3": 148.5,
  "4": 188.5,
  "5": 229.5,
  "6": 269.5
});
assert.deepEqual(map.machineSettings, {
  direction: "ccw",
  radius: 250,
  referencePitchRadiusMm: 572.958,
  encoderCountsPerRev: 4096,
  servoGearRatio: 1,
  autoScaleTableMap: true,
  zeroAngle: 0,
  maxMoveRatio: 21
});
assert.deepEqual(map.depths, {
  spender: 12,
  opRoller: 14,
  nonOpRoller: -18,
  wipeInner: -4,
  wipeOuter: 16
});

const sensors = map.objects.filter((object) => object.kind === "sensor");
assert.deepEqual(
  sensors.map((sensor) => [sensor.name, sensor.station, sensor.angle, sensor.orientationLabelSection]),
  [
    ["Neck Sensor", 2, 138.81236641814212, "neck"],
    ["Body Sensor", 4, 216.59777263155684, "body"],
    ["Body Sensor", 4, 295.2796742225027, "body"]
  ]
);
sensors.forEach((sensor) => {
  assert.equal(sensor.enabled, true);
  assert.equal(sensor.orientBottle, true);
  assert.equal(sensor.requiredVisibilityPercent, 50);
});

const coding = map.objects.find((object) => object.kind === "coding");
assert.equal(coding.start, 304);
assert.equal(coding.end, 309);
assert.equal(coding.orientBottle, true);
assert.equal(coding.orientationTarget, "code-box");

console.log("APL 6-Aggregate default regression passed.");
