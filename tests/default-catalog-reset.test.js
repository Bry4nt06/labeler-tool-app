"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const manifest = JSON.parse(read("config/company-default-settings.json"));
assert.equal(manifest.companyDefaultsVersion, 12);
assert.equal(manifest.settings.activeMapId, "map-apl-default");
assert.deepEqual(manifest.fragments.mapLibrary, [
  "./config/default-programs/map-apl-6-aggregate.json",
  "./config/default-programs/map-45h-topmodul-3-label-apl-wipe-down-pads.json"
]);
assert.equal(manifest.fragments.mapLibrary.length, 2);
assert.deepEqual(manifest.fragments.labelSpecs, []);

const maps = manifest.fragments.mapLibrary.map((source) =>
  JSON.parse(read(source.replace(/^\.\//, "")))
);
assert.deepEqual(maps.map((map) => map.name), [
  "APL 6-Aggregate",
  "Standard 45H TopModul Wipe-Down Pads"
]);
assert.deepEqual(maps.map((map) => map.id), [
  "map-apl-default",
  "map-45h-topmodul-3-label-apl-wipe-down-pads"
]);
maps.forEach((map) => {
  assert.equal(map.headCount, 45);
  assert.equal(map.applicationMode, "apl");
  assert.equal(map.companyDefaultProgram, true);
  assert.equal(map.protectedDefaultMap, true);
  assert.equal(map.companyDefaultProgramVersion, 12);
  assert.equal(map.defaultCatalogVersion, 12);
});

const apl = maps[0];
assert.deepEqual(apl.machineSettings, {
  direction: "ccw",
  radius: 250,
  referencePitchRadiusMm: 572.958,
  encoderCountsPerRev: 4096,
  servoGearRatio: 1,
  autoScaleTableMap: true,
  zeroAngle: 0,
  maxMoveRatio: 21
});
assert.deepEqual(apl.depths, {
  spender: 12,
  opRoller: 14,
  nonOpRoller: -18,
  wipeInner: -4,
  wipeOuter: 16
});

const catalogSource = read("app/company-default-map-catalog-integration.js");
assert.doesNotThrow(() => new vm.Script(catalogSource));
assert.match(catalogSource, /map-apl-default/);
assert.match(catalogSource, /map-45h-topmodul-3-label-apl-wipe-down-pads/);
assert.match(catalogSource, /map-blank-apl/);
assert.match(catalogSource, /map-l85-workbook-reference-3-label-apl/);
assert.match(catalogSource, /isRetiredPackagedMap/);
assert.match(catalogSource, /protectedDefaultMap: true/);

const legacyWorkbookSource = read("app/workbook-reference-map-library-integration.js");
assert.doesNotThrow(() => new vm.Script(legacyWorkbookSource));
assert.match(legacyWorkbookSource, /addsDefaultMap: false/);
assert.doesNotMatch(legacyWorkbookSource, /state\.mapLibrary\.push/);
assert.doesNotMatch(legacyWorkbookSource, /map-l85-workbook-reference-3-label-apl/);

const deletionGuard = read("app/protected-default-map-integration.js");
assert.doesNotThrow(() => new vm.Script(deletionGuard));
assert.match(deletionGuard, /protectedDefaultMap/);
assert.match(deletionGuard, /protected default/);

console.log("Approved two-map default catalog regression passed.");
