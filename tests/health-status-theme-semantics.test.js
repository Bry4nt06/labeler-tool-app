"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const healthSource = read("app", "controllers", "health-status-ui-controller.js");
const themeSource = read("app", "controllers", "theme-presets-controller.js");
const bootstrapSource = read("app", "bootstrap.js");
const startupSource = read("app", "startup-runtime.js");

[
  ["health-status-ui-controller.js", healthSource],
  ["theme-presets-controller.js", themeSource],
  ["bootstrap.js", bootstrapSource],
  ["startup-runtime.js", startupSource]
].forEach(([filename, source]) => {
  assert.doesNotThrow(() => new vm.Script(source, { filename }), `${filename} must parse.`);
});

class FakeElement {
  constructor() {
    this.dataset = {};
    this.classList = { contains: () => false };
    this.textContent = "";
  }
  querySelectorAll() { return []; }
  querySelector() { return null; }
  closest() { return null; }
}

const installedStyles = [];
const documentElement = new FakeElement();
const document = {
  documentElement,
  head: { appendChild(node) { installedStyles.push(node); } },
  createElement() { return { id: "", textContent: "" }; },
  getElementById() { return null; },
  querySelectorAll() { return []; },
  querySelector() { return null; }
};
class FakeMutationObserver {
  constructor(callback) { this.callback = callback; }
  observe() {}
}
const sandbox = {
  window: null,
  globalThis: null,
  document,
  Element: FakeElement,
  MutationObserver: FakeMutationObserver,
  console,
  requestAnimationFrame(callback) { callback(); }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(healthSource, sandbox, { filename: "health-status-ui-controller.js" });

const controller = sandbox.LabelerHealthStatusUiController;
assert.ok(controller?.installed);
assert.strictEqual(controller.healthFromValue("PASS"), "good");
assert.strictEqual(controller.healthFromValue("READY"), "good");
assert.strictEqual(controller.healthFromValue("REVIEW"), "warn");
assert.strictEqual(controller.healthFromValue("WARNING"), "warn");
assert.strictEqual(controller.healthFromValue("FAIL"), "bad");
assert.strictEqual(controller.healthFromValue("ACTION"), "bad");
assert.strictEqual(controller.healthFromValue("RUNNING"), "info");
assert.strictEqual(controller.healthFromText("Optimization HEALTHY"), "good");
assert.strictEqual(controller.healthFromText("Servo Pipeline PASS"), "good");
assert.strictEqual(controller.healthFromText("Needs WARNING review"), "warn");
assert.strictEqual(controller.healthFromText("Validation FAILURE"), "bad");
assert.strictEqual(controller.healthForCount("0 faults", "bad"), "good");
assert.strictEqual(controller.healthForCount("2 faults", "bad"), "bad");
assert.strictEqual(controller.healthForCount("0 warnings", "warn"), "good");
assert.strictEqual(controller.healthForCount("3 warnings", "warn"), "warn");
assert.strictEqual(installedStyles.length, 1);

const css = installedStyles[0].textContent;
[
  "--health-good: #39d77d",
  "--health-warn: #e7b93f",
  "--health-bad: #ed5965",
  "--health-info: #59aee9",
  "--health-good-glow: rgba(57, 215, 125, 0.08)",
  "--health-warn-glow: rgba(231, 185, 63, 0.08)",
  "--health-bad-glow: rgba(237, 89, 101, 0.09)",
  ".pipeline-validation-summary",
  ".servo-program-health-strip",
  ".release-readiness-status",
  ".program-optimizer-panel",
  ".program-optimizer-badge[data-health]",
  ".diagnostics-workspace-status",
  ".sensor-status-pass",
  ".sensor-status-fail",
  ".map-fault-notice",
  "0 0 5px var(--health-current-glow)"
].forEach((token) => assert.ok(css.includes(token), `Missing health visual coverage: ${token}`));
assert.ok(!css.includes("0 0 18px var(--health-current-glow)"), "Health cards must not use the previous heavy glow.");
assert.ok(!css.includes("0 0 16px var(--health-current-glow)"), "Validation notices must not use the previous heavy glow.");

assert.ok(themeSource.includes('body[data-theme="red-black"]'));
assert.ok(themeSource.includes("--green: #a45a63;"));
assert.ok(!healthSource.includes("var(--green)"), "Health semantics must not inherit the theme accent variable.");
assert.ok(healthSource.includes("KEYWORD_STATUS_SELECTOR"));
assert.ok(healthSource.includes("healthFromText(element.textContent)"));
assert.ok(healthSource.includes('setHealth(notice, notice.classList.contains("bad") ? "bad" : notice.classList.contains("warn") ? "warn" : "good")'));

const controllerPath = "app/controllers/health-status-ui-controller.js";
assert.ok(bootstrapSource.includes(controllerPath));
assert.ok(bootstrapSource.indexOf("app/controllers/theme-presets-controller.js") < bootstrapSource.indexOf(controllerPath));
assert.ok(bootstrapSource.indexOf(controllerPath) < bootstrapSource.indexOf("app/controllers/settings-controller.js"));
assert.ok(startupSource.includes("LabelerHealthStatusUiController?.installed"));
assert.ok(startupSource.includes("LabelerHealthStatusUiController.refresh()"));

console.log("Theme-independent health keyword and restrained glow regression passed.");
