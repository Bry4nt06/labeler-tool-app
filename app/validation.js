"use strict";

function validate() {
  const notes = [];
  if (state.headCount > 72) notes.push(["bad", "Head count exceeds the 72-motor maximum described in the manual."]);
  if (state.headCount < 1) notes.push(["bad", "Head count must be at least 1."]);

  const sorted = [...state.mapPoints].sort((a, b) => a.angle - b.angle);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].angle <= sorted[i - 1].angle) notes.push(["bad", "Map point angles must increase around the table."]);
  }

  if (state.applicationMode !== "cold-glue") state.assemblies.forEach((rawAssembly) => {
    const assembly = normalizeAssembly(rawAssembly);
    if (assembly.enabled && assembly.type === "pads" && assembly.sides.includes("inner") && assembly.sides.includes("outer") && assembly.padSideOffsetDeg <= 0) {
      notes.push(["bad", `Station ${assembly.station} has inner and outer wipe-down pads at the same table position. Add a positive inner-pad offset so the set-down and full-wipe turns occur on separate mechanical surfaces.`]);
    }
  });

  const segments = programSegments(state.program);
  for (let i = 1; i < segments.length; i += 1) {
    if (segments[i].tableAngle <= segments[i - 1].tableAngle) {
      notes.push(["bad", `Servo table angle does not increase at HMI ${segments[i].hmi}.`]);
      break;
    }
  }
  const missing = segments.filter((row) => row.cmd !== 0 && !Number.isFinite(row.plateAngle));
  if (missing.length) notes.push(["warn", `${missing.length} active command rows have missing plate angles from the workbook lookup path.`]);
  const faults = segments.filter((row) => row.moveFault);
  faults.forEach((row) => notes.push(["bad", `Move HMI ${row.hmi} -> ${row.hmi + 1} will fault: ${fmt(Math.abs(row.plateTravel), 1)} deg plate in ${fmt(Math.abs(row.tableTravel), 1)} deg table (ratio ${fmt(row.absSpeed, 1)}, limit ${fmt(state.maxMoveRatio, 1)}).`]));
  const usesAplMapDrivenProfile = state.motionPlan?.profileKind === "apl-map-driven";
  if (state.applicationMode !== "cold-glue" && !usesAplMapDrivenProfile) state.assemblies.forEach((assembly) => {
    const status = assemblyStatus(assembly);
    if (status.level === "bad") notes.push(["bad", `Wipe-down station ${assembly.station} ${assemblyPositionLabel(assembly).toLowerCase()} ${assemblyTypeLabel(assembly.type).toLowerCase()} cannot meet the physical contact distance: ${fmt(assembly.requiredPlateRotation, 1)} deg plate rotation in ${fmt(assemblySpan(assembly), 1)} deg table (${fmt(status.ratio, 2)}:1; servo limit ${fmt(state.maxMoveRatio, 1)}:1).`]);
    else if (status.level === "warn") notes.push(["warn", `Wipe-down station ${assembly.station} is near the servo limit at ${fmt(status.ratio, 2)}:1.`]);
  });
  const applications = selectedLabelApplicationState();
  const machineMap = typeof activeMachineMap === "function" ? activeMachineMap() : null;
  const sensorSections = machineMap?.applicationMode === "apl" && typeof inferAplStationSections === "function"
    ? inferAplStationSections(machineMap)
    : (() => {
      const result = { ...(machineMap?.stationSections || {}) };
      const activeSections = ["neck", "body", "back"].filter((section) => applications[section]);
      activeSlotNumbers(machineMap?.enabledStations || []).forEach((station, index) => {
        if (!result[String(station)] && activeSections[index]) result[String(station)] = activeSections[index];
      });
      return result;
    })();
  (machineMap?.objects || []).filter((item) => item.kind === "sensor" && isStationEnabled(machineMap, Number(item.station))).forEach((sensor) => {
    const station = Number(sensor.station);
    const section = sensorSections[String(station)] || labelSectionForStation(station);
    const placement = num(sensor.angle, sensor.start);
    if (!section || section === "none" || !applications[section]) {
      notes.push(["bad", `${sensor.name || "Label Sensor"} at Station ${station} is assigned to a label that is not active.`, { objectId: sensor.id }]);
      return;
    }
    const seed = generatedAplSeedProfile();
    const targetIndex = section === "neck" ? 1 : section === "body" ? 11 : 21;
    const bottleAngle = plateAngleAt(placement, state.program);
    const labelWidth = Math.min(360, Math.max(3, num(sectionWipePlan(section)?.labelDeg, 0)));
    const labelCenter = labelSensorInspectionCenter(section, num(seed[targetIndex]?.plateAngle, 0), labelWidth);
    const requiredVisibility = Math.min(100, Math.max(1, num(sensor.requiredVisibilityPercent, 50)));
    const visibility = labelSensorVisibility(labelCenter, bottleAngle, labelWidth, 180);
    const visible = visibility.percent + 0.001 >= requiredVisibility;
    notes.push([visible ? "ok" : "warn", visible
      ? `${sensor.name || "Label Sensor"} at Station ${station} can view ${fmt(visibility.percent, 1)}% of the ${sectionLabel(section).toLowerCase()} label through its 3 deg table window (${fmt(requiredVisibility, 0)}% required).`
      : `${sensor.name || "Label Sensor"} at Station ${station} can only view ${fmt(visibility.percent, 1)}% of the ${sectionLabel(section).toLowerCase()} label at ${fmt(placement, 1)} deg table; at least ${fmt(requiredVisibility, 0)}% is required.${sensor.servoAssist ? " Servo assist is enabled but could not achieve the target." : " Enable Orient bottle for sensor to generate the shortest corrective turn."}`, { objectId: sensor.id }]);
  });
  const activeObjects = (machineMap?.objects || []).filter((item) => item.kind !== "coding" && isStationEnabled(machineMap, Number(item.station)));
  activeObjects.forEach((item, index) => {
    const itemStart = num(item.angle, item.start);
    const itemEnd = item.kind === "sensor" ? itemStart + 3 : num(item.end, itemStart);
    activeObjects.slice(index + 1).forEach((other) => {
      if (item.id === other.id || Number(item.station) === Number(other.station)) return;
      const otherStart = num(other.angle, other.start);
      const otherEnd = other.kind === "sensor" ? otherStart + 3 : num(other.end, otherStart);
      if (Math.min(itemEnd, otherEnd) - Math.max(itemStart, otherStart) <= 0.1) return;
      notes.push(["warn", `${item.name} overlaps ${other.name} on the table map. Confirm that both objects can physically occupy this location.`, { objectId: item.id }]);
    });
  });
  if (state.applicationMode !== "cold-glue") ["neck", "body", "back"].forEach((section) => {
    if (!applications[section]) return;
    const sectionStations = state.assemblies.filter((assembly) => labelSectionForStation(assembly.station) === section);
    const operational = sectionStations.filter(stationIsOperational);
    if (!operational.length) {
      notes.push(["bad", `${sectionLabel(section)} label is present, but neither ${sectionLabel(section).toLowerCase()} wipe-down station is installed. No complete wipe-down can occur.`]);
    }
  });

  ["neck", "body", "back"].forEach((section) => {
    if (!applications[section]) return;
    const plan = sectionWipePlan(section);
    if (plan && plan.wipeAllowance <= 0) {
      notes.push(["warn", `${sectionLabel(section)} over-wipe is 0 deg in Build Inputs. The generated profile covers the label geometry but adds no intentional extra wipe rotation.`]);
    }
  });

  if (state.applicationMode !== "cold-glue" && !usesAplMapDrivenProfile) state.assemblies.forEach((assembly) => {
    const analysis = stationWipeAnalysis(assembly, state.program);
    if (!analysis.active) return;
    const tolerance = 0.5;
    const splitStages = Array.isArray(analysis.stages) && analysis.stages.some((stage) => stage.key === "outer" || stage.key === "inner");
    const plan = analysis.wipePlan || {};
    const stageSummary = splitStages
      ? ` Outside stage: ${fmt(analysis.stages.find((stage) => stage.key === "outer")?.contactRotation || 0, 1)} / ${fmt(analysis.stages.find((stage) => stage.key === "outer")?.requiredRotation || 0, 1)} deg; inside stage: ${fmt(analysis.stages.find((stage) => stage.key === "inner")?.contactRotation || 0, 1)} / ${fmt(analysis.stages.find((stage) => stage.key === "inner")?.requiredRotation || 0, 1)} deg.`
      : "";
    const requirementBreakdown = plan.mode === "center-tack-two-stage"
      ? ` Base label coverage ${fmt(plan.baseCoverageRequired, 1)} deg + intentional over-wipe ${fmt(plan.overWipeRequired, 1)} deg (${fmt(plan.wipeAllowance, 1)} deg per side).`
      : ` Set-down ${fmt(plan.contactSetDown || 0, 1)} deg + label coverage ${fmt(plan.labelDeg || 0, 1)} deg + intentional over-wipe ${fmt(plan.overWipeRequired || 0, 1)} deg.`;
    const failedStages = splitStages
      ? analysis.stages.filter((stage) => !stage.aligned || stage.contactRotation + tolerance < stage.requiredRotation)
      : [];
    if (failedStages.length || analysis.contactRotation + tolerance < analysis.requiredRotation) {
      const alignmentText = failedStages.some((stage) => !stage.aligned)
        ? " One or more servo turns do not reach the matching mechanical wipe assembly."
        : "";
      notes.push(["bad", `Station ${analysis.station} does not fully wipe the ${analysis.section} label: the combined contact stages provide ${fmt(analysis.contactRotation, 1)} deg of bottle rotation, but ${fmt(analysis.requiredRotation, 1)} deg is required from the selected Build Inputs and label geometry. ${requirementBreakdown}${stageSummary}${alignmentText}`]);
    } else {
      notes.push(["ok", `Station ${analysis.station} fully covers the ${analysis.section} label with ${fmt(analysis.contactRotation, 1)} deg combined contact rotation for ${fmt(analysis.requiredRotation, 1)} deg required. ${requirementBreakdown}${stageSummary}`]);
    }
    if (analysis.outsideRotation > tolerance) {
      notes.push(["warn", `Station ${analysis.station} has ${fmt(analysis.outsideRotation, 1)} deg of bottle-plate rotation outside its mechanical contact window (${fmt(analysis.window.start, 1)}-${fmt(analysis.window.end, 1)} deg table). Move the servo turn into the wipe-down window to reduce wear.`]);
    }
  });

  if (state.applicationMode !== "cold-glue" && !usesAplMapDrivenProfile) {
    const inactiveRows = inactiveMovementRows();
    inactiveRows.forEach((reason, index) => {
      const segment = segments[index];
      if (segment && Number.isFinite(segment.plateTravel) && Math.abs(segment.plateTravel) > 0.5) {
        notes.push(["bad", `HMI ${segment.hmi} rotates ${fmt(Math.abs(segment.plateTravel), 1)} deg in an inactive area (${reason}). The generated program should hold the bottle plate here.`]);
      }
    });
  }

  const motionValidationDriver = window.LabelerMotionValidationDriver;
  const commandDriver = window.LabelerServoCommandDriver;
  if (motionValidationDriver && state.motionPlan) {
    motionValidationDriver.analyze({ plan: state.motionPlan, rows: state.program, tolerance: 0.5 })
      .forEach((issue) => notes.push([issue.level, issue.message]));
  }
  if (commandDriver) {
    commandDriver.validateReferences(state.program)
      .forEach((issue) => notes.push([issue.level, issue.message]));
  }

  const speedRows = segments.filter((row) => Number.isFinite(row.absSpeed));
  const maxSpeed = speedRows.reduce((best, row) => row.absSpeed > (best?.absSpeed ?? -Infinity) ? row : best, null);
  if (maxSpeed) {
    const threshold = Math.max(0.1, num(state.maxMoveRatio, 21));
    const speed = maxSpeed.absSpeed;
    const level = speed >= threshold ? "bad" : speed >= threshold * 0.85 ? "warn" : "ok";
    const callout = level === "bad" ? "EXCEEDS THRESHOLD" : level === "warn" ? "NEAR THRESHOLD" : "WITHIN THRESHOLD";
    notes.push([level, `Maximum turn speed: ${fmt(speed, 1)} deg bottle / 1 deg table at HMI ${maxSpeed.hmi} — ${callout} (${fmt(threshold, 1)}:1 limit).`]);
  }
  if (typeof aggregateCenterlineGaps === "function") {
    aggregateCenterlineGaps()
      .filter((gap) => gap.violatesMinimum)
      .forEach((gap) => notes.push(["bad", `Aggregate centerline spacing A${gap.from} → A${gap.to} is ${fmt(gap.gapDeg, 1)}°, below the 6.0° minimum.`]));
  }
  if (!notes.length) notes.push(["ok", "No geometry or servo profile warnings at the current settings."]);
  return notes;
}
