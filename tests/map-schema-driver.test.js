"use strict";

const assert = require("node:assert/strict");
const driver = require("../drivers/map/map-schema-driver.js");

assert.equal(driver.MACHINE_MAP_SCHEMA_VERSION, 11);
assert.deepEqual(driver.normalizeEnabledSlots([], 3), [true, true, true, false, false, false]);
assert.deepEqual(driver.normalizeEnabledSlots([false, false], 2), [true, false, false, false, false, false]);
assert.deepEqual(driver.activeSlotNumbers([true, false, true, false, false, false]), [1, 3]);

const roller = driver.normalizeBuilderObject({
  id: "roller-1",
  kind: "roller",
  application: "apl",
  station: 3,
  start: 100,
  end: 112
}, "apl", 6);
assert.equal(roller.start, 100);
assert.equal(roller.wipeSpanDeg, 12);
assert.equal(roller.end, 112);
assert.equal(roller.station, 3);

const sensor = driver.normalizeBuilderObject({
  id: "sensor-1",
  kind: "sensor",
  angle: 291,
  station: 6,
  servoAssist: true,
  requiredVisibilityPercent: 125
}, "apl", 6);
assert.equal(sensor.start, 291);
assert.equal(sensor.end, 294);
assert.equal(sensor.angle, 291);
assert.equal(sensor.requiredVisibilityPercent, 100);

const channel = driver.normalizeBuilderObject({
  id: "channel-1",
  kind: "brush-channel",
  application: "cold-glue",
  outerStart: 100,
  outerEnd: 120,
  innerStart: 110,
  innerEnd: 135,
  bottleHoldStartDeg: 200,
  station: 2
}, "cold-glue", 6);
assert.equal(channel.application, "cold-glue");
assert.equal(channel.bottleHoldStartDeg, 135);

const sections = driver.inferAplStationSections({
  applicationMode: "apl",
  enabledStations: [true, false, true, false, true, false],
  stationCount: 3,
  stationSections: {},
  objects: [
    { kind: "roller", station: 1 },
    { kind: "pad", station: 3 },
    { kind: "pad", station: 5 }
  ]
});
assert.deepEqual(sections, { "1": "neck", "3": "body", "5": "back" });

const map = driver.createMachineMap({
  id: "map-1",
  name: "45H TopModul 3 label",
  applicationMode: "apl",
  machineType: "TopModul",
  headCount: 45,
  aggregateCount: 3,
  stationCount: 3,
  enabledAggregates: [true, false, true, false, true, false],
  enabledStations: [true, false, true, false, true, false],
  machineSettings: { direction: "cw", zeroAngle: -10 },
  objects: [{ id: "sensor", kind: "sensor", angle: 291, station: 5 }]
}, {
  current: { depths: { spender: 20 } },
  defaultAplAggregateAngles: () => ({ "1": 10, "2": 20, "3": 30, "4": 40, "5": 50, "6": 60 }),
  defaultAplStationAngles: () => ({ "1": 10, "2": 20, "3": 30, "4": 40, "5": 50, "6": 60 }),
  mapLocationFor: () => ({ zone: "Z", site: "S" }),
  idFactory: () => "generated"
});
assert.equal(map.schemaVersion, 11);
assert.equal(map.headCount, 45);
assert.equal(map.aggregateCount, 3);
assert.equal(map.stationCount, 3);
assert.equal(map.machineSettings.direction, "cw");
assert.equal(map.machineSettings.zeroAngle, 350);
assert.equal(map.objects[0].end, 294);
assert.equal(map.zone, "Z");
assert.equal(map.site, "S");

const coldGlue = driver.createMachineMap({
  applicationMode: "cold-glue",
  aggregateCount: 3,
  stationCount: 3,
  objects: [{ kind: "gripper", angle: 81, station: 1 }]
}, {
  idFactory: () => "generated",
  defaultAplAggregateAngles: () => ({ "1": 75, "2": 153, "3": 231, "4": 271, "5": 311, "6": 351 }),
  defaultAplStationAngles: () => ({ "1": 75, "2": 153, "3": 231, "4": 271, "5": 311, "6": 351 })
});
assert.equal(coldGlue.aggregateAngles["1"], 75);
assert.equal(coldGlue.machineSettings.direction, "ccw");

const restoreMap = {
  applicationMode: "apl",
  restoreDefaultObjects: true,
  enabledStations: [true, true, false, false, false, false],
  stationCount: 2,
  objects: [{ id: "apl-station-1-outer", name: "Station 1 Outside", kind: "pad", side: "outer", station: 1 }]
};
driver.ensureAplObjectsForNewStations(restoreMap, {
  defaultObjects: [
    { id: "default-1", name: "Station 1 Inside", kind: "pad", side: "inner", station: 1, start: 10, end: 20 },
    { id: "default-2", name: "Station 2 Outside", kind: "pad", side: "outer", station: 2, start: 30, end: 40 }
  ],
  idFactory: () => "generated"
});
assert.equal(restoreMap.objects.some((item) => item.station === 2), true);

console.log("Map schema driver regressions passed.");