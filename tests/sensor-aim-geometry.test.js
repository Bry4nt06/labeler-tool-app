"use strict";

const assert = require("node:assert/strict");

const registry = new Map();
global.window = global;
global.LabelerDriverRegistry = {
  register(id, api) { registry.set(id, api); },
  resolve(id) { return registry.get(id) || null; }
};
global.finishAngle = (value) => Math.round(Number(value) * 10) / 10;
global.selectedLabelApplicationState = () => ({ neck: true, body: true, back: true });
global.inferAplStationSections = () => ({ 4: "body" });
global.sectionLabel = (section) => section;
global.sectionWipePlan = () => ({ labelDeg: 40 });
global.selectedLabelSpec = () => ({ codeBoxCenterMm: 0, neckBottomCircumferenceMm: 100 });
global.selectedBottleSpec = () => ({ diameterTargetMm: 60 });
global.bodyCircumference = () => 100;
global.degFromMm = () => 0;
global.labelSensorInspectionCenter = (_section, applicationTarget) => applicationTarget;
global.nearestLabelSensorTarget = (_currentView, labelCenter) => ({
  target: labelCenter,
  visibility: { percent: 100 }
});
global.labelSensorVisibility = (labelCenter, effectiveViewAngle) => ({
  percent: Math.abs(Number(labelCenter) - Number(effectiveViewAngle)) < 0.001 ? 100 : 0
});
global.generatedAplSeedProfile = () => Array.from({ length: 22 }, (_, index) => ({
  plateAngle: index === 11 ? 100 : 0
}));
global.state = {
  buildInputs: { backInspectionOffsetMm: 0 },
  motionPlan: { bodyApplicationTarget: 100 }
};

require("../drivers/profile/map-object-orientation-driver.js");
require("../drivers/profile/sensor-station-label-driver.js");
require("../app/orientation-constraint-target-service.js");

const service = global.LabelerOrientationConstraintTargetService;
const currentPlate = 150;
const baseSensor = {
  id: "body-sensor",
  kind: "sensor",
  station: 4,
  enabled: true,
  servoAssist: true,
  requiredVisibilityPercent: 100,
  orientationLabelSection: "body"
};

const straight = service.targetFor(
  { ...baseSensor, sensorAimOffsetDeg: 0 },
  "body",
  [],
  currentPlate,
  216
);
const aimed = service.targetFor(
  { ...baseSensor, sensorAimOffsetDeg: 30 },
  "body",
  [],
  currentPlate,
  216
);

assert.equal(straight.target, 100, "A straight sensor requires the bottle label reference at 100 degrees.");
assert.equal(
  aimed.target,
  130,
  "A +30 degree physical sensor aim requires a +30 degree bottle target so the same label reference faces the aimed sensor."
);
assert.ok(
  Math.abs(aimed.target - currentPlate) < Math.abs(straight.target - currentPlate),
  "When the hardware is aimed toward the label, the servo must use that direction to reduce the required bottle rotation."
);
assert.equal(
  service.sensorViewingAngle({ ...baseSensor, sensorAimOffsetDeg: 30 }, aimed.target),
  100,
  "Sensor-relative viewing coordinates subtract the physical sensor aim."
);
assert.equal(
  service.bottleAngleForSensorView({ ...baseSensor, sensorAimOffsetDeg: 30 }, 100),
  130,
  "Converting a desired sensor view back to bottle coordinates adds the physical sensor aim."
);
assert.equal(
  service.visibilityAt({ item: { ...baseSensor, sensorAimOffsetDeg: 30 }, target: aimed }, aimed.target),
  100,
  "Visibility must evaluate the bottle angle from the sensor's aimed line of sight."
);

const alreadyAligned = service.targetFor(
  { ...baseSensor, sensorAimOffsetDeg: 35 },
  "body",
  [],
  135,
  216.4
);
assert.equal(
  alreadyAligned.target,
  135,
  "A +35 degree sensor that is already pointed at the label must not request an unnecessary servo correction."
);
assert.equal(
  service.visibilityAt({ item: { ...baseSensor, sensorAimOffsetDeg: 35 }, target: alreadyAligned }, 135),
  100,
  "The Map Builder visibility calculation must recognize a label already inside the aimed sensor line of sight."
);

assert.equal(service.sensorAimOffset({ sensorAimOffsetDeg: 135 }), 90);
assert.equal(service.sensorAimOffset({ sensorAimOffsetDeg: -135 }), -90);

console.log("Sensor aiming geometry regression passed.");
