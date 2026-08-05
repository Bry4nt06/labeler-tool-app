"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const rendererSource = fs.readFileSync(path.join(root, "app", "specification-table-renderer.js"), "utf8");
const uiSource = fs.readFileSync(path.join(root, "app", "controllers", "specification-table-ui-controller.js"), "utf8");
const bootstrapSource = fs.readFileSync(path.join(root, "app", "bootstrap.js"), "utf8");
const startupSource = fs.readFileSync(path.join(root, "app", "startup-runtime.js"), "utf8");

const appended = [];
const sandbox = {
  window: null,
  globalThis: null,
  document: {
    getElementById: () => null,
    createElement(tagName) {
      return { tagName, id: "", textContent: "" };
    },
    head: {
      appendChild(node) { appended.push(node); }
    }
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

assert.doesNotThrow(() => vm.runInContext(uiSource, sandbox, { filename: "specification-table-ui-controller.js" }));
assert.strictEqual(sandbox.LabelerSpecificationTableUiController.installed, true);
assert.strictEqual(appended.length, 1);
assert.strictEqual(appended[0].id, "specificationTableUiStyles");
assert.ok(appended[0].textContent.includes("position: sticky"));
assert.ok(appended[0].textContent.includes("top: 0"));
assert.ok(appended[0].textContent.includes("selected-brand-spec"));
assert.ok(appended[0].textContent.includes('content: "Selected"'));

assert.ok(rendererSource.includes('tr.classList.add("selected-brand-spec")'));
assert.ok(rendererSource.includes('tr.setAttribute("aria-current", "true")'));
assert.ok(rendererSource.includes('String(spec.brand ?? "") === String(state.selectedBrand ?? "")'));

const uiControllerPath = "app/controllers/specification-table-ui-controller.js";
assert.ok(bootstrapSource.includes(uiControllerPath));
assert.ok(bootstrapSource.indexOf("app/controllers/label-section-event-controller.js") < bootstrapSource.indexOf(uiControllerPath));
assert.ok(bootstrapSource.indexOf(uiControllerPath) < bootstrapSource.indexOf("app/controllers/build-inputs-controller.js"));
assert.ok(startupSource.includes("LabelerSpecificationTableUiController?.installed"));

console.log("Specs selection highlight and sticky header regression passed.");
