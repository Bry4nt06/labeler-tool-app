"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "app", "locked-map-brand-selector-integration.js"),
  "utf8"
);

assert.match(source, /function maps\(\)/, "Selector must use the full map library.");
assert.match(
  source,
  /const library = maps\(\);\s*viewer\.hidden = library\.length === 0;/s,
  "Selector must remain visible whenever maps exist."
);
assert.match(
  source,
  /library\.forEach\(\(map\) => fragment\.appendChild\(optionFor\(map, lockedIds\)\)\)/,
  "Every map must be rendered in library order."
);
assert.match(
  source,
  /option\.textContent = `\$\{lockedIds\.has\(id\) \? "🔒 " : ""\}/,
  "Locked maps must be marked in the list."
);
assert.match(
  source,
  /loadMachineMapIntoRuntime\(map, true\)/,
  "Selecting a map must load it into runtime."
);
assert.match(source, /Machine Map /, "The control must be labeled as a map selector.");
assert.match(source, /Map Locked • Specs & Inputs Editable/, "Locked state copy must remain clear.");
assert.match(source, /Map Editable/, "Unlocked maps must show an editable state.");
assert.doesNotMatch(
  source,
  /compatibleBrandSpecs|applySelectedBrand|dataset\.brand/,
  "The top-left control must no longer contain label-spec selection logic."
);

console.log("Machine-map selector regression passed.");
