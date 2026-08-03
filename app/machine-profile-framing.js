"use strict";

function applyMachineTypeProfileFraming(rows) {
  const machineMap = typeof activeMachineMap === "function" ? activeMachineMap() : null;
  if (String(machineMap?.machineType || "TopModul").toLowerCase() !== "autocol") return rows;
  const source = Array.isArray(rows) ? rows.map((row) => ({ ...row })) : [];
  const terminalIndex = source.findIndex((row) => row.terminalRest === true || /end curve/i.test(String(row.action || "")));
  const terminal = terminalIndex >= 0 ? source[terminalIndex] : null;
  const beforeTerminal = terminalIndex > 0 ? source[terminalIndex - 1] : null;

  const motionEndRest = terminal
    && Number(beforeTerminal?.cmd) === 7
    && Number(terminal.tableAngle) < 359
    && Math.abs(Number(terminal.plateAngle) - Number(beforeTerminal.plateAngle)) > 0.001
      ? { ...terminal, cmd: 3, action: "Rest", terminalRest: false, autocolBoundary: "motion-end-rest" }
      : null;

  let middle = source.filter((row, index) => {
    if (index === 0 && Number(row.tableAngle) === 0) return false;
    return !(row.terminalRest === true || /end curve/i.test(String(row.action || "")));
  });

  const firstCorrectionIndex = middle.findIndex((row) => Number(row.cmd) === 7);
  if (firstCorrectionIndex > 0) middle = middle.slice(firstCorrectionIndex);
  if (motionEndRest) middle.push(motionEndRest);

  const alternating = [];
  middle.forEach((row, index) => {
    const previous = alternating[alternating.length - 1];
    if (Number(previous?.cmd) === 7 && Number(row.cmd) === 7) {
      const boundary = Number(row.tableAngle);
      const nextTable = Number(middle[index + 1]?.tableAngle);
      const correctionTable = Number.isFinite(nextTable)
        ? Math.min(boundary + 0.5, nextTable - 0.1)
        : boundary + 0.5;
      alternating.push({
        ...row,
        cmd: 3,
        action: `${previous.action} - Rest`,
        autocolBoundary: "inter-move-rest"
      });
      alternating.push({ ...row, tableAngle: Math.max(boundary + 0.1, correctionTable) });
      return;
    }
    if (Number(previous?.cmd) === 3 && Number(row.cmd) === 3) {
      alternating[alternating.length - 1] = row;
      return;
    }
    alternating.push(row);
  });

  middle = alternating;
  const finalPlate = middle.length && Number.isFinite(Number(middle[middle.length - 1].plateAngle))
    ? Number(middle[middle.length - 1].plateAngle)
    : 0;
  const framed = [
    {
      cmd: 3,
      tableAngle: 0,
      plateAngle: 0,
      action: "Spec.-shap. plate corners",
      autocolBoundary: "start-shape"
    },
    { cmd: 3, tableAngle: 2, plateAngle: 0, action: "Rest", autocolBoundary: "start-rest" },
    ...middle,
    {
      cmd: 3,
      tableAngle: 359,
      plateAngle: finalPlate,
      action: "End of curve",
      terminalRest: true,
      autocolBoundary: "end-curve",
      motionSource: "terminal-end-curve-rest"
    }
  ];
  return framed.map((row, index) => ({
    ...row,
    hmi: index + 1,
    plc: index,
    autocolProfile: true
  }));
}

window.LabelerMachineProfileFraming = Object.freeze({ apply: applyMachineTypeProfileFraming });
