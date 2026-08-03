"use strict";

(function installRenderingCoordinator(global) {
  const driver = global.LabelerRenderCycleDriver;
  if (!driver) throw new Error("The render-cycle driver must load before the rendering coordinator.");

  function required(name) {
    const handler = global[name];
    if (typeof handler !== "function") {
      throw new Error(`Rendering dependency "${name}" is not available.`);
    }
    return handler;
  }

  function handlers() {
    return {
      ensurePersistentApplicationMaps: () => required("ensurePersistentApplicationMaps")(),
      ensureSelectedBrandForApplication: () => required("ensureSelectedBrandForApplication")(),
      applyLabelLengthStationRules: () => required("applyLabelLengthStationRules")(),
      syncApplicationMapToLegacyState: () => required("syncApplicationMapToLegacyState")(),
      syncMapPointsFromAssemblies: () => required("syncMapPointsFromAssemblies")(),
      applyGeneratedServoProfile: () => required("applyGeneratedServoProfile")(),
      renderMap: () => required("renderMap")(),
      renderStations: () => {
        if (global.els?.stations) required("renderStations")();
      },
      renderBottleSpecs: () => required("renderBottleSpecs")(),
      renderLabelSpecs: () => required("renderLabelSpecs")(),
      renderBuildInputs: () => required("renderBuildInputs")(),
      renderProgram: () => required("renderProgram")(),
      renderSimulation: () => required("renderSimulation")(),
      renderHeads: () => required("renderHeads")(),
      renderValidation: () => required("renderValidation")(),
      renderTopControls: () => required("renderTopControls")()
    };
  }

  function renderApplication() {
    return driver.run(handlers());
  }
  renderApplication.renderingCoordinator = true;

  global.render = renderApplication;
  try { globalThis.render = renderApplication; } catch { }

  global.LabelerRenderingCoordinator = Object.freeze({
    driver,
    handlers,
    render: renderApplication
  });
})(window);
