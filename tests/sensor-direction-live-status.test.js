"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const geometrySource = fs.readFileSync(path.join(root, "app", "label-sensor-geometry-service.js"), "utf8");
const targetSource = fs.readFileSync(path.join(root, "app", "orientation-constraint-target-service.js"), "utf8");
const liveStatusSource = fs.readFileSync(path.join(root, "app", "sensor-direction-live-status-integration.js"), "utf8");
const sensorMapColorSource = fs.readFileSync(path.join(root, "app", "sensor-map-visibility-color-integration.js"), "utf8");
const compactEditorSource = fs.readFileSync(path.join(root, "app", "sensor-editor-compact-interaction-integration.js"), "utf8");
const startupSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const bootstrapSource = fs.readFileSync(path.join(root, "app", "bootstrap.js"), "utf8");

assert.doesNotThrow(() => new vm.Script(geometrySource));
assert.doesNotThrow(() => new vm.Script(targetSource));
assert.doesNotThrow(() => new vm.Script(liveStatusSource));
assert.doesNotThrow(() => new vm.Script(sensorMapColorSource));
assert.doesNotThrow(() => new vm.Script(compactEditorSource));
assert.match(geometrySource, /finished physical label centerline/);
assert.match(geometrySource, /Application\/tack position and finished label centerline are separate/);
assert.doesNotMatch(geometrySource, /alignmentPercent/);
assert.match(targetSource, /function machineDirectionSign/);
assert.match(targetSource, /visibility solver must not mirror sensor aim a second time/);
assert.match(targetSource, /function sensorPhysicalAimOffset/);
assert.match(targetSource, /function labelSensorMapStatus/);
assert.match(targetSource, /global\.labelSensorMapStatus\s*=\s*labelSensorMapStatus/);
assert.match(liveStatusSource, /const VERSION = 2/);
assert.match(liveStatusSource, /refreshAllStatusCards/);
assert.match(liveStatusSource, /applyGeneratedServoProfileWithSensorStatus/);
assert.match(liveStatusSource, /renderWipeDownBuilderWithDirectionAwareSensorStatus/);
assert.match(liveStatusSource, /sensorStatusUpdatedAt/);
assert.match(sensorMapColorSource, /visibilityColorScaleV1:\s*true/);
assert.match(sensorMapColorSource, /#ff4d4f/);
assert.match(sensorMapColorSource, /#ff8a32/);
assert.match(sensorMapColorSource, /#ffd84d/);
assert.match(sensorMapColorSource, /#9adf4f/);
assert.match(sensorMapColorSource, /#2ed47a/);
assert.match(sensorMapColorSource, /#4ca8ff/);
assert.match(sensorMapColorSource, /global\.labelSensorMapColor\s*=\s*function/);
assert.match(sensorMapColorSource, /data-sensor-visibility-percent/);
assert.match(sensorMapColorSource, /drop-shadow/);
assert.match(compactEditorSource, /const VERSION = 14/);
assert.match(compactEditorSource, /function refreshLiveStatus/);
assert.match(compactEditorSource, /refreshLiveStatus\(control\)/);
assert.match(compactEditorSource, /function schedulePreviewRegeneration/);
assert.match(compactEditorSource, /else schedulePreviewRegeneration\(160\)/);
assert.match(compactEditorSource, /background:var\(--panel-hi\)!important/);
assert.match(compactEditorSource, /sensor-station-inherited-row>summary/);
assert.match(startupSource, /first-application-zero-datum-v30-physical-sensor-visibility/);
assert.match(startupSource, /label-application-reference-v32/);
assert.match(startupSource, /sensor-direction-live-status-integration\.js/);
assert.match(bootstrapSource, /sensor-map-visibility-color-integration\.js/);
assert.match(bootstrapSource, /label-application-reference-v32-20260807-1251/);
assert.match(bootstrapSource, /Aug 7, 2026 12:51 PM ET/);

const map = {
  applicationMode: "apl",
  stationSections: { "4": "body" },
  objects: []
};
const sensor = {
  id: "body-sensor",
  name: "Body Sensor",
  kind: "sensor",
  station: 4,
  angle: 217.3,
  start: 217.3,
  sensorAimOffsetDeg: 16,
  requiredVisibilityPercent: 98,
  enabled: true,
  servoAssist: true,
  orientBottle: true
};
map.objects.push(sensor);

const context = {
  console,
  state: {
    direction: "ccw",
    motionPlan: { bodyApplicationTarget: 100 },
    program: [
      { tableAngle: 0, cmd: 3, plateAngle: 146 },
      { tableAngle: 217.3, cmd: 3, plateAngle: 146 },
      { tableAngle: 220.3, cmd: 3, plateAngle: 146 }
    ],
    buildInputs: { backInspectionOffsetMm: 0 }
  },
  num(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  },
  activeMachineMap() { return map; },
  selectedLabelApplicationState() { return { neck: false, body: true, back: false }; },
  inferAplStationSections() { return { "4": "body" }; },
  labelSectionForStation() { return "body"; },
  sectionLabel(value) { return value === "body" ? "Body" : value; },
  sectionWipePlan() { return { labelDeg: 60 }; },
  selectedLabelSpec() { return { codeBoxCenterMm: 0, neckBottomCircumferenceMm: 100 }; },
  selectedBottleSpec() { return {}; },
  bodyCircumference() { return 188; },
  degFromMm() { return 0; },
  generatedAplSeedProfile() {
    const rows = Array.from({ length: 22 }, () => ({ plateAngle: 0 }));
    rows[11] = { plateAngle: 100 };
    return rows;
  },
  plateAngleAt(tableAngle, rows) {
    const sorted = [...rows].sort((a, b) => a.tableAngle - b.tableAngle);
    let current = sorted[0];
    sorted.forEach((row) => { if (row.tableAngle <= tableAngle) current = row; });
    return current.plateAngle;
  },
  LabelerDriverRegistry: {
    resolve(name) {
      if (name === "profile.sensorStationLabel") {
        return { sensorAimOffset(value) { return Math.max(-90, Math.min(90, Number(value || 0))); } };
      }
      if (name === "profile.mapObjectOrientation") {
        return {
          objectWindow({ item }) { return { start: item.angle, end: item.angle + 3 }; },
          applicationTarget({ plannedTarget, seedTarget }) {
            return Number.isFinite(Number(plannedTarget)) ? Number(plannedTarget) : Number(seedTarget || 0);
          },
          orientationTarget({ item, sensorTarget, sensorVisibilityPercent, labelCenter, labelWidthDeg }) {
            return {
              target: sensorTarget,
              mode: "label-center",
              required: Number(item.requiredVisibilityPercent || 50),
              visibility: sensorVisibilityPercent,
              center: labelCenter,
              width: labelWidthDeg
            };
          }
        };
      }
      return null;
    }
  }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(geometrySource, context, { filename: "label-sensor-geometry-service.js" });
vm.runInContext(targetSource, context, { filename: "orientation-constraint-target-service.js" });

const svc = context.LabelerOrientationConstraintTargetService;
assert.ok(svc);
assert.equal(context.labelSensorMapStatus, svc.labelSensorMapStatus, "Map Builder status must use the shared orientation service.");

let status = svc.labelSensorMapStatus(sensor, context.state.program);
assert.equal(status.labelCenter, 100, "Without the application-reference policy loaded, the target-service fallback receives an already-resolved centerline target.");
assert.equal(status.sensorAimOffsetDeg, 16);
assert.equal(status.sensorPhysicalAimOffsetDeg, 16);
assert.equal(status.viewedPlateAngle, 130);
assert.equal(status.percent, 100);
assert.equal(status.passes, true);
assert.equal(status.targetPlateAngle, 146, "A sensor already seeing enough label must not request another servo turn.");

// Changing machine direction mirrors both the bottle and sensor on the physical
// map. Their relative logical angle must therefore remain unchanged.
context.state.direction = "cw";
status = svc.labelSensorMapStatus(sensor, context.state.program);
assert.equal(status.sensorPhysicalAimOffsetDeg, 16, "CW must not reverse aim a second time inside the visibility solver.");
assert.equal(status.viewedPlateAngle, 130);
assert.equal(status.percent, 100);
assert.equal(status.passes, true);
assert.equal(status.targetPlateAngle, 146);

// Changing the actual aim direction must change visibility and generate only
// the minimum correction needed to meet the configured physical overlap.
sensor.sensorAimOffsetDeg = -16;
status = svc.labelSensorMapStatus(sensor, context.state.program);
assert.equal(status.sensorPhysicalAimOffsetDeg, -16);
assert.equal(status.viewedPlateAngle, 162);
assert.ok(status.percent > 96 && status.percent < 97, "Changing sensor aim must change the physical label overlap.");
assert.equal(status.passes, false, "96.7% visible must fail a 98% requirement.");
assert.ok(Math.abs(status.targetPlateAngle - 145.2) < 0.01, "The servo correction must be only the small move needed to reach 98% overlap.");

context.state.program = [
  { tableAngle: 0, cmd: 3, plateAngle: 145 },
  { tableAngle: 217.3, cmd: 3, plateAngle: 145 },
  { tableAngle: 220.3, cmd: 3, plateAngle: 145 }
];
status = svc.labelSensorMapStatus(sensor, context.state.program);
assert.equal(status.viewedPlateAngle, 161);
assert.ok(status.percent > 98 && status.percent < 99);
assert.equal(status.passes, true);
assert.equal(status.targetPlateAngle, 145, "Once the required physical overlap is met, no further centering turn is allowed.");

console.log("Direction-aware sensor line-of-sight, physical label overlap, live editor refresh, sensor map colors, and sensor-card contrast regression passed.");
