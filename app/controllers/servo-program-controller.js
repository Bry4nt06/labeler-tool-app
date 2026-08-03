"use strict";

(function installServoProgramController(global) {
  const actions = global.LabelerWorkspaceActionService;

  function rowForHmi(hmi) {
    const value = Number(hmi);
    return state.program.find((row) => Number(row.hmi) === value)
      || state.program[Math.max(0, value - 1)]
      || null;
  }

  function rowIndex(row) {
    const plc = Number(row?.plc);
    if (Number.isInteger(plc) && state.program[plc]) return plc;
    const hmi = Number(row?.hmi);
    return Number.isInteger(hmi) ? hmi - 1 : -1;
  }

  function updateCommand(hmi, value) {
    const row = rowForHmi(hmi);
    const index = rowIndex(row);
    if (!row || index < 0 || !state.program[index]) return;
    actions.execute({
      mutate() {
        state.program[index].cmd = actions.number(value, row.cmd);
      },
      render: "all"
    });
  }

  function updateOverride(hmi, field, value) {
    const row = rowForHmi(hmi);
    if (!row || !["tableAngle", "plateAngle"].includes(field)) return;
    actions.call("setServoAngleOverride", row, field, value);
    actions.execute({ render: "all" });
  }

  function updateAction(hmi, value) {
    const row = rowForHmi(hmi);
    const index = rowIndex(row);
    if (!row || index < 0 || !state.program[index]) return;
    state.program[index].action = String(value ?? "");
  }

  global.LabelerServoProgramController = Object.freeze({
    updateCommand,
    updateOverride,
    updateAction
  });
})(window);
