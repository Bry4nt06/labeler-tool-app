"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const startup = fs.readFileSync(path.join(root, "app/startup-runtime.js"), "utf8");
const builder = fs.readFileSync(path.join(root, "app/map-builder-controller.js"), "utf8");
const renderer = fs.readFileSync(path.join(root, "app/map-builder-renderer.js"), "utf8");

const stateInitialization = startup.indexOf("LabelerSetupStateController.initialize()");
const builderRender = startup.indexOf("renderWipeDownBuilder()");
const builderBinding = startup.indexOf("bindWipeDownBuilder()");
const applicationRender = startup.indexOf("\n    render();");

assert.ok(stateInitialization >= 0, "Startup must initialize saved setup state.");
assert.ok(builderRender > stateInitialization, "Map Builder must populate after saved state is restored.");
assert.ok(builderBinding > builderRender, "Map Builder controls must bind after their initial population.");
assert.ok(applicationRender > builderBinding, "Application rendering must continue after Map Builder initialization.");

assert.match(renderer, /function\s+renderWipeDownBuilder\s*\(/, "Map Builder renderer must expose initial population.");
assert.match(renderer, /renderMapLibraryControls\(\)/, "Initial population must render the saved map controls.");
assert.match(renderer, /els\.wipeBuilderList\.innerHTML\s*=\s*""/, "Initial population must rebuild the configured-object list.");
assert.match(builder, /function\s+bindWipeDownBuilder\s*\(/, "Map Builder controller must expose its binding stage.");
assert.match(builder, /if\s*\(!els\.addBuilderObject\)\s*return/, "Builder binding must retain its DOM availability guard.");

console.log("Map Builder startup population regression passed.");
