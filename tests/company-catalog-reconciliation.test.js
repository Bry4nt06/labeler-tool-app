"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app/company-default-programs-integration.js"), "utf8");
const startup = fs.readFileSync(path.join(root, "app/startup-runtime.js"), "utf8");

const officialLabels = [
  { id: 1, applicationMode: "apl", brand: "Official A", bottleType: "Bottle A" },
  { id: 2, applicationMode: "apl", brand: "Official B", bottleType: "Bottle B" }
];
const officialBottles = [
  { id: 1, bottleType: "Bottle A" },
  { id: 2, bottleType: "Bottle B" }
];
const officialMaps = [{ id: "official-map", name: "Official Map", applicationMode: "apl" }];
const manifest = {
  format: "labeler-tool-portable-settings",
  companyDefaultsVersion: 2,
  settings: { machineTypes: ["TopModul"], activeMapId: "official-map" },
  fragments: {
    mapLibrary: ["./maps.json"],
    labelSpecs: "./labels.json",
    bottleSpecs: "./bottles.json"
  }
};

const storage = new Map([["labelerCompanyProgramSeedVersion", "2"]]);
const state = {
  mapLibrary: [{ id: "custom-map", name: "Custom Map", applicationMode: "apl" }],
  labelSpecs: [
    { id: 1, applicationMode: "apl", brand: "Official A", bottleType: "Wrong Bottle" },
    { id: 99, applicationMode: "apl", brand: "Operator Label", bottleType: "Operator Bottle" }
  ],
  bottleSpecs: [
    { id: 1, bottleType: "Bottle A" },
    { id: 99, bottleType: "Operator Bottle" }
  ],
  machineTypes: ["TopMatic"],
  activeMapId: "custom-map"
};
let saveCount = 0;
let renderCount = 0;
let generationCount = 0;

const responses = new Map([
  ["./config/company-default-settings.json", manifest],
  ["./maps.json", officialMaps],
  ["./labels.json", officialLabels],
  ["./bottles.json", officialBottles]
]);

const sandbox = {
  console,
  Promise,
  JSON,
  Object,
  Array,
  Set,
  Map,
  Number,
  String,
  state,
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value))
  },
  fetch: async (url) => ({
    ok: responses.has(url),
    status: responses.has(url) ? 200 : 404,
    json: async () => JSON.parse(JSON.stringify(responses.get(url)))
  }),
  saveCurrentSettings: () => { saveCount += 1; },
  loadMachineMapIntoRuntime: () => { throw new Error("custom active map must not be replaced"); },
  applyGeneratedServoProfile: () => { generationCount += 1; },
  render: () => { renderCount += 1; },
  window: {}
};
sandbox.window = sandbox;

vm.runInNewContext(source, sandbox, { filename: "company-default-programs-integration.js" });
assert.ok(sandbox.LabelerCompanyDefaultsService, "catalog service should install synchronously");
assert.equal(sandbox.ServoForgeCompanyDefaultsReady, undefined, "service must not seed before saved settings load");

(async () => {
  const result = await sandbox.LabelerCompanyDefaultsService.reconcile();
  assert.equal(result.changed, true);
  assert.equal(state.labelSpecs.length, 3, "missing official label should be restored without removing operator label");
  assert.equal(state.bottleSpecs.length, 3, "missing official bottle should be restored without removing operator bottle");
  assert.equal(state.mapLibrary.length, 2, "missing official map should be restored without removing custom map");
  assert.equal(state.labelSpecs.find((item) => item.brand === "Official A").bottleType, "Bottle A", "official association should self-repair");
  assert.ok(state.labelSpecs.some((item) => item.brand === "Operator Label"));
  assert.ok(state.bottleSpecs.some((item) => item.bottleType === "Operator Bottle"));
  assert.equal(state.activeMapId, "custom-map", "custom active map should remain selected");
  assert.equal(saveCount, 1);
  assert.equal(renderCount, 1);
  assert.equal(generationCount, 1);

  const second = await sandbox.LabelerCompanyDefaultsService.reconcile();
  assert.equal(second.changed, false, "second reconciliation should be idempotent");
  assert.equal(saveCount, 1, "unchanged reconciliation should not rewrite storage");

  assert.match(startup, /LabelerCompanyDefaultsService\?\.reconcile/);
  assert.doesNotMatch(startup, /await applyCompanySettingsSeed\(\)/);
  console.log("Company catalog reconciliation regression passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
