"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const actionSource = fs.readFileSync(path.join(root, "app", "controllers", "map-builder-action-controller.js"), "utf8");
const eventSource = fs.readFileSync(path.join(root, "app", "controllers", "map-builder-event-controller.js"), "utf8");

assert.doesNotThrow(() => new vm.Script(actionSource, { filename: "map-builder-action-controller.js" }));
assert.doesNotThrow(() => new vm.Script(eventSource, { filename: "map-builder-event-controller.js" }));

const calls = [];
const context = {
  window: null,
  LabelerMapBuilderDomainActions: {
    addBuilderObjectFromControls() {
      calls.push(["domain-add"]);
      return { id: "new-object" };
    },
    saveMapDefinitionFromControls(event) {
      calls.push(["domain-save", event?.type]);
      return true;
    }
  },
  LabelerWorkspaceActionService: {
    call(name, ...args) {
      calls.push(["fallback", name, ...args]);
      return "fallback-result";
    }
  }
};
context.window = context;
vm.createContext(context);
vm.runInContext(actionSource, context);

const controller = context.LabelerMapBuilderActionController;
assert.ok(controller?.installed, "Map Builder action controller must install.");
assert.deepStrictEqual(controller.addObject(), { id: "new-object" });
assert.deepStrictEqual(calls.shift(), ["domain-add"], "Add Object must use the explicit Map Builder domain registry.");

assert.strictEqual(controller.saveDefinition("click"), true);
assert.deepStrictEqual(calls.shift(), ["domain-save", "click"]);

assert.strictEqual(controller.resetMap(), "fallback-result");
assert.deepStrictEqual(calls.shift(), ["fallback", "resetActiveBuilderMap"]);

assert.ok(actionSource.includes("global.LabelerMapBuilderDomainActions?.[name]"));
assert.ok(eventSource.includes('target.closest("#addBuilderObject")'));
assert.ok(eventSource.includes("builder.addObject()"));
assert.ok(eventSource.includes("consume(event, true)"));

console.log("Map Builder action dispatch regression passed.");
