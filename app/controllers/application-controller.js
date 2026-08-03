"use strict";

(function installApplicationController(global) {
  const actions = global.LabelerWorkspaceActionService;

  function setMode(value) {
    const mode = value === "cold-glue" ? "cold-glue" : "apl";
    const map = actions.call("editableMachineMap");
    if (!map) return;
    actions.execute({
      mutate() {
        state.applicationMode = mode;
        map.applicationMode = mode;
        if (mode === "cold-glue") {
          map.objects = actions.call("normalizeColdGlueMap", map.objects) || map.objects;
          map.restoreDefaultObjects = false;
        }
        map.objects = (map.objects || []).map((item) => actions.call("normalizeBuilderObject", item, mode, 6) || item);
        actions.call("ensureSelectedBrandForApplication");
        actions.call("loadMachineMapIntoRuntime", map, true);
      },
      persist: true,
      render: ["all", "builder"]
    });
  }

  function selectMachineMap(mapId) {
    const selected = state.mapLibrary.find((map) => map.id === mapId);
    if (!selected) return;
    actions.execute({
      mutate() {
        actions.call("clearServoSimulationForSelectedMap");
        actions.call("loadMachineMapIntoRuntime", selected, true);
      },
      persist: true,
      render: ["all", "builder"]
    });
  }

  global.LabelerApplicationController = Object.freeze({
    setMode,
    selectMachineMap
  });
})(window);