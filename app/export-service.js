"use strict";

function download(name, type, content) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function oneDecimalOutput(value) {
  return Number.isFinite(value) ? (Math.round(Number(value) * 2) / 2).toFixed(1) : "";
}

function roundedServoExportRow(row) {
  return {
    ...row,
    tableAngle: Number.isFinite(row.tableAngle) ? Number(oneDecimalOutput(row.tableAngle)) : null,
    plateAngle: Number.isFinite(row.plateAngle) ? Number(oneDecimalOutput(row.plateAngle)) : null,
    tableTravel: Number.isFinite(row.tableTravel) ? Number(oneDecimalOutput(row.tableTravel)) : null,
    plateTravel: Number.isFinite(row.plateTravel) ? Number(oneDecimalOutput(row.plateTravel)) : null,
    speed: Number.isFinite(row.speed) ? Number(oneDecimalOutput(row.speed)) : null,
    absSpeed: Number.isFinite(row.absSpeed) ? Number(oneDecimalOutput(row.absSpeed)) : null
  };
}

window.LabelerExportService = Object.freeze({
  download,
  oneDecimalOutput,
  roundedServoExportRow
});
