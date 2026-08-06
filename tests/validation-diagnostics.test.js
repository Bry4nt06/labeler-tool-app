"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const issueSource = fs.readFileSync(path.join(root, "drivers", "validation", "validation-issue-driver.js"), "utf8");
const aggregatorSource = fs.readFileSync(path.join(root, "drivers", "validation", "validation-result-aggregator-driver.js"), "utf8");
const integrationSource = fs.readFileSync(path.join(root, "app", "validation-diagnostics-integration.js"), "utf8");
const manifestSource = fs.readFileSync(path.join(root, "app", "simulation-collapsible-integration.js"), "utf8");

const registered = new Map();
const sandbox = {
  window: {},
  LabelerDriverRegistry: {
    register(name, api, metadata) { registered.set(name, { api, metadata }); }
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(issueSource, sandbox);
vm.runInContext(aggregatorSource, sandbox);

const notes = [
  ["bad", "Move HMI 4 -> 5 will fault: 180 deg plate in 5 deg table (ratio 36, limit 21)."],
  ["bad", "[SPEED] HMI 4 requires 36.0° bottle per 1° table, exceeding the 21.0:1 limit.", { pipelineCode: "speed-limit-exceeded", hmi: 4 }],
  ["warn", "[PLANNER] No mechanical planner steps are attached to the generated servo profile.", { pipelineCode: "planner-plan-missing" }],
  ["warn", "No mechanical planner steps are attached to the generated servo profile."],
  ["bad", "[GRAMMAR] HMI 7 is CMD 7 without a preceding CMD 3 reference.", { pipelineCode: "correction-missing-leading-reference", hmi: 7 }],
  ["bad", "HMI 7 is CMD 7 and must be followed by CMD 3 before another move."]
];

const result = sandbox.LabelerValidationResultAggregator.aggregateNotes(notes);
assert.strictEqual(result.sourceCount, 6);
assert.strictEqual(result.duplicateCount, 2);
assert.strictEqual(result.issues.length, 4);
assert.strictEqual(result.summary.bad, 3);
assert.strictEqual(result.summary.warn, 1);
assert.ok(result.issues.every((issue) => !/^\[/.test(issue.message)), "Presentation prefixes must not remain in canonical issues.");

const speed = result.issues.find((issue) => issue.category === "speed");
assert.strictEqual(speed.code, "speed-limit-exceeded");
assert.strictEqual(speed.hmi, 4);
assert.strictEqual(speed.message, "HMI 4 requires 36.0° bottle per 1° table, exceeding the 21.0:1 limit.");
assert.ok(sandbox.LabelerValidationResultAggregator.toNotes(result).every((note) => note[2].validationKey));

const mixedSeverity = sandbox.LabelerValidationResultAggregator.aggregateNotes([
  ["warn", "[SPEED] HMI 4 requires 36.0° bottle per 1° table, exceeding the 21.0:1 limit.", { pipelineCode: "speed-limit-exceeded", hmi: 4 }],
  ["bad", "Move HMI 4 -> 5 will fault: 180 deg plate in 5 deg table (ratio 36, limit 21)."]
]);
assert.strictEqual(mixedSeverity.issues.length, 1, "Issue severity must not create a second copy of the same physical condition.");
assert.strictEqual(mixedSeverity.duplicateCount, 1);
assert.strictEqual(mixedSeverity.issues[0].level, "bad", "The strongest severity must win during semantic deduplication.");
assert.strictEqual(mixedSeverity.issues[0].code, "speed-limit-exceeded", "The strongest severity must retain richer pipeline metadata.");

const firstPassNotes = sandbox.LabelerValidationResultAggregator.toNotes(mixedSeverity);
const firstValidationKey = firstPassNotes[0][2].validationKey;
const secondPass = sandbox.LabelerValidationResultAggregator.aggregateNotes(firstPassNotes);
const secondPassNotes = sandbox.LabelerValidationResultAggregator.toNotes(secondPass);
assert.strictEqual(secondPassNotes[0][2].validationKey, firstValidationKey, "Canonical validation keys must remain stable across repeated aggregation.");
assert.ok(!firstValidationKey.startsWith("explicit|"), "Canonical keys must not expose a presentation-only explicit prefix.");

const explicitKeyResult = sandbox.LabelerValidationResultAggregator.aggregateNotes([
  ["warn", "Custom controller condition", { validationKey: "explicit|warn|custom-controller|hmi:8", hmi: 8 }],
  ["bad", "Custom controller condition", { validationKey: "custom-controller|hmi:8", hmi: 8 }]
]);
assert.strictEqual(explicitKeyResult.issues.length, 1, "Legacy explicit validation keys must normalize to one condition identity.");
assert.strictEqual(explicitKeyResult.issues[0].level, "bad");
assert.strictEqual(
  sandbox.LabelerValidationResultAggregator.toNotes(explicitKeyResult)[0][2].validationKey,
  "custom-controller|hmi:8"
);

assert.ok(registered.has("validation.issue"));
assert.ok(registered.has("validation.result"));
assert.strictEqual(registered.get("validation.issue").metadata.version, 2);
assert.deepStrictEqual(Array.from(registered.get("validation.result").metadata.dependencies), ["validation.issue"]);

const issueIndex = manifestSource.indexOf("drivers/validation/validation-issue-driver.js");
const resultIndex = manifestSource.indexOf("drivers/validation/validation-result-aggregator-driver.js");
const integrationIndex = manifestSource.indexOf("app/validation-diagnostics-integration.js");
assert.ok(issueIndex >= 0 && resultIndex > issueIndex && integrationIndex > resultIndex, "Validation diagnostics modules must load in dependency order.");
assert.match(integrationSource, /validateWithDiagnosticsBoundary/, "The final validation boundary must aggregate all prior rule outputs.");
assert.match(integrationSource, /renderValidationWithDiagnosticsBoundary/, "Diagnostic presentation must be a separate render adapter.");

console.log("Validation diagnostics separation regression passed.");
