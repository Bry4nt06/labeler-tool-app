"use strict";

(function installAplOverlappingPadHandoff(global) {
  if (global.LabelerAplOverlappingPadHandoffIntegration?.installed) return;

  const RETRY_MS = 25;

  function contactDriver() {
    return global.LabelerDriverRegistry?.resolve?.("profile.aplContactWindow")
      || global.LabelerAplContactWindowDriver
      || null;
  }

  function install() {
    const driver = contactDriver();
    const original = global.generatedAplMapDrivenProfile;
    if (!driver?.splitOverlappingPadObjects || typeof original !== "function") return false;
    if (original.aplOverlappingPadHandoffV1) return true;

    const wrapped = function generatedAplMapDrivenProfileWithPadHandoff(machineMap) {
      const sourceObjects = Array.isArray(machineMap?.objects) ? machineMap.objects : [];
      const prepared = driver.splitOverlappingPadObjects(sourceObjects, {
        commandGapDeg: 0.5,
        minimumSpanDeg: 0.1
      });
      const profileMap = prepared.adjustments.length
        ? { ...machineMap, objects: prepared.objects }
        : machineMap;
      const rows = original.call(this, profileMap);

      if (prepared.adjustments.length && global.state?.motionPlan) {
        global.state.motionPlan.overlappingPadHandoffs = prepared.adjustments;
        global.state.motionPlan.padContactWindowDriver = "profile.aplContactWindow";
      }
      return rows;
    };
    wrapped.aplOverlappingPadHandoffV1 = true;
    wrapped.previousGenerator = original;

    global.generatedAplMapDrivenProfile = wrapped;
    global.LabelerAplMapProfileGenerator = Object.freeze({
      ...(global.LabelerAplMapProfileGenerator || {}),
      generate: wrapped
    });
    global.LabelerAplOverlappingPadHandoffIntegration = Object.freeze({
      installed: true,
      refresh: install
    });
    return true;
  }

  function wait() {
    if (!install()) global.setTimeout(wait, RETRY_MS);
  }

  Promise.resolve(global.ServoForgeProfileGenerationReady)
    .catch(() => null)
    .finally(wait);
})(typeof window !== "undefined" ? window : globalThis);
