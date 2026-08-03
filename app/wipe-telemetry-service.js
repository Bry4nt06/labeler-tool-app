"use strict";

function wipeSectionFromRow(row) {
  const explicit = String(row?.section || "").toLowerCase();
  if (["neck", "body", "back"].includes(explicit)) return explicit;
  const match = String(row?.action || "").match(/\b(neck|body|back)\b/i);
  return match ? match[1].toLowerCase() : null;
}

function wipeLabelLengthMm(section, label = selectedLabelSpec()) {
  if (section === "neck") return Math.max(num(label?.neckBottomCurveMm, 0), num(label?.neckLengthMm, 0));
  if (section === "body") return num(label?.bodyLengthMm, 0);
  if (section === "back") return num(label?.backLengthMm, 0);
  return 0;
}

function tableAngleWithinObject(angle, item, padding = 0.5) {
  const point = Number(item?.angle);
  if (Number.isFinite(point)) return Math.abs(signedAngleDifference(angle, point)) <= Math.max(2, padding);
  const start = Number(item?.start);
  const end = Number(item?.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  const span = ((end - start) % 360 + 360) % 360;
  const relative = ((norm(angle) - norm(start)) % 360 + 360) % 360;
  return relative <= span + padding || relative >= 360 - padding;
}

function wipeStationContextAtAngle(tableAngle) {
  const machineMap = typeof activeMachineMap === "function" ? activeMachineMap() : null;
  const objects = Array.isArray(machineMap?.objects) ? machineMap.objects : [];
  const candidates = objects.filter((item) => ["brush", "pad", "roller", "wipe"].includes(String(item?.kind || "")) && Number.isFinite(Number(item?.station)) && tableAngleWithinObject(tableAngle, item));
  if (!candidates.length) return null;
  const item = candidates[0];
  const station = Math.max(1, Math.min(6, Math.round(Number(item.station))));
  return { station, section: labelSectionForStation(station), object: item };
}

function wipeContextForSegment(row) {
  const start = Number(row?.tableAngle);
  const travel = Number(row?.tableTravel);
  const sampleAngles = [start];
  if (Number.isFinite(travel) && travel > 0) sampleAngles.push(start + travel / 2, start + Math.max(0, travel - 0.01));
  const physical = sampleAngles.map(wipeStationContextAtAngle).find(Boolean);
  if (physical) return physical;
  if (/wipe|brush/i.test(String(row?.action || ""))) {
    const section = wipeSectionFromRow(row);
    if (section) return { station: Number(row?.station) || null, section, object: null };
  }
  return null;
}

function telemetryWipeObjects(objects) {
  return (Array.isArray(objects) ? objects : []).flatMap((item) => {
    if (item?.kind !== "brush-channel") return [item];
    return [
      { ...item, id: `${item.id}-telemetry-outer`, kind: "brush", side: "outer", start: num(item.outerStart, item.start), end: num(item.outerEnd, item.end), channelId: item.id },
      { ...item, id: `${item.id}-telemetry-inner`, kind: "brush", side: "inner", start: num(item.innerStart, item.start), end: num(item.innerEnd, item.end), channelId: item.id }
    ];
  });
}

function wipeObjectsForSection(section, station = null) {
  const machineMap = typeof activeMachineMap === "function" ? activeMachineMap() : null;
  return telemetryWipeObjects(machineMap?.objects).filter((item) => {
    if (!["brush", "pad", "roller", "wipe"].includes(String(item?.kind || ""))) return false;
    const itemStation = Number(item?.station);
    return Number.isFinite(itemStation)
      && labelSectionForStation(itemStation) === section
      && (!Number.isFinite(Number(station)) || itemStation === Number(station));
  });
}

function objectContactIntervals(item, minimum, maximum) {
  const point = Number(item?.angle);
  const rawStart = Number.isFinite(point) ? point - 1 : Number(item?.start);
  const rawEnd = Number.isFinite(point) ? point + 1 : Number(item?.end);
  if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd) || maximum <= minimum) return [];
  let span = rawEnd - rawStart;
  while (span < 0) span += 360;
  span = Math.min(360, span);
  const normalizedStart = norm(rawStart);
  const intervals = [];
  for (let turn = Math.floor((minimum - normalizedStart) / 360) - 1; turn <= Math.ceil((maximum - normalizedStart) / 360) + 1; turn += 1) {
    const start = normalizedStart + turn * 360;
    const end = start + span;
    const clippedStart = Math.max(minimum, start);
    const clippedEnd = Math.min(maximum, end);
    if (clippedEnd > clippedStart) intervals.push([clippedStart, clippedEnd]);
  }
  return intervals;
}

function mergedIntervalLength(intervals) {
  const sorted = intervals.filter((range) => Number.isFinite(range?.[0]) && Number.isFinite(range?.[1]) && range[1] > range[0]).sort((a, b) => a[0] - b[0]);
  if (!sorted.length) return 0;
  const merged = [sorted[0].slice()];
  sorted.slice(1).forEach(([start, end]) => {
    const last = merged[merged.length - 1];
    if (start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  });
  return merged.reduce((sum, [start, end]) => sum + end - start, 0);
}

function wipeObjectSideForRow(row) {
  const stage = String(row?.stage || row?.brushStage || "").toLowerCase();
  if (/outer|outer-pad/.test(stage)) return "outer";
  if (/inner|inner-pad/.test(stage)) return "inner";
  const action = String(row?.action || "");
  if (/wipe turn 1/i.test(action)) return "outer";
  if (/wipe turn 2/i.test(action)) return "inner";
  return null;
}

function contactedLabelCoverage(program, section, station, throughTableAngle, visual) {
  const objects = wipeObjectsForSection(section, station);
  const labelLengthMm = wipeLabelLengthMm(section);
  const label = selectedLabelSpec();
  const circumferenceMm = section === "neck" ? num(label?.neckBottomCircumferenceMm, 0) : bodyCircumference(selectedBottleSpec());
  const labelDegrees = degFromMm(labelLengthMm, circumferenceMm);
  if (!objects.length || !Number.isFinite(labelDegrees) || labelDegrees <= 0) return { percentage: 0, leftPercent: 0, rightPercent: 0 };
  const intervalsByVisualSide = { left: [], right: [] };
  const leadingIntervals = [];
  const physicalSides = new Set(objects.map((item) => item?.side === "inner" ? "inner" : "outer"));
  const usesOppositeContactSides = physicalSides.size > 1;
  programSegments(program).forEach((row) => {
    const tableStart = Number(row.tableAngle);
    const tableTravel = Number(row.tableTravel);
    const plateStart = Number(row.plateAngle);
    const plateTravel = Number(row.plateTravel);
    if (Number(row.cmd) !== 7 || !Number.isFinite(tableStart) || !Number.isFinite(tableTravel) || tableTravel <= 0 || !Number.isFinite(plateStart) || !Number.isFinite(plateTravel)) return;
    const tableEnd = Math.min(tableStart + tableTravel, throughTableAngle);
    if (tableEnd <= tableStart) return;
    const commandedSide = wipeObjectSideForRow(row);
    const matchingSideObjects = commandedSide
      ? objects.filter((item) => (item?.side === "inner" ? "inner" : "outer") === commandedSide)
      : [];
    const contactObjects = matchingSideObjects.length ? matchingSideObjects : objects;
    contactObjects.forEach((item) => {
      objectContactIntervals(item, tableStart, tableEnd).forEach(([contactStart, contactEnd]) => {
        const startProgress = (contactStart - tableStart) / tableTravel;
        const endProgress = (contactEnd - tableStart) / tableTravel;
        const bottleStart = plateStart + plateTravel * startProgress;
        const bottleEnd = plateStart + plateTravel * endProgress;
        const bottleInterval = [Math.min(bottleStart, bottleEnd), Math.max(bottleStart, bottleEnd)];
        if (visual.tackMode === "leading") {
          leadingIntervals.push(bottleInterval);
          return;
        }
        let visualSide;
        if (usesOppositeContactSides) {
          const physicalSide = item?.side === "inner" ? "inner" : "outer";
          visualSide = state.direction === "cw"
            ? (physicalSide === "inner" ? "right" : "left")
            : (physicalSide === "inner" ? "left" : "right");
        } else {
          const movesRightToLeft = plateTravel >= 0 ? state.direction !== "cw" : state.direction === "cw";
          visualSide = movesRightToLeft ? "left" : "right";
        }
        intervalsByVisualSide[visualSide].push(bottleInterval);
      });
    });
  });
  const halfLabel = labelDegrees / 2;
  let leftDegrees = 0;
  let rightDegrees = 0;
  if (visual.tackMode === "leading") {
    const contactedDegrees = Math.min(labelDegrees, mergedIntervalLength(leadingIntervals));
    if (visual.direction === "rtl") {
      rightDegrees = Math.min(halfLabel, contactedDegrees);
      leftDegrees = Math.min(halfLabel, Math.max(0, contactedDegrees - halfLabel));
    } else {
      leftDegrees = Math.min(halfLabel, contactedDegrees);
      rightDegrees = Math.min(halfLabel, Math.max(0, contactedDegrees - halfLabel));
    }
  } else {
    leftDegrees = Math.min(halfLabel, mergedIntervalLength(intervalsByVisualSide.left));
    rightDegrees = Math.min(halfLabel, mergedIntervalLength(intervalsByVisualSide.right));
  }
  const leftPercent = Math.max(0, Math.min(100, 100 * leftDegrees / halfLabel));
  const rightPercent = Math.max(0, Math.min(100, 100 * rightDegrees / halfLabel));
  const percentage = (leftPercent + rightPercent) / 2;
  const stagedBackspinPercent = visual.tackMode === "leading"
    ? Math.min(percentage, visual.backspinPercent)
    : 0;
  const backspinFillPercent = visual.tackMode === "leading" && visual.backspinPercent > 0
    ? Math.max(0, Math.min(100, 100 * stagedBackspinPercent / visual.backspinPercent))
    : 0;
  const mainWipePercent = visual.tackMode === "leading"
    ? Math.max(0, Math.min(100 - visual.backspinPercent, percentage - visual.backspinPercent))
    : 0;
  return { percentage, leftPercent, rightPercent, backspinFillPercent, mainWipePercent };
}

function wipeVisualApplication(section, labelLengthMm) {
  const neckLeading = section === "neck" && state.buildInputs.neckApplication === "Leading Edge";
  const tackMode = section === "neck" && !neckLeading ? "center" : "leading";
  const direction = state.direction === "cw" ? "ltr" : "rtl";
  const backspinMm = section === "neck"
    ? num(state.buildInputs.neckContactMm, 0)
    : section === "body"
      ? num(state.buildInputs.bodyContactMm, 5)
      : section === "back"
        ? num(state.buildInputs.backContactMm, 5)
        : 0;
  const backspinPercent = labelLengthMm > 0 ? Math.max(0, Math.min(100, 100 * backspinMm / labelLengthMm)) : 0;
  return { tackMode, direction, backspinMm, backspinPercent };
}

function wipeDownTelemetry(program = currentProgram(), tableAngle = state.previewAngle) {
  const segments = programSegments(program);
  const active = activeSegmentForProgram(program, tableAngle);
  const activePhysical = wipeStationContextAtAngle(tableAngle);
  const activeExplicitSection = /wipe|brush/i.test(String(active?.action || "")) ? wipeSectionFromRow(active) : null;
  const activeWipeContext = Number(active?.cmd) === 7 ? wipeContextForSegment(active) : null;
  const resetForNextCorrection = Number(active?.cmd) === 7
    && !activePhysical
    && !activeExplicitSection
    && !activeWipeContext?.section;
  const wipeRows = segments.map((row) => ({ row, context: wipeContextForSegment(row) })).filter(({ row, context }) => Number(row.cmd) === 7 && context?.section);
  let context = activePhysical
    || activeWipeContext
    || (activeExplicitSection ? { section: activeExplicitSection, station: Number(active?.station) || null } : null);
  if (!context?.section) {
    const nearby = [...wipeRows].reverse().find(({ row }) => Number(row.tableAngle) <= tableAngle) || wipeRows.find(({ row }) => Number(row.tableAngle) > tableAngle);
    context = nearby?.context || null;
  }
  const section = context?.section || null;
  const station = Number.isFinite(Number(context?.station)) ? Number(context.station) : null;
  const labelLengthMm = wipeLabelLengthMm(section);
  const visual = wipeVisualApplication(section, labelLengthMm);
  const emptyCoverage = { percentage: 0, leftPercent: 0, rightPercent: 0, backspinFillPercent: 0, mainWipePercent: 0 };
  const coverage = section && !resetForNextCorrection
    ? contactedLabelCoverage(program, section, station, tableAngle, visual)
    : emptyCoverage;
  const sectionLabel = section ? `${section[0].toUpperCase()}${section.slice(1)} label${station ? ` • Station ${station}` : ""}` : "Waiting for label";
  return {
    section,
    station,
    sectionLabel,
    labelLengthMm,
    currentTurn: String(active?.action || "Waiting for wipe-down"),
    plateAngle: plateAngleAt(tableAngle, program),
    ...coverage,
    ...visual
  };
}

window.LabelerWipeTelemetryService = Object.freeze({
  wipeSectionFromRow,
  wipeLabelLengthMm,
  tableAngleWithinObject,
  wipeStationContextAtAngle,
  wipeContextForSegment,
  telemetryWipeObjects,
  wipeObjectsForSection,
  objectContactIntervals,
  mergedIntervalLength,
  wipeObjectSideForRow,
  contactedLabelCoverage,
  wipeVisualApplication,
  wipeDownTelemetry
});
