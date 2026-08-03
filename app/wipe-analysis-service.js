"use strict";

function sectionWipePlan(section) {
  const label = selectedLabelSpec();
  const bottle = selectedBottleSpec();
  if (!label) return null;
  const circumferenceMm = section === "neck" ? num(label.neckBottomCircumferenceMm, NaN) : bodyCircumference(bottle);
  // Neck-only Cold Glue specifications commonly provide the physical neck-label
  // length while leaving Neck Curve Bottom at zero. Treat the curve field as an
  // optional developed-length override, not as the only usable neck length.
  const neckCurveMm = num(label.neckBottomCurveMm, 0);
  const neckLengthMm = num(label.neckLengthMm, 0);
  const labelLengthMm = section === "neck"
    ? (neckCurveMm > 0 ? neckCurveMm : neckLengthMm)
    : section === "body"
      ? label.bodyLengthMm
      : label.backLengthMm;
  const contactMm = section === "neck" ? state.buildInputs.neckContactMm : section === "body" ? state.buildInputs.bodyContactMm : state.buildInputs.backContactMm;
  const overWipeDeg = section === "neck" ? state.buildInputs.neckOverWipeDeg : section === "body" ? state.buildInputs.bodyOverWipeDeg : state.buildInputs.backOverWipeDeg;
  const coldGlueLabel = normalizeLabelApplicationMode(label.applicationMode) === "cold-glue";
  const mode = coldGlueLabel || (section === "neck" && state.buildInputs.neckApplication === "Center") ? "center-tack-two-stage" : "leading-edge";
  return window.LabelerGeometryDriver?.solveSection({ mode, labelLengthMm, circumferenceMm, contactMm, overWipeDeg }) ?? null;
}

function sectionWipeRequirement(section) {
  return sectionWipePlan(section)?.totalRequired ?? null;
}

function stationContactWindow(assembly) {
  const angles = assemblyAngles(normalizeAssembly(assembly));
  if (!angles.length) return null;
  return { start: Math.min(...angles), end: Math.max(...angles) };
}

function stationWipeAnalysis(assembly, program = state.program) {
  const normalized = normalizeAssembly(assembly);
  const section = labelSectionForStation(normalized.station);
  const wipePlan = sectionWipePlan(section);
  const requiredRotation = wipePlan?.totalRequired ?? null;
  const window = stationContactWindow(normalized);

  const usesTwoStageNeckRollers = section === "neck" && normalized.type === "rollers";
  const usesTwoStageColdGlueBrushes = state.applicationMode === "cold-glue" && normalized.type === "brushes";
  const usesTwoStageAplPads = state.applicationMode === "apl" && normalized.type === "pads" && normalized.sides.includes("outer") && normalized.sides.includes("inner");
  const usesTwoStageContact = usesTwoStageNeckRollers || usesTwoStageColdGlueBrushes || usesTwoStageAplPads;
  const stageWindows = usesTwoStageContact
    ? [
        normalized.sides.includes("outer") ? { key: "outer", label: usesTwoStageColdGlueBrushes ? "outside brushes" : usesTwoStageAplPads ? "outside wipe-down pad" : "outside rollers", angles: assemblyAngles(normalized, "outer") } : null,
        normalized.sides.includes("inner") ? { key: "inner", label: usesTwoStageColdGlueBrushes ? "inside brushes" : usesTwoStageAplPads ? "inside wipe-down pad" : "inside rollers", angles: assemblyAngles(normalized, "inner") } : null
      ].filter(Boolean).map((stage) => ({
        ...stage,
        start: Math.min(...stage.angles),
        end: Math.max(...stage.angles),
        requiredRotation: (usesTwoStageAplPads ? wipePlan?.stages?.[stage.key === "outer" ? 0 : 1] : wipePlan?.stages?.find((item) => item.key === stage.key))?.requiredRotation ?? 0,
        contactRotation: 0,
        commandStart: null,
        commandEnd: null,
        aligned: false
      })).filter((stage) => Number.isFinite(stage.start) && Number.isFinite(stage.end))
    : window ? [{
        key: "combined",
        label: "contact window",
        start: window.start,
        end: window.end,
        requiredRotation,
        contactRotation: 0,
        commandStart: null,
        commandEnd: null,
        aligned: false
      }] : [];

  if (!stationIsOperational(normalized) || !window || !stageWindows.length || !Number.isFinite(requiredRotation)) {
    return { station: normalized.station, section, active: false, requiredRotation, contactRotation: 0, outsideRotation: 0, window, stages: stageWindows, wipePlan };
  }

  let contactRotation = 0;
  let outsideRotation = 0;
  // Select wipe moves by their generated station identity rather than fixed
  // row indexes. The generic two-label workbook profile is intentionally
  // compact (20 rows instead of the 32-row seed layout); applying the seed
  // indexes to it caused the coding turn to be counted as an Agg 4 body wipe.
  const stationWipePattern = new RegExp(`Wipe Turn [12] \\w+ - Agg ${normalized.station}(?:\\D|$)`, "i");
  const moveSegments = programSegments(program).filter((segment) =>
    stationWipePattern.test(String(segment.action || ""))
      && segment.cmd === 7
      && Number.isFinite(segment.tableTravel)
      && Number.isFinite(segment.plateTravel)
      && Math.abs(segment.tableTravel) > 0
  );

  if (usesTwoStageContact) {
    // For center-tack wiping, the roller/brush centerlines are mechanical anchors,
    // not the complete physical contact surface. The first CMD 7 is the outside
    // stage and the second CMD 7 is the inside stage. Count the complete commanded
    // turn when its table interval reaches the corresponding assembly anchors.
    stageWindows.forEach((stage, stageIndex) => {
      const segment = moveSegments[stageIndex];
      if (!segment) return;
      const segStart = Math.min(segment.tableAngle, segment.tableAngle + segment.tableTravel);
      const segEnd = Math.max(segment.tableAngle, segment.tableAngle + segment.tableTravel);
      const anchorTolerance = 1.5;
      const reachesStage = segEnd >= stage.start - anchorTolerance && segStart <= stage.end + anchorTolerance;
      stage.commandStart = segStart;
      stage.commandEnd = segEnd;
      stage.aligned = reachesStage;
      if (reachesStage) {
        stage.contactRotation = Math.abs(segment.plateTravel);
        contactRotation += stage.contactRotation;
      } else {
        outsideRotation += Math.abs(segment.plateTravel);
      }
    });
    moveSegments.slice(stageWindows.length).forEach((segment) => {
      outsideRotation += Math.abs(segment.plateTravel);
    });
  } else {
    moveSegments.forEach((segment) => {
      const segStart = Math.min(segment.tableAngle, segment.tableAngle + segment.tableTravel);
      const segEnd = Math.max(segment.tableAngle, segment.tableAngle + segment.tableTravel);
      const tableTravel = Math.abs(segment.tableTravel);
      const rotation = Math.abs(segment.plateTravel);
      const stage = stageWindows[0];
      const overlap = Math.max(0, Math.min(segEnd, stage.end) - Math.max(segStart, stage.start));
      const coveredFraction = Math.min(1, overlap / tableTravel);
      const coveredRotation = rotation * coveredFraction;
      stage.contactRotation += coveredRotation;
      stage.aligned = stage.aligned || overlap > 0;
      contactRotation += coveredRotation;
      outsideRotation += rotation - coveredRotation;
    });
  }

  return { station: normalized.station, section, active: true, requiredRotation, contactRotation, outsideRotation, window, stages: stageWindows, wipePlan };
}
