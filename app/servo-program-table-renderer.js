"use strict";

function renderProgram() {
  const commandHeading = activeMachineUsesAutocolCommands() ? "Travel command" : "CMD";
  els.program.innerHTML = `<table><thead><tr><th>HMI</th><th>PLC</th><th>${commandHeading}</th><th class="num">Table angle</th><th class="num override-heading">Table override</th><th class="num">Bottle angle</th><th class="num override-heading">Bottle override</th><th class="num">Table travel</th><th class="num">Bottle travel</th><th class="num">Encoder travel</th><th>Status</th><th class="num">Turn speed</th><th>Action</th></tr></thead><tbody></tbody></table>`;
  const body = els.program.querySelector("tbody");
  const segments = programSegments(state.program);
  const maxSpeed = segments.reduce((best, segment) => Number.isFinite(segment.absSpeed) && segment.absSpeed > (best?.absSpeed ?? -Infinity) ? segment : best, null);
  segments.forEach((row) => {
    const status = row.moveFault
      ? ["status-bad", `FAULT ${fmt(finishAngle(row.absSpeed), 1)} >= ${fmt(finishAngle(state.maxMoveRatio), 1)}`]
      : !Number.isFinite(row.plateAngle) && row.cmd !== 0
        ? ["status-warn", "Needs plate angle"]
        : ["status-ok", "OK"];
    const speedClass = maxSpeed && row.hmi === maxSpeed.hmi && row.absSpeed > 0 ? "speed-max" : "";
    const tr = document.createElement("tr");
    tr.dataset.programHmi = String(row.hmi);
    if (row.moveFault) tr.classList.add("move-fault-row");
    const tableOverride = Number.isFinite(row.tableAngleOverride) ? fmt(row.tableAngleOverride, 1) : "";
    const plateOverride = Number.isFinite(row.plateAngleOverride) ? fmt(row.plateAngleOverride, 1) : "";
    tr.innerHTML = `<td>${row.hmi}</td><td>${row.plc}</td><td>${servoCommandControl(row, false, 'data-program-field="command"')}</td><td><input class="num compact-input generated-angle" type="number" value="${fmt(row.generatedTableAngle, 1)}" readonly title="Generated table angle"></td><td><input class="num compact-input angle-override${tableOverride !== "" ? " active-override" : ""}" data-program-field="tableAngle" type="number" step="0.5" placeholder="Override" value="${tableOverride}" aria-label="Override table angle for HMI ${row.hmi}"></td><td><input class="num compact-input generated-angle" type="number" value="${Number.isFinite(row.generatedPlateAngle) ? fmt(row.generatedPlateAngle, 1) : ""}" readonly title="Generated bottle angle"></td><td><input class="num compact-input angle-override${plateOverride !== "" ? " active-override" : ""}" data-program-field="plateAngle" type="number" step="0.1" placeholder="Override" value="${plateOverride}" aria-label="Override bottle angle for HMI ${row.hmi}"></td><td class="num">${fmt(row.tableTravel, 1)}</td><td class="num">${fmt(row.plateTravel, 1)}</td><td class="num">${Number.isFinite(row.plateTravel) ? fmt(finishAngle(window.LabelerGeometryDriver?.encoderCountsFromPlateDegrees(row.plateTravel, state.encoderCountsPerRev, state.servoGearRatio)), 1) : ""}</td><td class="${status[0]}">${status[1]}</td><td class="num ${speedClass}">${Number.isFinite(row.absSpeed) ? fmt(finishAngle(row.absSpeed), 1) : ""}</td><td><input data-program-field="action" value="${row.action}"></td>`;
    body.appendChild(tr);
  });
  updateActiveServoProgramRow();
}

window.LabelerServoProgramTableRenderer = Object.freeze({ renderProgram });
