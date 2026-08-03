"use strict";

(function installSettingsController(global) {
  const actions = global.LabelerWorkspaceActionService;

  function commit(key, value, options = {}) {
    return actions.execute({
      mutate() { state[key] = value; return value; },
      syncMap: Boolean(options.syncMap),
      persist: options.persist !== false,
      render: options.render || "all"
    });
  }

  function commitDepth(key, value) {
    return actions.execute({
      mutate() { state.depths[key] = value; return value; },
      syncMap: true,
      persist: true,
      render: "map"
    });
  }

  function setTheme(value) {
    actions.call("setThemePreset", value);
  }

  function setWorkspaceView(value) {
    actions.call("setWorkspaceView", value);
    actions.call("saveCurrentSettings");
    actions.render("map");
  }

  function setQuadrantReferences(enabled) {
    commit("showQuadrantReferences", Boolean(enabled), {
      render: ["map", "simulation-map"]
    });
  }

  function setMovementOverlay(kind, enabled) {
    return actions.execute({
      mutate() {
        const active = Boolean(enabled);
        if (kind === "distance") {
          state.showMoveDistanceOverlay = active;
          if (active) state.showAllProgramMovesOverlay = false;
        } else {
          state.showAllProgramMovesOverlay = active;
          if (active) state.showMoveDistanceOverlay = false;
        }
        if (els.showMoveDistanceOverlay) els.showMoveDistanceOverlay.checked = Boolean(state.showMoveDistanceOverlay);
        if (els.showAllProgramMovesOverlay) els.showAllProgramMovesOverlay.checked = Boolean(state.showAllProgramMovesOverlay);
      },
      persist: true,
      render: ["map", "simulation-map"]
    });
  }

  function setAggregateSpacing(enabled) {
    commit("showAggregateSpacingOverlay", Boolean(enabled), { render: "map" });
  }

  function setGeometry(key, value, minimum = 0.001) {
    commit(key, Math.max(minimum, actions.number(value, state[key])), {
      syncMap: true,
      render: "all"
    });
  }

  function setAssemblyGeometry(tablePitchRadiusMm, padClearanceMm) {
    actions.execute({
      mutate() {
        state.tablePitchRadiusMm = Math.max(0.001, actions.number(tablePitchRadiusMm, state.tablePitchRadiusMm));
        state.padClearanceMm = Math.max(0, actions.number(padClearanceMm, state.padClearanceMm));
      },
      syncAssemblyMap: true,
      persist: true,
      render: ["all", "assembly"]
    });
  }

  function setMapSetting(key, value) {
    commit(key, value, { syncMap: true, render: "all" });
  }

  global.LabelerSettingsController = Object.freeze({
    commit,
    commitDepth,
    setTheme,
    setWorkspaceView,
    setQuadrantReferences,
    setMovementOverlay,
    setAggregateSpacing,
    setGeometry,
    setAssemblyGeometry,
    setMapSetting
  });
})(window);