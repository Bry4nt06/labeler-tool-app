"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const rendererSource = read("app", "specification-table-renderer.js");
const duplicateSource = read("app", "spec-row-duplicate-integration.js");
const sectionSource = read("app", "label-spec-section-selection-integration.js");
const uiSource = read("app", "controllers", "specification-table-ui-controller.js");

[
  ["specification-table-renderer.js", rendererSource],
  ["spec-row-duplicate-integration.js", duplicateSource],
  ["label-spec-section-selection-integration.js", sectionSource],
  ["specification-table-ui-controller.js", uiSource]
].forEach(([filename, source]) => {
  assert.doesNotThrow(() => new vm.Script(source, { filename }), `${filename} must parse.`);
});

assert.ok(rendererSource.includes("function specificationActionIcon"));
assert.ok(rendererSource.includes('class="spec-action-icon"'));
assert.ok(rendererSource.includes("spec-icon-button spec-delete-button"));
assert.ok(rendererSource.includes('aria-label="Delete ${description}"'));
assert.ok(rendererSource.includes('title="Delete ${description}"'));
assert.ok(rendererSource.includes('specificationActionIcon("delete")'));
assert.ok(!rendererSource.includes(">Delete</button>"), "Delete actions must remain icon-only.");

assert.ok(duplicateSource.includes("button.innerHTML = duplicateIcon()"));
assert.ok(duplicateSource.includes("spec-icon-button spec-duplicate-button"));
assert.ok(duplicateSource.includes('button.setAttribute("aria-label", `Duplicate ${label}`)'));
assert.ok(duplicateSource.includes("button.title = `Duplicate ${label}`"));
assert.ok(!duplicateSource.includes('button.textContent = "Duplicate"'), "Duplicate actions must remain icon-only.");
assert.ok(duplicateSource.includes("flex: 0 0 32px"));
assert.ok(duplicateSource.includes("width: 32px"));
assert.ok(duplicateSource.includes("height: 30px"));

assert.ok(sectionSource.includes("PRESENT_THRESHOLD_MM = 1"));
assert.ok(sectionSource.includes("dimensionFlags"));
assert.ok(sectionSource.includes("clearLegacySectionFlags"));
assert.ok(sectionSource.includes("applyMapVisibility"));
assert.ok(sectionSource.includes("applyBuilderVisibility"));
assert.ok(!sectionSource.includes("label-brand-section-layout"), "Brand inputs must not be crowded by section controls.");
assert.ok(!sectionSource.includes("label-section-checkboxes"), "Neck, Body, and Back checkboxes must remain removed.");
assert.ok(!sectionSource.includes("data-label-section"), "Manual section controls must remain removed.");

assert.ok(uiSource.includes("flex-wrap: nowrap !important"));
assert.ok(uiSource.includes("#specs .spec-row-actions > .spec-icon-button"));
assert.ok(uiSource.includes("flex: 0 0 32px"));
assert.ok(uiSource.includes("#specs tr.selected-brand-spec > td"));
assert.ok(!uiSource.includes('content: "Selected"'), "The selected row highlight must stand on its own.");
assert.ok(!uiSource.includes("padding-top: 31px"), "Selected actions must remain on one compact line.");
assert.ok(!uiSource.includes("position: absolute"), "Specs actions must not use an overlay marker.");
assert.ok(!uiSource.includes("flex: 1 1 70px"), "Icon buttons must not expand the action column.");

console.log("Compact Specs actions and dimension-driven label presence regression passed.");
