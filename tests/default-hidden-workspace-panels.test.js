"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "../app.js"), "utf8");
const startupIndex = source.indexOf("(async function startServoForge");
assert.ok(startupIndex > 0, "The workspace-default prelude must run before application startup.");
const prelude = source.slice(0, startupIndex);
assert.doesNotThrow(() => new vm.Script(prelude, { filename: "app-workspace-defaults.js" }));

function execute(initial = {}) {
  const values = new Map(Object.entries(initial));
  const context = {
    localStorage: {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { values.set(key, String(value)); }
    }
  };
  vm.createContext(context);
  vm.runInContext(prelude, context);
  return values;
}

const preferencesKey = "servoforge-developer-preferences-v1";
const migrationKey = "servoforge-default-hidden-panels-v1-applied";

const fresh = execute();
assert.deepEqual(
  JSON.parse(fresh.get(preferencesKey)).hiddenPanels.sort(),
  ["diagnostics", "simulation"],
  "A fresh load must hide Servo Simulation and Diagnostics."
);
assert.equal(fresh.get(migrationKey), "true");

const existing = execute({
  [preferencesKey]: JSON.stringify({ lockedMapIds: ["map-1"], hiddenPanels: ["program"] })
});
assert.deepEqual(
  JSON.parse(existing.get(preferencesKey)),
  {
    lockedMapIds: ["map-1"],
    hiddenPanels: ["program", "simulation", "diagnostics"]
  },
  "The one-time migration must preserve existing workspace settings while adding the two default-hidden panels."
);

const manuallyShown = execute({
  [preferencesKey]: JSON.stringify({ hiddenPanels: [] }),
  [migrationKey]: "true"
});
assert.deepEqual(
  JSON.parse(manuallyShown.get(preferencesKey)).hiddenPanels,
  [],
  "After the user shows the panels, later loads must preserve that manual choice."
);

console.log("Default hidden workspace panels regression passed.");
