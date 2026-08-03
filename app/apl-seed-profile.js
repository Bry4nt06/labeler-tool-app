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

window.LabelerAplSeedProfileGenerator = Object.freeze({
  generateSeed: generatedAplSeedProfile,
  generateTwoLabel: generatedAplTwoLabelProfile
});
