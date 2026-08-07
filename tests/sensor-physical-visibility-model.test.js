"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const geometrySource = fs.readFileSync(path.join(root, "app", "label-sensor-geometry-service.js"), "utf8");

assert.doesNotThrow(() => new vm.Script(geometrySource, { filename: "label-sensor-geometry-service.js" }));
assert.match(geometrySource, /finished physical label centerline/);
assert.match(geometrySource, /Application\/tack position and finished label centerline are separate/);
assert.doesNotMatch(geometrySource, /alignmentPercent/);

const context = {
  num(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(geometrySource, context, { filename: "label-sensor-geometry-service.js" });

const LANDSHARK_LABEL_MM = 64.897;
const SSNR_DIAMETER_MM = 60.68;
const SSNR_RADIUS_REDUCTION_MM = 0.3;
const circumferenceMm = (SSNR_DIAMETER_MM - 2 * SSNR_RADIUS_REDUCTION_MM) * Math.PI;
const labelDeg = LANDSHARK_LABEL_MM / circumferenceMm * 360;

assert.ok(Math.abs(circumferenceMm - 188.7468866) < 0.001);
assert.ok(Math.abs(labelDeg - 123.7791013) < 0.001);

// The application-reference policy resolves the physical tack location into a
// finished label centerline before sensor geometry is evaluated. This helper
// therefore preserves the already-resolved centerline for every label section.
assert.equal(context.labelSensorInspectionCenter("body", 0, labelDeg), 0);
assert.equal(context.labelSensorInspectionCenter("back", 180, labelDeg), 180);
assert.equal(context.labelSensorInspectionCenter("neck", 45, 80), 45);

function visibility(angle) {
  return context.labelSensorVisibility(0, angle, labelDeg, 180);
}

function close(actual, expected, tolerance = 0.05, message = "") {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message} expected ${expected}, got ${actual}`);
}

// LandShark / SSNR physical visibility checkpoints. The sensor is pointed
// directly at the bottle (aim = 0) and the finished Body-label centerline is 0.
const fullVisibilityEdge = (180 - labelDeg) / 2;
const angle75 = labelDeg / 2 + 90 - labelDeg * 0.75;
const angle50 = 90;
const angle25 = labelDeg / 2 + 90 - labelDeg * 0.25;
const zeroVisibilityEdge = labelDeg / 2 + 90;

close(fullVisibilityEdge, 28.11044935, 0.001, "100% boundary");
close(angle75, 59.05522467, 0.001, "75% checkpoint");
close(angle50, 90, 0.001, "50% checkpoint");
close(angle25, 120.94477533, 0.001, "25% checkpoint");
close(zeroVisibilityEdge, 151.88955065, 0.001, "0% boundary");

close(visibility(0).percent, 100, 0.001, "label centered toward sensor");
close(visibility(fullVisibilityEdge).percent, 100, 0.001, "full label still inside visible hemisphere");
close(visibility(angle75).percent, 75, 0.001, "75% label arc visible");
close(visibility(angle50).percent, 50, 0.001, "label centerline on bottle silhouette");
close(visibility(angle25).percent, 25, 0.001, "25% label arc visible");
close(visibility(zeroVisibilityEdge).percent, 0, 0.001, "label just leaves visible hemisphere");
close(visibility(-angle75).percent, 75, 0.001, "visibility must be symmetric around sensor centerline");

// User-observed benchmark: a LandShark body label centered at plate angle 94°
// with a sensor aimed directly at the bottle should be close to half visible.
const at94 = visibility(94);
close(at94.percent, 46.768, 0.05, "94-degree LandShark visibility");
close(LANDSHARK_LABEL_MM * at94.percent / 100, 30.35, 0.05, "visible LandShark label length at 94 degrees");

// Servo corrections must be the shortest move needed to satisfy the requested
// overlap, not a forced move to center the entire label.
let target = context.nearestLabelSensorTarget(94, 0, labelDeg, 50, 180);
close(target.target, 90, 0.001, "50% target from 94 degrees");
close(target.visibility.percent, 50, 0.001, "50% target visibility");

target = context.nearestLabelSensorTarget(94, 0, labelDeg, 100, 180);
close(target.target, fullVisibilityEdge, 0.001, "100% shortest target from 94 degrees");
close(target.visibility.percent, 100, 0.001, "100% target visibility");

target = context.nearestLabelSensorTarget(20, 0, labelDeg, 100, 180);
close(target.target, 20, 0.001, "already fully visible labels must not rotate");

console.log("Physical label-arc sensor visibility model regression passed.");
