"use strict";

(function installSensorPostInspectionReleaseIntegration(global) {
  if (global.LabelerSensorPostInspectionReleaseIntegration?.installed) return;

  const RETRY_MS = 50;
  const STAGE_ID = "orientation.map-objects";
  let installed = false;

  function pipeline() {
    return global.LabelerDriverRegistry?.resolve?.("profile.pipeline")
      || global.LabelerProfilePipelineDriver
      || null;
  }

  function releaseDriver() {
    return global.LabelerDriverRegistry?.resolve?.("profile.sensorPostInspectionRelease")
      || global.LabelerSensorPostInspectionReleaseDriver
      || null;
  }

  function updateMotionPlan(result) {
    if (!global.state?.motionPlan || !result) return;
    global.state.motionPlan.rows = result.rows;
    global.state.motionPlan.sensorPostInspectionReleases = result.releases;
    global.state.motionPlan.finalPlateAngle = result.rows.at(-1)?.plateAngle;

    const releasesByObject = new Map();
    result.releases.forEach((release) => {
      const ids = [release.objectId, release.sensorId, ...(release.sensorIds || [])]
        .filter((value) => value !== null && value !== undefined)
        .map((value) => String(value));
      ids.forEach((id) => releasesByObject.set(id, release));
    });

    const plans = global.state.motionPlan.orientationConstraintPlans;
    if (Array.isArray(plans)) {
      plans.forEach((plan) => {
        const release = releasesByObject.get(String(plan.objectId || ""));
        if (!release) return;
        Object.assign(plan, {
          setupBeginsAfterInspection: true,
          releaseTableAngle: release.releaseTableAngle,
          releaseDestinationTableAngle: release.destinationTableAngle,
          releaseDestinationPlateAngle: release.destinationPlateAngle,
          releaseDestinationAction: release.destinationAction,
          releaseRotation: release.plannedRotation,
          releaseRatio: release.plannedRatio,
          releaseExceedsMoveRatio: release.exceedsMoveRatio
        });
      });
    }
  }

  function wrapStage() {
    const profilePipeline = pipeline();
    const driver = releaseDriver();
    const stage = profilePipeline?.getStage?.(STAGE_ID);
    if (!profilePipeline?.registerStage || !stage || !driver?.apply) return false;
    if (stage.process?.sensorPostInspectionReleaseV1) return true;

    const baseProcess = stage.process;
    const wrappedProcess = function orientationPlannerWithPostInspectionRelease(sourceRows, context) {
      const outputRows = baseProcess.call(this, sourceRows, context);
      const result = driver.apply({
        sourceRows,
        outputRows,
        maxMoveRatio: global.state?.maxMoveRatio,
        formatter: typeof global.finishAngle === "function" ? global.finishAngle : undefined
      });
      updateMotionPlan(result);
      return result.rows;
    };
    wrappedProcess.sensorPostInspectionReleaseV1 = true;
    wrappedProcess.previousProcess = baseProcess;

    profilePipeline.registerStage({
      ...stage,
      source: "app/sensor-post-inspection-release-integration.js",
      description: `${stage.description || "Resolve sensor orientation."} Release the bottle immediately after inspection so setup for the next aggregate can begin.`,
      process: wrappedProcess
    });

    global.LabelerMapObjectOrientationProcessor = wrappedProcess;
    global.LabelerOrientationConstraintPlannerProcessor = wrappedProcess;
    return true;
  }

  function install() {
    if (installed) return true;
    if (!global.state || !wrapStage()) return false;
    installed = true;

    global.LabelerSensorPostInspectionReleaseIntegration = Object.freeze({
      installed: true,
      stageId: STAGE_ID,
      refresh: wrapStage
    });

    try {
      global.applyGeneratedServoProfile?.();
      global.renderValidation?.();
      global.renderMap?.();
    } catch (error) {
      console.error("Unable to apply the post-inspection sensor release policy.", error);
    }
    return true;
  }

  function wait() {
    if (!install()) global.setTimeout(wait, RETRY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait, { once: true });
  else wait();
})(typeof window !== "undefined" ? window : globalThis);
