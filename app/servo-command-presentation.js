"use strict";

function activeMachineUsesAutocolCommands() {
  const machineMap = typeof activeMachineMap === "function" ? activeMachineMap() : null;
  return String(machineMap?.machineType || "").toLowerCase() === "autocol";
}

function autocolCommandLabel(row) {
  if (row.autocolBoundary === "start-shape") return "Spec.-shap. plate corners";
  if (row.autocolBoundary === "end-curve") return "End of curve";
  return Number(row.cmd) === 7 ? "Correction" : "Rest";
}

function servoCommandControl(row, allowAutocolBoundaries = false, attributes = "") {
  const extra = attributes ? ` ${attributes}` : "";
  if (!activeMachineUsesAutocolCommands()) {
    return `<input class="num compact-input"${extra} type="number" step="1" value="${row.cmd}">`;
  }
  if (!allowAutocolBoundaries && (row.autocolBoundary === "start-shape" || row.autocolBoundary === "end-curve")) {
    return `<select class="compact-input"${extra} disabled><option value="${row.cmd}">${autocolCommandLabel(row)}</option></select>`;
  }
  if (allowAutocolBoundaries && (row.autocolBoundary === "start-shape" || row.autocolBoundary === "end-curve")) {
    return `<select class="compact-input"${extra} disabled><option>${autocolCommandLabel(row)}</option></select>`;
  }
  const value = row.autocolBoundary === "start-shape" ? "start-shape" : row.autocolBoundary === "end-curve" ? "end-curve" : String(Number(row.cmd) === 7 ? 7 : 3);
  return `<select class="compact-input"${extra}>${allowAutocolBoundaries ? `<option value="start-shape"${value === "start-shape" ? " selected" : ""}>Spec.-shap. plate corners</option>` : ""}<option value="3"${value === "3" ? " selected" : ""}>Rest</option><option value="7"${value === "7" ? " selected" : ""}>Correction</option>${allowAutocolBoundaries ? `<option value="end-curve"${value === "end-curve" ? " selected" : ""}>End of curve</option>` : ""}</select>`;
}

window.LabelerServoCommandPresentation = Object.freeze({
  activeMachineUsesAutocolCommands,
  autocolCommandLabel,
  servoCommandControl
});
