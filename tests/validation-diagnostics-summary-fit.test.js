"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const diagnosticsSource = read("app", "validation-diagnostics-integration.js");
const manifestSource = read("app", "simulation-collapsible-integration.js");

assert.doesNotThrow(
  () => new vm.Script(diagnosticsSource, { filename: "validation-diagnostics-integration.js" }),
  "Validation diagnostics integration must parse."
);
assert.doesNotThrow(
  () => new vm.Script(manifestSource, { filename: "simulation-collapsible-integration.js" }),
  "Feature manifest must parse."
);

[
  "grid-template-columns: minmax(0, 1fr)",
  "grid-column: 1 / -1",
  "inline-size: 100%",
  "max-inline-size: 100%",
  "min-inline-size: 0",
  "overflow-x: clip",
  "contain: inline-size",
  "white-space: normal",
  "overflow-wrap: anywhere",
  "word-break: break-word"
].forEach((token) => {
  assert.ok(diagnosticsSource.includes(token), `Missing stacked Validation summary rule: ${token}`);
});

assert.ok(
  diagnosticsSource.includes('<span>${result.summary.bad} faults</span>')
    && diagnosticsSource.includes('<span>${result.summary.warn} warnings</span>')
    && diagnosticsSource.includes('<span>${result.summary.ok} checks</span>')
    && diagnosticsSource.includes('<span>${result.duplicateCount} duplicates removed</span>'),
  "All four Validation metrics must remain visible."
);

assert.ok(
  !diagnosticsSource.includes("grid-template-columns: repeat(2, minmax(0, 1fr))"),
  "The two-column Validation summary must remain removed."
);
assert.ok(
  !diagnosticsSource.includes("white-space:nowrap"),
  "Validation metric rows must be allowed to wrap."
);
assert.ok(
  manifestSource.includes("app/validation-diagnostics-integration.js?v=0.9.10-validation-summary-stack-v3"),
  "The stacked Validation summary must use a refreshed feature-module URL."
);

console.log("Stacked Validation diagnostics summary regression passed.");
