"use strict";

(function installProtectedDefaultMapGuard(global) {
  if (global.LabelerProtectedDefaultMapGuard?.installed) return;

  const RETRY_MS = 50;

  function install() {
    const actions = global.LabelerMapBuilderDomainActions;
    if (!actions?.deleteActiveMachineMap) return false;
    if (actions.protectedDefaultMapGuardV1) return true;

    const baseDelete = actions.deleteActiveMachineMap.bind(actions);
    function deleteActiveMachineMap() {
      const map = typeof global.activeMachineMap === "function"
        ? global.activeMachineMap()
        : global.state?.mapLibrary?.find((item) => item?.id === global.state?.activeMapId);
      if (map?.protectedDefaultMap === true || map?.companyDefaultProgram === true) {
        global.alert?.(`"${map.name || "This map"}" is a protected default. Duplicate it to create a deletable copy.`);
        return false;
      }
      return baseDelete();
    }

    global.LabelerMapBuilderDomainActions = Object.freeze({
      ...actions,
      deleteActiveMachineMap,
      protectedDefaultMapGuardV1: true
    });
    global.LabelerProtectedDefaultMapGuard = Object.freeze({ installed: true });
    return true;
  }

  function wait() {
    if (!install()) global.setTimeout(wait, RETRY_MS);
  }

  wait();
})(typeof window !== "undefined" ? window : globalThis);
