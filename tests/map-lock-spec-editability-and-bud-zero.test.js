"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const lockSource = fs.readFileSync(
  path.join(root, "app", "locked-map-brand-selector-integration.js"),
  "utf8"
);
const catalogSource = fs.readFileSync(
  path.join(root, "app", "company-default-programs-integration.js"),
  "utf8"
);
const labels = JSON.parse(
  fs.readFileSync(path.join(root, "config", "default-programs", "label-specs.json"), "utf8")
);

assert.match(
  lockSource,
  /restoreSurfaceControls\(document\.querySelector\("#specs"\)\)/,
  "Locked maps must not disable the Specs workspace."
);
assert.match(
  lockSource,
  /restoreSurfaceControls\(document\.querySelector\("#buildInputs"\)\)/,
  "Locked maps must not disable Build Inputs."
);
assert.match(
  lockSource,
  /const map = activeMap\(\);\s*const locked = activeMapIsLocked\(map\);\s*viewer\.hidden = !locked;/s,
  "The top-left label selector must follow the active map lock state only."
);
assert.match(
  lockSource,
  /Map Locked • Specs & Inputs Editable/,
  "The lock badge must describe what remains editable."
);
assert.doesNotMatch(
  lockSource,
  /function lockedMaps\(/,
  "The label selector must not render from every locked map."
);
assert.match(
  catalogSource,
  /\(spec\) => `\$\{key\(spec\?\.applicationMode \|\| "apl"\)\}\|\$\{key\(spec\?\.brand\)\}`/,
  "Company catalog reconciliation must update official specs by application and brand."
);

const budZero = labels.find((spec) => spec.brand === "12oz Bud Zero");
assert.ok(budZero, "The 12oz Bud Zero company specification must exist.");
assert.strictEqual(
  budZero.bottleType,
  "LNNR - 12 Oz",
  "The Bud Zero profile must retain its LNNR bottle association."
);
assert.strictEqual(
  budZero.neckBottomCircumferenceMm,
  105,
  "The Bud Zero neck-bottom circumference must use the LNNR neck geometry, not the duplicated 65 mm label length."
);

const degreesFromMm = (mm, circumference) => 360 * mm / circumference;
const centerLineFrontDeg = -15;
const neckContactDeg = degreesFromMm(4.4, budZero.neckBottomCircumferenceMm);
const neckHalfDeg = degreesFromMm(
  budZero.neckBottomCurveMm,
  budZero.neckBottomCircumferenceMm
) / 2;
const neckTurnDeg = centerLineFrontDeg + neckContactDeg + neckHalfDeg + 66;
const referenceTableTravelDeg = 10.5;
const ratio = Math.abs(neckTurnDeg) / referenceTableTravelDeg;

assert.ok(
  ratio < 21,
  `Bud Zero reference neck turn must remain below the 21:1 threshold; received ${ratio.toFixed(2)}:1.`
);

const badCircumferenceRatio = Math.abs(
  centerLineFrontDeg
  + degreesFromMm(4.4, 65)
  + degreesFromMm(budZero.neckBottomCurveMm, 65) / 2
  + 66
) / referenceTableTravelDeg;

assert.ok(
  badCircumferenceRatio > 21,
  "The regression fixture must prove that the former 65 mm circumference caused the over-speed turn."
);

console.log("Map-lock Specs editability and Bud Zero geometry regression passed.");
