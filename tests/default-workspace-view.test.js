"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const defaultsSource = fs.readFileSync(path.join(root, "app", "defaults.js"), "utf8");
const persistenceSource = fs.readFileSync(path.join(root, "app", "persistence.js"), "utf8");
const companyDefaults = JSON.parse(fs.readFileSync(path.join(root, "config", "company-default-settings.json"), "utf8"));

assert.doesNotThrow(() => new vm.Script(defaultsSource, { filename: "defaults.js" }));
assert.ok(
  defaultsSource.includes('workspaceView: "direct"'),
  "The in-memory workspace default must be Direct."
);
assert.strictEqual(
  companyDefaults.settings.workspaceView,
  "direct",
  "The company settings seed must also default to Direct."
);
assert.ok(
  persistenceSource.includes('"workspaceView"'),
  "Saved workspace preferences must continue to hydrate from storage."
);

console.log("Direct default workspace view regression passed.");
