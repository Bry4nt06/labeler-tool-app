"use strict";

(function installStationTableController(global) {
  const actions = global.LabelerWorkspaceActionService;

  function rows() {
    return actions.call("applicationMapPointRows") || [];
  }

  function rowAt(index) {
    const value = Number(index);
    return Number.isInteger(value) ? rows()[value] : null;
  }

  function updateName(index, value) {
    const point = rowAt(index);
    if (!point || point.station || point.fixed || point.fixedName) return;
    actions.execute({
      mutate() {
        const globalPoint = state.mapPoints.find((entry) => entry.name === point.name && !actions.call("mapPointStation", entry.name));
        if (globalPoint) globalPoint.name = String(value || point.name);
      },
      render: "all"
    });
  }

  function updateAngle(index, value) {
    const point = rowAt(index);
    if (!point || point.fixed) return;
    actions.execute({
      mutate() {
        point.angle = actions.number(value, point.angle);
        if (typeof point.update === "function") point.update(point.angle);
      },
      syncAssemblyMap: true,
      render: ["all", "assembly"]
    });
  }

  global.LabelerStationTableController = Object.freeze({
    updateName,
    updateAngle
  });
})(window);
