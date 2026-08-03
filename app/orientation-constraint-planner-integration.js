"use strict";

(function installOrientationConstraintPlannerIntegration(global) {
  const RETRY_MS = 50;
  const STAGE_ID = "orientation.map-objects";
  let installed = false;
  let validationInstalled = false;
  let observer = null;
  let resolveReady;

  global.ServoForgeOrientationConstraintPlannerReady = new Promise((resolve) => {
    resolveReady = resolve;
  });

  const constraintDriver = () => global.LabelerDriverRegistry?.resolve("profile.orientationConstraintPlanner")
    || global.LabelerOrientationConstraintPlannerDriver
    || null;
  const pipelineDriver = () => global.LabelerDriverRegistry?.resolve("profile.pipeline")
    || global.LabelerProfilePipelineDriver
    || null;
  const targetService = () => global.LabelerOrientationConstraintTargetService;
  const planner = () => global.LabelerOrientationConstraintProgramPlanner;

  function sensorDiagnostic(sensor, map) {
    const svc = targetService();
    const plan = (global.state?.motionPlan?.orientationConstraintPlans || [])
      .find((entry) => String(entry.objectId) === String(sensor.id));
    const section = plan?.section || constraintDriver()?.resolveSection({
      item: sensor,
      rows: global.state?.program || [],
      before: svc.num(sensor.angle, sensor.start),
      activeApplications: svc.applications(),
      stationSections: svc.stationSections(map),
      fallbackStationSection: (station) => typeof global.labelSectionForStation === "function"
        ? global.labelSectionForStation(station)
        : ""
    })?.section;
    if (!section || section === "none") return null;
    const placement = svc.num(sensor.angle, sensor.start);
    const current = svc.plateAt(placement, global.state?.program || []);
    const target = svc.targetFor(sensor, section, global.state?.program || [], current, placement);
    const visibility = svc.visibilityAt({ item: sensor, target }, current);
    const required = Math.min(100, Math.max(1, svc.num(sensor.requiredVisibilityPercent, target.required || 50)));
    return {
      plan,
      section,
      placement,
      visibility,
      required,
      visible: visibility + 0.001 >= required
    };
  }

  function installValidation() {
    if (validationInstalled || typeof global.validate !== "function") return validationInstalled;
    const base = global.validate;
    if (base.orientationConstraintPlannerValidation) {
      validationInstalled = true;
      return true;
    }
    const wrapped = function validateWithOrientationConstraintPlanner(...args) {
      let notes = base.apply(this, args);
      if (!Array.isArray(notes)) notes = [];
      const svc = targetService();
      const map = svc?.activeMap();
      if (!svc || !map || map.applicationMode !== "apl") return notes;

      (map.objects || []).filter((item) => item?.kind === "sensor").forEach((sensor) => {
        const result = sensorDiagnostic(sensor, map);
        if (!result) return;
        const name = sensor.name || "Label Sensor";
        const station = Number(sensor.station);
        notes = notes.filter((note) => {
          if (String(note?.[2]?.objectId || "") === String(sensor.id)) return false;
          const message = String(note?.[1] || "");
          return !(message.includes(name) && message.includes(`Station ${station}`));
        });
        const source = result.plan?.autoTargetSource === "last-applied-label"
          ? "the last completed label application"
          : "the selected label target";
        const merged = result.plan?.mergedConstraintGroup
          ? " Its correction is merged with the overlapping coder/sensor orientation."
          : result.plan?.satisfiedByExistingMotion
            ? " The existing servo motion already satisfies the sensor."
            : "";
        notes.push([result.visible ? "ok" : "warn", result.visible
          ? `${name} at Station ${station} can view ${svc.done(result.visibility)}% of the ${svc.sectionName(result.section).toLowerCase()} label (${svc.done(result.required)}% required) using ${source}.${merged}`
          : `${name} at Station ${station} can view ${svc.done(result.visibility)}% of the ${svc.sectionName(result.section).toLowerCase()} label at ${svc.done(result.placement)}° table; ${svc.done(result.required)}% is required. Move the sensor later or provide open travel for the shared orientation turn.`, { objectId: sensor.id }]);
      });
      return notes;
    };
    wrapped.orientationConstraintPlannerValidation = true;
    wrapped.previousValidate = base;
    global.validate = wrapped;
    validationInstalled = true;
    return true;
  }

  function decorateAutoOptions() {
    document.querySelectorAll('#builderOrientationLabel option[value="auto"], [data-object-orientation-field="orientationLabelSection"] option[value="auto"]')
      .forEach((option) => { option.textContent = "Auto — last applied label"; });
  }

  function installOptionObserver() {
    if (observer || typeof MutationObserver !== "function") return;
    decorateAutoOptions();
    observer = new MutationObserver(decorateAutoOptions);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function install() {
    if (installed) {
      installValidation();
      return true;
    }
    const pipeline = pipelineDriver();
    const process = planner()?.process;
    if (typeof global.state === "undefined"
      || typeof global.generatedServoProfile !== "function"
      || !constraintDriver()?.chooseSharedTarget
      || !targetService()?.targetFor
      || typeof process !== "function"
      || !pipeline?.registerStage
      || !pipeline.getStage?.(STAGE_ID)) return false;

    pipeline.registerStage({
      id: STAGE_ID,
      phase: "orientation",
      order: 300,
      source: "app/orientation-constraint-planner-integration.js",
      description: "Resolve the last applied label and merge compatible sensor/coder orientation turns.",
      process
    });
    global.LabelerMapObjectOrientationProcessor = process;
    global.LabelerOrientationConstraintPlannerProcessor = process;
    global.LabelerOrientationConstraintPlannerInstalled = true;
    installOptionObserver();
    installValidation();
    installed = true;

    try {
      if (typeof global.applyGeneratedServoProfile === "function") global.applyGeneratedServoProfile();
      if (typeof global.render === "function") global.render();
      if (typeof global.renderValidation === "function") global.renderValidation();
    } catch (error) {
      console.error("Unable to apply the orientation constraint planner.", error);
    }
    resolveReady?.({ installed: true, stageId: STAGE_ID });
    resolveReady = null;
    return true;
  }

  function wait() {
    if (!install()) global.setTimeout(wait, RETRY_MS);
    else if (!installValidation()) global.setTimeout(wait, RETRY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait, { once: true });
  else wait();
})(typeof window !== "undefined" ? window : globalThis);
