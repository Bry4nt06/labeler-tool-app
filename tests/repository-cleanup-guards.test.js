"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const retiredColdGlueV1 = path.join(root, "app/cold-glue-gripper-sequence-integration.js");
assert.equal(
  fs.existsSync(retiredColdGlueV1),
  false,
  "The superseded Cold Glue gripper sequence v1 file must not return."
);

const loader = read("app/simulation-collapsible-integration.js");
assert.match(loader, /coreDrivers:\s*Object\.freeze/);
assert.match(loader, /aplGeneration:\s*Object\.freeze/);
assert.match(loader, /coldGlue:\s*Object\.freeze/);
assert.match(loader, /mapBuilder:\s*Object\.freeze/);
assert.match(loader, /profilePipeline:\s*Object\.freeze/);
assert.match(loader, /finalProfileStages:\s*Object\.freeze/);
assert.match(loader, /LabelerIntegrationFeatureManifest/);
assert.match(loader, /cold-glue-gripper-sequence-integration-v2\.js/);
assert.doesNotMatch(
  loader,
  /["']app\/cold-glue-gripper-sequence-integration\.js\?/,
  "The feature loader must not reference the deleted v1 integration."
);

const moduleReferences = [...loader.matchAll(/["']([^"']+\.js\?v=[^"']+)["']/g)]
  .map((match) => match[1]);
assert.ok(moduleReferences.length > 30, "Expected the full integration manifest.");
assert.equal(
  new Set(moduleReferences).size,
  moduleReferences.length,
  "Every dynamically loaded script must have one feature owner."
);

const zoneCompatibility = read("app/zone-site-configuration.js");
assert.match(zoneCompatibility, /Compatibility-only API/);
assert.doesNotMatch(zoneCompatibility, /addEventListener\(\s*["']click["']/);
assert.doesNotMatch(zoneCompatibility, /MutationObserver/);
assert.doesNotMatch(zoneCompatibility, /bindRetiredLocationPromptGuard/);

const globalMapIntegration = read("app/remove-zone-site-integration.js");
assert.match(globalMapIntegration, /addEventListener\(\s*["']click["']/);
assert.match(globalMapIntegration, /MutationObserver/);
assert.match(globalMapIntegration, /wrapCreateMachineMap/);
assert.match(globalMapIntegration, /wrapSettingsSnapshot/);

console.log("Repository cleanup guards passed.");
