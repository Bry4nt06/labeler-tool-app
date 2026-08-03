"use strict";

(function installProfilePipelineOrchestrator() {
  const RETRY_MS = 50;
  let installed = false;

  function pipelineDriver() {
    return window.LabelerDriverRegistry?.resolve("profile.pipeline")
      || window.LabelerProfilePipelineDriver
      || null;
  }

  function activeMapSafe() {
    try {
      return typeof activeMachineMap === "function" ? activeMachineMap() : null;
    } catch {
      return null;
    }
  }

  function publishTrace(result) {
    if (!state?.motionPlan || typeof state.motionPlan !== "object") return;
    state.motionPlan.profilePipeline = true;
    state.motionPlan.profilePipelineDriver = "profile.pipeline";
    state.motionPlan.profilePipelineStages = result.stageIds;
    state.motionPlan.profilePipelineTrace = result.trace;
    state.motionPlan.rows = result.rows;
    state.motionPlan.finalPlateAngle = result.rows.at(-1)?.plateAngle;
  }

  function install() {
    if (installed) return true;
    const pipeline = pipelineDriver();
    if (typeof generatedServoProfile !== "function"
      || typeof state === "undefined"
      || !pipeline?.run
      || !pipeline.listStages().length) return false;

    const base = generatedServoProfile;
    generatedServoProfile = function generatedServoProfileWithOrderedPipeline(...args) {
      const sourceRows = base.apply(this, args);
      const result = pipeline.run(sourceRows, {
        state,
        map: activeMapSafe(),
        applicationMode: state?.applicationMode,
        generatedArguments: args
      });
      publishTrace(result);
      return result.rows;
    };
    generatedServoProfile.profilePipelineOrchestrator = true;
    generatedServoProfile.profilePipelineBase = base;
    window.generatedServoProfile = generatedServoProfile;
    window.LabelerProfilePipelineOrchestratorInstalled = true;
    installed = true;

    try {
      if (typeof applyGeneratedServoProfile === "function") applyGeneratedServoProfile();
      if (typeof render === "function") render();
    } catch (error) {
      console.error("Unable to apply the ordered profile pipeline.", error);
    }
    return true;
  }

  function wait() {
    if (!install()) window.setTimeout(wait, RETRY_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wait, { once: true });
  } else {
    wait();
  }
})();
