"use strict";

function generatedAplSeedProfile() {
  const label = selectedLabelSpec();
  const bottle = selectedBottleSpec();
  const bottleCirc = bodyCircumference(bottle);
  const neckCirc = label ? num(label.neckBottomCircumferenceMm, NaN) : NaN;
  const neckDevelopedLengthMm = num(label?.neckBottomCurveMm, 0) > 0
    ? num(label?.neckBottomCurveMm, 0)
    : num(label?.neckLengthMm, 0);
  const neckFull = degFromMm(neckDevelopedLengthMm, neckCirc);
  const bodyFull = degFromMm(label?.bodyLengthMm, bottleCirc);
  const backFull = degFromMm(label?.backLengthMm, bottleCirc);
  const codeBox = degFromMm(label?.codeBoxCenterMm, bottleCirc);
  const neckContact = degFromMm(state.buildInputs.neckContactMm, neckCirc);
  const bodyContact = degFromMm(state.buildInputs.bodyContactMm, bottleCirc);
  const backContact = degFromMm(state.buildInputs.backContactMm, bottleCirc);

  const usable = [neckFull, bodyFull, backFull, codeBox, neckContact, bodyContact, backContact].every(Number.isFinite);
  const centerFront = buildProgramSummary().rows.find(([name]) => name === "Center Line Front (deg)")?.[1];
  const centerBack = Number.isFinite(centerFront) ? centerFront + 180 : null;
  const neckAdjustedCenter = Number.isFinite(centerFront) && Number.isFinite(neckContact) ? centerFront + neckContact : null;
  const bodyAdjustedCenter = Number.isFinite(centerFront) && Number.isFinite(bodyContact) ? centerFront + bodyContact : null;
  const backAdjustedCenter = Number.isFinite(centerBack) && Number.isFinite(backContact) ? centerBack + backContact : null;
  const neckHalf = Number.isFinite(neckFull) ? neckFull / 2 : null;
  const bodyHalf = Number.isFinite(bodyFull) ? bodyFull / 2 : null;
  const backHalf = Number.isFinite(backFull) ? backFull / 2 : null;
  const input = state.buildInputs;
  const neckWipeDeg = sectionWipePlan("neck")?.overWipeDeg ?? 0;
  const bodyWipeDeg = sectionWipePlan("body")?.overWipeDeg ?? 0;
  const backWipeDeg = sectionWipePlan("back")?.overWipeDeg ?? 0;
  const neckOffsetDeg = degFromMm(input.neckOffsetMm, neckCirc) ?? 0;
  const bodyOffsetDeg = degFromMm(input.bodyOffsetMm, bottleCirc) ?? 0;
  const backOffsetDeg = degFromMm(input.backOffsetMm, bottleCirc) ?? 0;
  const backInspectionOffsetDeg = degFromMm(input.backInspectionOffsetMm, bottleCirc) ?? 0;
  const leading = state.applicationMode !== "cold-glue" && input.neckApplication === "Leading Edge";
  const coldGlueCenterTack = state.applicationMode === "cold-glue";
  const neckStageRotation = sectionWipePlan("neck")?.stageRequired;
  const neckTurn = (start) => leading
    ? start - neckContact + neckFull + neckWipeDeg
    : start + (Number.isFinite(neckAdjustedCenter) && Number.isFinite(neckHalf)
      ? neckAdjustedCenter + neckHalf + neckWipeDeg
      : (Number.isFinite(neckStageRotation) ? neckStageRotation : neckHalf + neckWipeDeg));
  const bodyStart = () => leading
    ? (bodyAdjustedCenter - (neckOffsetDeg + neckContact)) - bodyHalf + bodyOffsetDeg
    : (bodyAdjustedCenter - neckOffsetDeg + neckContact) - bodyHalf + bodyOffsetDeg;
  const backStart = () => leading
    ? (backAdjustedCenter - (neckOffsetDeg + neckContact)) - backHalf + backOffsetDeg
    : (backAdjustedCenter - neckOffsetDeg + neckContact) - backHalf + backOffsetDeg;
  const backInspect = () => leading
    ? (centerBack - (neckOffsetDeg + neckContact)) + (backHalf - codeBox) + backOffsetDeg + backInspectionOffsetDeg
    : (centerBack - neckOffsetDeg + neckContact) + (backHalf - codeBox) + backOffsetDeg + backInspectionOffsetDeg;

  const aplDriver = window.LabelerAplProfileDriver;
  if (!aplDriver) throw new Error("APL profile driver is not loaded.");

  // The second neck wipe returns the plate to its application reference and
  // executes between Roller 4 and the pair-exit CMD 3 reference. Long neck
  // labels can require more table travel than the legacy fixed 2 degree exit
  // padding provides. Extend only that exit window enough to keep the return
  // move below the configured servo fault ratio, while retaining a small
  // operating margin.
  const neckReturnRotation = Number.isFinite(neckTurn(input.plateStartPositionDeg))
    ? Math.abs(neckTurn(input.plateStartPositionDeg) - input.plateStartPositionDeg)
    : 0;
  const safeExitPadding = aplDriver.requiredPairExitPadding({
    moveRotation: neckReturnRotation,
    maxRatio: state.maxMoveRatio,
    margin: 0.95,
    roller4Offset: profileTiming.neckRoller4Offset,
    configuredPadding: profileTiming.pairExitReferencePadding,
    roundingIncrement: 0.5
  });
  const optimizedProfileTiming = {
    ...profileTiming,
    pairExitReferencePadding: safeExitPadding
  };

  const template = aplDriver.createTemplate({
    mapPointAngle,
    padProfileTableAngles,
    timing: optimizedProfileTiming,
    scaleAngle: (angle) => window.LabelerGeometryDriver?.scaleTableAngle(angle, {
      enabled: state.autoScaleTableMap,
      currentPitchRadiusMm: state.tablePitchRadiusMm,
      referencePitchRadiusMm: state.referencePitchRadiusMm,
      zeroAngle: state.zeroAngle
    }) ?? angle
  });

  const p = Array(32).fill(null);
  if (usable && Number.isFinite(centerFront) && Number.isFinite(centerBack)) {
    p[0] = input.plateStartPositionDeg;
    p[1] = input.plateStartPositionDeg;
    p[2] = p[1];
    p[3] = neckTurn(p[2]);
    p[4] = p[3];
    p[5] = input.plateStartPositionDeg;
    p[6] = p[5];
    p[7] = neckTurn(p[6]);
    p[8] = p[7];
    p[9] = input.plateStartPositionDeg;
    p[10] = p[9];
    p[11] = bodyStart();
    p[12] = p[11];
    p[13] = coldGlueCenterTack ? p[12] - bodyHalf - bodyWipeDeg : p[12] - bodyContact - bodyWipeDeg;
    p[14] = p[13] + bodyFull + bodyWipeDeg * 2;
    p[15] = p[14];
    p[16] = bodyStart();
    p[17] = p[16];
    p[18] = coldGlueCenterTack ? p[17] - bodyHalf - bodyWipeDeg : p[17] - bodyContact - bodyWipeDeg;
    p[19] = p[18] + bodyFull + bodyWipeDeg * 2;
    p[20] = p[19];
    p[21] = backStart();
    p[22] = p[21];
    p[23] = coldGlueCenterTack ? p[22] - backHalf - backWipeDeg : p[22] - backContact - backWipeDeg;
    p[24] = p[23] + backFull + backWipeDeg * 2;
    p[25] = p[24];
    p[26] = backStart();
    p[27] = p[26];
    p[28] = coldGlueCenterTack ? p[27] - backHalf - backWipeDeg : p[27] - backContact - backWipeDeg;
    p[29] = p[28] + backFull + backWipeDeg * 2;
    p[30] = p[29];
    p[31] = backInspect();
  }

  optimizeInactiveStationWaypoints(p);
  const inactiveRows = inactiveMovementRows();
  return template.map((row, index) => ({
    ...row,
    cmd: inactiveRows.has(index) ? 3 : row.cmd,
    tableAngle: row.tableAngle,
    plateAngle: index < p.length ? finishAngle(p[index]) : null,
    action: inactiveRows.has(index) ? `Idle - ${inactiveRows.get(index)}` : row.action
  }));
}


function generatedAplTwoLabelProfile() {
  const seed = generatedAplSeedProfile();
  const label = selectedLabelSpec();
  const bottle = selectedBottleSpec();
  const bottleCirc = bodyCircumference(bottle);
  const neckCirc = label ? num(label.neckBottomCircumferenceMm, NaN) : NaN;
  const input = state.buildInputs;
  const centerFront = buildProgramSummary().rows.find(([name]) => name === "Center Line Front (deg)")?.[1];
  const neckContact = degFromMm(input.neckContactMm, neckCirc);
  const neckOffsetDeg = degFromMm(input.neckOffsetMm, neckCirc) ?? 0;
  const bodyOffsetDeg = degFromMm(input.bodyOffsetMm, bottleCirc) ?? 0;
  const bodyFull = degFromMm(label?.bodyLengthMm, bottleCirc);
  const bodyHalf = Number.isFinite(bodyFull) ? bodyFull / 2 : null;
  const codeBox = degFromMm(label?.codeBoxCenterMm, bottleCirc);
  const backInspectionOffsetDeg = degFromMm(input.backInspectionOffsetMm, bottleCirc) ?? 0;
  const leading = input.neckApplication === "Leading Edge";

  // This is the workbook P51 formula. Code-box center is measured from the
  // left body-label edge; do not add an extra half-turn or normalize the result.
  const codeBoxReference = [centerFront, neckContact, bodyHalf, codeBox].every(Number.isFinite)
    ? (leading
      ? (centerFront - (neckOffsetDeg + neckContact)) + (bodyHalf - codeBox) + bodyOffsetDeg + backInspectionOffsetDeg
      : (centerFront - neckOffsetDeg + neckContact) + (bodyHalf - codeBox) + bodyOffsetDeg + backInspectionOffsetDeg)
    : null;
  const codingTarget = Number.isFinite(codeBoxReference) ? codeBoxReference : seed[19]?.plateAngle;

  const scale = (angle) => window.LabelerGeometryDriver?.scaleTableAngle(angle, {
    enabled: state.autoScaleTableMap,
    currentPitchRadiusMm: state.tablePitchRadiusMm,
    referencePitchRadiusMm: state.referencePitchRadiusMm,
    zeroAngle: state.zeroAngle
  }) ?? angle;
  const point = (pattern, fallback) => {
    const value = mapPointAngle(pattern);
    return Number.isFinite(value) ? value : fallback;
  };
  const map = typeof activeMachineMap === "function" ? activeMachineMap() : null;
  const codingObject = (map?.objects || []).find((item) => item.kind === "coding");
  const pad3 = padProfileTableAngles(3);
  const pad4 = padProfileTableAngles(4);
  const codingStart = Number.isFinite(num(codingObject?.start, NaN))
    ? num(codingObject.start, 304)
    : point(/Back Label.*(?:Inspection|Code).*Start/i, 304);
  const codingStop = Number.isFinite(num(codingObject?.end, NaN))
    ? num(codingObject.end, 315)
    : point(/Back Label.*(?:Inspection|Code).*Stop/i, 315);

  // Workbook timing completes the turn at MapBackInspectCodeStart minus the
  // configured arrive-early distance (304 - 75 = 229 on the reference map).
  // With inspection rows omitted, begin immediately after the final Agg 4 hold
  // and preserve strict table ordering.
  const codingTurnStart = pad4[3] + 0.5;
  let codingReady = codingStart - profileTiming.codingArriveEarlyDeg;
  while (codingReady <= codingTurnStart) codingReady += 360;

  // The coding target is reached before the physical coding object and the
  // terminal CMD 3 holds that orientation through the complete coding window.
  const referenceTablePath = [
    seed[0]?.tableAngle,
    seed[1]?.tableAngle,
    seed[2]?.tableAngle,
    seed[3]?.tableAngle,
    seed[4]?.tableAngle,
    seed[5]?.tableAngle,
    seed[6]?.tableAngle,
    seed[7]?.tableAngle,
    seed[8]?.tableAngle,
    scale(point(/Agg 3 (?:Spender|Pallet)/i, 148.5) - profileTiming.spenderArriveEarly),
    scale(pad3[0]), scale(pad3[1]), scale(pad3[2]), scale(pad3[3]),
    scale(point(/Agg 4 (?:Spender|Pallet)/i, 188.5) - profileTiming.spenderArriveEarly),
    scale(pad4[0]), scale(pad4[1]), scale(pad4[2]), scale(pad4[3]),
    scale(codingTurnStart),
    scale(codingReady)
  ];

  const plateAngles = [
    seed[0]?.plateAngle,
    seed[1]?.plateAngle,
    seed[2]?.plateAngle,
    seed[3]?.plateAngle,
    seed[4]?.plateAngle,
    seed[5]?.plateAngle,
    seed[6]?.plateAngle,
    seed[7]?.plateAngle,
    seed[8]?.plateAngle,
    seed[11]?.plateAngle,
    seed[12]?.plateAngle,
    seed[13]?.plateAngle,
    seed[14]?.plateAngle,
    seed[15]?.plateAngle,
    seed[16]?.plateAngle,
    seed[17]?.plateAngle,
    seed[18]?.plateAngle,
    seed[19]?.plateAngle,
    seed[19]?.plateAngle,
    codingTarget
  ];

  const commands = [3, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 7, 3, 7, 3, 7, 7, 3, 7, 3];
  const actions = [
    "Zero Line",
    "Hold for Neck Application - Agg 1",
    "Wipe Turn 1 Neck - Agg 1",
    "Wipe Hold Neck - Agg 1",
    "Wipe Turn 2 Neck - Agg 1",
    "Hold for Neck Application - Agg 2",
    "Wipe Turn 1 Neck - Agg 2",
    "Wipe Hold Neck - Agg 2",
    "Wipe Turn 2 Neck - Agg 2",
    "Hold for Body Application - Agg 3",
    "Wipe Turn 1 Body - Agg 3",
    "Wipe Turn 2 Body - Agg 3",
    "Wipe Hold Body - Agg 3",
    "Turn For Body Application - Agg 4",
    "Hold for Body Application - Agg 4",
    "Wipe Turn 1 Body - Agg 4",
    "Wipe Turn 2 Body - Agg 4",
    "Wipe Hold Body - Agg 4",
    "Turn for Coding",
    "Hold for Coding"
  ];

  return actions.map((action, index) => ({
    hmi: index + 1,
    plc: index,
    cmd: commands[index],
    tableAngle: finishAngle(referenceTablePath[index]),
    plateAngle: finishAngle(plateAngles[index]),
    action,
    terminalRest: index === actions.length - 1,
    ...(index >= actions.length - 2 ? {
      codingWindowStart: finishAngle(scale(codingStart)),
      codingWindowStop: finishAngle(scale(codingStop)),
      codingReadyTableAngle: finishAngle(scale(codingReady))
    } : {}),
    profileSource: "apl-two-label-reference"
  }));
}

function generatedColdGlueFixedProfile() {
  const commandDriver = window.LabelerServoCommandDriver;
  const geometry = window.LabelerGeometryDriver;
  const coldGlueDriver = window.LabelerColdGlueMotionDriver;
  const machineMap = typeof activeMachineMap === "function" ? activeMachineMap() : null;
  const coldGlueSettings = state.coldGlueAggregateSettings || {};
  const applications = selectedLabelApplicationState();
  const activeSections = ["neck", "body", "back"].filter((section) => applications[section]);
  const enabledStations = machineMap
    ? activeSlotNumbers(coldGlueSettings.enabledStations || machineMap.enabledStations)
    : [1, 2, 3];
  const enabledAggregates = machineMap
    ? activeSlotNumbers(coldGlueSettings.enabledAggregates || machineMap.enabledAggregates)
    : [1, 2, 3];
  const stationNumbers = enabledStations.filter((station) => enabledAggregates.includes(station));
  const objects = (Array.isArray(state.coldGlueMap) ? state.coldGlueMap : []).map((item) => ({
    ...item,
    station: Math.max(1, Math.min(6, Math.round(num(item.station, inferredMapObjectStation(item) || 1))))
  }));
  const aggregateAngles = coldGlueSettings.aggregateAngles || machineMap?.aggregateAngles || {};
  const mapDirection = (coldGlueSettings.machineSettings?.direction || machineMap?.machineSettings?.direction) === "ccw" ? "ccw" : "cw";
  const startPlate = num(state.buildInputs.plateStartPositionDeg, 0);
  const aplSeed = generatedAplSeedProfile();
  const applicationTargets = {
    neck: num(aplSeed[1]?.plateAngle, startPlate),
    body: num(aplSeed[11]?.plateAngle, startPlate),
    back: num(aplSeed[21]?.plateAngle, startPlate)
  };
  const rows = [];
  const issues = [];
  const stationPlans = [];
  let plate = startPlate;
  let lastTable = 0;

  const unwrapAfter = (angle, after = lastTable) => {
    let value = norm(num(angle, after));
    while (value <= after + 0.001) value += 360;
    return value;
  };
  const add = (cmd, tableAngle, plateAngle, action, extra = {}) => {
    const rawTable = num(tableAngle, lastTable);
    const normalizedTable = rows.length ? (rawTable < lastTable - 0.001 ? unwrapAfter(rawTable, lastTable) : rawTable) : rawTable;
    rows.push({
      hmi: rows.length + 1,
      plc: rows.length,
      cmd,
      tableAngle: finishAngle(normalizedTable),
      plateAngle: finishAngle(plateAngle),
      action,
      fixedColdGlueMap: false,
      motionSource: "cold-glue-machine-map",
      ...extra
    });
    lastTable = normalizedTable;
  };
  const moveToReference = (targetTable, targetPlate, action, extra = {}) => {
    const target = unwrapAfter(targetTable, lastTable);
    add(7, lastTable, plate, action, extra);
    plate = targetPlate;
    add(3, target, plate, `${action} - Reference`, extra);
  };
  const plateTravelTo = (targetPlate) => Math.abs(((num(targetPlate, plate) - plate + 540) % 360) - 180);
  const moveInWindow = (startTable, endTable, targetPlate, action, extra = {}) => {
    const start = unwrapAfter(startTable, lastTable);
    let end = num(endTable, start);
    while (end <= start + 0.001) end += 360;
    add(7, start, plate, action, extra);
    plate = targetPlate;
    add(3, end, plate, `${action} - Reference`, extra);
  };
  const applyMove = (startAngle, endAngle, rotation, direction, action, extra = {}) => {
    // A wipe may begin exactly where its entry/reference move ended. Equality
    // means "start now", not "wait for the next table revolution".
    let start = norm(num(startAngle, lastTable));
    while (start < lastTable - 0.001) start += 360;
    let end = num(endAngle, start);
    while (end <= start + 0.001) end += 360;
    // The preceding Rest holds the achieved bottle orientation through any
    // open table travel. Start the next Correction at the brush itself; adding
    // a synthetic hold pair creates duplicate CMD 7/3 rows and zero-travel
    // faults on Autocol profiles.
    add(7, start, plate, `${action} - Turn`, extra);
    plate += direction * rotation;
    add(3, end, plate, `${action} - Rest`, extra);
  };
  const pairedBrushPlan = (section, stationObjects) => {
    const wipe = sectionWipePlan(section);
    if (!wipe) return null;
    const brushes = stationObjects.filter((item) => item.kind === "brush");
    const outer = brushes.filter((item) => item.side !== "inner");
    const inner = brushes.filter((item) => item.side === "inner");
    // Opposite-side brushes occupying the same table window form one physical
    // brush channel. Split that window between the two wipe directions below
    // instead of scheduling the second brush on another 360-degree lap.
    const hasSharedOppositeChannel = outer.some((outside) => inner.some((inside) =>
      Math.min(num(outside.end, 0), num(inside.end, 0)) > Math.max(num(outside.start, 0), num(inside.start, 0)) + 0.001
    ));
    if (coldGlueDriver && brushes.length) {
      return coldGlueDriver.createPlan({
        labelDeg: wipe.labelDeg,
        overWipeDeg: wipe.overWipeDeg,
        partialCoveragePercent: 50,
        maxRatio: state.maxMoveRatio,
        safetyFactor: 0.9,
        mapDirection,
        brushes
      });
    }
    const outsideRequired = Math.max(0, num(wipe.labelDeg, 0) / 2 + num(wipe.overWipeDeg, 0));
    const insideRequired = Math.max(0, num(wipe.labelDeg, 0) + num(wipe.overWipeDeg, 0) * 2);
    if (!outer.length || !inner.length) {
      const windows = stationObjects.filter((item) => item.kind === "brush").map((item) => ({
        id: item.id,
        stage: item.side === "inner" ? "inner" : "outer",
        role: item.side === "inner" ? "inside-completion" : "immediate-outside",
        start: num(item.start, 0),
        end: num(item.end, 0)
      }));
      return geometry?.planColdGlueSection ? geometry.planColdGlueSection({
        labelDeg: wipe.labelDeg,
        overWipeDeg: wipe.overWipeDeg,
        maxRatio: state.maxMoveRatio,
        safetyFactor: 0.9,
        windows
      }) : null;
    }

    const outerStart = Math.min(...outer.map((item) => num(item.start, 0)));
    const outerEnd = Math.max(...outer.map((item) => num(item.end, 0)));
    const innerStart = Math.min(...inner.map((item) => num(item.start, 0)));
    const innerEnd = Math.max(...inner.map((item) => num(item.end, 0)));
    const overlaps = Math.min(outerEnd, innerEnd) > Math.max(outerStart, innerStart) + 0.001;
    if (!overlaps) {
      return geometry?.planColdGlueSection ? geometry.planColdGlueSection({
        labelDeg: wipe.labelDeg,
        overWipeDeg: wipe.overWipeDeg,
        maxRatio: state.maxMoveRatio,
        safetyFactor: 0.9,
        windows: [
          ...outer.map((item) => ({ id: item.id, stage: "outer", role: "immediate-outside", start: item.start, end: item.end })),
          ...inner.map((item) => ({ id: item.id, stage: "inner", role: "inside-completion", start: item.start, end: item.end }))
        ]
      }) : null;
    }

    const channelStart = Math.min(outerStart, innerStart);
    const channelEnd = Math.max(outerEnd, innerEnd);
    const span = Math.max(0.001, channelEnd - channelStart);
    const totalRequired = outsideRequired + insideRequired;
    const outsideSpan = totalRequired > 0 ? span * outsideRequired / totalRequired : span / 2;
    const split = channelStart + outsideSpan;
    const outsideRatio = outsideRequired / Math.max(0.001, outsideSpan);
    const insideRatio = insideRequired / Math.max(0.001, channelEnd - split);
    const planIssues = [];
    if (outsideRatio >= state.maxMoveRatio) planIssues.push({ level: "bad", code: "cold-glue-outer-capacity", message: `Station outside brush channel requires ${outsideRatio.toFixed(2)}:1, above the ${state.maxMoveRatio.toFixed(2)}:1 limit.` });
    if (insideRatio >= state.maxMoveRatio) planIssues.push({ level: "bad", code: "cold-glue-inner-capacity", message: `Station inside brush channel requires ${insideRatio.toFixed(2)}:1, above the ${state.maxMoveRatio.toFixed(2)}:1 limit.` });
    return {
      labelDeg: wipe.labelDeg,
      overWipeDeg: wipe.overWipeDeg,
      outside: [{ id: outer[0].id, stage: "outer", role: "immediate-outside", start: channelStart, end: split, span: outsideSpan, rotation: outsideRequired, ratio: outsideRatio }],
      inside: [{ id: inner[0].id, stage: "inner", role: "inside-completion", start: split, end: channelEnd, span: channelEnd - split, rotation: insideRequired, ratio: insideRatio }],
      issues: planIssues
    };
  };

  add(3, 0, startPlate, "Zero Line");

  // A blank map has no physical device capable of applying or wiping a label.
  // Keep the exported curve legal, but never synthesize an application move
  // from fallback aggregate angles when the map contains no objects.
  if (!objects.length) {
    rows[0] = {
      ...rows[0],
      action: "End Curve - Rest",
      terminalRest: true,
      motionSource: "terminal-end-curve-rest"
    };
    const finalizedBlankRows = commandDriver ? commandDriver.finalize(rows) : rows;
    state.motionPlan = {
      rows: finalizedBlankRows,
      issues: [],
      stationPlans: [],
      pairPlans: [],
      coldGluePlans: {},
      finalPlateAngle: startPlate,
      termination: { section: "none", hmi: 1, tableAngle: 0, command: "Rest" },
      fixedColdGlueMap: false,
      mapDriven: true,
      profileKind: "cold-glue-empty-map"
    };
    return finalizedBlankRows;
  }

  stationNumbers.forEach((station, index) => {
    const section = activeSections[index] || null;
    const stationObjects = objects.filter((item) => Number(item.station) === station);
    const aggregateAngle = num(aggregateAngles[String(station)], num(machineMap?.stationAngles?.[String(station)], station * 40 + 35));
    const stationPlan = section ? pairedBrushPlan(section, stationObjects) : null;
    // Cold-glue brush channels can service more than one label while the same
    // bottle passes them. Once an earlier full-wrap wipe has carried the curve
    // beyond a later aggregate point, do not unwrap that aggregate onto a
    // second revolution. Its label is already on the bottle; continue with the
    // remaining physical brush windows in their actual table order.
    const aggregateAlreadyPassed = aggregateAngle <= lastTable + 0.001;
    if (section && !aggregateAlreadyPassed) {
      const applicationPlate = coldGlueDriver?.applicationTarget
        ? coldGlueDriver.applicationTarget(applicationTargets[section], mapDirection, stationPlan?.labelDeg)
        : applicationTargets[section];
      if (stationPlan?.fullWrap) {
        const applicationStart = unwrapAfter(aggregateAngle + 4, lastTable);
        const applicationTravel = plateTravelTo(applicationPlate) / Math.max(0.1, Math.min(state.maxMoveRatio * 0.9, 11.5));
        moveInWindow(applicationStart, applicationStart + applicationTravel, applicationPlate, `Turn for ${sectionLabel(section)} Application at Aggregate ${station}`, { station, section, fullWrapApplication: true });
      } else {
        moveToReference(aggregateAngle, applicationPlate, `Turn for ${sectionLabel(section)} Application at Aggregate ${station}`, { station, section });
      }
    } else if (!section && stationObjects.length) {
      moveToReference(aggregateAngle, plate, `Aggregate ${station} Entry`, { station });
    }

    if (stationPlan) {
      (stationPlan.issues || []).forEach((issue) => issues.push({ ...issue, station, section }));

      // Cold-glue labels are only center/edge tacked when they leave the
      // aggregate. Before the bottle enters the first brush channel, rotate the
      // plate so the tacked portion points in the direction of bottle flow and
      // the loose label tail trails behind it. Entering the channel in the
      // opposite orientation lets the brushes catch and peel the unwiped label.
      const allBrushAllocations = [
        ...(Array.isArray(stationPlan.process) ? stationPlan.process : stationPlan.outside || []),
        ...(Array.isArray(stationPlan.final) ? stationPlan.final : stationPlan.inside || [])
      ].filter((allocation) => Number.isFinite(num(allocation.start, NaN)))
        .sort((a, b) => num(a.start, 0) - num(b.start, 0));
      const firstBrush = allBrushAllocations[0];
      if (firstBrush && !aggregateAlreadyPassed) {
        const flowFacingPlate = coldGlueDriver?.flowFacingTarget
          ? coldGlueDriver.flowFacingTarget(plate, mapDirection, stationPlan.labelDeg)
          : applicationTargets[section] + (mapDirection === "ccw" ? -90 : 90);
        const brushEntryTable = firstBrush.start - Math.max(0, num(stationPlan.brushEntryLeadDeg, 0));
        const alignmentExtra = { station, section, brushEntryAlignment: true, mapDirection, flowFacingOffsetDeg: mapDirection === "ccw" ? 90 : -90 };
        if (stationPlan.fullWrap) {
          const alignmentStart = Math.max(lastTable + 0.5, brushEntryTable - plateTravelTo(flowFacingPlate) / Math.max(0.1, Math.min(state.maxMoveRatio * 0.9, 7.5)));
          moveInWindow(alignmentStart, brushEntryTable, flowFacingPlate, `${sectionLabel(section)} Face Bottle With Flow Before Brush Channel`, alignmentExtra);
        } else {
          moveToReference(brushEntryTable, flowFacingPlate, `${sectionLabel(section)} Face Bottle With Flow Before Brush Channel`, alignmentExtra);
        }
      }

      if (Array.isArray(stationPlan.process) || Array.isArray(stationPlan.final)) {
        (stationPlan.process || []).forEach((allocation) => applyMove(allocation.start, allocation.end, allocation.rotation, allocation.direction, `${sectionLabel(section)} Partial Brush Wipe-Down`, { station, section, brushStage: "process", brushRole: allocation.role, plannedRotation: allocation.rotation, plannedRatio: allocation.ratio, coveragePercent: stationPlan.partialCoveragePercent }));
        (stationPlan.final || []).forEach((allocation) => applyMove(allocation.start, allocation.end, allocation.rotation, allocation.direction, `${sectionLabel(section)} Final Brush Wipe-Down`, { station, section, brushStage: "final", brushRole: allocation.role, plannedRotation: allocation.rotation, plannedRatio: allocation.ratio, coveragePercent: 100 - stationPlan.partialCoveragePercent }));
      } else {
        stationPlan.outside.forEach((allocation) => applyMove(allocation.start, allocation.end, allocation.rotation, -1, `${sectionLabel(section)} Outside Brush Wipe-Down`, { station, section, brushStage: "outer", plannedRotation: allocation.rotation, plannedRatio: allocation.ratio }));
        stationPlan.inside.forEach((allocation) => applyMove(allocation.start, allocation.end, allocation.rotation, 1, `${sectionLabel(section)} Inside Brush Wipe-Down`, { station, section, brushStage: "inner", plannedRotation: allocation.rotation, plannedRatio: allocation.ratio }));
      }
    } else if (section) {
      issues.push({ level: "bad", code: "cold-glue-missing-brush-station", station, section, message: `Aggregate ${station} is assigned to the ${section} label but has no complete outside/inside brush set.` });
    }

    const rollers = stationObjects.filter((item) => item.kind === "roller").sort((a, b) => num(a.start, a.angle) - num(b.start, b.angle));
    rollers.forEach((roller) => {
      const start = num(roller.start, roller.angle);
      const end = num(roller.end, start + 0.5);
      applyMove(start, end, 0, 1, roller.name || `Aggregate ${station} Roller Pass`, { station, rollerPass: true });
    });
    if (section) stationObjects
      .filter((item) => item.kind === "sensor" && item.servoAssist)
      .sort((a, b) => num(a.angle, a.start) - num(b.angle, b.start))
      .forEach((sensor) => {
        const wipe = sectionWipePlan(section);
        const placement = num(sensor.angle, sensor.start);
        const ready = placement - 1.5;
        const requiredVisibility = Math.min(100, Math.max(1, num(sensor.requiredVisibilityPercent, 50)));
        const sensorLabelCenter = labelSensorInspectionCenter(section, applicationTargets[section], wipe?.labelDeg);
        const visibility = labelSensorVisibility(sensorLabelCenter, plate, wipe?.labelDeg, 180);
        if (visibility.percent >= requiredVisibility) {
          lastTable = Math.max(lastTable, placement + 1.5);
          return;
        }
        if (ready <= lastTable + 0.5) {
          issues.push({ level: "bad", code: "label-sensor-turn-window", station, section, message: `${sensor.name || "Label Sensor"} needs a bottle-orientation turn, but its 3 deg window starts at ${ready.toFixed(1)} deg after the previous motion ends at ${lastTable.toFixed(1)} deg. Move the sensor later or finish the brush wipe earlier.` });
          return;
        }
        const plan = nearestLabelSensorTarget(plate, sensorLabelCenter, wipe?.labelDeg, requiredVisibility, 180);
        moveToReference(ready, plan.target, `Orient ${sectionLabel(section)} Label for Sensor - Station ${station}`, { station, section, sensorId: sensor.id, sensorPlacement: placement, sensorFieldOfViewDeg: 180, requiredLabelVisibilityPercent: requiredVisibility, plannedLabelVisibilityPercent: plan.visibility.percent });
        // A sensor placement represents a centered three-degree inspection
        // window. Keep the achieved Rest active through the complete window;
        // the following station may not begin a new turn until after it ends.
        lastTable = Math.max(lastTable, placement + 1.5);
      });
    stationPlans.push({ station, section, aggregateAngle, objects: stationObjects, plan: stationPlan });
  });

  const remainingObjects = objects
    .filter((item) => !stationNumbers.includes(Number(item.station)))
    .sort((a, b) => num(a.start, a.angle) - num(b.start, b.angle));
  remainingObjects.filter((item) => item.kind === "roller").forEach((roller) => {
    applyMove(num(roller.start, roller.angle), num(roller.end, num(roller.start, roller.angle) + 0.5), 0, 1, roller.name || "Final Roller Pass", { rollerPass: true });
  });

  const finalObjectAngle = objects.reduce((best, item) => Math.max(best, num(item.end, num(item.angle, num(item.start, 0)))), 0);
  const endCurveAngle = unwrapAfter(finalObjectAngle || (lastTable + Math.max(0.5, 360 / Math.max(1, state.headCount))), lastTable);
  if (Number(rows[rows.length - 1]?.cmd) === 3) {
    rows[rows.length - 1] = { ...rows[rows.length - 1], tableAngle: finishAngle(endCurveAngle), action: "End Curve - Rest", terminalRest: true, motionSource: "terminal-end-curve-rest" };
    lastTable = endCurveAngle;
  } else {
    add(3, endCurveAngle, plate, "End Curve - Rest", { terminalRest: true, motionSource: "terminal-end-curve-rest" });
  }

  const finalized = commandDriver ? commandDriver.finalize(rows) : rows;
  state.motionPlan = {
    rows: finalized,
    issues,
    stationPlans,
    pairPlans: [],
    coldGluePlans: Object.fromEntries(stationPlans.filter((plan) => plan.section).map((plan) => [plan.section, plan.plan])),
    finalPlateAngle: finalized[finalized.length - 1]?.plateAngle,
    termination: {
      section: activeSections[activeSections.length - 1] || "none",
      hmi: finalized.length,
      tableAngle: endCurveAngle,
      command: "Rest"
    },
    fixedColdGlueMap: false,
    mapDriven: true
  };
  return finalized;
}

function generatedAplMapDrivenProfile(machineMap) {
  const commandDriver = window.LabelerServoCommandDriver;
  const mapZero = num(machineMap?.machineSettings?.zeroAngle, state.zeroAngle || 0);
  // Map geometry is stored in physical bottle-table degrees. Head count changes
  // the head pitch, but it must never move aggregates or objects around the table.
  const scaleMapAngle = (angle) => num(angle, mapZero);
  const scaleMapSpan = (span) => num(span, 0);
  const objects = (machineMap?.objects || [])
    .filter((item) => item.application !== "cold-glue")
    .filter((item) => item.kind === "coding" || ((item.kind === "roller" || item.kind === "pad" || item.kind === "sensor") && isStationEnabled(machineMap, Number(item.station))))
    .map((item) => normalizeBuilderObject(item, "apl", 6))
    .map((item) => ({
      ...item,
      start: scaleMapAngle(item.start),
      end: scaleMapAngle(item.end),
      angle: Number.isFinite(Number(item.angle)) ? scaleMapAngle(item.angle) : item.angle,
      wipeSpanDeg: scaleMapSpan(item.wipeSpanDeg)
    }));
  const sections = typeof inferAplStationSections === "function" ? inferAplStationSections(machineMap) : {};
  const startPlate = num(state.buildInputs.plateStartPositionDeg, 0);
  const seed = generatedAplSeedProfile();
  const targets = {
    neck: num(seed[1]?.plateAngle, startPlate),
    body: num(seed[11]?.plateAngle, startPlate),
    back: num(seed[21]?.plateAngle, startPlate)
  };
  const rows = [];
  const issues = [];
  const stationPlans = [];
  let plate = startPlate;
  let lastTable = 0;
  let motionStarted = false;

  const unwrapAfter = (angle, after = lastTable, gap = 0.5) => {
    let value = norm(num(angle, after + gap));
    while (value < after + gap) value += 360;
    return value;
  };
  const add = (cmd, tableAngle, plateAngle, action, extra = {}) => {
    const raw = num(tableAngle, lastTable);
    const table = rows.length && raw < lastTable + 0.5 ? lastTable + 0.5 : raw;
    rows.push({
      hmi: rows.length + 1,
      plc: rows.length,
      cmd,
      tableAngle: finishAngle(table),
      plateAngle: finishAngle(plateAngle),
      action,
      motionSource: "apl-machine-map",
      mapDriven: true,
      ...extra
    });
    lastTable = table;
    if (Number(cmd) === 7) motionStarted = true;
  };
  const moveToReference = (tableAngle, targetPlate, action, extra = {}) => {
    const targetTable = unwrapAfter(tableAngle, lastTable);
    const rotation = targetPlate - plate;
    if (Math.abs(rotation) <= 0.001) {
      if (!motionStarted) add(3, targetTable, plate, action, extra);
      return;
    }
    add(7, lastTable + 0.5, plate, action, extra);
    plate = targetPlate;
    add(3, targetTable, plate, `${action} - Reference`, extra);
  };
  const applyTurn = (startAngle, endAngle, rotation, action, extra = {}) => {
    if (!Number.isFinite(rotation) || Math.abs(rotation) <= 0.001) return null;
    const { endAction, ...rowExtra } = extra;
    const start = unwrapAfter(startAngle, lastTable);
    let end = num(endAngle, start + 0.1);
    while (end <= start + 0.001) end += 360;
    const span = end - start;
    const ratio = Math.abs(rotation) / Math.max(0.001, span);
    add(7, start, plate, action, { ...rowExtra, plannedRotation: rotation, plannedRatio: ratio });
    plate += rotation;
    add(3, end, plate, endAction || `${action} - Rest`, { ...rowExtra, plannedRotation: rotation, plannedRatio: ratio });
    if (ratio >= state.maxMoveRatio) {
      issues.push({
        level: "bad",
        code: "apl-object-contact-capacity",
        station: rowExtra.station,
        section: rowExtra.section,
        message: `${action} requires ${Math.abs(rotation).toFixed(1)} deg of bottle rotation in ${span.toFixed(1)} deg of roller/pad surface coverage (${ratio.toFixed(2)}:1; limit ${state.maxMoveRatio.toFixed(1)}:1). Increase that object's surface coverage or reposition the next object.`
      });
    }
    return rotation;
  };
  const applyContinuousPadTurns = (startAngle, splitAngle, endAngle, firstRotation, secondRotation, section, station, stageNames = ["set-down", "wipe"], endAction = "") => {
    const start = unwrapAfter(startAngle, lastTable);
    let split = num(splitAngle, start + 0.1);
    let end = num(endAngle, split + 0.1);
    while (split <= start + 0.001) split += 360;
    while (end <= split + 0.001) end += 360;
    const firstRatio = Math.abs(firstRotation) / Math.max(0.001, split - start);
    const secondRatio = Math.abs(secondRotation) / Math.max(0.001, end - split);
    add(7, start, plate, `Wipe Turn 1 ${sectionLabel(section)} - Agg ${station}`, { station, section, stage: stageNames[0], plannedRotation: firstRotation, plannedRatio: firstRatio });
    plate += firstRotation;
    add(7, split, plate, `Wipe Turn 2 ${sectionLabel(section)} - Agg ${station}`, { station, section, stage: stageNames[1], plannedRotation: secondRotation, plannedRatio: secondRatio });
    plate += secondRotation;
    add(3, end, plate, endAction || `Wipe Hold ${sectionLabel(section)} - Agg ${station}`, { station, section, stage: "complete" });
    [[firstRatio, firstRotation, split - start, 1], [secondRatio, secondRotation, end - split, 2]].forEach(([ratio, rotation, span, turn]) => {
      if (ratio < state.maxMoveRatio) return;
      issues.push({
        level: "bad",
        code: "apl-object-contact-capacity",
        station,
        section,
        message: `Wipe Turn ${turn} ${sectionLabel(section)} - Agg ${station} requires ${Math.abs(rotation).toFixed(1)} deg of bottle rotation in ${span.toFixed(1)} deg of pad surface coverage (${ratio.toFixed(2)}:1; limit ${state.maxMoveRatio.toFixed(1)}:1). Increase the pad contact span or adjust the split.`
      });
    });
    return [firstRotation, secondRotation];
  };
  const contactRange = (items) => items.length ? {
    start: Math.min(...items.map((item) => num(item.start, 0))),
    end: Math.max(...items.map((item) => num(item.end, num(item.start, 0) + num(item.wipeSpanDeg, 0.1))))
  } : null;
  const adaptiveLongNeckPlan = (outsideRange, insideRange, wipe, station) => {
    if (num(wipe?.labelDeg, 0) <= 360 || !outsideRange || !insideRange) return null;
    const plan = window.LabelerGeometryDriver?.planTwoSurfaceWipe({
      labelDeg: wipe.labelDeg,
      totalRequired: wipe.totalRequired,
      preferredOutside: wipe.stageRequired,
      outsideSpan: Math.max(0, outsideRange.end - outsideRange.start),
      insideSpan: Math.max(0, insideRange.end - insideRange.start),
      maxRatio: state.maxMoveRatio,
      safetyFactor: 0.9
    });
    if (!plan) return null;
    issues.push({
      level: plan.fits ? "ok" : "bad",
      code: plan.fits ? "apl-long-neck-adaptive-wipe" : "apl-long-neck-pad-capacity",
      station,
      section: "neck",
      message: plan.fits
        ? `Aggregate ${station} has an overlength neck label (${plan.labelDeg.toFixed(1)} deg around the neck). Wipe ${plan.outsideRotation.toFixed(1)} deg on the outside surface, then reverse and complete ${plan.insideRotation.toFixed(1)} deg on the inside surface. At the ${plan.safeRatio.toFixed(1)}:1 planning ratio, the pads/rollers need at least ${plan.outsideRequiredTableSpan.toFixed(1)} deg outside and ${plan.insideRequiredTableSpan.toFixed(1)} deg inside table contact.`
        : `Aggregate ${station} cannot secure the overlength neck label before pill-back: its outside and inside contact surfaces are short by ${plan.shortfall.toFixed(1)} deg of bottle rotation. Increase pad/roller contact by at least ${(plan.shortfall / plan.safeRatio).toFixed(1)} deg of table travel.`,
      wipeAllocation: plan
    });
    return plan;
  };

  add(3, 0, startPlate, "Zero Line");

  const stationGroups = new Map();
  objects.filter((item) => item.kind === "roller" || item.kind === "pad").forEach((item) => {
    const station = Number(item.station);
    if (!stationGroups.has(station)) stationGroups.set(station, []);
    stationGroups.get(station).push(item);
  });

  const orderedStationGroups = [...stationGroups.entries()].sort((a, b) => a[0] - b[0]);
  orderedStationGroups.forEach(([station, stationObjects], stationIndex) => {
    const section = sections[String(station)] || labelSectionForStation(station);
    const wipe = sectionWipePlan(section);
    if (!wipe || !selectedLabelApplicationState()[section]) return;
    const aggregate = scaleMapAngle(num(machineMap.aggregateAngles?.[String(station)], num(machineMap.stationAngles?.[String(station)], 0)));
    const applicationPoint = aggregate - scaleMapSpan(num(profileTiming.spenderArriveEarly, 7.5));
    moveToReference(applicationPoint, targets[section], `Hold for ${sectionLabel(section)} Application - Agg ${station}`, { station, section });

    const nextEntry = orderedStationGroups.slice(stationIndex + 1).find(([nextStation]) => {
      const nextSection = sections[String(nextStation)] || labelSectionForStation(nextStation);
      return selectedLabelApplicationState()[nextSection];
    });
    const nextStation = Number(nextEntry?.[0]);
    const nextSection = nextEntry ? (sections[String(nextStation)] || labelSectionForStation(nextStation)) : "";
    const sectionBoundary = nextEntry && nextSection !== section ? {
      station: nextStation,
      section: nextSection,
      tableAngle: scaleMapAngle(num(machineMap.aggregateAngles?.[String(nextStation)], num(machineMap.stationAngles?.[String(nextStation)], 0))) - scaleMapSpan(num(profileTiming.spenderArriveEarly, 7.5)),
      plateAngle: targets[nextSection],
      action: `Hold for ${sectionLabel(nextSection)} Application - Agg ${nextStation}`
    } : null;

    const moves = [];
    let valid = true;
    // Pads intentionally take precedence when an operator adds them to a
    // station. This lets Aggregates 1 and 2 be converted from rollers to
    // wipe-down pads without changing map identity or profile routing.
    const preferredKind = stationObjects.some((item) => item.kind === "pad") ? "pad" : "roller";
    const preferredObjects = stationObjects.filter((item) => item.kind === preferredKind);
    const ignoredObjects = stationObjects.filter((item) => item.kind !== preferredKind);
    if (ignoredObjects.length) {
      issues.push({ level: "warn", code: "apl-incompatible-station-object", station, section, message: `Station ${station} is assigned to ${section} and uses ${preferredKind} objects; ${ignoredObjects.length} incompatible object${ignoredObjects.length === 1 ? " was" : "s were"} ignored.` });
    }
    if (preferredKind === "roller") {
      const outside = contactRange(preferredObjects.filter((item) => item.side !== "inner"));
      const inside = contactRange(preferredObjects.filter((item) => item.side === "inner"));
      const required = num(wipe.stageRequired, num(wipe.totalRequired, 0) / 2);
      const longNeckPlan = section === "neck" ? adaptiveLongNeckPlan(outside, inside, wipe, station) : null;
      if (!outside || !inside) {
        valid = false;
        issues.push({ level: "bad", code: "apl-neck-roller-side-missing", station, section, message: `Station ${station} needs both outside and inside roller objects to complete the two-direction ${section} wipe.` });
      }
      if (outside) moves.push(applyTurn(outside.start, outside.end, longNeckPlan?.outsideRotation ?? required, `Wipe Turn 1 ${sectionLabel(section)} - Agg ${station}`, { station, section, stage: "outer" }));
      if (inside) {
        // Finish the neck reversal while the bottle is physically touching the
        // inside roller. The following station iteration creates a separate
        // orientation move for the next label; merging that target here would
        // spread part of the neck wipe into the open gap after this roller.
        const secondRotation = -(longNeckPlan?.insideRotation ?? required);
        moves.push(applyTurn(inside.start, inside.end, secondRotation, `Wipe Turn 2 ${sectionLabel(section)} - Agg ${station}`, { station, section, stage: "inner" }));
      }
    } else {
      const outsidePad = contactRange(preferredObjects.filter((item) => item.side !== "inner"));
      const insidePad = contactRange(preferredObjects.filter((item) => item.side === "inner"));
      const configuredPadRange = contactRange(preferredObjects);
      // A station cannot keep wiping after the next aggregate must apply its
      // label. Limit oversized/custom pad geometry to that physical boundary
      // instead of unwrapping the next application into a second table turn.
      const padRange = configuredPadRange && Number.isFinite(sectionBoundary?.tableAngle) && sectionBoundary.tableAngle > configuredPadRange.start
        // Reserve one table degree after an oversized wipe window for the
        // separate next-label orientation pair. Ending exactly on the next
        // application point would unwrap its reference into a second cycle.
        ? { ...configuredPadRange, end: Math.min(configuredPadRange.end, sectionBoundary.tableAngle - 1) }
        : configuredPadRange;
      if (!padRange) return;
      if (section === "neck") {
        const required = num(wipe.stageRequired, num(wipe.totalRequired, 0) / 2);
        if (outsidePad && insidePad) {
          const longNeckPlan = adaptiveLongNeckPlan(outsidePad, insidePad, wipe, station);
          moves.push(applyTurn(outsidePad.start, outsidePad.end, longNeckPlan?.outsideRotation ?? required, `Wipe Turn 1 ${sectionLabel(section)} - Agg ${station}`, { station, section, stage: "outer-pad" }));
          const secondRotation = -(longNeckPlan?.insideRotation ?? required);
          moves.push(applyTurn(insidePad.start, insidePad.end, secondRotation, `Wipe Turn 2 ${sectionLabel(section)} - Agg ${station}`, { station, section, stage: "inner-pad" }));
        } else {
          const midpoint = padRange.start + (padRange.end - padRange.start) / 2;
          const longNeckPlan = adaptiveLongNeckPlan({ start: padRange.start, end: midpoint }, { start: midpoint, end: padRange.end }, wipe, station);
          const firstRotation = longNeckPlan?.outsideRotation ?? required;
          const naturalSecondRotation = longNeckPlan?.insideRotation ?? required;
          const splitFraction = longNeckPlan?.totalRequired > 0 ? longNeckPlan.outsideRotation / longNeckPlan.totalRequired : 0.5;
          const split = padRange.start + (padRange.end - padRange.start) * splitFraction;
          const secondRotation = -naturalSecondRotation;
          moves.push(...applyContinuousPadTurns(padRange.start, split, padRange.end, firstRotation, secondRotation, section, station, ["outer-pad", "inner-pad"]));
        }
      } else {
        const backSpin = num(wipe.backSpinRequired, num(wipe.stages?.[0]?.requiredRotation, 0));
        const forward = num(wipe.forwardWipeRequired, num(wipe.stages?.[1]?.requiredRotation, 0));
        const total = Math.max(0.001, backSpin + forward);
        const split = padRange.start + (padRange.end - padRange.start) * (backSpin / total);
        const secondRotation = sectionBoundary ? sectionBoundary.plateAngle - (plate - backSpin) : forward;
        // Complete the bottle rotation while the bottle is still touching the
        // configured pad. If the next label section starts later, the terminal
        // CMD 3 naturally holds this orientation through that application
        // point; extending CMD 7 to the next aggregate would wipe in free air.
        moves.push(...applyContinuousPadTurns(padRange.start, split, padRange.end, -backSpin, secondRotation, section, station, ["set-down", "wipe"], sectionBoundary?.action));
      }
    }
    const movePath = moves.filter(Number.isFinite);
    objects
      .filter((item) => item.kind === "sensor" && item.servoAssist && Number(item.station) === station)
      .sort((a, b) => num(a.angle, a.start) - num(b.angle, b.start))
      .forEach((sensor) => {
        const placement = num(sensor.angle, sensor.start);
        const ready = placement - 1.5;
        const requiredVisibility = Math.min(100, Math.max(1, num(sensor.requiredVisibilityPercent, 50)));
        const sensorLabelCenter = labelSensorInspectionCenter(section, targets[section], wipe.labelDeg);
        const visibility = labelSensorVisibility(sensorLabelCenter, plate, wipe.labelDeg, 180);
        if (visibility.percent >= requiredVisibility) {
          lastTable = Math.max(lastTable, placement + 1.5);
          return;
        }
        if (ready <= lastTable + 0.5) {
          issues.push({ level: "bad", code: "label-sensor-turn-window", station, section, message: `${sensor.name || "Label Sensor"} needs a bottle-orientation turn, but its 3 deg window starts at ${ready.toFixed(1)} deg after the previous motion ends at ${lastTable.toFixed(1)} deg. Move the sensor later or finish the wipe earlier.` });
          return;
        }
        const plan = nearestLabelSensorTarget(plate, sensorLabelCenter, wipe.labelDeg, requiredVisibility, 180);
        moveToReference(ready, plan.target, `Orient ${sectionLabel(section)} Label for Sensor - Station ${station}`, {
          station, section, sensorId: sensor.id, sensorPlacement: placement,
          sensorFieldOfViewDeg: 180, requiredLabelVisibilityPercent: requiredVisibility,
          plannedLabelVisibilityPercent: plan.visibility.percent
        });
        lastTable = Math.max(lastTable, placement + 1.5);
      });
    stationPlans.push({
      station,
      section,
      active: true,
      valid,
      requiredRotation: num(wipe.totalRequired, 0),
      movePath,
      directionChanges: movePath.slice(1).filter((move, index) => Math.sign(move) !== Math.sign(movePath[index])).length,
      objects: stationObjects
    });
  });

  const codingObject = objects.find((item) => item.kind === "coding");
  if (codingObject) {
    const label = selectedLabelSpec();
    const bottleCirc = bodyCircumference(selectedBottleSpec());
    const neckCirc = num(label?.neckBottomCircumferenceMm, NaN);
    const centerFront = buildProgramSummary().rows.find(([name]) => name === "Center Line Front (deg)")?.[1];
    const neckContact = degFromMm(state.buildInputs.neckContactMm, neckCirc);
    const neckOffset = degFromMm(state.buildInputs.neckOffsetMm, neckCirc) ?? 0;
    const bodyOffset = degFromMm(state.buildInputs.bodyOffsetMm, bottleCirc) ?? 0;
    const backOffset = degFromMm(state.buildInputs.backOffsetMm, bottleCirc) ?? 0;
    const bodyFull = degFromMm(label?.bodyLengthMm, bottleCirc);
    const backFull = degFromMm(label?.backLengthMm, bottleCirc);
    const codeBox = degFromMm(label?.codeBoxCenterMm, bottleCirc);
    const inspectionOffset = degFromMm(state.buildInputs.backInspectionOffsetMm, bottleCirc) ?? 0;
    const leading = state.buildInputs.neckApplication === "Leading Edge";
    // Code Box Center is measured along the label from its left edge to the
    // centre of the 20 mm print area. Three-label bottles code the back label;
    // two-label bottles code the body label. Convert that linear input to
    // bottle degrees, then locate it from the selected label's centre line.
    const codesBackLabel = Boolean(selectedLabelApplicationState().back && num(label?.backLengthMm, 0) > 0);
    const codingLabelCenter = Number.isFinite(centerFront) ? centerFront + (codesBackLabel ? 180 : 0) : null;
    const codingLabelFull = codesBackLabel ? backFull : bodyFull;
    const codingLabelOffset = codesBackLabel ? backOffset : bodyOffset;
    const rawCodingTarget = [codingLabelCenter, neckContact, codingLabelFull, codeBox].every(Number.isFinite)
      ? (leading
        ? (codingLabelCenter - (neckOffset + neckContact)) + (codingLabelFull / 2 - codeBox) + codingLabelOffset + inspectionOffset
        : (codingLabelCenter - neckOffset + neckContact) + (codingLabelFull / 2 - codeBox) + codingLabelOffset + inspectionOffset)
      : plate;
    // Coding has no set-down/back-spin stage. Select the equivalent code-box
    // orientation requiring the least rotation from the final wipe position.
    const codingTarget = Number.isFinite(rawCodingTarget)
      ? rawCodingTarget + 360 * Math.round((plate - rawCodingTarget) / 360)
      : plate;
    const codingStart = norm(num(codingObject.start, scaleMapAngle(304)));
    const codingStop = Math.min(360, codingStart + Math.max(0.5, scaleMapSpan(5)));
    const desiredCodingReady = codingStart - scaleMapSpan(profileTiming.codingArriveEarlyDeg);
    // The preferred arrive-early point can fall behind the final wipe on a
    // compact 60-head layout. Use the remaining forward window and reach the
    // orientation no later than the coder, never by adding another revolution.
    const codingTurnStart = lastTable + 0.5;
    const codingReady = desiredCodingReady > codingTurnStart
      ? Math.min(codingStart, desiredCodingReady)
      : codingStart;
    if (codingStart <= codingTurnStart) {
      issues.push({
        level: "bad",
        code: "coding-window-passed",
        message: `Coding starts at ${codingStart.toFixed(1)} deg, before the final label motion ends at ${lastTable.toFixed(1)} deg. Move the Coding Station later or finish the final wipe earlier.`
      });
    }
    moveToReference(codingReady, codingTarget, "Direct Turn for Coding", {
      codingWindowStart: finishAngle(codingStart),
      codingWindowStop: finishAngle(codingStop),
      codingReadyTableAngle: finishAngle(codingReady),
      codingMotion: "direct-shortest-path"
    });
    const codingHold = rows[rows.length - 1];
    rows[rows.length - 1] = {
      ...codingHold,
      // Keep the achieved coding orientation actively controlled through the
      // coding window. A CMD 3 here followed by the terminal CMD 3 creates an
      // illegal double-Rest ending on TopModul/TopMatic servos.
      cmd: 7,
      action: "Hold for Coding",
      codingHold: true,
      activeHold: true
    };
    add(3, Math.max(359, lastTable + 0.5), plate, "End Curve - Rest", {
      terminalRest: true,
      motionSource: "terminal-end-curve-rest"
    });
  }

  if (!codingObject) {
    const finalRow = rows[rows.length - 1];
    rows[rows.length - 1] = {
      ...finalRow,
      cmd: 3,
      action: "End Curve - Rest",
      terminalRest: true,
      motionSource: "terminal-end-curve-rest"
    };
  }
  const finalized = commandDriver ? commandDriver.finalize(rows) : rows;
  state.motionPlan = {
    rows: finalized,
    issues,
    stationPlans,
    pairPlans: [],
    finalPlateAngle: finalized[finalized.length - 1]?.plateAngle,
    termination: { section: codingObject ? "coding" : stationPlans[stationPlans.length - 1]?.section || "none", hmi: finalized.length, tableAngle: finalized[finalized.length - 1]?.tableAngle, command: "Rest" },
    mapDriven: true,
    profileKind: "apl-map-driven"
  };
  return finalized;
}

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
      termination: { section: "coding", hmi: rows.length, tableAngle: rows[rows.length - 1]?.tableAngle, command: "Rest" },
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

function applyGeneratedServoProfile() {
  const generated = applyMachineTypeProfileFraming(generatedServoProfile());
  const profileKey = servoOverrideProfileKey();
  const overrides = state.servoOverrides?.[profileKey] || {};
  state.program = generated.map((row, index) => {
    const override = overrides[String(row.plc ?? index)] || {};
    return {
      ...row,
      generatedTableAngle: row.tableAngle,
      generatedPlateAngle: row.plateAngle,
      tableAngle: Number.isFinite(Number(override.tableAngle)) ? Number(override.tableAngle) : row.tableAngle,
      plateAngle: Number.isFinite(Number(override.plateAngle)) ? Number(override.plateAngle) : row.plateAngle,
      tableAngleOverride: Number.isFinite(Number(override.tableAngle)) ? Number(override.tableAngle) : null,
      plateAngleOverride: Number.isFinite(Number(override.plateAngle)) ? Number(override.plateAngle) : null
    };
  });
}

function servoOverrideProfileKey() {
  return [state.activeMapId || "no-map", state.applicationMode || "apl", state.selectedBrand || "no-brand", state.selectedBottle || "no-bottle"].join("|");
}

function setServoAngleOverride(row, field, rawValue) {
  if (!state.servoOverrides || typeof state.servoOverrides !== "object") state.servoOverrides = {};
  const profileKey = servoOverrideProfileKey();
  const rowKey = String(row.plc ?? Math.max(0, Number(row.hmi) - 1));
  const profileOverrides = { ...(state.servoOverrides[profileKey] || {}) };
  const rowOverrides = { ...(profileOverrides[rowKey] || {}) };
  if (rawValue === "") delete rowOverrides[field];
  else rowOverrides[field] = num(rawValue, field === "tableAngle" ? row.tableAngle : row.plateAngle);
  if (Object.keys(rowOverrides).length) profileOverrides[rowKey] = rowOverrides;
  else delete profileOverrides[rowKey];
  if (Object.keys(profileOverrides).length) state.servoOverrides[profileKey] = profileOverrides;
  else delete state.servoOverrides[profileKey];
}

function applyMachineTypeProfileFraming(rows) {
  const machineMap = typeof activeMachineMap === "function" ? activeMachineMap() : null;
  if (String(machineMap?.machineType || "TopModul").toLowerCase() !== "autocol") return rows;
  const source = Array.isArray(rows) ? rows.map((row) => ({ ...row })) : [];
  const terminalIndex = source.findIndex((row) => row.terminalRest === true || /end curve/i.test(String(row.action || "")));
  const terminal = terminalIndex >= 0 ? source[terminalIndex] : null;
  const beforeTerminal = terminalIndex > 0 ? source[terminalIndex - 1] : null;
  // A map-driven profile promotes the final wipe endpoint to its terminal
  // Rest. Autocol still needs that Rest to capture the result of the preceding
  // Correction. Keep it when it contains real plate motion, then append the
  // separate mandatory End of curve line at 359 degrees.
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
  // The mandatory 2-degree Autocol Rest already holds the plate until the
  // first Correction. Drop generic leading hold rows or they become an extra
  // line in the Autocol travel-command table.
  const firstCorrectionIndex = middle.findIndex((row) => Number(row.cmd) === 7);
  if (firstCorrectionIndex > 0) middle = middle.slice(firstCorrectionIndex);
  if (motionEndRest) middle.push(motionEndRest);
  const alternating = [];
  middle.forEach((row, index) => {
    const previous = alternating[alternating.length - 1];
    if (Number(previous?.cmd) === 7 && Number(row.cmd) === 7) {
      // The shared pad boundary is both the end of the first motion and the
      // beginning of the next. Autocol needs that point expressed as a Rest,
      // followed by a new Correction command for the next (possibly reverse)
      // movement. Give the Correction a small forward table offset so every
      // setpoint remains strictly increasing.
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
      // Two ordinary Rest setpoints contain no intervening motion. Keep the
      // later reference only; start/end boundary commands are outside middle.
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
    { cmd: 3, tableAngle: 0, plateAngle: 0, action: "Spec.-shap. plate corners", autocolBoundary: "start-shape" },
    { cmd: 3, tableAngle: 2, plateAngle: 0, action: "Rest", autocolBoundary: "start-rest" },
    ...middle,
    { cmd: 3, tableAngle: 359, plateAngle: finalPlate, action: "End of curve", terminalRest: true, autocolBoundary: "end-curve", motionSource: "terminal-end-curve-rest" }
  ];
  return framed.map((row, index) => ({ ...row, hmi: index + 1, plc: index, autocolProfile: true }));
}
