"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const loader = fs.readFileSync(path.join(root, "app/geometry-and-planning.js"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const serviceWorker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
const expected = [
  "app/geometry-primitives.js",
  "app/label-specification-service.js",
  "app/label-station-planning-service.js",
  "app/label-sensor-geometry-service.js",
  "app/wipe-analysis-service.js",
  "app/program-summary-service.js",
  "app/cold-glue-map-service.js"
];

assert.ok(loader.split("\n").length < 80, "geometry entrypoint must remain a small loader");
let previous = -1;
for (const modulePath of expected) {
  const position = loader.indexOf(`\"${modulePath}\"`);
  assert.ok(position > previous, `${modulePath} must appear in dependency order`);
  previous = position;
}
assert.ok(loader.includes("ServoForgeGeometryPlanningReady"));
assert.ok(app.includes("ServoForgeGeometryPlanningReady"), "startup must await geometry/planning modules");
assert.ok(serviceWorker.includes("fetch(event.request, { cache: \"no-store\" })"), "service worker must network-fetch module requests");
assert.ok(serviceWorker.includes("cacheResponse("), "service worker must cache successfully fetched module requests");
for (const forbidden of [
  "function angleToXY(",
  "function selectedLabelSpec(",
  "function labelSensorVisibility(",
  "function stationWipeAnalysis(",
  "function buildProgramSummary(",
  "function normalizeColdGlueMap("
]) assert.ok(!loader.includes(forbidden), `${forbidden} must not remain in loader`);

const owners = {
  "app/geometry-primitives.js": ["function angleToXY(", "function arcPath("],
  "app/label-specification-service.js": ["function selectedLabelSpec(", "function ensureSelectedBrandForApplication("],
  "app/label-station-planning-service.js": ["function selectedLabelApplicationState(", "function inactiveMovementRows("],
  "app/label-sensor-geometry-service.js": ["function labelSensorVisibility(", "function nearestLabelSensorTarget("],
  "app/wipe-analysis-service.js": ["function sectionWipePlan(", "function stationWipeAnalysis("],
  "app/program-summary-service.js": ["function buildProgramSummary("],
  "app/cold-glue-map-service.js": ["function normalizeColdGlueMap(", "function coldGlueMapRows("]
};
for (const [modulePath, markers] of Object.entries(owners)) {
  const source = fs.readFileSync(path.join(root, modulePath), "utf8");
  for (const marker of markers) assert.ok(source.includes(marker), `${modulePath} must own ${marker}`);
}

console.log("Geometry/planning module boundary regression passed.");
