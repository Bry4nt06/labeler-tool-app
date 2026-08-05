"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(
  path.join(root, "app", "sensor-editor-compact-interaction-integration.js"),
  "utf8"
);

assert.match(source, /global\.addEventListener\("input",[\s\S]*true\);/, "sensor input must be captured at window level");
assert.match(source, /event\.stopImmediatePropagation\(\)/, "legacy document input regeneration must be blocked");
assert.doesNotMatch(source, /refreshAfterBuilderEdit\(/, "live sensor typing must not rebuild the Map Builder row");
assert.match(source, /if \(finalize\) scheduleCommit\(0\)/, "full sensor regeneration must wait for a committed value");
assert.doesNotMatch(source, /scheduleCommit\(finalize \? 0 : 260\)/, "ordinary keystrokes must not schedule a row-destroying regeneration");
assert.match(source, /builder-row-title\{display:none!important\}/, "duplicate sensor name row must be removed");
assert.match(source, /grid-auto-rows:min-content!important/, "sensor grid rows must collapse to content height");
assert.match(source, /flex:0 0 auto!important/, "activation helper text must not reserve vertical flex space");
assert.match(source, /data-sensor-aim-centerline/, "sensor aim must render a full centerline reference");
assert.match(source, /rayLength = Math\.max\(120, radius \* 2 \+ 38\)/, "sensor centerline must extend across the table");
assert.match(source, /direction\.setAttribute\("x2", "38"\)/, "sensor direction must include a solid arrow stem");

console.log("Compact sensor editor interaction regression passed.");
