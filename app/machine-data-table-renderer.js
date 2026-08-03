"use strict";

function renderStations() {
  syncMapPointsFromAssemblies();
  els.stations.innerHTML = `<table><thead><tr><th>#</th><th>Map point object</th><th class="num">Table angle</th><th class="num">Nearest head</th><th class="num">X</th><th class="num">Y</th></tr></thead><tbody></tbody></table>`;
  const body = els.stations.querySelector("tbody");
  const pitch = 360 / state.headCount;
  const rows = applicationMapPointRows();
  const names = rows.map((row) => row.name);

  rows.forEach((point, index) => {
    const xy = angleToXY(point.angle, state.radius);
    const nearest = Math.round(norm(point.angle) / pitch) % state.headCount + 1;
    const row = document.createElement("tr");
    row.dataset.stationRowIndex = String(index);
    row.innerHTML = `<td>${index + 1}</td><td><select class="map-point-name" data-station-field="name" aria-label="Map point name">${optionList(names, point.name)}</select></td><td><input class="num" data-station-field="angle" type="number" step="0.1" value="${fmt(point.angle, 3)}"></td><td class="num">${nearest}</td><td class="num">${fmt(xy.x)}</td><td class="num">${fmt(xy.y)}</td>`;
    const nameSelect = row.querySelector("select");
    const angleInput = row.querySelector("input");
    if (point.station || point.fixed || point.fixedName) nameSelect.disabled = true;
    if (point.fixed) angleInput.disabled = true;
    body.appendChild(row);
  });
}

function renderHeads() {
  els.heads.innerHTML = `<table><thead><tr><th>Head</th><th class="num">Home angle</th><th class="num">Current table angle</th><th class="num">Plate angle</th><th class="num">X</th><th class="num">Y</th></tr></thead><tbody></tbody></table>`;
  const body = els.heads.querySelector("tbody");
  heads().forEach((head) => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${head.head}</td><td class="num">${fmt(head.angle, 3)}</td><td class="num">${fmt(head.tableAngle, 3)}</td><td class="num">${fmt(plateAngleAt(head.tableAngle), 1)}</td><td class="num">${fmt(head.x)}</td><td class="num">${fmt(head.y)}</td>`;
    body.appendChild(row);
  });
}

window.LabelerMachineDataTableRenderer = Object.freeze({
  renderStations,
  renderHeads
});
