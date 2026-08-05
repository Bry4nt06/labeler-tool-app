"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const commandPresentation = read("app/servo-command-presentation.js");
const programRenderer = read("app/servo-program-table-renderer.js");
const simulationRenderer = read("app/simulation-table-renderer.js");
const programController = read("app/controllers/servo-program-controller.js");
const simulationEditor = read("app/controllers/simulation-editor-controller.js");
const delegatedEvents = read("app/controllers/setup-event-controller-integration.js");
const bootstrap = read("app/bootstrap.js");
const manifest = read("app/simulation-collapsible-integration.js");

[programRenderer, simulationRenderer].forEach((source) => {
  assert.doesNotMatch(source, /addEventListener\(/, "Servo and simulation renderers must not attach row listeners.");
  assert.doesNotMatch(source, /saveCurrentSettings\(/, "Presentation modules must not own persistence.");
  assert.doesNotMatch(source, /\brender\(\)/, "Presentation modules must not recursively own the render cycle.");
});
assert.match(commandPresentation, /function servoCommandControl\(/, "Shared command presentation must own command controls.");
assert.match(programRenderer, /data-program-field="command"/, "Program command controls require delegated field metadata.");
assert.match(programRenderer, /data-program-field="tableAngle"/, "Program table overrides require delegated field metadata.");
assert.match(programRenderer, /data-program-field="action"/, "Program actions require delegated field metadata.");
assert.match(simulationRenderer, /dataset\.simulationSourceIndex/, "Simulation rows require stable source indexes.");
assert.match(simulationRenderer, /data-simulation-field="command"/, "Simulation commands require delegated field metadata.");
assert.match(simulationRenderer, /id="saveServoProfile"/, "Saved-profile control IDs must remain stable.");
assert.match(simulationRenderer, /class="danger small-button simulation-delete-line"/, "Simulation delete controls must remain present.");

assert.match(programController, /function updateOverride\(/, "Servo controller must own angle overrides.");
assert.match(programController, /setServoAngleOverride/, "Servo controller must delegate override storage to the existing service.");
assert.match(simulationEditor, /function saveProfile\(/, "Simulation editor controller must own profile creation.");
assert.match(simulationEditor, /function loadProfile\(/, "Simulation editor controller must own profile loading.");
assert.match(simulationEditor, /function updateTableAngle\(/, "Simulation editor controller must own table-angle edits.");
assert.match(delegatedEvents, /LabelerServoProgramController/, "Delegated events must require the Servo Program controller.");
assert.match(delegatedEvents, /LabelerSimulationEditorController/, "Delegated events must require the Simulation editor controller.");
assert.match(delegatedEvents, /handleProgramChange/, "Delegated events must route Servo Program changes.");
assert.match(delegatedEvents, /handleSimulationChange/, "Delegated events must route Simulation changes.");

const programControllerIndex = bootstrap.indexOf("app/controllers/servo-program-controller.js");
const simulationEditorIndex = bootstrap.indexOf("app/controllers/simulation-editor-controller.js");
const eventBoundaryIndex = bootstrap.indexOf("app/controllers/setup-event-controller-integration.js");
assert.ok(programControllerIndex >= 0, "Servo Program controller must load in bootstrap.");
assert.ok(simulationEditorIndex > programControllerIndex, "Simulation editor must load after Servo Program controller.");
assert.ok(eventBoundaryIndex > simulationEditorIndex, "Delegated events must load after both controllers.");

const commandIndex = manifest.indexOf("app/servo-command-presentation.js");
const programIndex = manifest.indexOf("app/servo-program-table-renderer.js");
const simulationIndex = manifest.indexOf("app/simulation-table-renderer.js");
const coordinatorIndex = manifest.indexOf("app/rendering-coordinator-integration.js");
const diagnosticsIndex = manifest.indexOf("app/validation-diagnostics-integration.js");
assert.ok(commandIndex >= 0, "Shared command presentation must be in the feature manifest.");
assert.ok(programIndex > commandIndex, "Program renderer must load after command presentation.");
assert.ok(simulationIndex > programIndex, "Simulation renderer must load after Program renderer.");
assert.ok(coordinatorIndex > simulationIndex, "Render coordinator must install after focused renderers.");
assert.ok(diagnosticsIndex > coordinatorIndex, "Diagnostics must remain the final feature stage.");

const state = {
  program: [{ hmi: 1, plc: 0, cmd: 3, tableAngle: 10, plateAngle: 20, action: "Rest" }],
  servoOverrides: {},
  activeMapId: "map-1",
  applicationMode: "apl",
  selectedBrand: "Brand",
  selectedBottle: "Bottle",
  simulation: { useCustom: true, lines: [{ cmd: 3, tableAngle: 10, plateAngle: 20, action: "Rest" }] },
  servoProfileLibrary: [],
  mapLibrary: []
};
const calls = [];
const sandbox = {
  window: {},
  state,
  document: { querySelector: () => null },
  JSON,
  Date,
  Math,
  LabelerWorkspaceActionService: {
    number(value, fallback = 0) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    },
    call(name, ...args) {
      calls.push(["call", name, ...args]);
      if (name === "setServoAngleOverride") {
        const [, field, raw] = args;
        state.servoOverrides[field] = raw;
      }
      if (name === "deepClone") return JSON.parse(JSON.stringify(args[0]));
      return undefined;
    },
    execute(options = {}) {
      const result = options.mutate?.();
      calls.push(["execute", options.persist, options.render]);
      return result;
    },
    render(target) { calls.push(["render", target]); }
  },
  alert() {},
  confirm() { return true; }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(programController, sandbox);
vm.runInContext(simulationEditor, sandbox);

sandbox.LabelerServoProgramController.updateCommand(1, 7);
assert.strictEqual(state.program[0].cmd, 7);
sandbox.LabelerServoProgramController.updateAction(1, "Correction");
assert.strictEqual(state.program[0].action, "Correction");
sandbox.LabelerServoProgramController.updateOverride(1, "tableAngle", "12.5");
assert.strictEqual(state.servoOverrides.tableAngle, "12.5");
sandbox.LabelerSimulationEditorController.updateTableAngle(0, "14.5");
assert.strictEqual(state.simulation.lines[0].tableAngle, 14.5);
sandbox.LabelerSimulationEditorController.updatePlateAngle(0, "");
assert.strictEqual(state.simulation.lines[0].plateAngle, null);
sandbox.LabelerSimulationEditorController.updateAction(0, "Custom rest");
assert.strictEqual(state.simulation.lines[0].action, "Custom rest");

console.log("Servo Program and Simulation presentation ownership regression passed.");
