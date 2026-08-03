"use strict";

const LABEL_SECTION_PRESENT_THRESHOLD_MM = 1;

function labelSectionDimensionPresent(...values) {
  return values.some((value) => num(value, 0) > LABEL_SECTION_PRESENT_THRESHOLD_MM);
}

function selectedLabelApplicationState() {
  const label = selectedLabelSpec();
  const available = {
    neck: labelSectionDimensionPresent(label?.neckLengthMm, label?.neckBottomCurveMm),
    body: labelSectionDimensionPresent(label?.bodyLengthMm),
    back: labelSectionDimensionPresent(label?.backLengthMm)
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

function stationIsOperational(assembly) {
  const normalized = normalizeAssembly(assembly);
  const section = labelSectionForStation(normalized.station);
  return Boolean(normalized.enabled && normalized.type !== "none" && normalized.sides.length && selectedLabelApplicationState()[section]);
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
