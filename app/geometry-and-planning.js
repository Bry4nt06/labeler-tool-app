"use strict";

function fmt(value, decimals = 2) {
  return Number.isFinite(value) ? value.toFixed(decimals).replace(/\.?0+$/, "") : "";
}

function norm(angle) {
  const value = angle % 360;
  return value < 0 ? value + 360 : value;
}

function angleToXY(angle, radius) {
  const signed = state.direction === "cw" ? -1 : 1;
  const zeroBase = state.direction === "cw" ? 180 : 0;
  const rad = ((norm(zeroBase + state.zeroAngle + signed * angle)) * Math.PI) / 180;
  return { x: Math.cos(rad) * radius, y: Math.sin(rad) * radius };
}

function angleToSvgRotation(angle) {
  const signed = state.direction === "cw" ? -1 : 1;
  const zeroBase = state.direction === "cw" ? 180 : 0;
  return norm(zeroBase + state.zeroAngle + signed * angle);
}

function arcPath(startAngle, endAngle, innerRadius, outerRadius) {
  const startOuter = angleToXY(startAngle, outerRadius);
  const endOuter = angleToXY(endAngle, outerRadius);
  const startInner = angleToXY(startAngle, innerRadius);
  const endInner = angleToXY(endAngle, innerRadius);
  const span = Math.abs(endAngle - startAngle);
  const largeArc = span > 180 ? 1 : 0;
  const sweepOuter = state.direction === "cw" ? 0 : 1;
  const sweepInner = sweepOuter ? 0 : 1;
  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} ${sweepOuter} ${endOuter.x} ${endOuter.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} ${sweepInner} ${startInner.x} ${startInner.y}`,
    "Z"
  ].join(" ");
}


function bodyDiameter(spec) { return window.LabelerGeometryDriver?.effectiveDiameterMm(spec) ?? null; }

function bodyCircumference(spec) { return window.LabelerGeometryDriver?.bodyCircumferenceMm(spec) ?? null; }

function selectedBottleSpec() {
  return state.bottleSpecs.find((spec) => spec.bottleType === state.selectedBottle) ?? null;
}

function normalizeLabelApplicationMode(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  return normalized === "cold-glue" || normalized === "coldglue" ? "cold-glue" : "apl";
}

function labelSpecMatchesApplication(spec, mode = state.applicationMode) {
  return normalizeLabelApplicationMode(spec?.applicationMode) === normalizeLabelApplicationMode(mode);
}

function labelSpecsForApplication(mode = state.applicationMode) {
  return state.labelSpecs.filter((spec) => labelSpecMatchesApplication(spec, mode));
}

function bottleTypeExists(bottleType) {
  if (!Array.isArray(state.bottleSpecs)) return Boolean(bottleType);
  return state.bottleSpecs.some((spec) => spec.bottleType === bottleType);
}

function ensureBottleReferenceForLabel(label = null) {
  if (label?.bottleType && bottleTypeExists(label.bottleType)) {
    state.selectedBottle = label.bottleType;
    return label.bottleType;
  }
  const fallback = bottleTypeExists(state.selectedBottle)
    ? state.selectedBottle
    : state.bottleSpecs?.find((spec) => spec.bottleType)?.bottleType || "";
  state.selectedBottle = fallback;
  if (label && fallback) label.bottleType = fallback;
  return fallback;
}

function ensureSelectedBrandForApplication() {
  const available = labelSpecsForApplication();
  const selected = available.find((spec) => spec.brand === state.selectedBrand);
  if (selected) {
    if (!bottleTypeExists(selected.bottleType)) ensureBottleReferenceForLabel(selected);
    else if (!bottleTypeExists(state.selectedBottle)) state.selectedBottle = selected.bottleType;
    return selected;
  }

  const fallback = available[0] || null;
  state.selectedBrand = fallback?.brand || "";
  ensureBottleReferenceForLabel(fallback);
  return fallback;
}


function selectedLabelApplicationState() {
  const label = selectedLabelSpec();
  const available = {
    neck: Math.max(num(label?.neckLengthMm, 0), num(label?.neckBottomCurveMm, 0)) > 0,
    body: num(label?.bodyLengthMm, 0) > 0,
    back: num(label?.backLengthMm, 0) > 0
  };
  if (state.applicationMode !== "apl" || typeof activeMachineMap !== "function" || typeof inferAplStationSections !== "function") return available;
  const machineMap = activeMachineMap();
  const configuredSections = new Set(Object.values(inferAplStationSections(machineMap)).filter((section) => section !== "none"));
  return {
    neck: available.neck && configuredSections.has("neck"),
    body: available.body && configuredSections.has("body"),
    back: available.back && configuredSections.has("back")
  };
}

function applyLabelLengthStationRules() {
  const applications = selectedLabelApplicationState();
  state.assemblies = state.assemblies.map((rawAssembly) => {
    const assembly = normalizeAssembly(rawAssembly);
    const section = assembly.labelSection || labelSectionForStation(assembly.station);
    const present = Boolean(applications[section]);
    if (!section || section === "none") return assembly;

    if (!present) {
      if (!assembly.removedByLabelLength) {
        assembly.enabledBeforeLabelLength = assembly.enabled;
      }
      assembly.removedByLabelLength = true;
      assembly.removedLabelSection = section;
      assembly.enabled = false;
    } else if (assembly.removedByLabelLength) {
      assembly.enabled = assembly.enabledBeforeLabelLength !== false;
      delete assembly.enabledBeforeLabelLength;
      delete assembly.removedByLabelLength;
      delete assembly.removedLabelSection;
    }
    return assembly;
  });
}

const STATION_PROGRAM_WINDOWS = window.LabelerAplProfileDriver?.stationWindows || {};

function labelSectionForStation(station) {
  const n = Number(station);
  const assemblySection = state.assemblies?.find((item) => Number(item.station) === n)?.labelSection;
  if (["neck", "body", "back", "none"].includes(assemblySection)) return assemblySection;
  if (typeof activeMachineMap === "function" && typeof inferAplStationSections === "function") {
    const inferred = inferAplStationSections(activeMachineMap())?.[String(n)];
    if (["neck", "body", "back", "none"].includes(inferred)) return inferred;
  }
  if (n <= 2) return "neck";
  if (n <= 4) return "body";
  return "back";
}

function sectionLabel(section) {
  return ({ neck: "Neck", body: "Body", back: "Back" })[section] || section;
}

function signedAngleDifference(value, reference) {
  return ((num(value, 0) - num(reference, 0) + 540) % 360) - 180;
}

function labelSensorInspectionCenter(section, applicationTarget, labelWidthDeg = 0) {
  // Body and back application targets are the leading/left label edge in the
  // workbook servo path. Move half the developed label width to obtain the
  // finished label centerline. The neck target already uses its centerline
  // reference and must not receive the half-width correction.
  return num(applicationTarget, 0) + (section === "body" || section === "back" ? num(labelWidthDeg, 0) / 2 : 0);
}

function labelSensorVisibility(labelCenter, bottleAngle, labelWidthDeg, fieldOfViewDeg = 180) {
  const labelWidth = Math.min(360, Math.max(0.1, num(labelWidthDeg, 0.1)));
  const fieldWidth = Math.min(360, Math.max(0.1, num(fieldOfViewDeg, 180)));
  const distance = Math.abs(signedAngleDifference(bottleAngle, labelCenter));
  const labelHalf = labelWidth / 2;
  const fieldHalf = fieldWidth / 2;
  const overlap = distance <= Math.abs(labelHalf - fieldHalf)
    ? Math.min(labelWidth, fieldWidth)
    : Math.max(0, labelHalf + fieldHalf - distance);
  const overlapPercent = Math.min(100, 100 * overlap / labelWidth);
  // Within a 180-degree bottle face, convert off-center angle to an operator-
  // friendly view percentage. This makes 100% uniquely mean that the label
  // centerline faces the sensor, while values approaching 1% allow an edge view.
  const alignmentPercent = distance <= 0.25
    ? 100
    : Math.max(0, 100 * (1 - distance / Math.max(0.1, fieldHalf)));
  return { overlapDeg: overlap, percent: Math.min(overlapPercent, alignmentPercent), overlapPercent, alignmentPercent, fieldOfViewDeg: fieldWidth };
}

function nearestLabelSensorTarget(currentAngle, labelCenter, labelWidthDeg, requiredPercent = 50, fieldOfViewDeg = 180) {
  const labelWidth = Math.min(360, Math.max(0.1, num(labelWidthDeg, 0.1)));
  const fieldWidth = Math.min(360, Math.max(0.1, num(fieldOfViewDeg, 180)));
  const requiredOverlap = labelWidth * Math.min(100, Math.max(0, num(requiredPercent, 50))) / 100;
  const requestedPercent = Math.min(100, Math.max(1, num(requiredPercent, 50)));
  const overlapMaximumError = Math.max(0, labelWidth / 2 + fieldWidth / 2 - requiredOverlap);
  const alignmentMaximumError = fieldWidth / 2 * (1 - requestedPercent / 100);
  const maximumError = Math.min(overlapMaximumError, alignmentMaximumError);
  const centerEquivalent = num(labelCenter, 0) + 360 * Math.round((num(currentAngle, 0) - num(labelCenter, 0)) / 360);
  const error = num(currentAngle, 0) - centerEquivalent;
  const target = centerEquivalent + Math.max(-maximumError, Math.min(maximumError, error));
  return { target, requiredOverlap, maximumError, visibility: labelSensorVisibility(labelCenter, target, labelWidth, fieldWidth) };
}

function stationIsOperational(assembly) {
  const normalized = normalizeAssembly(assembly);
  const section = labelSectionForStation(normalized.station);
  return Boolean(normalized.enabled && normalized.type !== "none" && normalized.sides.length && selectedLabelApplicationState()[section]);
}

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

function optimizeInactiveStationWaypoints(plateWaypoints) {
  state.assemblies.forEach((raw) => {
    const assembly = normalizeAssembly(raw);
    if (stationIsOperational(assembly)) return;
    const group = STATION_PROGRAM_WINDOWS[assembly.station];
    if (!group) return;
    const holdValue = Number.isFinite(plateWaypoints[group.waypointStart - 1]) ? plateWaypoints[group.waypointStart - 1] : 0;
    for (let index = group.waypointStart; index <= group.waypointEnd; index += 1) plateWaypoints[index] = holdValue;
  });
  return plateWaypoints;
}

function inactiveMovementRows() {
  const rows = new Map();
  state.assemblies.forEach((raw) => {
    const assembly = normalizeAssembly(raw);
    if (stationIsOperational(assembly)) return;
    const group = STATION_PROGRAM_WINDOWS[assembly.station];
    if (!group) return;
    const reason = selectedLabelApplicationState()[labelSectionForStation(assembly.station)]
      ? `Station ${assembly.station} removed`
      : `No ${labelSectionForStation(assembly.station)} label`;
    for (let index = group.moveStart; index <= group.moveEnd; index += 1) rows.set(index, reason);
  });
  return rows;
}

function selectedLabelSpec() {
  return state.labelSpecs.find((spec) => spec.brand === state.selectedBrand) ?? null;
}

function degFromMm(mm, circumference) {
  return Number.isFinite(mm) && Number.isFinite(circumference) && circumference !== 0 ? (360 * mm) / circumference : null;
}

function nextId(rows) {
  return rows.reduce((highest, row) => Math.max(highest, num(row.id, 0)), 0) + 1;
}

function buildProgramSummary() {
  const label = selectedLabelSpec();
  const bottle = selectedBottleSpec();
  const bottleCirc = bodyCircumference(bottle);
  const neckCirc = label ? num(label.neckBottomCircumferenceMm, NaN) : NaN;
  const neckFullDeg = degFromMm(label?.neckBottomCurveMm, neckCirc);
  const neckContactDeg = degFromMm(state.buildInputs.neckContactMm, neckCirc);
  const bodyContactDeg = degFromMm(state.buildInputs.bodyContactMm, bottleCirc);
  const backContactDeg = degFromMm(state.buildInputs.backContactMm, bottleCirc);
  const centerLineFront = state.buildInputs.neckApplication === "Leading Edge"
    ? Number.isFinite(neckFullDeg) ? state.buildInputs.plateStartPositionDeg + neckFullDeg / 2 : null
    : -(90 - state.buildInputs.neckSpenderPlateDeg) + state.buildInputs.plateStartPositionDeg;
  const centerLineBack = Number.isFinite(centerLineFront) ? centerLineFront + 180 : null;
  return {
    label,
    bottle,
    rows: [
      ["Build Program H43 Brand", state.selectedBrand, "Feeds Brand named range"],
      ["Build Program H44 Bottle Type", state.selectedBottle, "Feeds Bottle named range"],
      ["Label Spec Lookup", label?.specNumber ?? "#N/A", "=VLOOKUP(Brand,'Label Specs'!B2:J101,2,FALSE)"],
      ["Bottle Type From Label", label?.bottleType ?? "#N/A", "Label Specs column D"],
      ["Neck Label Bottom Curvature (mm)", label?.neckBottomCurveMm ?? "#N/A", "=VLOOKUP(Brand,'Label Specs'!B2:J101,8,FALSE)"],
      ["Body Label Length (mm)", label?.bodyLengthMm ?? "#N/A", "=VLOOKUP(Brand,'Label Specs'!B2:J101,4,FALSE)"],
      ["Back Label Length (mm)", label?.backLengthMm ?? "#N/A", "=VLOOKUP(Brand,'Label Specs'!B2:J101,5,FALSE)"],
      ["Bottle Circ @ Neck Label Bottom (mm)", label?.neckBottomCircumferenceMm ?? "#N/A", "=VLOOKUP(Brand,'Label Specs'!B2:J101,9,FALSE)"],
      ["Bottle Body/Back Circumference (mm)", bottleCirc ?? "#N/A", "=VLOOKUP(Bottle,'Bottle Specs'!B2:F51,5,FALSE)"],
      ["Neck Contact Parameter (deg)", neckContactDeg ?? "#N/A", "=(360*NeckContactMm)/NeckCirc"],
      ["Body Contact Parameter (deg)", bodyContactDeg ?? "#N/A", "=(360*BodyContactMm)/BottleCirc"],
      ["Back Contact Parameter (deg)", backContactDeg ?? "#N/A", "=(360*BackContactMm)/BottleCirc"],
      ["Center Line Front (deg)", centerLineFront ?? "#N/A", "Workbook W9"],
      ["Center Line Back (deg)", centerLineBack ?? "#N/A", "=CenterLineFront+180"],
      ["Neck Label Length (deg)", neckFullDeg ?? "#N/A", "=NeckCurve/NeckCirc*360"],
      ["Body Label Length (deg)", degFromMm(label?.bodyLengthMm, bottleCirc) ?? "#N/A", "=(360*BodyLength)/BottleCirc"],
      ["Back Label Length (deg)", degFromMm(label?.backLengthMm, bottleCirc) ?? "#N/A", "=(360*BackLength)/BottleCirc"],
      ["Code Box Center From Left Label Edge (deg)", degFromMm(label?.codeBoxCenterMm, bottleCirc) ?? "#N/A", "=(360*CodeBoxCenterMm)/BottleCirc"],
      ["Neck Over-Wipe (deg)", state.buildInputs.neckOverWipeDeg, "Workbook Build Program input"],
      ["Body Over-Wipe (deg)", state.buildInputs.bodyOverWipeDeg, "Workbook Build Program input"],
      ["Back Over-Wipe (deg)", state.buildInputs.backOverWipeDeg, "Workbook Build Program input"],
      ["Back Inspection Offset (mm)", state.buildInputs.backInspectionOffsetMm, "Geometry solver"],
      ["Current Head Pitch (deg)", 360 / state.headCount, "360 / head count"],
      ["45-Head Reference Pitch (deg)", 360 / 45, "360 / 45"],
      ["Table Map Scale", state.autoScaleTableMap ? state.referencePitchRadiusMm / state.tablePitchRadiusMm : 1, "reference radius / current radius"],
      ["Encoder Counts / Plate Rev", state.encoderCountsPerRev * state.servoGearRatio, "encoder counts x gear ratio"]
    ]
  };
}

function normalizeColdGlueMap(items) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => ["brush", "wipe", "roller"].includes(item?.kind))
    .map((item) => ({ ...item, kind: item.kind === "wipe" ? "brush" : item.kind }));
}

function coldGlueMapObjects() {
  state.coldGlueMap = normalizeColdGlueMap(state.coldGlueMap);
  return state.coldGlueMap;
}

function resetColdGlueMap() {
  state.coldGlueMap = [];
}

function coldGlueMapRows() {
  return coldGlueMapObjects().flatMap((item) => {
    if (Number.isFinite(Number(item.angle))) {
      return [{
        name: item.name, angle: Number(item.angle), station: null, fixedName: true,
        update: (value) => { item.angle = value; }
      }];
    }
    return [
      { name: `${item.name} Start`, angle: Number(item.start), station: null, fixedName: true, update: (value) => { item.start = value; } },
      { name: `${item.name} Stop`, angle: Number(item.end), station: null, fixedName: true, update: (value) => { item.end = value; } }
    ];
  });
}

function coldGlueMapValue(id, field, fallback) {
  const item = coldGlueMapObjects().find((entry) => entry.id === id);
  return num(item?.[field], fallback);
}

function mapPointAngle(pattern, fallback = 0) {
  const dynamicPoint = applicationMapPointRows().find((point) => pattern.test(point.name));
  if (dynamicPoint && Number.isFinite(Number(dynamicPoint.angle))) return Number(dynamicPoint.angle);
  return state.mapPoints.find((point) => pattern.test(point.name))?.angle ?? fallback;
}

function finishAngle(value) {
  return Number.isFinite(value) ? Math.round(value * 2) / 2 : null;
}
