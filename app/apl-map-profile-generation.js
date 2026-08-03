"use strict";

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
        // At the neck-to-body boundary, finish the neck wipe at the body's
        // required bottle angle. The terminal CMD 3 is a Rest, so the next
        // body wipe starts directly from that orientation without a setup row.
        const neckToBody = section === "neck" && sectionBoundary?.section === "body";
        const nextWipeStart = neckToBody
          ? Math.min(...(nextEntry?.[1] || []).filter((item) => item.kind === "roller" || item.kind === "pad").map((item) => num(item.start, Infinity)))
          : NaN;
        const transitionEnd = Number.isFinite(nextWipeStart) ? nextWipeStart - 1.5 : inside.end;
        const secondRotation = neckToBody ? sectionBoundary.plateAngle - plate : -(longNeckPlan?.insideRotation ?? required);
        moves.push(applyTurn(inside.start, transitionEnd, secondRotation, `Wipe Turn 2 ${sectionLabel(section)} - Agg ${station}`, {
          station, section, stage: "inner", endAction: neckToBody ? "Rest" : undefined, phaseTransition: neckToBody ? "neck-to-body" : undefined
        }));
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

window.LabelerAplMapProfileGenerator = Object.freeze({ generate: generatedAplMapDrivenProfile });
