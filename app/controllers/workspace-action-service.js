"use strict";

(function installWorkspaceActionService(global) {
  function call(name, ...args) {
    const fn = global[name];
    return typeof fn === "function" ? fn(...args) : undefined;
  }

  function renderTargets(targets) {
    const requested = Array.isArray(targets) ? targets : targets ? [targets] : [];
    const unique = new Set(requested);
    if (unique.has("all")) call("render");
    if (unique.has("map")) call("renderMap");
    if (unique.has("simulation-map")) call("renderSimulationMap");
    if (unique.has("animation")) call("renderAnimationFrame");
    if (unique.has("builder")) call("renderWipeDownBuilder");
    if (unique.has("assembly")) call("renderAssemblyEditor");
    if (unique.has("validation")) call("renderValidation");
    if (unique.has("simulation")) call("renderSimulation");
    if (unique.has("labeler-map")) call("renderLabelerMapReference");
  }

  function execute(options = {}) {
    const result = typeof options.mutate === "function" ? options.mutate() : undefined;
    if (options.syncMap) call("syncApplicationMapToLegacyState");
    if (options.syncAssemblyMap) call("syncMapPointsFromAssemblies");
    if (options.regenerate) call("applyGeneratedServoProfile");
    if (options.persist) call("saveCurrentSettings");
    renderTargets(options.render);
    if (typeof options.after === "function") options.after(result);
    return result;
  }

  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  global.LabelerWorkspaceActionService = Object.freeze({
    execute,
    render: renderTargets,
    call,
    number
  });
})(window);