"use strict";

(function installTransferController(global) {
  const actions = global.LabelerWorkspaceActionService;

  function exportJson() {
    const payload = {
      ...state,
      heads: actions.call("heads") || [],
      program: (actions.call("programSegments") || []).map((row) => actions.call("roundedServoExportRow", row) || row)
    };
    actions.call("download", "labeler-servo-map.json", "application/json", JSON.stringify(payload, null, 2));
  }

  function exportSettings() {
    actions.call("saveCurrentSettings");
    const portable = {
      format: "labeler-tool-portable-settings",
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: actions.call("settingsSnapshot") || {}
    };
    actions.call("download", "labeler-tool-settings.json", "application/json", JSON.stringify(portable, null, 2));
  }

  function exportCsv() {
    const autocol = Boolean(actions.call("activeMachineUsesAutocolCommands"));
    const rows = [[
      "HMI",
      "PLC",
      autocol ? "Travel Command" : "CMD",
      "Table Angle",
      "Plate Angle",
      "Table Travel",
      "Plate Travel",
      "Turn Speed",
      "Action"
    ]];
    (actions.call("programSegments", state.program) || []).forEach((row) => rows.push([
      row.hmi,
      row.plc,
      autocol ? actions.call("autocolCommandLabel", row) : row.cmd,
      actions.call("oneDecimalOutput", row.tableAngle) ?? row.tableAngle,
      actions.call("oneDecimalOutput", row.plateAngle) ?? row.plateAngle,
      actions.call("oneDecimalOutput", row.tableTravel) ?? row.tableTravel,
      actions.call("oneDecimalOutput", row.plateTravel) ?? row.plateTravel,
      actions.call("oneDecimalOutput", row.absSpeed) ?? row.absSpeed,
      row.action
    ]));
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    actions.call("download", "labeler-servo-program.csv", "text/csv", csv);
  }

  function importSettings(file) {
    actions.call("importPortableSettingsFile", file);
  }

  function importFaultConfig(file) {
    actions.call("importFaultConfigFile", file);
  }

  function saveSettings() {
    actions.call("saveCurrentSettings");
  }

  function checkForUpdates() {
    actions.call("checkForToolUpdates");
  }

  function exportMachineMap() {
    actions.call("exportSelectedMachineMap");
  }

  global.LabelerTransferController = Object.freeze({
    exportJson,
    exportSettings,
    exportCsv,
    importSettings,
    importFaultConfig,
    saveSettings,
    checkForUpdates,
    exportMachineMap
  });
})(window);