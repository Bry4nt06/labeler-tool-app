"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const policySource = fs.readFileSync(path.join(root, "app", "label-centerline-policy-integration.js"), "utf8");
const targetSource = fs.readFileSync(path.join(root, "app", "orientation-constraint-target-service.js"), "utf8");
const buildRendererSource = fs.readFileSync(path.join(root, "app", "build-inputs-renderer.js"), "utf8");
const buildControllerSource = fs.readFileSync(path.join(root, "app", "controllers", "build-inputs-controller.js"), "utf8");
const buildInputIntegrationSource = fs.readFileSync(path.join(root, "app", "application-reference-build-input-integration.js"), "utf8");
const startupSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const bootstrapSource = fs.readFileSync(path.join(root, "app", "bootstrap.js"), "utf8");

assert.doesNotThrow(() => new vm.Script(policySource));
assert.doesNotThrow(() => new vm.Script(targetSource));
assert.doesNotThrow(() => new vm.Script(buildControllerSource));
assert.doesNotThrow(() => new vm.Script(buildInputIntegrationSource));
assert.match(policySource, /const CENTER_TACK = "center-tack"/);
assert.match(policySource, /const LEADING_EDGE = "leading-edge"/);
assert.match(policySource, /neck:\s*CENTER_TACK/);
assert.match(policySource, /body:\s*LEADING_EDGE/);
assert.match(policySource, /back:\s*LEADING_EDGE/);
assert.match(policySource, /finishedCenterlineFromApplication/);
assert.match(policySource, /applicationTargetFromCenterline/);
assert.match(buildRendererSource, /Neck Application Reference/);
assert.match(buildRendererSource, /Body Application Reference/);
assert.match(buildRendererSource, /Back Application Reference/);
assert.match(buildRendererSource, />Center Tack</);
assert.match(buildRendererSource, />Leading Edge</);
assert.match(buildControllerSource, /function updateApplicationReference/);
assert.match(bootstrapSource, /application-reference-build-input-integration\.js/);
assert.match(bootstrapSource, /label-application-reference-v32-20260807-1251/);
assert.match(startupSource, /label-application-reference-v32/);

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
  state: {
    applicationMode: "apl",
    selectedBrand: "Test",
    selectedBottle: "Bottle",
    buildInputs: {
      neckApplication: "Center",
      bodyOffsetMm: 0,
      backOffsetMm: 0,
      backInspectionOffsetMm: 0
    }
  },
  selectedLabelApplicationState() { return active; },
  selectedLabelSpec() {
    return {
      brand: "Test",
      neckBottomCurveMm: 60,
      neckBottomCircumferenceMm: 360,
      bodyLengthMm: 120,
      backLengthMm: 80,
      codeBoxCenterMm: 0
    };
  },
  selectedBottleSpec() { return { bottleType: "Bottle" }; },
  bodyCircumference() { return 360; },
  sectionWipePlan(section) {
    return { labelDeg: section === "neck" ? 60 : section === "body" ? 120 : 80 };
  },
  buildProgramSummary() {
    return { rows: [["Center Line Front (deg)", 0], ["Center Line Back (deg)", 180]] };
  },
  generatedAplSeedProfile() { return baseSeed(); },
  LabelerAplSeedProfileGenerator: { generateSeed() { return baseSeed(); } }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(policySource, context, { filename: "label-centerline-policy-integration.js" });

const policy = context.LabelerLabelCenterlinePolicy;
assert.equal(policy.installed, true);
assert.equal(policy.VERSION, 2);
assert.equal(context.state.buildInputs.neckApplicationReference, "center-tack");
assert.equal(context.state.buildInputs.bodyApplicationReference, "leading-edge");
assert.equal(context.state.buildInputs.backApplicationReference, "leading-edge");

// Default APL behavior: Neck center-tacks at the finished front centerline.
// Body and Back tack their leading edges, so their application angles differ
// from their finished centers by half of each developed label width.
let seed = context.generatedAplSeedProfile();
assert.equal(seed[1].plateAngle, 0);
assert.equal(seed[5].plateAngle, 0);
assert.equal(seed[11].plateAngle, -60);
assert.equal(seed[16].plateAngle, -60);
assert.equal(seed[21].plateAngle, 140);
assert.equal(seed[26].plateAngle, 140);
assert.equal(seed[1].applicationReferenceMode, "center-tack");
assert.equal(seed[11].applicationReferenceMode, "leading-edge");
assert.equal(seed[21].applicationReferenceMode, "leading-edge");
assert.equal(policy.centerlineForSection("neck", seed), 0);
assert.equal(policy.centerlineForSection("body", seed), 0);
assert.equal(policy.centerlineForSection("back", seed), 180);
assert.equal(policy.validationNotes(seed).length, 0, "Different tack angles are valid when the finished label centers align.");

// Future recipe option: Body may be center-tacked without changing its finished
// centerline or its sensor reference.
context.state.buildInputs.bodyApplicationReference = "center-tack";
seed = context.generatedAplSeedProfile();
assert.equal(seed[11].plateAngle, 0);
assert.equal(seed[16].plateAngle, 0);
assert.equal(policy.centerlineForSection("body", seed), 0);

// Back can independently use center tack in a future setup.
context.state.buildInputs.backApplicationReference = "center-tack";
seed = context.generatedAplSeedProfile();
assert.equal(seed[21].plateAngle, 180);
assert.equal(seed[26].plateAngle, 180);
assert.equal(policy.centerlineForSection("back", seed), 180);

// Neck can also be changed to Leading Edge. Its tack moves by half the neck
// label width but its finished front datum remains unchanged.
context.state.buildInputs.neckApplicationReference = "leading-edge";
seed = context.generatedAplSeedProfile();
assert.equal(seed[1].plateAngle, -30);
assert.equal(seed[5].plateAngle, -30);
assert.equal(policy.centerlineForSection("neck", seed), 0);

// Restore requested defaults for imported-program interpretation.
context.state.buildInputs.neckApplicationReference = "center-tack";
context.state.buildInputs.bodyApplicationReference = "leading-edge";
context.state.buildInputs.backApplicationReference = "leading-edge";

// Loaded programs use their actual tack row plus the selected reference mode to
// derive the finished label center. These raw application angles are different,
// but all three finished centers are physically aligned.
const alignedImported = [
  { cmd: 3, tableAngle: 10, plateAngle: 12, action: "Hold for Neck Application - Agg 1", section: "neck", applicationReferenceMode: "center-tack" },
  { cmd: 3, tableAngle: 150, plateAngle: -48, action: "Hold for Body Application - Agg 3", section: "body", applicationReferenceMode: "leading-edge" },
  { cmd: 3, tableAngle: 230, plateAngle: 152, action: "Hold for Back Application - Agg 5", section: "back", applicationReferenceMode: "leading-edge" }
];
assert.equal(policy.applicationTargetForSection("body", alignedImported), -48);
assert.equal(policy.centerlineForSection("neck", alignedImported), 12);
assert.equal(policy.centerlineForSection("body", alignedImported), 12);
assert.equal(policy.centerlineForSection("back", alignedImported), 192);
assert.equal(policy.validationNotes(alignedImported).length, 0);

const misalignedImported = alignedImported.map((row) => ({ ...row }));
misalignedImported[1].plateAngle = -40;
const importedNotes = policy.validationNotes(misalignedImported);
assert.ok(importedNotes.some((note) => note[2]?.code === "front-label-centerline-mismatch"));

// The sensor target service consumes the finished label centerline, not the
// leading-edge tack position. Motion-plan application targets remain free to
// represent the actual dispenser/tack orientation.
context.state.direction = "ccw";
context.state.motionPlan = { bodyApplicationTarget: -48, backApplicationTarget: 152 };
context.state.program = alignedImported;
context.LabelerDriverRegistry = { resolve() { return null; } };
context.activeMachineMap = () => ({ applicationMode: "apl", stationSections: {}, objects: [] });
context.inferAplStationSections = () => ({});
context.sectionLabel = (section) => section;
context.degFromMm = () => 0;
vm.runInContext(targetSource, context, { filename: "orientation-constraint-target-service.js" });

const targetService = context.LabelerOrientationConstraintTargetService;
assert.equal(targetService.applicationTarget("body", alignedImported, 200), 12);
assert.equal(targetService.applicationTarget("back", alignedImported, 250), 192);

console.log("Label application-reference and finished-centerline regression passed.");
