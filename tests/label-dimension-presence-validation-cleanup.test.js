"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const planningSource = read("app", "label-station-planning-service.js");
const sectionIntegrationSource = read("app", "label-spec-section-selection-integration.js");
const sectionControllerSource = read("app", "controllers", "label-section-event-controller.js");
const specsControllerSource = read("app", "controllers", "specs-controller.js");
const pipelineSource = read("app", "servo-pipeline-validator-integration.js");
const specsUiSource = read("app", "controllers", "specification-table-ui-controller.js");

[
  ["label-station-planning-service.js", planningSource],
  ["label-spec-section-selection-integration.js", sectionIntegrationSource],
  ["label-section-event-controller.js", sectionControllerSource],
  ["specs-controller.js", specsControllerSource],
  ["servo-pipeline-validator-integration.js", pipelineSource],
  ["specification-table-ui-controller.js", specsUiSource]
].forEach(([filename, source]) => {
  assert.doesNotThrow(() => new vm.Script(source, { filename }), `${filename} must parse.`);
});

assert.ok(planningSource.includes("LABEL_SECTION_PRESENT_THRESHOLD_MM = 1"));
assert.ok(planningSource.includes("labelSectionDimensionPresent"));
assert.ok(planningSource.includes("num(value, 0) > LABEL_SECTION_PRESENT_THRESHOLD_MM"));
assert.ok(sectionIntegrationSource.includes("dimensionFlags"));
assert.ok(sectionIntegrationSource.includes("clearLegacySectionFlags"));
assert.ok(sectionIntegrationSource.includes("selectedLabelApplicationState"));
assert.ok(!sectionIntegrationSource.includes("label-section-checkboxes"), "Label section checkboxes must remain removed.");
assert.ok(!sectionIntegrationSource.includes("data-label-section"), "Label section checkbox data attributes must remain removed.");
assert.ok(!sectionIntegrationSource.includes("saveSelection"), "Manual label section selection must remain removed.");
assert.ok(sectionControllerSource.includes("compatibilityOnly: true"));
assert.ok(sectionControllerSource.includes("thresholdMm: PRESENT_THRESHOLD_MM"));
assert.ok(sectionControllerSource.includes("sectionState"));
assert.ok(!sectionControllerSource.includes("addEventListener"), "The retired label section controller must not own checkbox events.");
assert.ok(!sectionControllerSource.includes("enabledLabelSections"), "Manual label section flags must remain retired.");
assert.ok(!sectionControllerSource.includes("setSection"), "Manual label section mutation must remain retired.");
assert.ok(specsControllerSource.includes("labelPresenceFields"));
assert.ok(specsControllerSource.includes('actions.call("applyLabelLengthStationRules")'));
assert.ok(specsControllerSource.includes("regenerate: affectsSelectedProgram"));

assert.ok(pipelineSource.includes('els.validationList.querySelector(".pipeline-validation-banner")?.remove()'));
assert.ok(!pipelineSource.includes('banner.className = "pipeline-validation-banner"'), "The redundant Validation Status banner must not be recreated.");
assert.ok(!pipelineSource.includes("grammarLabel"), "The removed Validation Status banner copy must remain deleted.");
assert.ok(!specsUiSource.includes('content: "Selected"'), "Selected Label Specs must use the row highlight only.");

const label = {
  brand: "Test Brand",
  neckLengthMm: 0,
  neckBottomCurveMm: 0,
  bodyLengthMm: 0,
  backLengthMm: 0
};
const sandbox = {
  window: { LabelerAplProfileDriver: { stationWindows: {} } },
  state: {
    applicationMode: "apl",
    selectedBrand: "Test Brand",
    labelSpecs: [label],
    assemblies: [
      { station: 1, labelSection: "neck", enabled: true, type: "pads", sides: ["outer"] },
      { station: 3, labelSection: "body", enabled: true, type: "pads", sides: ["outer"] },
      { station: 5, labelSection: "back", enabled: true, type: "pads", sides: ["outer"] }
    ]
  },
  selectedLabelSpec: () => label,
  num(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  },
  activeMachineMap: () => ({ id: "map", applicationMode: "apl" }),
  inferAplStationSections: () => ({ "1": "neck", "3": "body", "5": "back" }),
  normalizeAssembly: (assembly) => ({ ...assembly, sides: [...(assembly.sides || [])] }),
  console
};
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(planningSource, sandbox, { filename: "label-station-planning-service.js" });

function applicationState() {
  return vm.runInContext("selectedLabelApplicationState()", sandbox);
}

assert.deepStrictEqual(
  JSON.parse(JSON.stringify(applicationState())),
  { neck: false, body: false, back: false },
  "Zero dimensions must mean no label sections."
);

label.bodyLengthMm = 1;
assert.strictEqual(applicationState().body, false, "Exactly 1 mm must remain inactive.");
label.bodyLengthMm = 1.1;
assert.strictEqual(applicationState().body, true, "A body dimension greater than 1 mm must activate the body label.");

label.neckLengthMm = 1;
assert.strictEqual(applicationState().neck, false, "A 1 mm neck dimension must remain inactive.");
label.neckBottomCurveMm = 1.1;
assert.strictEqual(applicationState().neck, true, "A neck dimension greater than 1 mm must activate the neck label.");

label.backLengthMm = 1.1;
assert.strictEqual(applicationState().back, true, "A back dimension greater than 1 mm must activate the back label.");

label.bodyLengthMm = 0;
label.backLengthMm = 0;
vm.runInContext("applyLabelLengthStationRules()", sandbox);
assert.strictEqual(sandbox.state.assemblies[0].enabled, true, "The active neck station must remain enabled.");
assert.strictEqual(sandbox.state.assemblies[1].enabled, false, "The zero-length body station must be disabled.");
assert.strictEqual(sandbox.state.assemblies[2].enabled, false, "The zero-length back station must be disabled.");

label.bodyLengthMm = 12;
vm.runInContext("applyLabelLengthStationRules()", sandbox);
assert.strictEqual(sandbox.state.assemblies[1].enabled, true, "The body station must restore when body length exceeds 1 mm.");

console.log("Dimension-driven label presence, retired checkbox state, and Validation cleanup regression passed.");
