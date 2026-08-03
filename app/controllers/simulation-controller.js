"use strict";

(function installSimulationController(global) {
  const actions = global.LabelerWorkspaceActionService;

  function togglePlayback() {
    actions.execute({
      mutate() {
        state.isPlaying = !state.isPlaying;
        global.LabelerAnimationRuntime?.resetClock?.();
        if (els.playPause) {
          els.playPause.textContent = state.isPlaying ? "Pause" : "Play";
          els.playPause.setAttribute("aria-pressed", state.isPlaying ? "true" : "false");
        }
      },
      render: "animation"
    });
  }

  function pause() {
    state.isPlaying = false;
    if (els.playPause) {
      els.playPause.textContent = "Play";
      els.playPause.setAttribute("aria-pressed", "false");
    }
  }

  function setSpeed(value) {
    state.animationSpeed = Math.min(50, Math.max(1, actions.number(value, state.animationSpeed)));
    state.animationSpeedUnit = "deg-per-second";
    if (els.animationStepReadout) {
      const formatted = actions.call("fmt", state.animationSpeed, 1) ?? state.animationSpeed;
      els.animationStepReadout.textContent = `${formatted} deg / sec`;
    }
  }

  function loadGeneratedTurns() {
    actions.execute({
      mutate() {
        state.simulation.turns = state.program.map((row) => Number.isFinite(row.plateAngle) ? row.plateAngle : null);
        state.simulation.rows = state.program.map((row) => ({ cmd: row.cmd, tableAngle: row.tableAngle, action: row.action }));
        state.simulation.deletedRows = [];
        state.simulation.lines = state.program.map((row) => ({ ...row }));
        state.simulation.useCustom = true;
      },
      persist: true,
      render: "all"
    });
  }

  function clearCustomTurns() {
    actions.execute({
      mutate() {
        state.simulation.turns = state.program.map(() => null);
        state.simulation.rows = [];
        state.simulation.deletedRows = [];
        state.simulation.lines = [];
        state.simulation.useCustom = false;
      },
      persist: true,
      render: "all"
    });
  }

  function insertPair(lineIndex) {
    if (!Number.isInteger(lineIndex)) return;
    actions.call("insertSimulationPairAfter", lineIndex);
    actions.execute({ persist: true, render: "all" });
  }

  global.LabelerSimulationController = Object.freeze({
    togglePlayback,
    pause,
    setSpeed,
    loadGeneratedTurns,
    clearCustomTurns,
    insertPair
  });
})(window);