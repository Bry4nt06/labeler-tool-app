(function (global) {
  "use strict";

  const PREPARATION_STAGES = Object.freeze([
    "ensurePersistentApplicationMaps",
    "ensureSelectedBrandForApplication",
    "applyLabelLengthStationRules",
    "syncApplicationMapToLegacyState",
    "syncMapPointsFromAssemblies",
    "applyGeneratedServoProfile"
  ]);

  const PRESENTATION_STAGES = Object.freeze([
    "renderMap",
    "renderStations",
    "renderBottleSpecs",
    "renderLabelSpecs",
    "renderBuildInputs",
    "renderProgram",
    "renderSimulation",
    "renderHeads",
    "renderValidation",
    "renderTopControls"
  ]);

  function runStages(stageNames, handlers, phase) {
    if (!handlers || typeof handlers !== "object") {
      throw new TypeError(`Rendering ${phase} handlers are required.`);
    }
    const completed = [];
    stageNames.forEach((name) => {
      const handler = handlers[name];
      if (typeof handler !== "function") {
        throw new Error(`Rendering ${phase} stage "${name}" is not available.`);
      }
      handler();
      completed.push(name);
    });
    return completed;
  }

  function prepare(handlers) {
    return runStages(PREPARATION_STAGES, handlers, "preparation");
  }

  function present(handlers) {
    return runStages(PRESENTATION_STAGES, handlers, "presentation");
  }

  function run(handlers) {
    return Object.freeze({
      prepared: Object.freeze(prepare(handlers)),
      presented: Object.freeze(present(handlers))
    });
  }

  const api = Object.freeze({
    PREPARATION_STAGES,
    PRESENTATION_STAGES,
    prepare,
    present,
    run
  });

  global.LabelerRenderCycleDriver = api;
  global.LabelerDriverRegistry?.register?.("render.cycle", api, {
    version: 1,
    responsibilities: ["render-preparation-order", "presentation-order", "render-cycle-execution"]
  });
})(window);
