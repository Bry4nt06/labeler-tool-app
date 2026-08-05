"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const guard = fs.readFileSync(
  path.join(root, "app", "sensor-editor-focus-guard-integration.js"),
  "utf8"
);
const startup = fs.readFileSync(path.join(root, "app.js"), "utf8");

assert.match(
  guard,
  /BUILDER_ROOT_SELECTOR\s*=\s*"#wipeBuilderList"/,
  "sensor observers must be scoped to the Map Builder instead of the whole application"
);
assert.match(
  guard,
  /target\s*===\s*global\.document\?\.documentElement[\s\S]*nativeObserver\.observe\(builderRoot, options\)/,
  "whole-document sensor observers must be redirected to the Map Builder"
);
assert.match(
  guard,
  /nodeContainsSelector\(node, SENSOR_ROW_SELECTOR\)[\s\S]*nodeContainsSelector\(node, AUTO_OPTION_SELECTOR\)/,
  "only structural sensor rows and orientation options should trigger observer callbacks"
);
assert.doesNotMatch(
  guard,
  /callback\(records/,
  "unfiltered animation and text mutations must never reach sensor observer callbacks"
);
assert.match(
  startup,
  /sensor-editor-focus-guard-integration\.js[\s\S]*orientation-constraint-planner-integration\.js[\s\S]*sensor-station-label-inheritance-integration\.js/,
  "the focus guard must load before the two legacy whole-document observers"
);
assert.match(
  startup,
  /waitForScopedObservers\?\.\(2, 2000\)[\s\S]*restoreMutationObserver/,
  "the native MutationObserver must be restored after both sensor observers are safely scoped"
);
assert.match(
  startup,
  /sensor-(?:editor-v14|release-v1[5-9])/,
  "the focus guard and later sensor policies must use a cache-busting sensor build id"
);

console.log("Sensor editor focus guard regression passed.");
