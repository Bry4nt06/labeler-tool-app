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
const currentPlate = 20;
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

assert.equal(straight.target, 100, "A straight sensor requires the bottle to face 100 degrees.");
assert.equal(aimed.target, 70, "A +30 degree sensor aim reduces the physical bottle target by 30 degrees.");
assert.ok(
  Math.abs(aimed.target - currentPlate) < Math.abs(straight.target - currentPlate),
  "Aiming the sensor toward the label must reduce required servo rotation."
);
assert.equal(
  service.visibilityAt({ item: { ...baseSensor, sensorAimOffsetDeg: 30 }, target: aimed }, aimed.target),
  100,
  "Visibility must evaluate the physical bottle angle plus the sensor aim."
);
assert.equal(service.sensorAimOffset({ sensorAimOffsetDeg: 135 }), 90);
assert.equal(service.sensorAimOffset({ sensorAimOffsetDeg: -135 }), -90);

console.log("Sensor aiming geometry regression passed.");
