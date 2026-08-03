"use strict";

function generatedServoProfile() {
  if (state.applicationMode === "cold-glue") return generatedColdGlueFixedProfile();
  const applications = selectedLabelApplicationState();
  const machineMap = typeof activeMachineMap === "function" ? activeMachineMap() : null;
  if (machineMap) return generatedAplMapDrivenProfile(machineMap);
  const compactStationsReady = [1, 2, 3, 4].every((station) => {
    const assembly = state.assemblies.find((item) => Number(item.station) === station);
    return assembly && stationIsOperational(assembly);
  });
  const codingObjectReady = Boolean(machineMap?.objects?.some((item) => item.kind === "coding"));
  const usesCompactTwoLabelProfile = applications.neck && applications.body && !applications.back
    && compactStationsReady && codingObjectReady;
  if (usesCompactTwoLabelProfile) {
    const rows = generatedAplTwoLabelProfile();
    state.motionPlan = {
      rows,
      issues: [],
      stationPlans: [],
      pairPlans: [],
      finalPlateAngle: rows[rows.length - 1]?.plateAngle,
      termination: {
        section: "coding",
        hmi: rows.length,
        tableAngle: rows[rows.length - 1]?.tableAngle,
        command: "Rest"
      },
      profileKind: "apl-compact-two-label",
      referenceProfile: "Labeler Program Tool V1.05E - 2 Label APL"
    };
    return rows;
  }

  const baseRows = generatedAplSeedProfile();
  const mechanicalDriver = window.LabelerMechanicalMotionDriver;
  const commandDriver = window.LabelerServoCommandDriver;
  if (!mechanicalDriver || !commandDriver) return baseRows;

  const plan = mechanicalDriver.createContinuousProfile({
    program: baseRows,
    sourceProgram: baseRows,
    assemblies: state.assemblies.map(normalizeAssembly),
    stationWindows: STATION_PROGRAM_WINDOWS,
    initialPlateAngle: num(state.buildInputs.plateStartPositionDeg, 0),
    maxRatio: state.maxMoveRatio,
    sectionForStation: labelSectionForStation,
    isOperational: stationIsOperational,
    contactWindow: stationContactWindow,
    requirement: sectionWipeRequirement
  });

  const finalizedRows = commandDriver.finalize(plan.rows);
  const termination = applications.back
    ? { lastRowIndex: 31, endTableAngle: mapPointAngle(/Back Label.*Stop/i) }
    : applications.body
      ? { lastRowIndex: 19, endTableAngle: finalizedRows[20]?.tableAngle }
      : applications.neck
        ? { lastRowIndex: 9, endTableAngle: finalizedRows[10]?.tableAngle }
        : { lastRowIndex: 0, endTableAngle: finalizedRows[1]?.tableAngle };
  const rows = commandDriver.terminateAtEndCurve(finalizedRows, termination);
  state.motionPlan = {
    ...plan,
    rows,
    finalPlateAngle: rows[rows.length - 1]?.plateAngle,
    termination: {
      section: applications.back ? "back" : applications.body ? "body" : applications.neck ? "neck" : "none",
      hmi: rows[rows.length - 1]?.hmi,
      tableAngle: rows[rows.length - 1]?.tableAngle,
      command: "Rest"
    }
  };
  return rows;
}

window.LabelerProfileRouter = Object.freeze({ generate: generatedServoProfile });
