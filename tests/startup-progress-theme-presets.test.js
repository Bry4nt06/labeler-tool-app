"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const geometrySource = read("drivers", "geometry", "label-geometry-driver.js");
const themeSource = read("app", "controllers", "theme-presets-controller.js");
const specsUiSource = read("app", "controllers", "specification-table-ui-controller.js");
const bootstrapSource = read("app", "bootstrap.js");
const appSource = read("app.js");
const startupSource = read("app", "startup-runtime.js");

[
  ["label-geometry-driver.js", geometrySource],
  ["theme-presets-controller.js", themeSource],
  ["specification-table-ui-controller.js", specsUiSource],
  ["bootstrap.js", bootstrapSource],
  ["app.js", appSource],
  ["startup-runtime.js", startupSource]
].forEach(([filename, source]) => {
  assert.doesNotThrow(() => new vm.Script(source, { filename }), `${filename} must parse.`);
});

assert.ok(geometrySource.includes("ServoForgeStartupProgress"));
assert.ok(geometrySource.includes("servoforgeStartupOverlay"));
assert.ok(geometrySource.includes("assets/labeler-tool-icon.svg"));
assert.ok(geometrySource.includes('role="progressbar"'));
assert.ok(geometrySource.includes("Loading core modules"));
assert.ok(geometrySource.includes("function complete"));
assert.ok(geometrySource.includes("function fail"));
assert.ok(geometrySource.includes('body.classList.add("servoforge-initializing")'));
assert.ok(geometrySource.includes('body.classList.remove("servoforge-initializing")'));

const expectedThemes = Object.freeze({
  "red-black": "Carbon Crimson",
  "dark-gold": "Carbon Brass",
  "burnt-orange": "Graphite Copper",
  "forge-gradient": "Midnight Alloy"
});

Object.entries(expectedThemes).forEach(([preset, label]) => {
  assert.ok(themeSource.includes(`value: "${preset}"`), `${preset} option must be registered.`);
  assert.ok(themeSource.includes(`label: "${label}"`), `${preset} must use its layout-oriented name.`);
  assert.ok(themeSource.includes(`body[data-theme="${preset}"]`), `${preset} CSS must be installed.`);
});

[
  "--panel: #14181d;",
  "--panel: #161917;",
  "--panel: #171a1e;",
  "--panel: #141a20;",
  "--panel-hi: #1c2228;",
  "--panel-hi: #1f2320;",
  "--panel-hi: #20252a;",
  "--panel-hi: #1c242b;",
  "--input: #0a0e12;",
  "--input: #0c0f0d;",
  "--input: #0d1013;",
  "--input: #0a0f14;"
].forEach((token) => assert.ok(themeSource.includes(token), `Missing workspace surface token: ${token}`));

[
  "--green: #a45a63;",
  "--green: #a38b55;",
  "--green: #a96c47;",
  "--green: #6f948c;"
].forEach((token) => assert.ok(themeSource.includes(token), `Missing controlled accent token: ${token}`));

[
  "Carbon Crimson",
  "Carbon Brass",
  "Graphite Copper",
  "Midnight Alloy",
  "color-mix(in srgb, var(--accent) 5%, transparent)",
  "color-mix(in srgb, var(--panel-hi) 91%, var(--input) 9%)",
  ".top-settings-menu > summary",
  ".switch-control input:checked + .switch-track",
  "background-attachment: fixed"
].forEach((token) => assert.ok(themeSource.includes(token), `Missing layout integration: ${token}`));

[
  "Red & black",
  "Dark gold",
  "Burnt orange",
  "Forge gradient",
  "--green: #a5535a;",
  "--green: #a7653e;",
  "--panel: #191b1f;"
].forEach((token) => assert.ok(!themeSource.includes(token), `Previous theme design must remain removed: ${token}`));

assert.ok(specsUiSource.includes("var(--accent, var(--green))"));
assert.ok(specsUiSource.includes("#specs tr.selected-brand-spec > td"));
assert.ok(specsUiSource.includes("color-mix(in srgb, var(--accent, var(--green)) 22%, var(--panel))"));
assert.ok(specsUiSource.includes("background-clip: padding-box"));
assert.ok(specsUiSource.includes("#specs .spec-row-actions"));
assert.ok(specsUiSource.includes("flex-wrap: nowrap !important"));
assert.ok(specsUiSource.includes("#specs .spec-row-actions > .spec-icon-button"));
assert.ok(specsUiSource.includes("flex: 0 0 32px"));
assert.ok(specsUiSource.includes("border-color: var(--line)"));
assert.ok(specsUiSource.includes("box-shadow: none"));
assert.ok(!specsUiSource.includes('content: "Selected"'), "The row highlight must communicate selection without a text marker.");
assert.ok(!specsUiSource.includes("td:first-child::after"), "Selected marker must not remain beneath the first cell.");
assert.ok(!specsUiSource.includes("td:last-child::before"), "Selected marker must not occupy the action cell.");
assert.ok(!specsUiSource.includes("min-width: 150px"), "Selected action cells must not impose a table-expanding minimum width.");
assert.ok(!specsUiSource.includes("rgba(65, 200, 137, 0.17)"));
assert.ok(!specsUiSource.includes("rgba(65, 200, 137, 0.2)"));

const themePath = "app/controllers/theme-presets-controller.js";
assert.ok(bootstrapSource.includes(themePath));
assert.ok(bootstrapSource.indexOf(themePath) < bootstrapSource.indexOf("app/controllers/settings-controller.js"));
assert.ok(startupSource.includes("LabelerThemePresetsController?.installed"));

[
  "Loading profile engine",
  "Loading geometry and planning",
  "Loading Map Builder",
  "Loading feature integrations",
  "Loading workspace controllers",
  "ServoForge ready"
].forEach((milestone) => assert.ok(appSource.includes(milestone)));
assert.ok(appSource.includes("progress?.complete"));
assert.ok(appSource.includes("progress?.fail"));

[
  "Verifying workspace controllers",
  "Restoring saved settings",
  "Loading company defaults",
  "Preparing machine maps",
  "Applying workspace settings",
  "Rendering ServoForge workspace",
  "Registering update service"
].forEach((milestone) => assert.ok(startupSource.includes(milestone)));
assert.ok(startupSource.includes("return true;"));
assert.ok(startupSource.includes("return false;"));

console.log("Startup progress, themes, and highlight-only selected Label Spec regression passed.");
