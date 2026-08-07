"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const guardSource = fs.readFileSync(path.join(root, "app", "startup-dom-binding-guard-integration.js"), "utf8");
const bootstrapSource = fs.readFileSync(path.join(root, "app", "bootstrap.js"), "utf8");
const specRendererSource = fs.readFileSync(path.join(root, "app", "specification-table-renderer.js"), "utf8");
const machineRendererSource = fs.readFileSync(path.join(root, "app", "machine-data-table-renderer.js"), "utf8");

assert.doesNotThrow(() => new vm.Script(guardSource, { filename: "startup-dom-binding-guard-integration.js" }));
assert.match(specRendererSource, /els\.bottleSpecs\.innerHTML/);
assert.match(specRendererSource, /els\.labelSpecs\.innerHTML/);
assert.match(machineRendererSource, /els\.heads\.innerHTML/);
assert.match(bootstrapSource, /startup-dom-binding-recovery-v33-20260807-1306/);
assert.ok(
  bootstrapSource.indexOf("app/startup-dom-binding-guard-integration.js")
    < bootstrapSource.indexOf("app/controllers/workspace-action-service.js"),
  "The DOM binding guard must run before workspace controllers and startup rendering."
);

const selectors = [
  "#bottleSpecs",
  "#labelSpecs",
  "#buildInputs",
  "#program",
  "#simulation",
  "#heads",
  "#stations"
];
const nodes = Object.fromEntries(selectors.map((selector) => [selector, { selector }]));
const context = {
  console,
  els: {
    buildInputs: nodes["#buildInputs"],
    program: nodes["#program"],
    simulation: nodes["#simulation"],
    stations: nodes["#stations"]
  },
  document: {
    querySelector(selector) {
      return nodes[selector] || null;
    }
  }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(guardSource, context, { filename: "startup-dom-binding-guard-integration.js" });

assert.equal(context.LabelerStartupDomBindingGuard.installed, true);
assert.equal(context.els.bottleSpecs, nodes["#bottleSpecs"]);
assert.equal(context.els.labelSpecs, nodes["#labelSpecs"]);
assert.equal(context.els.heads, nodes["#heads"]);
assert.deepEqual(
  Array.from(context.LabelerStartupDomBindingGuard.repaired).sort(),
  ["bottleSpecs", "heads", "labelSpecs"].sort()
);
assert.equal(context.window.els, context.els, "Modular controllers must see the same binding registry as legacy renderers.");

console.log("Startup DOM binding guard regression passed.");
