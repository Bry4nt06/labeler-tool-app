"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const bootstrap = read("app/bootstrap.js");
const app = read("app.js");
const exportsService = read("app/export-service.js");
const globalActions = read("app/global-actions.js");
const animation = read("app/animation-runtime.js");
const startup = read("app/startup-runtime.js");
const serviceWorker = read("service-worker.js");

const expectedModules = [
  "app/export-service.js",
  "app/global-actions.js",
  "app/animation-runtime.js",
  "app/startup-runtime.js"
];
expectedModules.forEach((modulePath) => {
  const escaped = modulePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(bootstrap, new RegExp(escaped));
  assert.match(serviceWorker, new RegExp(escaped));
});

assert.match(bootstrap, /ServoForgeBootstrapReady/);
assert.match(app, /await window\.ServoForgeBootstrapReady/);
assert.match(app, /await initializeLabelerApp\(\)/);

assert.doesNotMatch(bootstrap, /STAGING_RELEASE_VERSION|clearStaleStagingRuntime|checkForToolUpdates|bindGlobalActions|animationFrame/);
assert.doesNotMatch(bootstrap, /0\.8\.3|0\.7\.99/);
assert.doesNotMatch(startup, /0\.7\.99/);

assert.match(exportsService, /function download\(/);
assert.match(exportsService, /function roundedServoExportRow\(/);
assert.match(globalActions, /function bindGlobalActions\(/);
assert.match(animation, /function startAnimationLoop\(/);
assert.match(animation, /function stopAnimationLoop\(/);
assert.match(startup, /function initializeLabelerApp\(/);
assert.match(startup, /function loadSimulatorRuntime\(/);
assert.match(startup, /SERVOFORGE_RELEASE_VERSION/);

console.log("Modular bootstrap boundary regression passed.");
