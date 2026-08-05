"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app", "workspace-panel-visibility-guard-integration.js"), "utf8");
const startup = fs.readFileSync(path.join(root, "app.js"), "utf8");

assert.doesNotThrow(() => new vm.Script(source));
assert.match(source, /style\.setProperty\("display", "none", "important"\)/);
assert.match(source, /Object\.freeze\(\["simulation", "diagnostics"\]\)/);
assert.match(source, /attributeFilter:\s*\["class"\]/);
assert.match(startup, /workspace-panel-visibility-guard-integration\.js/);
assert.match(startup, /workspace-visibility-v1/);

function element(active = false) {
  const styles = new Map();
  const attributes = new Map();
  return {
    dataset: {},
    style: {
      setProperty(name, value, priority) { styles.set(name, { value, priority }); },
      removeProperty(name) { styles.delete(name); },
      getPropertyValue(name) { return styles.get(name)?.value || ""; },
      getPropertyPriority(name) { return styles.get(name)?.priority || ""; }
    },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    removeAttribute(name) { attributes.delete(name); },
    getAttribute(name) { return attributes.has(name) ? attributes.get(name) : null; },
    classList: { contains(name) { return name === "active" && active; } },
    click() {}
  };
}

const simulationTab = element(true);
const simulationPanel = element(true);
const diagnosticsTab = element(false);
const diagnosticsPanel = element(false);
const specsTab = element(false);
let fallbackClicks = 0;
specsTab.click = () => { fallbackClicks += 1; };

const tabMap = {
  simulation: simulationTab,
  diagnostics: diagnosticsTab,
  specs: specsTab
};
const panelMap = {
  simulation: simulationPanel,
  diagnostics: diagnosticsPanel
};
const listeners = {};
let observerOptions = null;
let storedPreferences = JSON.stringify({ hiddenPanels: ["simulation", "diagnostics"] });

const document = {
  readyState: "complete",
  body: {},
  querySelector(selector) {
    if (selector === ".tabs") {
      return {
        querySelector(inner) {
          const match = inner.match(/data-tab="([^"]+)"/);
          return match ? tabMap[match[1]] || null : null;
        }
      };
    }
    const panelMatch = selector.match(/^#(.+)$/);
    if (panelMatch) return panelMap[panelMatch[1]] || null;
    const tabMatch = selector.match(/^\.tabs \[data-tab="([^"]+)"\]$/);
    if (tabMatch) return tabMap[tabMatch[1]] || null;
    return null;
  },
  addEventListener(type, callback) { listeners[type] = callback; }
};

class MutationObserver {
  constructor(callback) { this.callback = callback; }
  observe(target, options) { observerOptions = options; }
}

const context = {
  console,
  document,
  MutationObserver,
  localStorage: { getItem() { return storedPreferences; } },
  state: { activeTab: "simulation" },
  requestAnimationFrame(callback) { callback(); },
  setTimeout(callback) { callback(); },
  addEventListener() {}
};
context.window = context;
context.globalThis = context;
vm.runInNewContext(source, context);

assert.equal(context.LabelerWorkspacePanelVisibilityGuard.installed, true);
assert.equal(simulationTab.style.getPropertyValue("display"), "none");
assert.equal(simulationTab.style.getPropertyPriority("display"), "important");
assert.equal(simulationPanel.style.getPropertyValue("display"), "none");
assert.equal(diagnosticsTab.style.getPropertyValue("display"), "none");
assert.equal(diagnosticsPanel.style.getPropertyValue("display"), "none");
assert.equal(simulationPanel.getAttribute("aria-hidden"), "true");
assert.equal(fallbackClicks > 0, true, "An active hidden panel must fall back to a visible workspace tab.");
assert.deepEqual(Array.from(observerOptions.attributeFilter), ["class"]);
assert.equal(observerOptions.childList, true);
assert.equal(observerOptions.subtree, true);

storedPreferences = JSON.stringify({ hiddenPanels: [] });
context.LabelerWorkspacePanelVisibilityGuard.apply();
assert.equal(simulationTab.style.getPropertyValue("display"), "");
assert.equal(simulationPanel.style.getPropertyValue("display"), "");
assert.equal(diagnosticsTab.style.getPropertyValue("display"), "");
assert.equal(diagnosticsPanel.style.getPropertyValue("display"), "");
assert.equal(simulationPanel.getAttribute("aria-hidden"), null);

console.log("Workspace panel visibility guard regression passed.");
