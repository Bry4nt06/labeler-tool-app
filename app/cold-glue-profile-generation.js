"use strict";

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
  const moveToReferenceWithoutExtraLap = (targetTable, targetPlate, action, extra = {}) => {
    if (Math.abs(norm(num(targetTable, lastTable)) - norm(lastTable)) <= 0.001) {
      add(7, lastTable, plate, action, extra);
      plate = targetPlate;
      add(3, lastTable, plate, `${action} - Reference`, extra);
      return;
    }
    moveToReference(targetTable, targetPlate, action, extra);
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
    const channels = stationObjects.filter((item) => item.kind === "brush-channel");
    if (channels.length) {
      const firstHalfRequired = Math.max(0, num(wipe.labelDeg, 0) / 2 + num(wipe.overWipeDeg, 0));
      const reverseRequired = Math.max(0, num(wipe.labelDeg, 0) + num(wipe.overWipeDeg, 0) * 2);
      const requiredRotation = firstHalfRequired + reverseRequired;
      let moves = [];
      channels.forEach((channel) => {
        const outerStart = num(channel.outerStart, channel.start);
        const outerEnd = Math.max(outerStart, num(channel.outerEnd, channel.end));
        const innerStart = num(channel.innerStart, channel.start);
        const innerEnd = Math.max(innerStart, num(channel.innerEnd, channel.end));
        const channelStart = Math.min(outerStart, innerStart);
        const channelEnd = Math.max(outerEnd, innerEnd);
        const holdStart = Math.min(channelEnd, Math.max(channelStart, num(channel.bottleHoldStartDeg, channelStart)));
        const points = [...new Set([outerStart, outerEnd, innerStart, innerEnd, ...(channel.holdBottleAngle ? [holdStart] : [])])].sort((a, b) => a - b);
        for (let index = 0; index < points.length - 1; index += 1) {
          const start = points[index];
          const end = points[index + 1];
          if (end <= start + 0.001) continue;
          const middle = (start + end) / 2;
          const outerActive = middle >= outerStart && middle <= outerEnd;
          const innerActive = middle >= innerStart && middle <= innerEnd;
          const held = Boolean(channel.holdBottleAngle) && middle >= holdStart - 0.001;
          if (held || (outerActive && innerActive)) moves.push({ id: channel.id, stage: "opposed", start, end, rotation: 0, direction: 0, holdAngle: num(channel.bottleHoldAngleDeg, 90), holdCurrent: held && Boolean(channel.holdCurrentBottleAngle), configuredHold: held });
          else if (outerActive) moves.push({ id: channel.id, stage: "outer", start, end, direction: 1 });
          else if (innerActive) moves.push({ id: channel.id, stage: "inner", start, end, direction: -1 });
        }
      });
      const issues = [];
      const candidates = moves.filter((move) => move.stage === "outer" || move.stage === "inner").sort((a, b) => a.start - b.start);
      const totalOpenSpan = candidates.reduce((sum, move) => sum + move.end - move.start, 0);
      const safeRatio = state.maxMoveRatio * 0.9;
      const plannedRatio = totalOpenSpan > 0 ? Math.min(safeRatio, requiredRotation / totalOpenSpan) : 0;
      const initialDirection = candidates[0]?.direction || 1;
      let firstRemaining = firstHalfRequired;
      let reverseRemaining = reverseRequired;
      const allocated = candidates.map((move) => {
        const reversing = firstRemaining <= 0.001;
        const remaining = reversing ? reverseRemaining : firstRemaining;
        const rotation = Math.min(remaining, (move.end - move.start) * plannedRatio);
        if (reversing) reverseRemaining -= rotation;
        else firstRemaining -= rotation;
        return { ...move, rotation, ratio: plannedRatio, direction: reversing ? -initialDirection : initialDirection, centerTackStage: reversing ? "reverse-to-second-edge" : "first-half-to-edge" };
      });
      const candidateSet = new Set(candidates);
      moves = [...moves.filter((move) => !candidateSet.has(move)), ...allocated].sort((a, b) => a.start - b.start);
      const remainingRotation = Math.max(0, firstRemaining) + Math.max(0, reverseRemaining);
      if (requiredRotation > 0.001 && !candidates.length && !channels.every((channel) => channel.holdBottleAngle)) issues.push({ level: "bad", code: "cold-glue-channel-closed", message: "The Brush Channel has no open one-sided brush length available to wipe the label." });
      else if (remainingRotation > 0.001 && candidates.length) issues.push({ level: "bad", code: "cold-glue-channel-capacity", message: `The open Brush Channel length is short by ${remainingRotation.toFixed(1)} deg of bottle rotation.` });
      return { labelDeg: wipe.labelDeg, overWipeDeg: wipe.overWipeDeg, channelMoves: moves, issues };
    }
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
        ...(Array.isArray(stationPlan.final) ? stationPlan.final : stationPlan.inside || []),
        ...(Array.isArray(stationPlan.channelMoves) ? stationPlan.channelMoves : [])
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

      if (Array.isArray(stationPlan.channelMoves)) {
        stationPlan.channelMoves.forEach((allocation) => {
          if (allocation.stage === "opposed") {
            const holdAngle = allocation.holdCurrent ? plate : num(allocation.holdAngle, 90);
            const action = `${sectionLabel(section)} Brush Channel ${allocation.configuredHold ? "Configured" : "Opposed"} Hold at ${finishAngle(holdAngle)}°`;
            moveToReferenceWithoutExtraLap(allocation.start, holdAngle, action, { station, section, brushStage: "opposed", channelHold: true, holdAngle });
            applyMove(allocation.start, allocation.end, 0, 0, action, { station, section, brushStage: "opposed", channelHold: true, holdAngle });
          } else if (allocation.rotation > 0.001) {
            applyMove(allocation.start, allocation.end, allocation.rotation, allocation.direction, `${sectionLabel(section)} ${allocation.stage === "outer" ? "Outside" : "Inside"} Brush Channel Wipe-Down`, { station, section, brushStage: allocation.stage, plannedRotation: allocation.rotation, plannedRatio: allocation.ratio });
          }
        });
      } else if (Array.isArray(stationPlan.process) || Array.isArray(stationPlan.final) || Array.isArray(stationPlan.holds)) {
        const brushMoves = [
          ...(stationPlan.process || []).map((allocation) => ({ ...allocation, generatedStage: "process" })),
          ...(stationPlan.final || []).map((allocation) => ({ ...allocation, generatedStage: "final" })),
          ...(stationPlan.holds || []).map((allocation) => ({ ...allocation, generatedStage: "hold" }))
        ].sort((a, b) => num(a.start, 0) - num(b.start, 0));
        brushMoves.forEach((allocation) => {
          if (allocation.generatedStage === "hold") {
            const holdAngle = allocation.holdCurrent ? plate : num(allocation.holdAngle, 90);
            const holdAction = `${sectionLabel(section)} Brush Hold at ${finishAngle(holdAngle)}°`;
            moveToReferenceWithoutExtraLap(allocation.start, holdAngle, holdAction, { station, section, brushStage: "hold", channelHold: true, holdAngle });
            applyMove(allocation.start, allocation.end, 0, 0, holdAction, { station, section, brushStage: "hold", channelHold: true, holdAngle });
            return;
          }
          const finalStage = allocation.generatedStage === "final";
          applyMove(allocation.start, allocation.end, allocation.rotation, allocation.direction, `${sectionLabel(section)} ${finalStage ? "Final" : "Partial"} Brush Wipe-Down`, { station, section, brushStage: allocation.generatedStage, brushRole: allocation.role, plannedRotation: allocation.rotation, plannedRatio: allocation.ratio, coveragePercent: finalStage ? 100 - stationPlan.partialCoveragePercent : stationPlan.partialCoveragePercent });
        });
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

window.LabelerColdGlueProfileGenerator = Object.freeze({ generate: generatedColdGlueFixedProfile });
