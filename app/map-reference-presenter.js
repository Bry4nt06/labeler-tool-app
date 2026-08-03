"use strict";

(function installMapReferencePresenter(global) {
  function applicationMapPointRows() {
    if (state.applicationMode === "cold-glue") return coldGlueMapRows();
    const rows = [];
    const addRow = (name, angle, update, station = null) => rows.push({ name, angle, update, station });
    const sideLabel = (side) => side === "inner" ? "Inner" : "Outer";

    state.assemblies.map(normalizeAssembly).forEach((assembly, index) => {
      state.assemblies[index] = assembly;
      if (!assembly.enabled || assembly.type === "none" || !assembly.sides.length) return;

      const applicatorPointName = `Agg ${assembly.station} Spender Plate Position`;
      addRow(applicatorPointName, assembly.spenderAngle, (value) => {
        assembly.spenderAngle = value;
        state.assemblies[index] = assembly;
      }, assembly.station);

      if (assembly.type === "rollers") {
        if (assembly.sides.includes("outer")) {
          assembly.outerRollerAngles.forEach((angle, rollerIndex) => addRow(
            `Wipe-Down Agg ${assembly.station} Roller ${rollerIndex + 1} Center (Outer)`,
            angle,
            (value) => {
              assembly.outerRollerAngles[rollerIndex] = value;
              state.assemblies[index] = assembly;
            },
            assembly.station
          ));
        }
        if (assembly.sides.includes("inner")) {
          assembly.innerRollerAngles.forEach((angle, rollerIndex) => addRow(
            `Wipe-Down Agg ${assembly.station} Roller ${rollerIndex + 3} Center (Inner)`,
            angle,
            (value) => {
              assembly.innerRollerAngles[rollerIndex] = value;
              state.assemblies[index] = assembly;
            },
            assembly.station
          ));
        }
      }

      if (assembly.type === "pads") {
        assembly.sides.forEach((side) => {
          const currentWindow = padAnglesForSide(assembly, side);
          addRow(`Wipe-Down Agg ${assembly.station} ${sideLabel(side)} Pad Position Start`, currentWindow[0], (value) => {
            if (side === "inner" && assembly.sides.includes("outer")) {
              assembly.padSideOffsetDeg = Math.max(0, value - padStartAngle(assembly));
            } else {
              assembly.spenderAngle = value - mmToTableDegrees(state.padClearanceMm);
            }
            state.assemblies[index] = assembly;
          }, assembly.station);
          addRow(`Wipe-Down Agg ${assembly.station} ${sideLabel(side)} Pad Position Stop`, currentWindow[1], (value) => {
            const start = padAnglesForSide(assembly, side)[0];
            assembly.padSpanDeg = Math.max(0.1, value - start);
            state.assemblies[index] = assembly;
          }, assembly.station);
        });
      }
    });

    state.mapPoints.filter((point) => !mapPointStation(point.name)).forEach((point) => {
      addRow(point.name, point.angle, (value) => { point.angle = value; });
    });
    return rows;
  }

  function labelerMapReferenceRows() {
    return permanentLabelerMapReferencePoints.map((point) => ({ ...point }));
  }

  function renderLabelerMapReference() {
    if (!els.labelerMapReferenceBody) return;
    if (els.labelerMapReferenceName) {
      els.labelerMapReferenceName.textContent = "Permanent map-building reference • read only";
    }
    els.labelerMapReferenceBody.innerHTML = "";
    labelerMapReferenceRows().forEach((point) => {
      const row = document.createElement("tr");
      const name = document.createElement("td");
      const angle = document.createElement("td");
      name.textContent = point.name;
      angle.textContent = fmt(point.angle, 1);
      angle.className = "num";
      row.append(name, angle);
      els.labelerMapReferenceBody.appendChild(row);
    });
  }

  global.applicationMapPointRows = applicationMapPointRows;
  global.labelerMapReferenceRows = labelerMapReferenceRows;
  global.renderLabelerMapReference = renderLabelerMapReference;
  global.LabelerMapReferencePresenter = Object.freeze({
    applicationMapPointRows,
    labelerMapReferenceRows,
    renderLabelerMapReference
  });
})(window);
