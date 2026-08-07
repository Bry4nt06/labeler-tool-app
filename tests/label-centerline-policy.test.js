"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const policySource = fs.readFileSync(path.join(root, "app", "label-centerline-policy-integration.js"), "utf8");
const targetSource = fs.readFileSync(path.join(root, "app", "orientation-constraint-target-service.js"), "utf8");
const startupSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const bootstrapSource = fs.readFileSync(path.join(root, "app", "bootstrap.js"), "utf8");

assert.doesNotThrow(() => new vm.Script(policySource));
assert.doesNotThrow(() => new vm.Script(targetSource));
assert.match(startupSource, /label-centerline-policy-integration\.js/);
assert.ok(
  startupSource.indexOf("label-centerline-policy-integration.js") < startupSource.indexOf("first-application-zero-datum-integration.js"),
  "The centerline policy must wrap the APL seed before zero-datum generation runs."
);
assert.match(startupSource, /label-centerline-policy-v31/);
assert.match(bootstrapSource, /label-centerline-policy-20260807-0001/);
assert.match(bootstrapSource, /Aug 7, 2026 12:01 AM ET/);

function baseSeed() {
  const rows = Array.from({ length: 32 }, (_, index) => ({
    hmi: index + 1,
    cmd: 3,
    tableAngle: index * 10,
    plateAngle: 0,
    action: `Row ${index + 1}`
  }));
  rows[1] = { ...rows[1], plateAngle: 0, action: "Hold for Neck Application - Agg 1", section: "neck" };
  rows[5] = { ...rows[5], plateAngle: 0, action: "Hold for Neck Application - Agg 2", section: "neck" };
  rows[11] = { ...rows[11], plateAngle: -43.6, action: "Hold for Body Application - Agg 3", section: "body" };
  rows[16] = { ...rows[16], plateAngle: -43.6, action: "Hold for Body Application - Agg 4", section: "body" };
  rows[21] = { ...rows[21], plateAngle: 126.4, action: "Hold for Back Application - Agg 5", section: "back" };
  rows[26] = { ...rows[26], plateAngle: 126.4, action: "Hold for Back Application - Agg 6", section: "back" };
  return rows;
}

let active = { neck: true, body: true, back: true };
const context = {
  console,
  setTimeout() {},
  selectedLabelApplicationState() { return active; },
  generatedAplSeedProfile() { return baseSeed(); },
  LabelerAplSeedProfileGenerator: { generateSeed() { return baseSeed(); } }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(policySource, context, { filename: "label-centerline-policy-integration.js" });

const policy = context.LabelerLabelCenterlinePolicy;
assert.equal(policy.installed, true);

// Three-label program: Neck establishes the front datum, Body must share it,
// and Back must be 180 degrees opposite it.
let seed = context.generatedAplSeedProfile();
assert.equal(seed[1].plateAngle, 0);
assert.equal(seed[5].plateAngle, 0);
assert.equal(seed[11].plateAngle, 0);
assert.equal(seed[16].plateAngle, 0);
assert.equal(seed[21].plateAngle, 180);
assert.equal(seed[26].plateAngle, 180);

// Body-only program: Body establishes its own front datum. No nonexistent Neck
// datum is invented. Back, when present, is opposite Body.
active = { neck: false, body: true, back: true };
seed = context.generatedAplSeedProfile();
assert.equal(seed[11].plateAngle, -43.6);
assert.equal(seed[16].plateAngle, -43.6);
assert.ok(Math.abs(seed[21].plateAngle - 136.4) < 1e-9);
assert.ok(Math.abs(seed[26].plateAngle - 136.4) < 1e-9);

// Neck-only program: Neck alone owns the front datum.
active = { neck: true, body: false, back: false };
seed = context.generatedAplSeedProfile();
assert.equal(seed[1].plateAngle, 0);
assert.equal(seed[5].plateAngle, 0);
assert.equal(seed[11].plateAngle, -43.6, "Inactive Body rows must not be rewritten as an active datum.");

// Back-only program: Back establishes its own label centerline. ServoForge must
// not manufacture a front datum just to orient the Back sensor.
active = { neck: false, body: false, back: true };
seed = context.generatedAplSeedProfile();
assert.equal(seed[21].plateAngle, 126.4);
assert.equal(seed[26].plateAngle, 126.4);

// Existing/imported program semantics: application rows are physical facts.
// Sensors use the actual label they inspect even when an old external program
// has Neck and Body at different centerlines.
const imported = [
  { hmi: 1, cmd: 3, tableAngle: 10, plateAngle: 12, action: "Hold for Neck Application - Agg 1", section: "neck" },
  { hmi: 2, cmd: 3, tableAngle: 150, plateAngle: 38, action: "Hold for Body Application - Agg 3", section: "body" },
  { hmi: 3, cmd: 3, tableAngle: 230, plateAngle: 205, action: "Hold for Back Application - Agg 5", section: "back" }
];
assert.equal(policy.centerlineForSection("neck", imported), 12);
assert.equal(policy.centerlineForSection("body", imported), 38);
assert.equal(policy.centerlineForSection("back", imported), 205);
const importedNotes = policy.validationNotes(imported);
assert.ok(importedNotes.some((note) => note[2]?.code === "front-label-centerline-mismatch"));
assert.ok(importedNotes.some((note) => note[2]?.code === "back-label-centerline-mismatch"));

const alignedImported = [
  { cmd: 3, tableAngle: 10, plateAngle: 12, action: "Hold for Neck Application - Agg 1", section: "neck" },
  { cmd: 3, tableAngle: 150, plateAngle: 12, action: "Hold for Body Application - Agg 3", section: "body" },
  { cmd: 3, tableAngle: 230, plateAngle: 192, action: "Hold for Back Application - Agg 5", section: "back" }
];
assert.equal(policy.validationNotes(alignedImported).length, 0);

// The shared sensor target service must prefer an actual loaded-program
// application event over a stale/generated motion-plan target.
context.state = {
  direction: "ccw",
  motionPlan: { bodyApplicationTarget: 0, backApplicationTarget: 180 },
  buildInputs: { backInspectionOffsetMm: 0 },
  program: imported
};
context.LabelerDriverRegistry = { resolve() { return null; } };
context.selectedLabelApplicationState = () => ({ neck: true, body: true, back: true });
context.activeMachineMap = () => ({ applicationMode: "apl", stationSections: {}, objects: [] });
context.inferAplStationSections = () => ({});
context.sectionLabel = (section) => section;
context.sectionWipePlan = () => ({ labelDeg: 120 });
context.selectedLabelSpec = () => ({ codeBoxCenterMm: 0, neckBottomCircumferenceMm: 100 });
context.selectedBottleSpec = () => ({});
context.bodyCircumference = () => 188;
context.degFromMm = () => 0;
vm.runInContext(targetSource, context, { filename: "orientation-constraint-target-service.js" });

const targetService = context.LabelerOrientationConstraintTargetService;
assert.equal(targetService.applicationTarget("body", imported, 200), 38);
assert.equal(targetService.applicationTarget("back", imported, 250), 205);

const backOnlyImported = [
  { cmd: 3, tableAngle: 200, plateAngle: 222, action: "Hold for Back Application - Agg 5", section: "back" }
];
assert.equal(targetService.applicationTarget("back", backOnlyImported, 250), 222);

console.log("Universal generated and imported label-centerline policy regression passed.");
