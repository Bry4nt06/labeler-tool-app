"use strict";

(function bridgeLegacyDrivers(global) {
  const registry = global.LabelerDriverRegistry;
  if (!registry || global.LabelerDriverBridge) return;

  const definitions = Object.freeze([
    ["geometry.label", "LabelerGeometryDriver", []],
    ["application.mode", "LabelerApplicationModeDriver", []],
    ["mechanical.motion", "LabelerMechanicalMotionDriver", ["geometry.label"]],
    ["mechanical.coldGlue", "LabelerColdGlueMotionDriver", ["geometry.label", "mechanical.motion"]],
    ["servo.command", "LabelerServoCommandDriver", []],
    ["planning.motion", "LabelerMotionPlannerDriver", ["mechanical.motion", "servo.command"]],
    ["planning.mechanicalEvents", "LabelerMechanicalEventPlannerDriver", ["mechanical.motion"]],
    ["translation.profile", "LabelerProfileTranslatorDriver", ["servo.command"]],
    ["validation.motion", "LabelerMotionValidationDriver", ["servo.command"]],
    ["validation.pipeline", "LabelerServoPipelineValidator", ["servo.command"]],
    ["validation.machineGrammar", "LabelerMachineFamilyGrammarDriver", ["servo.command"]],
    ["simulation.replay", "LabelerServoReplayDriver", ["servo.command"]],
    ["optimization.program", "LabelerProgramOptimizerDriver", ["validation.pipeline"]],
    ["quality.release", "LabelerReleaseReadinessDriver", ["validation.pipeline", "validation.machineGrammar"]],
    ["profile.apl", "LabelerAplProfileDriver", ["geometry.label", "servo.command"]]
  ]);

  function refresh() {
    const adopted = [];
    definitions.forEach(([name, legacyGlobal, dependencies]) => {
      if (registry.adopt(name, legacyGlobal, { dependencies })) adopted.push(name);
    });
    return adopted;
  }

  global.LabelerDriverBridge = Object.freeze({ definitions, refresh });
  refresh();
})(window);
