"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const fitSource = fs.readFileSync(path.join(root, "app", "build-inputs-fit-integration.js"), "utf8");
const workspaceSource = fs.readFileSync(path.join(root, "app", "workspace-developer-integration.js"), "utf8");

assert.doesNotThrow(() => new vm.Script(appSource, { filename: "app.js" }));
assert.doesNotThrow(() => new vm.Script(fitSource, { filename: "build-inputs-fit-integration.js" }));
assert.doesNotThrow(() => new vm.Script(workspaceSource, { filename: "workspace-developer-integration.js" }));

assert.match(fitSource, /container-type:\s*inline-size/, "Build Inputs must respond to its panel width rather than the full viewport.");
assert.match(fitSource, /grid-template-columns:\s*minmax\(280px,\s*0\.85fr\)\s*minmax\(0,\s*1\.15fr\)/, "The workbook column must be allowed to shrink inside the workspace.");
assert.match(fitSource, /min-width:\s*0\s*!important/, "Legacy table minimum widths must be neutralized.");
assert.match(fitSource, /table-layout:\s*fixed/, "Workbook columns must remain inside the available panel width.");
assert.match(fitSource, /width:\s*56%/, "Workbook field names must leave visible space for values.");
assert.match(fitSource, /width:\s*44%/, "Workbook values must be brought into the visible table area.");
assert.match(fitSource, /@container\s*\(max-width:\s*720px\)/, "Build cards must stack based on their actual container width.");
assert.match(fitSource, /MutationObserver/, "Responsive classes must be restored after Build Inputs rerenders.");

const fitIndex = appSource.indexOf('loadScript("app/build-inputs-fit-integration.js"');
const workspaceIndex = appSource.indexOf('loadScript("app/workspace-developer-integration.js"');
const guardIndex = appSource.indexOf('loadScript("app/workspace-panel-visibility-guard-integration.js"');
assert.ok(fitIndex >= 0, "The responsive Build Inputs integration must load through primary startup.");
assert.ok(workspaceIndex >= 0, "The Settings workspace visibility menu must load through primary startup.");
assert.ok(guardIndex > workspaceIndex, "Workspace visibility controls must initialize before their visibility guard.");
assert.match(appSource, /production-build-inputs-fit-workspace-pages-20260806-v1/);

assert.match(workspaceSource, /workspace-panel-visibility/);
assert.match(workspaceSource, /workspacePanelToggles/);
assert.match(workspaceSource, /Hide \$\{escapeHtml\(label\)\}/, "Settings must render a Hide control for every workspace page definition.");
assert.match(workspaceSource, /\["buildInputs",\s*"Build Inputs"\]/);
assert.match(workspaceSource, /\["program",\s*"Servo Program"\]/);

console.log("Build Inputs fit and Settings page visibility regression passed.");
