"use strict";

function heads() {
  const pitch = 360 / state.headCount;
  return Array.from({ length: state.headCount }, (_, i) => {
    const angle = i * pitch;
    const tableAngle = norm(angle + state.previewAngle);
    const xy = angleToXY(tableAngle, state.radius);
    return { head: i + 1, angle, tableAngle, x: xy.x, y: xy.y };
  });
}

function ensureSimulationRows() {
  if (!Array.isArray(state.simulation.rows)) state.simulation.rows = [];
  if (!Array.isArray(state.simulation.deletedRows)) state.simulation.deletedRows = [];
  if (!Array.isArray(state.simulation.lines)) state.simulation.lines = [];
  while (state.simulation.rows.length < state.program.length) state.simulation.rows.push({});
  if (!state.simulation.useCustom) {
    state.simulation.lines = state.program.map((row) => ({ ...row }));
  } else if (!state.simulation.lines.length && state.program.length) {
    const deletedRows = new Set(state.simulation.deletedRows);
    state.simulation.lines = state.program.map((row, index) => {
      const simRow = state.simulation.rows[index] ?? {};
      const customTurn = state.simulation.turns[index];
      return {
        ...row,
        cmd: Number.isFinite(simRow.cmd) ? simRow.cmd : row.cmd,
        tableAngle: Number.isFinite(simRow.tableAngle) ? simRow.tableAngle : row.tableAngle,
        plateAngle: Number.isFinite(customTurn) ? customTurn : row.plateAngle,
        action: simRow.action ?? row.action
      };
    }).filter((row, index) => !deletedRows.has(index));
  }
}

function simulationProgram() {
  ensureSimulationRows();
  if (typeof activeMachineUsesAutocolCommands === "function" && activeMachineUsesAutocolCommands()) normalizeAutocolSimulationLines();
  return state.simulation.lines.map((row, index) => ({
    ...row,
    simulationSourceIndex: index,
    hmi: index + 1,
    plc: index
  }));
}

function deleteSimulationLine(sourceIndex) {
  ensureSimulationRows();
  if (!Number.isInteger(sourceIndex)) return;
  if (["start-shape", "end-curve"].includes(state.simulation.lines[sourceIndex]?.autocolBoundary)) return;
  state.simulation.useCustom = true;
  state.simulation.lines.splice(sourceIndex, 1);
  if (typeof activeMachineUsesAutocolCommands === "function" && activeMachineUsesAutocolCommands()) normalizeAutocolSimulationLines();
}

function simulationRestLine(reference = {}) {
  return {
    cmd: 3,
    tableAngle: Number.isFinite(Number(reference.tableAngle)) ? Number(reference.tableAngle) : 2,
    plateAngle: Number.isFinite(Number(reference.plateAngle)) ? Number(reference.plateAngle) : 0,
    action: "Rest"
  };
}

function simulationCorrectionLine(reference = {}) {
  return {
    cmd: 7,
    tableAngle: Number.isFinite(Number(reference.tableAngle)) ? Number(reference.tableAngle) : 2,
    plateAngle: Number.isFinite(Number(reference.plateAngle)) ? Number(reference.plateAngle) : 0,
    action: "Correction"
  };
}

function normalizeAutocolSimulationLines() {
  if (!Array.isArray(state.simulation.lines)) state.simulation.lines = [];
  const source = state.simulation.lines;
  const existingStart = source.find((line) => line?.autocolBoundary === "start-shape");
  const existingEnd = source.find((line) => line?.autocolBoundary === "end-curve");
  const start = {
    ...(existingStart || {}),
    cmd: 3,
    tableAngle: 0,
    plateAngle: Number.isFinite(Number(existingStart?.plateAngle)) ? Number(existingStart.plateAngle) : 0,
    action: "Spec.-shap. plate corners",
    autocolBoundary: "start-shape"
  };
  const end = {
    ...(existingEnd || {}),
    cmd: 3,
    tableAngle: 359,
    plateAngle: Number.isFinite(Number(existingEnd?.plateAngle)) ? Number(existingEnd.plateAngle) : Number(start.plateAngle),
    action: "End of curve",
    autocolBoundary: "end-curve"
  };
  const editable = source.filter((line) => !["start-shape", "end-curve"].includes(line?.autocolBoundary)).map((line) => ({
    ...line,
    cmd: Number(line.cmd) === 7 ? 7 : 3,
    action: Number(line.cmd) === 7 ? (line.action || "Correction") : (line.action || "Rest")
  }));
  const alternating = [];
  editable.forEach((line) => {
    const command = Number(line.cmd) === 7 ? 7 : 3;
    // Deleting a line can bring two equal commands together. Collapse that
    // duplicate instead of inserting the deleted opposite command again, so
    // users can reduce a generated profile one move at a time.
    if (Number(alternating.at(-1)?.cmd) === command && !line.simulatorInserted) return;
    alternating.push(line);
  });
  if (!alternating.length || Number(alternating[0].cmd) !== 3) alternating.unshift(simulationRestLine(alternating[0] || start));
  if (!alternating.some((line) => Number(line.cmd) === 7)) alternating.push(simulationCorrectionLine(alternating.at(-1)));
  if (Number(alternating.at(-1)?.cmd) !== 3) alternating.push(simulationRestLine(alternating.at(-1)));
  state.simulation.lines = [start, ...alternating, end];
}

function addSimulationLineBeforeEnd() {
  ensureSimulationRows();
  state.simulation.useCustom = true;
  normalizeAutocolSimulationLines();
  const endIndex = state.simulation.lines.findIndex((line) => line?.autocolBoundary === "end-curve");
  if (endIndex < 0) return;
  const reference = state.simulation.lines[endIndex - 1] || state.simulation.lines[0] || {};
  state.simulation.lines.splice(endIndex, 0, {
    ...simulationRestLine(reference),
    simulatorInserted: true
  });
}

function insertSimulationPairAfter(sourceIndex) {
  ensureSimulationRows();
  if (!Number.isInteger(sourceIndex)) return;
  const reference = state.simulation.lines[sourceIndex];
  if (!reference || reference.autocolBoundary === "end-curve") return;
  state.simulation.useCustom = true;
  const next = state.simulation.lines[sourceIndex + 1] || reference;
  const startTable = Number(reference.tableAngle);
  const nextTable = Number(next.tableAngle);
  const available = Number.isFinite(startTable) && Number.isFinite(nextTable) && nextTable > startTable
    ? nextTable - startTable
    : 0;
  const correctionTable = available > 0 ? startTable + available / 3 : startTable;
  const restTable = available > 0 ? startTable + available * 2 / 3 : startTable;
  const plateAngle = Number.isFinite(Number(reference.plateAngle)) ? Number(reference.plateAngle) : 0;
  state.simulation.lines.splice(sourceIndex + 1, 0,
    { ...simulationCorrectionLine(reference), tableAngle: correctionTable, plateAngle, simulatorInserted: true },
    { ...simulationRestLine(reference), tableAngle: restTable, plateAngle, simulatorInserted: true }
  );
  // The inserted pair is already a legal Correction -> Rest sequence and the
  // mandatory boundary rows are untouched. Do not normalize here: the editor
  // deliberately allows this new pair beside an existing pair so the user can
  // build the next motion before changing its angles.
}

function setSimulationCommand(sourceIndex, commandValue) {
  ensureSimulationRows();
  if (!Number.isInteger(sourceIndex) || !state.simulation.lines[sourceIndex]) return;
  state.simulation.useCustom = true;
  const selected = state.simulation.lines[sourceIndex];
  const command = String(commandValue);
  if (command === "start-shape") {
    state.simulation.lines.forEach((line) => {
      if (line.autocolBoundary === "start-shape") delete line.autocolBoundary;
    });
    const line = { ...selected, cmd: 3, tableAngle: 0, plateAngle: Number.isFinite(selected.plateAngle) ? selected.plateAngle : 0, action: "Spec.-shap. plate corners", autocolBoundary: "start-shape" };
    state.simulation.lines.splice(sourceIndex, 1);
    state.simulation.lines.unshift(line);
    normalizeAutocolSimulationLines();
    return;
  }
  if (command === "end-curve") {
    state.simulation.lines.forEach((line) => {
      if (line.autocolBoundary === "end-curve") delete line.autocolBoundary;
    });
    const line = { ...selected, cmd: 3, tableAngle: 359, action: "End of curve", autocolBoundary: "end-curve" };
    state.simulation.lines.splice(sourceIndex, 1);
    state.simulation.lines.push(line);
    normalizeAutocolSimulationLines();
    return;
  }
  const line = state.simulation.lines[sourceIndex];
  delete line.autocolBoundary;
  line.cmd = command === "7" ? 7 : 3;
  line.action = command === "7" ? "Correction" : "Rest";
  if (command !== "7") {
    normalizeAutocolSimulationLines();
    return;
  }
  const next = state.simulation.lines[sourceIndex + 1];
  if (next && Number(next.cmd) === 3 && next.autocolBoundary !== "end-curve") return;
  state.simulation.lines.splice(sourceIndex + 1, 0, {
    cmd: 3,
    tableAngle: Number(line.tableAngle),
    plateAngle: Number(line.plateAngle),
    action: "Rest"
  });
  normalizeAutocolSimulationLines();
}

function currentProgram() {
  return state.activeTab === "simulation" || state.simulation.useCustom ? simulationProgram() : state.program;
}

function programSegments(program = currentProgram()) {
  return program.map((row, i) => {
    const next = program[i + 1];
    const tableTravel = next ? next.tableAngle - row.tableAngle : null;
    const isMotionCommand = Number(row.cmd) === 7;
    // CMD 3 establishes or holds a reference. Only CMD 7 executes the travel
    // to the following waypoint, matching plateAngleAt() and the servo driver.
    const plateTravel = isMotionCommand && next && Number.isFinite(row.plateAngle) && Number.isFinite(next.plateAngle)
      ? next.plateAngle - row.plateAngle
      : next ? 0 : null;
    const speed = tableTravel && plateTravel !== null ? plateTravel / tableTravel : null;
    const absSpeed = Number.isFinite(speed) ? Math.abs(speed) : null;
    const moveFault = isMotionCommand
      && Number.isFinite(absSpeed)
      && Number.isFinite(state.maxMoveRatio)
      && absSpeed >= state.maxMoveRatio;
    const excessPlateTravel = moveFault && Number.isFinite(tableTravel)
      ? Math.abs(plateTravel) - Math.abs(tableTravel) * state.maxMoveRatio
      : 0;
    return { ...row, isMotionCommand, tableTravel, plateTravel, speed, absSpeed, moveFault, excessPlateTravel };
  });
}

function faultMoves(program = currentProgram()) {
  return programSegments(program).filter((row) => row.moveFault);
}

function activeFaultMove(program = currentProgram(), tableAngle = state.previewAngle) {
  const active = activeSegmentForProgram(program, tableAngle);
  if (active?.moveFault) return active;
  return faultMoves(program)[0] ?? null;
}

function drawFaultOverlay(add, parent, program = currentProgram()) {
  const fault = activeFaultMove(program, state.previewAngle);
  if (els.mapFaultNotice) {
    els.mapFaultNotice.hidden = !fault;
    els.mapFaultNotice.innerHTML = fault
      ? `<strong>MOVE FAULT HMI ${fault.hmi}</strong><span>${fmt(Math.abs(fault.plateTravel), 1)} deg plate / ${fmt(Math.abs(fault.tableTravel), 1)} deg table</span><small>Ratio ${fmt(fault.absSpeed, 1)} &gt;= fault limit ${fmt(state.maxMoveRatio, 1)}</small>`
      : "";
  }
  if (!fault || !Number.isFinite(fault.tableTravel) || !Number.isFinite(fault.plateTravel)) return;

  const startAngle = fault.tableAngle;
  const endAngle = fault.tableAngle + fault.tableTravel;
  const overlayRadius = Math.max(38, state.radius - 42);
  const start = angleToXY(startAngle, overlayRadius);
  const end = angleToXY(endAngle, overlayRadius);
  const span = Math.abs(fault.tableTravel);
  const largeArc = span > 180 ? 1 : 0;
  const sweep = state.direction === "cw" ? 0 : 1;
  add("path", {
    d: `M ${start.x} ${start.y} A ${overlayRadius} ${overlayRadius} 0 ${largeArc} ${sweep} ${end.x} ${end.y}`,
    fill: "none",
    stroke: "#d71920",
    "stroke-width": 8,
    "stroke-linecap": "round",
    "stroke-opacity": 0.9
  }, parent);
  add("circle", { cx: start.x, cy: start.y, r: 6, fill: "#d71920", stroke: "#ffffff", "stroke-width": 2 }, parent);
  add("circle", { cx: end.x, cy: end.y, r: 6, fill: "#d71920", stroke: "#ffffff", "stroke-width": 2 }, parent);

}

function drawMoveDistanceOverlay(add, parent, program = currentProgram()) {
  if (!state.showMoveDistanceOverlay) return;
  const move = activeSegmentForProgram(program, state.previewAngle);
  if (!move || !Number.isFinite(move.tableTravel) || move.tableTravel === 0) return;

  // Animate the leading boundary with the live table position. Using the
  // command's original table angle pins this degree line at the wipe start for
  // the entire move and makes it appear frozen once the bottle reaches it.
  const startAngle = state.previewAngle;
  const endAngle = move.tableAngle + move.tableTravel;
  const innerRadius = Math.max(52, state.radius - 145);
  const outerRadius = Math.max(innerRadius + 30, state.radius - 22);
  const startOuter = angleToXY(startAngle, outerRadius);
  const endOuter = angleToXY(endAngle, outerRadius);
  const startInner = angleToXY(startAngle, innerRadius);
  const endInner = angleToXY(endAngle, innerRadius);
  const span = Math.abs(endAngle - startAngle);
  const largeArc = span > 180 ? 1 : 0;
  const sweep = state.direction === "cw" ? 0 : 1;
  const reverseSweep = sweep ? 0 : 1;

  add("path", {
    d: `M ${startOuter.x} ${startOuter.y} A ${outerRadius} ${outerRadius} 0 ${largeArc} ${sweep} ${endOuter.x} ${endOuter.y} L ${endInner.x} ${endInner.y} A ${innerRadius} ${innerRadius} 0 ${largeArc} ${reverseSweep} ${startInner.x} ${startInner.y} Z`,
    fill: "#7890a3",
    "fill-opacity": 0.18,
    stroke: "#617b90",
    "stroke-width": 1.5,
    "stroke-opacity": 0.7
  }, parent);
  add("line", { x1: 0, y1: 0, x2: startOuter.x, y2: startOuter.y, stroke: "#617b90", "stroke-width": 1.2, "stroke-dasharray": "4 5", "stroke-opacity": 0.75 }, parent);
  add("line", { x1: 0, y1: 0, x2: endOuter.x, y2: endOuter.y, stroke: "#617b90", "stroke-width": 1.2, "stroke-dasharray": "4 5", "stroke-opacity": 0.75 }, parent);

  const tableValue = `${fmt(Math.abs(move.tableTravel), 1)}°`;
  const plateValue = Number.isFinite(move.plateTravel) ? `${fmt(Math.abs(move.plateTravel), 1)}°` : "--";

  // Keep the move readout outside the circular labeler diagram. The parent SVG
  // uses a -340..340 by -315..315 viewBox, so this anchors the readout to the
  // lower-right corner of the map panel without covering machine geometry.
  const readout = add("g", { transform: "translate(322 287)" }, parent);
  add("text", { x: 0, y: -30, fill: "#334b5d", "font-size": 11, "font-weight": 700, "text-anchor": "end" }, readout).textContent = `HMI ${move.hmi}`;
  add("text", { x: 0, y: -14, fill: "#425d70", "font-size": 10, "font-weight": 600, "text-anchor": "end" }, readout).textContent = `Table move: ${tableValue}`;
  add("text", { x: 0, y: 1, fill: "#425d70", "font-size": 10, "font-weight": 600, "text-anchor": "end" }, readout).textContent = `Plate move: ${plateValue}`;
}

function activeSegment(tableAngle = state.previewAngle) {
  const segments = programSegments().filter((row) => row.cmd !== 0);
  for (let i = 0; i < segments.length - 1; i += 1) {
    if (tableAngle >= segments[i].tableAngle && tableAngle < segments[i + 1].tableAngle) {
      return segments[i];
    }
  }
  return segments[segments.length - 1] ?? null;
}

function activeSegmentForProgram(program, tableAngle = state.previewAngle) {
  const segments = programSegments(program).filter((row) => row.cmd !== 0);
  for (let i = 0; i < segments.length - 1; i += 1) {
    if (tableAngle >= segments[i].tableAngle && tableAngle < segments[i + 1].tableAngle) return segments[i];
  }
  return segments[segments.length - 1] ?? null;
}

function plateAngleAt(tableAngle = state.previewAngle, program = currentProgram()) {
  const segments = programSegments(program);
  const seg = activeSegmentForProgram(program, tableAngle);
  if (!seg) return 0;
  const index = segments.findIndex((row) => row.hmi === seg.hmi);
  const next = segments[index + 1];
  if (!next || !Number.isFinite(seg.plateAngle)) return Number.isFinite(seg.plateAngle) ? seg.plateAngle : 0;
  if (seg.cmd === 3 || !Number.isFinite(next.plateAngle) || next.tableAngle === seg.tableAngle) return seg.plateAngle;
  const progress = Math.max(0, Math.min(1, (tableAngle - seg.tableAngle) / (next.tableAngle - seg.tableAngle)));
  return seg.plateAngle + (next.plateAngle - seg.plateAngle) * progress;
}
