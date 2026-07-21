"use strict";

const MACHINE_MAP_SCHEMA_VERSION = 11;
const STELLA_330_FULL_WRAP_CALIBRATION_VERSION = 2;
const BLANK_MAP_SEED_VERSION = 1;
let runtimeMachineMapId = null;

function isProtectedMapTemplate() {
  return false;
}

function uniqueMapName(baseName) {
  const base = String(baseName || "Machine Map").trim() || "Machine Map";
  const names = new Set((state.mapLibrary || []).map((map) => String(map.name).toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  let suffix = 2;
  while (names.has(`${base} ${suffix}`.toLowerCase())) suffix += 1;
  return `${base} ${suffix}`;
}

function uniqueMapId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function defaultAplMapObjects() {
  const objects = [];
  defaultAssemblies.map(normalizeAssembly).forEach((assembly) => {
    if (!assembly.enabled || assembly.type === "none") return;
    assembly.sides.forEach((side) => {
      const angles = assembly.type === "rollers"
        ? (side === "inner" ? assembly.innerRollerAngles : assembly.outerRollerAngles)
        : padAnglesForSide(assembly, side);
      if (assembly.type === "rollers") {
        angles.forEach((angle, index) => {
          objects.push({
            id: `apl-station-${assembly.station}-${side}-roller-${index + 1}`,
            name: `Station ${assembly.station} ${side === "inner" ? "Inside" : "Outside"} Roller ${index + 1}`,
            station: assembly.station,
            kind: "roller",
            side,
            start: Number(angle),
            wipeSpanDeg: 10,
            extension: 20
          });
        });
        return;
      }
      objects.push({
        id: `apl-station-${assembly.station}-${side}`,
        name: `Station ${assembly.station} ${side === "inner" ? "Inside" : "Outside"} ${assembly.type === "rollers" ? "Rollers" : "Wipe-Down Pad"}`,
        station: assembly.station,
        kind: assembly.type === "rollers" ? "roller" : "pad",
        side,
        start: Number(angles[0]),
        end: Number(angles[1]),
        extension: 20
      });
    });
  });
  return objects;
}

function inferredMapObjectStation(item) {
  const explicit = Number(item?.station);
  if (Number.isFinite(explicit) && explicit >= 1 && explicit <= 6) return Math.round(explicit);
  const match = String(item?.name || "").match(/station\s*(\d+)/i);
  const parsed = Number(match?.[1]);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 6 ? Math.round(parsed) : null;
}

function normalizeBuilderObject(item, mode, stationCount = 6) {
  const kindOptions = ["pad", "brush", "roller", "gripper", "coding", "sensor"];
  const kind = kindOptions.includes(item?.kind) ? item.kind : kindOptions[0];
  const application = item?.application === "cold-glue" || kind === "brush" || kind === "gripper" ? "cold-glue" : "apl";
  const aplRoller = application === "apl" && kind === "roller";
  const singlePoint = kind === "gripper" || kind === "sensor" || (application === "cold-glue" && kind === "roller");
  const start = num(singlePoint ? item?.angle : item?.start, 0);
  const originalEnd = num(singlePoint ? item?.angle : item?.end, start + 10);
  // An APL roller is one physical roller. Its coverage value describes the
  // roller's contact footprint during the wipe, never a second map point.
  const wipeSpanDeg = aplRoller
    ? Math.max(0.1, num(item?.wipeSpanDeg, Math.abs(originalEnd - start) || 10))
    : 0;
  const end = kind === "coding" ? start + 5 : kind === "sensor" ? start + 3 : aplRoller ? start + wipeSpanDeg : originalEnd;
  return {
    ...item,
    id: String(item?.id || uniqueMapId(mode)),
    name: String(item?.name || `${kind[0].toUpperCase()}${kind.slice(1)} object`),
    kind,
    application,
    side: item?.side === "inner" ? "inner" : "outer",
    role: application === "cold-glue" && kind === "brush" && ["process", "final", "hold"].includes(item?.role) ? item.role : "process",
    coveragePercent: application === "cold-glue" && kind === "brush" ? Math.max(0, Math.min(100, num(item?.coveragePercent, 0))) : 0,
    start,
    end,
    wipeSpanDeg,
    angle: singlePoint ? start : item?.angle,
    servoAssist: kind === "sensor" && Boolean(item?.servoAssist),
    requiredVisibilityPercent: kind === "sensor" ? Math.min(100, Math.max(1, num(item?.requiredVisibilityPercent, 50))) : 50,
    extension: Math.max(4, num(item?.extension, 20)),
    station: kind === "coding" ? null : Math.max(1, Math.min(6, Math.round(num(item?.station, inferredMapObjectStation(item) || 1))))
  };
}

function itemApplicationMode(item) {
  return item?.application === "cold-glue" || item?.kind === "brush" || item?.kind === "gripper" ? "cold-glue" : "apl";
}


function normalizeEnabledSlots(value, fallbackCount) {
  const source = Array.isArray(value) ? value : [];
  const count = Math.max(1, Math.min(6, Math.round(num(fallbackCount, 6))));
  const result = Array.from({ length: 6 }, (_, index) => source[index] === undefined ? index < count : Boolean(source[index]));
  if (!result.some(Boolean)) result[0] = true;
  return result;
}

function activeSlotNumbers(value) {
  return normalizeEnabledSlots(value, 1).map((enabled, index) => enabled ? index + 1 : null).filter(Boolean);
}

function isAggregateEnabled(machineMap, aggregate) {
  return Boolean(normalizeEnabledSlots(machineMap?.enabledAggregates, machineMap?.aggregateCount)[aggregate - 1]);
}

function isStationEnabled(machineMap, station) {
  return Boolean(normalizeEnabledSlots(machineMap?.enabledStations, machineMap?.stationCount)[station - 1]);
}

function activeAplStationNumbers(machineMap) {
  // Stations and aggregates are independent physical map objects. Disabling
  // an aggregate marker must not silently remove the same-numbered wipe station.
  return Array.from({ length: 6 }, (_, index) => index + 1).filter((station) => isStationEnabled(machineMap, station));
}

function activeAplStationLimit(machineMap) {
  const active = activeAplStationNumbers(machineMap);
  return active.length ? Math.max(...active) : 1;
}

function defaultAplStationAngles() {
  return Object.fromEntries(defaultAssemblies.map((assembly) => [String(assembly.station), Number(assembly.spenderAngle)]));
}

function defaultAplAggregateAngles() {
  return Object.fromEntries(defaultAssemblies.map((assembly) => [String(assembly.station), Number(assembly.spenderAngle)]));
}

function sortAplMapObjects(objects) {
  const sideOrder = { outer: 0, inner: 1 };
  return objects.sort((a, b) => Number(a.station) - Number(b.station) || (sideOrder[a.side] ?? 9) - (sideOrder[b.side] ?? 9) || String(a.name).localeCompare(String(b.name)));
}

function inferredAplStation(item) {
  const idMatch = String(item?.id || "").match(/apl-station-(\d+)/i);
  const nameMatch = String(item?.name || "").match(/station\s+(\d+)/i);
  const parsed = Number(idMatch?.[1] || nameMatch?.[1]);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 6 ? parsed : null;
}

function repairAplStationAssignments(machineMap) {
  if (!machineMap || machineMap.applicationMode !== "apl") return;
  machineMap.objects = machineMap.objects.map((item) => {
    const expected = inferredAplStation(item);
    return expected && Number(item.station) !== expected ? { ...item, station: expected } : item;
  });
}

function ensureAplObjectsForNewStations(machineMap, previousLimit = 0) {
  if (!machineMap || machineMap.applicationMode !== "apl" || machineMap.restoreDefaultObjects === false) return;
  repairAplStationAssignments(machineMap);
  const activeStations = activeAplStationNumbers(machineMap);
  const defaultsByStation = new Map();
  defaultAplMapObjects().forEach((item) => {
    const station = Number(item.station);
    if (!defaultsByStation.has(station)) defaultsByStation.set(station, []);
    defaultsByStation.get(station).push(item);
  });

  // Rebuild every exact missing station in sequence. Existing higher-numbered
  // stations remain stored but can never satisfy a lower station slot.
  for (const station of activeStations) {
    const stationObjects = machineMap.objects.filter((item) => Number(item.station) === station && (item.kind === "pad" || item.kind === "roller"));
    if (stationObjects.length) continue;
    const defaults = defaultsByStation.get(station) || [];
    defaults.forEach((item) => {
      const restored = normalizeBuilderObject(deepClone(item), "apl", 6);
      restored.station = station;
      restored.id = `apl-station-${station}-${restored.side}`;
      restored.name = `Station ${station} ${restored.side === "inner" ? "Inside" : "Outside"} ${restored.kind === "roller" ? "Rollers" : "Wipe-Down Pad"}`;
      machineMap.objects.push(restored);
    });
  }
  machineMap.objects = sortAplMapObjects(machineMap.objects);
}

function defaultColdGlueAggregateAngles(objects = []) {
  const defaults = { "1": 75, "2": 153, "3": 231, "4": 271, "5": 311, "6": 351 };
  const grippers = (Array.isArray(objects) ? objects : [])
    .filter((item) => (item?.kind === "gripper" || item?.kind === "pallet"))
    .map((item) => num(item.angle, item.start))
    .filter(Number.isFinite);
  grippers.slice(0, 6).forEach((angle, index) => { defaults[String(index + 1)] = angle; });
  return defaults;
}

function optimizeColdGlueMapExample({ requireStella660 = false } = {}) {
  const machineMap = activeMachineMap();
  if (!machineMap || machineMap.applicationMode !== "cold-glue") return false;
  const stella660Pattern = /(?=.*stella)(?=.*660)/i;
  const specification = requireStella660
    ? state.labelSpecs.find((spec) => normalizeLabelApplicationMode(spec.applicationMode) === "cold-glue" && stella660Pattern.test(String(spec.brand || "")))
    : selectedLabelSpec();
  if (!specification || normalizeLabelApplicationMode(specification.applicationMode) !== "cold-glue") return false;

  state.selectedBrand = specification.brand;
  if (specification.bottleType) state.selectedBottle = specification.bottleType;
  state.applicationMode = "cold-glue";
  machineMap.applicationMode = "cold-glue";
  machineMap.headCount = 60;

  const sections = [
    Math.max(num(specification.neckLengthMm, 0), num(specification.neckBottomCurveMm, 0)) > 0 ? "neck" : null,
    num(specification.bodyLengthMm, 0) > 0 ? "body" : null,
    num(specification.backLengthMm, 0) > 0 ? "back" : null
  ].filter(Boolean);
  const stations = activeSlotNumbers(machineMap.enabledStations)
    .filter((station) => activeSlotNumbers(machineMap.enabledAggregates).includes(station))
    .slice(0, sections.length);
  if (!stations.length || !sections.length) return false;

  const pitch = 360 / machineMap.headCount;
  const newObjects = [];
  stations.forEach((station, index) => {
    const section = sections[index];
    const aggregateAngle = norm(num(machineMap.aggregateAngles?.[String(station)], num(machineMap.stationAngles?.[String(station)], station * 40 + 35)));
    const nextStation = stations[index + 1];
    let nextBoundary = nextStation
      ? norm(num(machineMap.aggregateAngles?.[String(nextStation)], num(machineMap.stationAngles?.[String(nextStation)], aggregateAngle + 80)))
      : 359;
    while (nextBoundary <= aggregateAngle + pitch) nextBoundary += 360;
    nextBoundary = Math.min(359, nextBoundary);
    const channelStart = Math.min(356, aggregateAngle + Math.max(6, pitch));
    const availableSpan = Math.max(4, nextBoundary - channelStart - Math.max(3, pitch / 2));
    const wipe = sectionWipePlan(section);
    const labelDeg = Math.max(0, num(wipe?.labelDeg, 0));
    const overWipeDeg = Math.max(0, num(wipe?.overWipeDeg, 0));
    // A shared channel performs the half-label first-side wipe and the
    // remaining opposite-side wipe. Target roughly 8 degrees of bottle turn
    // per degree of table travel for a natural, comfortably sub-limit motion.
    const totalRequiredRotation = labelDeg * 1.5 + overWipeDeg * 3;
    const desiredSpan = Math.max(12, totalRequiredRotation / 8);
    const channelEnd = Math.min(359, channelStart + Math.min(availableSpan, desiredSpan));
    const sectionName = sectionLabel(section);
    newObjects.push(
      normalizeBuilderObject({ id: `stella-660-${station}-${section}-outer`, name: `${sectionName} Outside Brush Channel`, kind: "brush", application: "cold-glue", station, side: "outer", role: "process", coveragePercent: 50, start: channelStart, end: channelEnd, extension: 20 }, "cold-glue", machineMap.stationCount),
      normalizeBuilderObject({ id: `stella-660-${station}-${section}-inner`, name: `${sectionName} Inside Brush Channel`, kind: "brush", application: "cold-glue", station, side: "inner", role: "final", coveragePercent: 0, start: channelStart, end: channelEnd, extension: 20 }, "cold-glue", machineMap.stationCount)
    );
    machineMap.stationSections = { ...(machineMap.stationSections || {}), [String(station)]: section };
  });

  machineMap.objects.splice(0, machineMap.objects.length, ...newObjects);
  machineMap.restoreDefaultObjects = false;
  machineMap.coldGlueOptimizationVersion = 1;
  state.coldGlueMap = machineMap.objects.map((item) => ({ ...item }));
  state.coldGlueAggregateSettings = {
    enabledAggregates: [...machineMap.enabledAggregates],
    enabledStations: [...machineMap.enabledStations],
    aggregateAngles: { ...machineMap.aggregateAngles },
    machineSettings: { ...machineMap.machineSettings }
  };
  return true;
}

function initializeStella660ColdGlueExample() {
  const machineMap = activeMachineMap();
  if (!machineMap || machineMap.coldGlueOptimizationVersion >= 1 || String(machineMap.name || "").trim().toLowerCase() !== "60h cg mab1") return false;
  return optimizeColdGlueMapExample({ requireStella660: true });
}

function normalizeAggregateAngles(value, mode = "apl", objects = []) {
  const defaults = mode === "cold-glue" ? defaultColdGlueAggregateAngles(objects) : defaultAplAggregateAngles();
  const source = value && typeof value === "object" ? value : {};
  const result = {};
  for (let aggregate = 1; aggregate <= 6; aggregate += 1) {
    result[String(aggregate)] = num(source[String(aggregate)], defaults[String(aggregate)]);
  }
  return result;
}

function normalizeStationAngles(value) {
  const defaults = defaultAplStationAngles();
  const source = value && typeof value === "object" ? value : {};
  const result = {};
  for (let station = 1; station <= 6; station += 1) {
    result[String(station)] = num(source[String(station)], defaults[String(station)]);
  }
  return result;
}

function inferAplStationSections(machineMap) {
  if (!machineMap || machineMap.applicationMode !== "apl") return {};
  const explicit = machineMap.stationSections && typeof machineMap.stationSections === "object"
    ? machineMap.stationSections
    : {};
  const result = {};
  Object.entries(explicit).forEach(([station, section]) => {
    if (["neck", "body", "back", "none"].includes(section)) result[String(station)] = section;
  });

  const mechanical = (machineMap.objects || []).filter((item) =>
    (item.kind === "roller" || item.kind === "pad") && isStationEnabled(machineMap, Number(item.station))
  );
  const rollerStations = [...new Set(mechanical.filter((item) => item.kind === "roller").map((item) => Number(item.station)))].sort((a, b) => a - b);
  const padStations = [...new Set(mechanical.filter((item) => item.kind === "pad").map((item) => Number(item.station)))].sort((a, b) => a - b);
  const installedStations = [...new Set(mechanical.map((item) => Number(item.station)))].sort((a, b) => a - b);

  // A three-aggregate APL layout represents one physical application station
  // per label. Aggregate numbers may be sparse (for example 1, 3, and 5), so
  // assign Auto by physical order instead of treating all pad stations as body.
  // An explicit Label Use selection below/above always remains authoritative.
  if (installedStations.length === 3) {
    ["neck", "body", "back"].forEach((section, index) => {
      const station = String(installedStations[index]);
      if (!result[station]) result[station] = section;
    });
    return result;
  }

  // APL neck stations use rollers. Wipe-down pad stations are consumed in
  // physical order: the first pair applies the body label and the next pair
  // applies the back label. Explicit stationSections always win.
  rollerStations.forEach((station) => { if (!result[String(station)]) result[String(station)] = "neck"; });
  padStations.forEach((station, index) => {
    if (!result[String(station)]) result[String(station)] = index < 2 ? "body" : "back";
  });
  return result;
}

function createMachineMap({ id, name, machineType, applicationMode, headCount, aggregateCount, stationCount, enabledAggregates, enabledStations, aggregateAngles, stationAngles, stationSections, objects, depths, machineSettings, restoreDefaultObjects = true, isTemplate = false, blankSeedVersion = 0 } = {}) {
  const mode = applicationMode === "cold-glue" ? "cold-glue" : "apl";
  const aggregates = Math.max(1, Math.min(6, Math.round(num(aggregateCount, mode === "cold-glue" ? 3 : 6))));
  const stations = Math.max(1, Math.min(6, Math.round(num(stationCount, aggregates))));
  const sourceObjects = Array.isArray(objects)
    ? objects.map((item) => ({ ...item }))
    : mode === "cold-glue" ? [] : defaultAplMapObjects();
  if (mode === "apl" && restoreDefaultObjects !== false && !sourceObjects.some((item) => item.kind === "coding")) {
    sourceObjects.push({
      id: `${mode}-coding-default`,
      name: "Coding",
      kind: "coding",
      side: "outer",
      start: 304,
      end: 309,
      extension: 14,
      station: 1
    });
  }
  return {
    schemaVersion: MACHINE_MAP_SCHEMA_VERSION,
    blankSeedVersion: Math.max(0, Math.round(num(blankSeedVersion, 0))),
    isTemplate: Boolean(isTemplate),
    id: String(id || uniqueMapId("machine-map")),
    name: String(name || `${mode === "cold-glue" ? "Cold Glue" : "APL"} ${aggregates}-Aggregate Map`),
    machineType: String(machineType || "TopModul"),
    applicationMode: mode,
    headCount: Math.max(1, Math.min(120, Math.round(num(headCount, machineSettings?.headCount !== undefined ? machineSettings.headCount : (state?.headCount !== undefined ? state.headCount : 60))))),
    aggregateCount: normalizeEnabledSlots(enabledAggregates, aggregates).filter(Boolean).length,
    stationCount: normalizeEnabledSlots(enabledStations, stations).filter(Boolean).length,
    enabledAggregates: normalizeEnabledSlots(enabledAggregates, aggregates),
    enabledStations: normalizeEnabledSlots(enabledStations, stations),
    // Aggregate angles are the single editable mounting-angle source. Seed
    // missing values from legacy station angles so older maps keep position.
    aggregateAngles: normalizeAggregateAngles({ ...normalizeStationAngles(stationAngles), ...(aggregateAngles || {}) }, mode, sourceObjects),
    stationAngles: normalizeStationAngles({ ...(stationAngles || {}), ...(aggregateAngles || {}) }),
    stationSections: stationSections && typeof stationSections === "object" ? { ...stationSections } : {},
    machineSettings: {
      direction: machineSettings?.direction === "cw" ? "cw" : "ccw",
      radius: Math.max(1, num(machineSettings?.radius, state?.radius !== undefined ? state.radius : 250)),
      referencePitchRadiusMm: Math.max(1, num(machineSettings?.referencePitchRadiusMm, state?.referencePitchRadiusMm !== undefined ? state.referencePitchRadiusMm : 572.958)),
      encoderCountsPerRev: Math.max(1, num(machineSettings?.encoderCountsPerRev, state?.encoderCountsPerRev !== undefined ? state.encoderCountsPerRev : 10000)),
      servoGearRatio: Math.max(0.001, num(machineSettings?.servoGearRatio, state?.servoGearRatio !== undefined ? state.servoGearRatio : 1)),
      autoScaleTableMap: machineSettings?.autoScaleTableMap !== false,
      zeroAngle: norm(num(machineSettings?.zeroAngle, state?.zeroAngle !== undefined ? state.zeroAngle : 0)),
      maxMoveRatio: Math.max(0.1, num(machineSettings?.maxMoveRatio, state?.maxMoveRatio !== undefined ? state.maxMoveRatio : 21))
    },
    depths: { ...state.depths, ...(depths || {}) },
    restoreDefaultObjects: restoreDefaultObjects !== false,
    objects: sourceObjects.map((item) => normalizeBuilderObject({ ...item, kind: item.kind === "wipe" ? "brush" : item.kind }, mode, stations))
  };
}

function activeMachineMap() {
  ensurePersistentApplicationMaps();
  return state.mapLibrary.find((map) => map.id === state.activeMapId) || state.mapLibrary[0];
}

function editableMachineMap() {
  return activeMachineMap();
}

function inferredMachineMapApplicationMode(map) {
  if (map?.applicationMode === "cold-glue") return "cold-glue";
  const name = String(map?.name || "");
  return /cold[ -]?glue/i.test(name) || /(^|[\s_-])cg([\s_-]|$)/i.test(name) ? "cold-glue" : "apl";
}

function ensurePersistentApplicationMaps() {
  if (!Array.isArray(state.mapLibrary) || !state.mapLibrary.length) {
    const legacyApl = Array.isArray(state.aplMapObjects) && state.aplMapObjects.length ? state.aplMapObjects : defaultAplMapObjects();
    state.mapLibrary = [
      createMachineMap({ id: "map-apl-default", name: "APL 6-Aggregate", applicationMode: "apl", headCount: state.headCount, aggregateCount: 6, stationCount: 6, objects: legacyApl.map((item) => ({ ...item, application: "apl" })) })
    ];
  } else {
    state.mapLibrary.forEach((map, index) => {
      const applicationMode = inferredMachineMapApplicationMode(map);
      if (map && map.schemaVersion === MACHINE_MAP_SCHEMA_VERSION) {
        // Preserve the map record and its object-array identity. Map Builder
        // event handlers hold references to this record while a refresh runs;
        // replacing it here makes subsequent edits land on a detached copy.
        map.applicationMode = applicationMode;
        map.isTemplate = isProtectedMapTemplate(map);
        map.aggregateAngles = normalizeAggregateAngles(map.aggregateAngles, applicationMode, map.objects);
      } else {
        state.mapLibrary[index] = createMachineMap({ ...map, applicationMode });
      }
    });
  }
  // Remove the retired factory/blank Cold Glue records. Operator-created Cold
  // Glue maps remain intact and are normalized to brushes and rollers below.
  state.mapLibrary = state.mapLibrary.filter((map) => {
    if (["map-blank-cold-glue", "map-blank-cold-glue-template"].includes(map?.id)) return false;
    // Older operator maps may still carry the original factory ID after being
    // renamed and edited. Remove only the untouched factory record; an ID by
    // itself is not sufficient evidence that the map is disposable.
    if (map?.id === "map-cold-glue-default" && map?.name === "Cold Glue 3-Aggregate") return false;
    return true;
  });
  state.mapLibrary.filter((map) => map?.applicationMode === "cold-glue").forEach((map) => {
    map.objects = normalizeColdGlueMap(map.objects);
    map.restoreDefaultObjects = false;

    // Calibrate the saved 60H CG MAB1 example to the proven Stella 330 ml
    // full-wrap profile. Only migrate the exact legacy two-brush layout; maps
    // the operator has already repositioned remain untouched.
    const brushesByStation = (station) => map.objects
      .filter((item) => item.kind === "brush" && Number(item.station) === station)
      .sort((a, b) => String(a.side) === "outer" ? -1 : String(b.side) === "outer" ? 1 : num(a.start, 0) - num(b.start, 0));
    const neckBrushes = brushesByStation(1);
    const bodyBrushes = brushesByStation(3);
    const backBrushes = brushesByStation(5);
    const matchesWindow = (brushes, start, end) => brushes.length === 2 &&
      brushes.every((brush) => Math.abs(num(brush.start, 0) - start) < 0.25 && Math.abs(num(brush.end, 0) - end) < 0.25);
    const isLegacyStella330Layout = String(map.name || "").trim().toLowerCase() === "60h cg mab1" &&
      matchesWindow(neckBrushes, 87, 150) &&
      matchesWindow(bodyBrushes, 159, 205.1) &&
      matchesWindow(backBrushes, 237, 279.6);
    if (isLegacyStella330Layout) {
      const setBrushPair = (brushes, processWindow, finalWindow, processCoverage = 50) => {
        Object.assign(brushes[0], { start: processWindow[0], end: processWindow[1], side: "outer", role: "process", coveragePercent: processCoverage });
        Object.assign(brushes[1], { start: finalWindow[0], end: finalWindow[1], side: "inner", role: "final", coveragePercent: 100 - processCoverage });
      };
      // The long neck label is center-tacked. The first channel wipes one
      // complete half and the second channel reverses the plate to wipe the
      // opposite half; both operations remain inside the same revolution.
      setBrushPair(neckBrushes, [161, 174], [210, 227], 50);
      setBrushPair(bodyBrushes, [235, 247], [265, 273]);
      setBrushPair(backBrushes, [285.8, 298], [300, 314]);
      map.stella330FullWrapCalibrationVersion = STELLA_330_FULL_WRAP_CALIBRATION_VERSION;
      // The selected map may already have been copied into the live runtime.
      // Force one reload so the calibrated brush positions are used now,
      // rather than only after the operator selects another map and returns.
      if (map.id === state.activeMapId) runtimeMachineMapId = null;
    }
  });
  const ensureEditableBlankAplMap = () => {
    const id = "map-blank-apl";
    const legacyIds = ["map-blank-apl-template", "map-blank-template"];
    let map = state.mapLibrary.find((entry) => entry.id === id || legacyIds.includes(entry.id));

    // Repair both legacy template IDs and canonical IDs saved by builds that
    // accidentally populated their blank map. The seed marker makes this a
    // one-time migration, so objects deliberately added later are preserved.
    if (map && (map.id !== id || map.blankSeedVersion !== BLANK_MAP_SEED_VERSION)) {
      map.id = id;
      map.name = "Blank APL Map";
      map.applicationMode = "apl";
      map.headCount = 45;
      map.aggregateCount = 1;
      map.stationCount = 1;
      map.enabledAggregates = [true, false, false, false, false, false];
      map.enabledStations = [true, false, false, false, false, false];
      map.objects = [];
      map.restoreDefaultObjects = false;
      map.isTemplate = false;
      map.schemaVersion = MACHINE_MAP_SCHEMA_VERSION;
      map.blankSeedVersion = BLANK_MAP_SEED_VERSION;
    }

    if (!map) {
      map = createMachineMap({
        id,
        name: "Blank APL Map",
        applicationMode: "apl",
        headCount: 45,
        aggregateCount: 1,
        stationCount: 1,
        enabledAggregates: [true, false, false, false, false, false],
        enabledStations: [true, false, false, false, false, false],
        objects: [],
        restoreDefaultObjects: false,
        isTemplate: false,
        blankSeedVersion: BLANK_MAP_SEED_VERSION
      });
      state.mapLibrary.push(map);
    }

    map.isTemplate = false;
    map.restoreDefaultObjects = false;
    map.blankSeedVersion = BLANK_MAP_SEED_VERSION;
    return map;
  };

  ensureEditableBlankAplMap();
  if (!state.activeMapId || !state.mapLibrary.some((map) => map.id === state.activeMapId)) {
    state.activeMapId = state.mapLibrary[0].id;
  }
  const selected = state.mapLibrary.find((map) => map.id === state.activeMapId) || state.mapLibrary[0];
  if (selected && runtimeMachineMapId !== selected.id) loadMachineMapIntoRuntime(selected, false);
}

function loadMachineMapIntoRuntime(map, shouldRender = true) {
  if (!map) return;
  runtimeMachineMapId = map.id;
  state.activeMapId = map.id;
  state.applicationMode = inferredMachineMapApplicationMode(map);
  map.applicationMode = state.applicationMode;
  state.headCount = map.headCount;
  const settings = map.machineSettings || {};
  state.direction = settings.direction === "cw" ? "cw" : "ccw";
  state.radius = Math.max(1, num(settings.radius, state.radius));
  state.referencePitchRadiusMm = Math.max(1, num(settings.referencePitchRadiusMm, state.referencePitchRadiusMm));
  state.encoderCountsPerRev = Math.max(1, num(settings.encoderCountsPerRev, state.encoderCountsPerRev));
  state.servoGearRatio = Math.max(0.001, num(settings.servoGearRatio, state.servoGearRatio));
  state.autoScaleTableMap = settings.autoScaleTableMap !== false;
  state.zeroAngle = norm(num(settings.zeroAngle, state.zeroAngle));
  state.maxMoveRatio = Math.max(0.1, num(settings.maxMoveRatio, state.maxMoveRatio));
  state.depths = { ...state.depths, ...map.depths };
  const normalizedObjects = map.objects.map((item) => normalizeBuilderObject(item, "apl", 6));
  const coldGlueObjects = normalizedObjects.filter((item) => item.application === "cold-glue");
  if (state.applicationMode === "cold-glue") {
    state.coldGlueMap = coldGlueObjects.map((item) => ({ ...item, kind: item.kind }));
    state.coldGlueAggregateSettings = {
      enabledAggregates: [...map.enabledAggregates],
      enabledStations: [...map.enabledStations],
      aggregateAngles: { ...map.aggregateAngles },
      machineSettings: { ...map.machineSettings }
    };
  }
  state.aplMapObjects = normalizedObjects
    .filter((item) => item.application !== "cold-glue")
    .filter((item) => item.kind === "coding" || activeAplStationNumbers(map).includes(Number(item.station)));
  syncApplicationMapToLegacyState();
  ensureSelectedBrandForApplication();
  const runtimeFields = ["headCount", "radius", "referencePitchRadiusMm", "encoderCountsPerRev", "servoGearRatio", "zeroAngle", "maxMoveRatio", "direction"];
  runtimeFields.forEach((key) => { if (els[key]) els[key].value = state[key]; });
  if (els.autoScaleTableMap) els.autoScaleTableMap.checked = Boolean(state.autoScaleTableMap);
  Object.entries({ spenderDepth: "spender", opRollerDepth: "opRoller", nonOpRollerDepth: "nonOpRoller", wipeInnerDepth: "wipeInner", wipeOuterDepth: "wipeOuter" }).forEach(([elementKey, depthKey]) => {
    if (els[elementKey]) els[elementKey].value = state.depths[depthKey];
  });
  if (shouldRender) render();
}

function activeBuilderMap() {
  const map = activeMachineMap();
  return map.objects;
}

function syncApplicationMapToLegacyState() {
  const machineMap = state.mapLibrary?.find((map) => map.id === state.activeMapId);
  if (!machineMap) return;
  machineMap.applicationMode = state.applicationMode;
  machineMap.headCount = state.headCount;
  machineMap.machineSettings = {
    direction: state.direction,
    radius: state.radius,
    referencePitchRadiusMm: state.referencePitchRadiusMm,
    encoderCountsPerRev: state.encoderCountsPerRev,
    servoGearRatio: state.servoGearRatio,
    autoScaleTableMap: state.autoScaleTableMap,
    zeroAngle: state.zeroAngle,
    maxMoveRatio: state.maxMoveRatio
  };
  machineMap.depths = { ...state.depths };
  machineMap.objects = machineMap.objects.map((item) => normalizeBuilderObject(item, "apl", 6));
  const coldGlueObjects = machineMap.objects.filter((item) => item.application === "cold-glue");
  if (coldGlueObjects.length) state.coldGlueMap = coldGlueObjects.map((item) => ({ ...item, kind: item.kind, angle: item.kind === "gripper" ? num(item.angle, item.start) : item.angle }));
  const stationSections = inferAplStationSections(machineMap);
  state.aplMapObjects = machineMap.objects
    .filter((item) => item.application !== "cold-glue")
    .filter((item) => item.kind === "coding" || activeAplStationNumbers(machineMap).includes(Number(item.station)));
  const grouped = new Map();
  machineMap.objects.filter((item) => item.application !== "cold-glue" && (item.kind === "pad" || item.kind === "roller")).forEach((item) => {
    if (!grouped.has(item.station)) grouped.set(item.station, []);
    grouped.get(item.station).push(item);
  });

  state.assemblies = defaultAssemblies.map((fallback, index) => {
    const station = index + 1;
    if (!isStationEnabled(machineMap, station)) {
      return normalizeAssembly({ ...fallback, enabled: false, type: "none", sides: [] });
    }
    const items = grouped.get(station) || [];
    if (!items.length) return normalizeAssembly({ ...fallback, enabled: false, type: "none", sides: [] });
    const selectedKind = items[0].kind;
    const compatible = items.filter((item) => item.kind === selectedKind);
    const aggregateAngle = num(machineMap.aggregateAngles?.[String(station)], machineMap.stationAngles?.[String(station)] ?? fallback.spenderAngle);
    const assembly = normalizeAssembly({
      ...fallback,
      spenderAngle: aggregateAngle,
      enabled: true,
      type: selectedKind === "roller" ? "rollers" : "pads",
      sides: compatible.map((item) => item.side),
      labelSection: stationSections[String(station)] || labelSectionForStation(station)
    });
    if (selectedKind === "roller") {
      ["outer", "inner"].forEach((side) => {
        const sideItems = compatible.filter((item) => item.side === side);
        if (!sideItems.length) return;
        const target = side === "inner" ? assembly.innerRollerAngles : assembly.outerRollerAngles;
        target[0] = Math.min(...sideItems.map((item) => num(item.start, 0)));
        target[1] = Math.max(...sideItems.map((item) => num(item.end, num(item.start, 0) + num(item.wipeSpanDeg, 0.1))));
      });
    } else {
      const outer = compatible.find((entry) => entry.side === "outer");
      const inner = compatible.find((entry) => entry.side === "inner");
      const reference = outer || inner;
      if (reference) {
        assembly.spenderAngle = reference.start - mmToTableDegrees(state.padClearanceMm);
        assembly.padSpanDeg = Math.max(0.1, reference.end - reference.start);
      }
      if (outer && inner) assembly.padSideOffsetDeg = Math.max(0, inner.start - outer.start);
    }
    return normalizeAssembly(assembly);
  });
}

function builderTypeOptions() {
  return state.applicationMode === "cold-glue"
    ? [["brush", "Cold Glue Brush"], ["roller", "Roller"]]
    : [["pad", "Wipe-Down Pad"], ["roller", "Roller"], ["coding", "Coding"], ["sensor", "Label Sensor"]];
}

function nextAplStation() {
  const machineMap = activeMachineMap();
  const active = activeAplStationNumbers(machineMap);
  const used = new Set(machineMap.objects
    .filter((item) => item.kind === "pad" || item.kind === "roller")
    .map((item) => Number(item.station)));
  for (const station of active) if (!used.has(station)) return station;
  return active[0] || 1;
}

function updateBuilderTypeControls() {
  const select = document.querySelector("#builderObjectType");
  const extensionLabel = document.querySelector("#builderExtensionLabel");
  const sensorAssistLabel = document.querySelector("#builderSensorAssistLabel");
  const sensorVisibilityLabel = document.querySelector("#builderSensorVisibilityLabel");
  if (!select) return;
  const previous = select.value;
  select.innerHTML = builderTypeOptions().map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
  if ([...select.options].some((option) => option.value === previous)) select.value = previous;
  const stationSelect = document.querySelector("#builderObjectStation");
  const stationLabel = document.querySelector("#builderObjectStationLabel");
  const sideSelect = document.querySelector("#builderObjectSide");
  const map = typeof activeMachineMap === "function" ? activeMachineMap() : null;
  if (stationSelect && map) {
    const previousStation = stationSelect.value;
    const stations = activeSlotNumbers(map.enabledStations);
    stationSelect.innerHTML = stations.map((station) => `<option value="${station}">Station ${station}</option>`).join("");
    if (stations.includes(Number(previousStation))) stationSelect.value = previousStation;
  }
  if (extensionLabel) extensionLabel.hidden = select.value !== "brush";
  if (sensorAssistLabel) sensorAssistLabel.hidden = select.value !== "sensor";
  if (sensorVisibilityLabel) sensorVisibilityLabel.hidden = select.value !== "sensor";
  if (stationLabel) stationLabel.hidden = select.value === "coding";
  if (stationSelect) stationSelect.disabled = select.value === "coding";
  if (sideSelect?.parentElement) sideSelect.parentElement.hidden = select.value === "sensor";
  const isAplRoller = state.applicationMode === "apl" && select.value === "roller";
  const startLabel = document.querySelector("#builderObjectStartLabel");
  const endLabel = document.querySelector("#builderObjectEndLabel");
  const isSinglePlacement = select.value === "coding" || select.value === "sensor";
  if (startLabel) startLabel.firstChild.textContent = select.value === "sensor" ? "Placement (deg) " : isAplRoller ? "Roller center (deg) " : "Start / point 1 (deg) ";
  if (endLabel) {
    endLabel.hidden = isSinglePlacement;
    endLabel.firstChild.textContent = isAplRoller ? "Roller surface coverage (table deg) " : "Stop / point 2 (deg) ";
  }
}

function renderAggregateAngleEditor(machineMap) {
  if (!els.aggregateAngleEditor) return;
  if (els.aggregateAnglesSection) els.aggregateAnglesSection.hidden = false;
  machineMap.aggregateAngles = normalizeAggregateAngles(machineMap.aggregateAngles, machineMap.applicationMode, machineMap.objects);
  machineMap.stationAngles = normalizeStationAngles({ ...machineMap.stationAngles, ...machineMap.aggregateAngles });
  const activeAggregates = activeSlotNumbers(machineMap.enabledAggregates);
  if (els.aggregateAnglesSummary) els.aggregateAnglesSummary.textContent = `${activeAggregates.length} active aggregate${activeAggregates.length === 1 ? "" : "s"} • click to expand`;
  els.aggregateAngleEditor.innerHTML = `<div class="builder-row-grid">${activeAggregates.map((aggregate) => `<label>Aggregate ${aggregate}<input data-aggregate-angle="${aggregate}" type="number" step="0.1" value="${fmt(machineMap.aggregateAngles[String(aggregate)], 1)}"></label>`).join("")}</div>`;
  els.aggregateAngleEditor.querySelectorAll("[data-aggregate-angle]").forEach((control) => {
    const applyAggregateAngle = () => {
      if (control.value === "" || control.value === "-") return;
      const aggregate = String(control.dataset.aggregateAngle);
      const editable = editableMachineMap();
      editable.aggregateAngles = normalizeAggregateAngles(editable.aggregateAngles, editable.applicationMode, editable.objects);
      editable.aggregateAngles[aggregate] = num(control.value, editable.aggregateAngles[aggregate]);
      editable.stationAngles = normalizeStationAngles(editable.stationAngles);
      editable.stationAngles[aggregate] = editable.aggregateAngles[aggregate];
      refreshAfterBuilderEdit({ persist: true });
    };
    control.addEventListener("input", applyAggregateAngle);
    control.addEventListener("change", applyAggregateAngle);
  });
}

function renderMachineLayoutControls(machineMap) {
  if (!els.aggregateToggleList || !els.stationToggleList) return;
  machineMap.enabledAggregates = normalizeEnabledSlots(machineMap.enabledAggregates, machineMap.aggregateCount);
  machineMap.enabledStations = normalizeEnabledSlots(machineMap.enabledStations, machineMap.stationCount);
  const renderGroup = (container, slots, label, slotType) => {
    container.innerHTML = slots.map((enabled, index) => {
      const number = index + 1;
      return `<label class="machine-toggle-item${enabled ? "" : " inactive"}"><input type="checkbox" data-machine-slot="${slotType}" data-slot-number="${number}" ${enabled ? "checked" : ""}><span>${label} ${number}</span></label>`;
    }).join("");
    container.querySelectorAll("[data-machine-slot]").forEach((control) => {
      control.addEventListener("change", () => {
        const editable = editableMachineMap();
        const target = control.dataset.machineSlot === "aggregate" ? editable.enabledAggregates : editable.enabledStations;
        const slotIndex = Number(control.dataset.slotNumber) - 1;
        if (!control.checked && target.filter(Boolean).length === 1) {
          control.checked = true;
          window.alert(`At least one ${control.dataset.machineSlot} must remain active.`);
          return;
        }
        target[slotIndex] = control.checked;
        editable.aggregateCount = editable.enabledAggregates.filter(Boolean).length;
        editable.stationCount = editable.enabledStations.filter(Boolean).length;
        ensureAplObjectsForNewStations(editable);
        loadMachineMapIntoRuntime(editable, true);
        saveCurrentSettings();
        renderWipeDownBuilder();
      });
    });
  };
  renderGroup(els.aggregateToggleList, machineMap.enabledAggregates, "Aggregate", "aggregate");
  renderGroup(els.stationToggleList, machineMap.enabledStations, "Station", "station");
  const aggregateCount = machineMap.enabledAggregates.filter(Boolean).length;
  const stationCount = machineMap.enabledStations.filter(Boolean).length;
  if (els.machineLayoutSummary) els.machineLayoutSummary.textContent = `${aggregateCount} active aggregate${aggregateCount === 1 ? "" : "s"} • ${stationCount} active station${stationCount === 1 ? "" : "s"}`;
}

function renderMapLibraryControls() {
  const map = activeMachineMap();
  if (!map) return;
  if (els.mapLibrarySelect) {
    els.mapLibrarySelect.innerHTML = state.mapLibrary.map((entry) => `<option value="${entry.id}"${entry.id === map.id ? " selected" : ""}>${entry.name}</option>`).join("");
  }
  if (els.mapLibrarySummary) els.mapLibrarySummary.textContent = `${map.machineType || "TopModul"} • ${map.name} • ${map.headCount} heads • ${map.aggregateCount} aggregate${map.aggregateCount === 1 ? "" : "s"}`;
  if (els.mapName) els.mapName.value = map.name;
  if (els.applicationMode) els.applicationMode.value = state.applicationMode;
  if (els.mapHeadCount) els.mapHeadCount.value = map.headCount;
  if (els.mapMachineType) {
    const types = [...new Set(["TopMatic", "Autocol", "TopModul", ...(state.machineTypes || []), map.machineType || "TopModul"])];
    els.mapMachineType.replaceChildren(...types.map((type) => {
      const option = document.createElement("option");
      option.value = type;
      option.textContent = type;
      option.selected = type === (map.machineType || "TopModul");
      return option;
    }));
  }
  const settings = map.machineSettings || {};
  const builderMachineFields = {
    mapDirection: settings.direction, mapRadius: settings.radius, mapReferencePitchRadiusMm: settings.referencePitchRadiusMm,
    mapEncoderCountsPerRev: settings.encoderCountsPerRev,
    mapServoGearRatio: settings.servoGearRatio, mapZeroAngle: settings.zeroAngle, mapMaxMoveRatio: settings.maxMoveRatio
  };
  Object.entries(builderMachineFields).forEach(([key, value]) => { if (els[key]) els[key].value = value; });
  if (els.mapAutoScaleTableMap) els.mapAutoScaleTableMap.checked = settings.autoScaleTableMap !== false;
  if (els.deleteMachineMap) els.deleteMachineMap.disabled = false;
  if (els.saveMachineMap) els.saveMachineMap.textContent = "Save Map";
  if (els.mapAggregateCount) els.mapAggregateCount.value = map.aggregateCount;
  if (els.mapStationCount) els.mapStationCount.value = map.stationCount;
  renderMachineLayoutControls(map);
  renderAggregateAngleEditor(map);
}

let builderSaveTimer = null;

function selectMapBuilderObject(objectId, { openBuilder = true, scroll = true } = {}) {
  state.selectedMapObjectId = String(objectId || "");
  const map = activeMachineMap();
  const item = map?.objects?.find((entry) => entry.id === state.selectedMapObjectId);
  if (item) builderExpandedStation = String(item.kind === "coding" ? "coding" : item.station);
  if (openBuilder && typeof setBuilderOpen === "function") setBuilderOpen(true);
  renderMap();
  renderWipeDownBuilder();
  if (scroll) window.requestAnimationFrame(() => {
    const editor = els.wipeBuilderList?.querySelector(`[data-builder-object-id="${CSS.escape(state.selectedMapObjectId)}"]`);
    if (editor) {
      editor.open = true;
      editor.scrollIntoView({ behavior: "smooth", block: "center" });
      editor.querySelector("input, select")?.focus({ preventScroll: true });
    }
  });
}

function recordBuilderHistory(label = "Map edit") {
  const map = activeMachineMap();
  if (!map) return;
  state.builderHistory = state.builderHistory || { undo: [], redo: [] };
  state.builderHistory.undo.push({ label, map: deepClone(map) });
  if (state.builderHistory.undo.length > 30) state.builderHistory.undo.shift();
  state.builderHistory.redo = [];
}

function restoreBuilderHistory(direction) {
  const source = direction === "undo" ? state.builderHistory?.undo : state.builderHistory?.redo;
  const destination = direction === "undo" ? state.builderHistory?.redo : state.builderHistory?.undo;
  if (!source?.length) return;
  const current = activeMachineMap();
  destination.push({ label: direction === "undo" ? "Redo" : "Undo", map: deepClone(current) });
  const snapshot = source.pop();
  const index = state.mapLibrary.findIndex((map) => map.id === state.activeMapId);
  if (index >= 0) state.mapLibrary[index] = createMachineMap(snapshot.map);
  loadMachineMapIntoRuntime(state.mapLibrary[index], true);
  saveCurrentSettings();
  render();
  renderWipeDownBuilder();
}

function refreshAfterBuilderEdit({ persist = false } = {}) {
  syncApplicationMapToLegacyState();
  applyGeneratedServoProfile();
  renderMap();
  renderProgram();
  renderSimulation();
  renderValidation();
  renderTopControls();
  if (persist) {
    state.builderSaveState = "saving";
    if (els.builderStatus) els.builderStatus.textContent = "Saving…";
    clearTimeout(builderSaveTimer);
    builderSaveTimer = setTimeout(() => {
      saveCurrentSettings();
      state.builderSaveState = "saved";
      if (els.builderStatus) els.builderStatus.textContent = `Saved • ${activeMachineMap()?.name || "Map"}`;
    }, 120);
  }
}

let builderExpandedStation = null;

function renderWipeDownBuilder() {
  ensurePersistentApplicationMaps();
  if (!els.wipeBuilderList) return;
  const machineMap = activeMachineMap();
  const optimizeColdGlueButton = document.querySelector("#optimizeColdGlueMap");
  if (optimizeColdGlueButton) optimizeColdGlueButton.hidden = machineMap.applicationMode !== "cold-glue";
  renderMapLibraryControls();
  if (els.applicationModeDescription) {
    els.applicationModeDescription.textContent = `${machineMap.machineType || "TopModul"} • ${machineMap.name}: ${machineMap.headCount} heads, ${machineMap.aggregateCount} aggregate${machineMap.aggregateCount === 1 ? "" : "s"}, ${machineMap.stationCount} station${machineMap.stationCount === 1 ? "" : "s"}.`;
  }
  updateBuilderTypeControls();
  const map = machineMap.objects;
  const visibleEntries = map
    .map((raw, index) => ({ raw, index }))
    .filter(({ raw }) => itemApplicationMode(raw) === state.applicationMode)
    .filter(({ raw }) => raw.kind === "coding" || state.applicationMode === "cold-glue" || activeAplStationNumbers(machineMap).includes(Number(raw.station)));
  const expandedStations = new Set([...els.wipeBuilderList.querySelectorAll(".configured-station-group[open]")].map((group) => group.dataset.stationGroup));
  els.wipeBuilderList.innerHTML = "";

  const stationGroups = new Map();
  visibleEntries.forEach((entry) => {
    const station = entry.raw.kind === "coding" ? "coding" : (Number(entry.raw.station) || 1);
    if (!stationGroups.has(station)) stationGroups.set(station, []);
    stationGroups.get(station).push(entry);
  });

  [...stationGroups.entries()].sort((a, b) => a[0] === "coding" ? 1 : b[0] === "coding" ? -1 : a[0] - b[0]).forEach(([station, entries]) => {
    const isCodingStation = station === "coding";
    const section = machineMap.applicationMode === "apl" && !isCodingStation
      ? (inferAplStationSections(machineMap)[String(station)] || "none")
      : "";
    const group = document.createElement("details");
    group.className = "configured-station-group collapsible-builder-section";
    group.dataset.stationGroup = String(station);
    group.open = expandedStations.has(String(station)) || builderExpandedStation === String(station);
    const compactObjects = entries.map(({ raw }) => {
      const item = normalizeBuilderObject(raw, itemApplicationMode(raw), machineMap.stationCount);
      const location = item.kind === "sensor" || item.kind === "gripper" ? num(item.angle, item.start) : item.start;
      return `${item.kind === "sensor" ? "Sensor" : item.kind === "coding" ? "Coder" : item.kind === "pad" ? "Pad" : item.kind === "roller" ? "Roller" : sectionLabel(item.kind)} ${fmt(location, 1)}°`;
    }).join(" · ");
    group.innerHTML = `<summary><span><strong>Station ${station}</strong><small>${section && section !== "none" ? `${sectionLabel(section)} label • ` : ""}${compactObjects}</small></span></summary><div class="configured-station-objects collapsible-builder-content">${isCodingStation ? "" : `<div class="builder-station-actions"><button type="button" class="builder-duplicate-station secondary-button">Duplicate Station</button></div>`}</div>`;
    if (isCodingStation) group.querySelector("summary strong").textContent = "Coding Station";
    const groupBody = group.querySelector(".configured-station-objects");

    entries.forEach(({ raw, index }) => {
    const mode = itemApplicationMode(raw);
    const item = normalizeBuilderObject(raw, mode, machineMap.stationCount);
    map[index] = item;
    const coreColdGlue = mode === "cold-glue" && /^cg-/.test(item.id);
    const isGripper = item.kind === "gripper";
    const isCoding = item.kind === "coding";
    const isSensor = item.kind === "sensor";
    const sensorStatus = isSensor && typeof labelSensorMapStatus === "function" ? labelSensorMapStatus(item) : null;
    const isAplRoller = mode === "apl" && item.kind === "roller";
    const stationSection = mode === "apl" ? (machineMap.stationSections?.[String(item.station)] || "auto") : null;
    const row = document.createElement("details");
    row.className = "wipe-builder-row";
    row.dataset.builderObjectId = item.id;
    row.open = state.selectedMapObjectId === item.id;
    if (row.open) row.classList.add("selected-builder-object");
    const objectKind = isCoding ? "Coder" : isSensor ? "Label Sensor" : isGripper ? "Gripper" : item.kind === "pad" ? "Wipe-down pad" : item.kind.charAt(0).toUpperCase() + item.kind.slice(1);
    const objectPosition = isGripper || isSensor ? "" : ` • ${item.side === "inner" ? "Inside" : "Outside"}`;
    const objectRange = isCoding || isGripper || isSensor
      ? `${fmt(isGripper || isSensor ? item.angle : item.start, 1)}°`
      : `${fmt(item.start, 1)}°–${fmt(isAplRoller ? item.start + item.wipeSpanDeg : item.end, 1)}°`;
    row.innerHTML = `
      <summary><span><strong></strong><small>${objectKind}${objectPosition} • ${objectRange}</small></span></summary>
      <div class="builder-object-editor">
      <div class="builder-row-title"><input class="builder-name-input" data-builder-field="name" value="${item.name.replace(/"/g, "&quot;")}" aria-label="Map object name"></div>
      <div class="builder-row-grid">
        ${isCoding ? "" : `<label>Station<select data-builder-field="station">${activeSlotNumbers(machineMap.enabledStations).map((station) => `<option value="${station}" ${Number(item.station) === station ? "selected" : ""}>Station ${station}</option>`).join("")}</select></label>`}
        ${mode === "apl" && !isCoding ? `<label>Label use<select data-station-section><option value="auto" ${stationSection === "auto" ? "selected" : ""}>Auto</option><option value="neck" ${stationSection === "neck" ? "selected" : ""}>Neck</option><option value="body" ${stationSection === "body" ? "selected" : ""}>Body</option><option value="back" ${stationSection === "back" ? "selected" : ""}>Back</option><option value="none" ${stationSection === "none" ? "selected" : ""}>None</option></select><small>Applies to every object assigned to this station.</small></label>` : ""}
        ${!isGripper && !isSensor ? `<label>Position<select data-builder-field="side"><option value="outer" ${item.side === "outer" ? "selected" : ""}>Outside</option><option value="inner" ${item.side === "inner" ? "selected" : ""}>Inside</option></select></label>` : ""}
        <label>${isGripper ? "Table angle" : isSensor ? "Placement" : isAplRoller ? "Roller center" : "Start / point 1"}<input data-builder-field="${isGripper || isSensor ? "angle" : "start"}" type="number" step="0.1" value="${fmt(isGripper || isSensor ? item.angle : item.start, 1)}"></label>
        ${!isGripper && !isCoding && !isSensor ? isAplRoller
          ? `<label>Roller surface coverage (table deg)<input data-builder-field="wipeSpanDeg" type="number" min="0.1" step="0.1" value="${fmt(item.wipeSpanDeg, 1)}"><small>Contact footprint used by the servo wipe calculation; this is not another roller point.</small></label>`
          : `<label>Stop / point 2<input data-builder-field="end" type="number" step="0.1" value="${fmt(item.end, 1)}"></label>` : ""}
        ${mode === "cold-glue" && item.kind === "brush" ? `<label>Brush role<select data-builder-field="role"><option value="process" ${item.role === "process" ? "selected" : ""}>Partial wipe</option><option value="final" ${item.role === "final" ? "selected" : ""}>Final wipe</option><option value="hold" ${item.role === "hold" ? "selected" : ""}>Hold only</option></select></label><label>Coverage %<input data-builder-field="coveragePercent" type="number" min="0" max="100" step="1" value="${fmt(item.coveragePercent, 0)}"></label><label>Brush extension<input data-builder-field="extension" type="number" min="4" step="1" value="${fmt(item.extension, 1)}"></label>` : ""}
        ${isSensor ? `<label class="builder-checkbox-label"><input data-builder-field="servoAssist" type="checkbox" ${item.servoAssist ? "checked" : ""}> Orient bottle for sensor<small>Creates the shortest turn needed to meet the configured label view.</small></label><label>Required label view (%)<input data-builder-field="requiredVisibilityPercent" type="number" min="1" max="100" step="1" value="${fmt(item.requiredVisibilityPercent, 0)}"><small>1% allows an edge view; 100% aligns the label centerline directly with the sensor.</small></label><div class="sensor-inline-status ${sensorStatus?.passes ? "sensor-status-pass" : "sensor-status-fail"}"><strong>${fmt(sensorStatus?.percent, 1)}% visible</strong><span>Required: ${fmt(sensorStatus?.required, 0)}%</span></div>` : ""}
      </div>
      ${coreColdGlue ? `<small class="builder-core-note">Core Cold Glue machine point</small>` : ""}
      <div class="builder-object-actions"><button type="button" class="builder-duplicate secondary-button">Duplicate</button><button type="button" class="builder-remove secondary-button">Remove</button></div>
      </div>`;
    row.querySelector("summary strong").textContent = item.name;
    row.querySelector("summary")?.addEventListener("click", () => {
      state.selectedMapObjectId = item.id;
      window.requestAnimationFrame(renderMap);
    });

    row.querySelector("[data-station-section]")?.addEventListener("change", (event) => {
      const editable = editableMachineMap();
      editable.stationSections = editable.stationSections && typeof editable.stationSections === "object" ? editable.stationSections : {};
      const key = String(item.station);
      if (event.target.value === "auto") delete editable.stationSections[key];
      else editable.stationSections[key] = event.target.value;
      refreshAfterBuilderEdit({ persist: true });
      renderWipeDownBuilder();
    });

    row.querySelectorAll("[data-builder-field]").forEach((control) => {
      control.addEventListener("focus", () => recordBuilderHistory(`Edit ${item.name}`), { once: true });
      const applyControlValue = (persist = false) => {
        const field = control.dataset.builderField;
        const booleanField = field === "servoAssist";
        const numericField = !booleanField && !["name", "side", "role"].includes(field);
        if (numericField && (control.value === "" || control.value === "-" || control.value === "." || control.value === "-.")) return;
        const editable = editableMachineMap();
        const editableIndex = editable.objects.findIndex((entry) => entry.id === item.id);
        const targetItem = editableIndex >= 0 ? normalizeBuilderObject(editable.objects[editableIndex], editable.applicationMode, editable.stationCount) : item;
        targetItem[field] = booleanField ? control.checked : numericField ? num(control.value, targetItem[field]) : control.value;
        if (field === "angle") targetItem.start = targetItem.end = targetItem.angle;
        if (editableIndex >= 0) editable.objects[editableIndex] = normalizeBuilderObject(targetItem, editable.applicationMode, editable.stationCount);
        if (field === "name") row.querySelector("summary strong").textContent = targetItem.name;
        refreshAfterBuilderEdit({ persist: true });
        // Ordinary edits are already applied to the live map and persisted.
        // Rebuilding the list here destroys focus, closes the station details
        // box, and resets the user's scroll position. Only a station change
        // needs regrouping in the collapsible station list.
        if (persist && field === "station") renderWipeDownBuilder();
      };
      control.addEventListener("input", () => applyControlValue(false));
      control.addEventListener("change", () => applyControlValue(true));
    });
    row.querySelector(".builder-remove")?.addEventListener("click", () => {
      recordBuilderHistory(`Remove ${item.name}`);
      const editable = editableMachineMap();
      const editableIndex = editable.objects.findIndex((entry) => entry.id === item.id);
      if (editableIndex >= 0) editable.objects.splice(editableIndex, 1);
      refreshAfterBuilderEdit({ persist: true });
      renderWipeDownBuilder();
    });
    row.querySelector(".builder-duplicate")?.addEventListener("click", () => {
      recordBuilderHistory(`Duplicate ${item.name}`);
      const editable = editableMachineMap();
      editable.objects.push(normalizeBuilderObject({ ...deepClone(item), id: uniqueMapId(editable.applicationMode), name: `${item.name} Copy` }, editable.applicationMode, editable.stationCount));
      builderExpandedStation = String(isCoding ? "coding" : item.station);
      refreshAfterBuilderEdit({ persist: true });
      renderWipeDownBuilder();
    });
      groupBody.appendChild(row);
    });
    group.querySelector(".builder-duplicate-station")?.addEventListener("click", () => {
      const targetRaw = window.prompt(`Duplicate Station ${station} to which station number?`, "");
      const targetStation = Math.round(num(targetRaw, NaN));
      if (!Number.isFinite(targetStation) || !activeSlotNumbers(machineMap.enabledStations).includes(targetStation) || targetStation === Number(station)) return;
      recordBuilderHistory(`Duplicate Station ${station}`);
      const editable = editableMachineMap();
      const sourceAngle = num(editable.aggregateAngles?.[String(station)], 0);
      const targetAngle = num(editable.aggregateAngles?.[String(targetStation)], sourceAngle);
      const offset = targetAngle - sourceAngle;
      entries.forEach(({ raw }) => {
        const copy = normalizeBuilderObject({ ...deepClone(raw), id: uniqueMapId(editable.applicationMode), name: `${raw.name} - Station ${targetStation}`, station: targetStation }, editable.applicationMode, editable.stationCount);
        if (Number.isFinite(Number(copy.angle))) copy.angle += offset;
        copy.start += offset;
        copy.end += offset;
        editable.objects.push(copy);
      });
      refreshAfterBuilderEdit({ persist: true });
      builderExpandedStation = String(targetStation);
      renderWipeDownBuilder();
    });
    els.wipeBuilderList.appendChild(group);
  });
  builderExpandedStation = null;
  const undoButton = document.querySelector("#undoBuilderEdit");
  const redoButton = document.querySelector("#redoBuilderEdit");
  if (undoButton) undoButton.disabled = !state.builderHistory?.undo?.length;
  if (redoButton) redoButton.disabled = !state.builderHistory?.redo?.length;
  if (els.builderStatus) els.builderStatus.textContent = `${state.builderSaveState === "saving" ? "Saving…" : "Saved"} • ${machineMap.name} • ${visibleEntries.length} object${visibleEntries.length === 1 ? "" : "s"}`;
}

function saveMapDefinitionFromControls(event) {
  const liveInput = event?.type === "input";
  const map = editableMachineMap();
  if (!map) return;
  const previousLimit = activeAplStationLimit(map);
  map.name = String(els.mapName?.value || map.name).trim() || map.name;
  map.machineType = String(els.mapMachineType?.value || map.machineType || "TopModul").trim() || "TopModul";
  state.applicationMode = els.applicationMode?.value === "cold-glue" ? "cold-glue" : "apl";
  map.applicationMode = state.applicationMode;
  if (map.applicationMode === "cold-glue") {
    map.objects = normalizeColdGlueMap(map.objects);
    map.restoreDefaultObjects = false;
  }
  ensureSelectedBrandForApplication();
  map.headCount = Math.max(1, Math.min(120, Math.round(num(els.mapHeadCount?.value, map.headCount))));
  map.machineSettings = {
    direction: els.mapDirection?.value === "cw" ? "cw" : "ccw",
    radius: Math.max(1, num(els.mapRadius?.value, map.machineSettings?.radius)),
    referencePitchRadiusMm: Math.max(1, num(els.mapReferencePitchRadiusMm?.value, map.machineSettings?.referencePitchRadiusMm)),
    encoderCountsPerRev: Math.max(1, num(els.mapEncoderCountsPerRev?.value, map.machineSettings?.encoderCountsPerRev)),
    servoGearRatio: Math.max(0.001, num(els.mapServoGearRatio?.value, map.machineSettings?.servoGearRatio)),
    autoScaleTableMap: Boolean(els.mapAutoScaleTableMap?.checked),
    zeroAngle: norm(num(els.mapZeroAngle?.value, map.machineSettings?.zeroAngle)),
    maxMoveRatio: Math.max(0.1, num(els.mapMaxMoveRatio?.value, map.machineSettings?.maxMoveRatio))
  };
  map.enabledAggregates = normalizeEnabledSlots(map.enabledAggregates, map.aggregateCount);
  map.enabledStations = normalizeEnabledSlots(map.enabledStations, map.stationCount);
  map.aggregateCount = map.enabledAggregates.filter(Boolean).length;
  map.stationCount = map.enabledStations.filter(Boolean).length;
  map.objects = map.objects.map((item) => normalizeBuilderObject(item, map.applicationMode, 6));
  map.aggregateAngles = normalizeAggregateAngles(map.aggregateAngles, map.applicationMode, map.objects);
  map.stationAngles = normalizeStationAngles({ ...map.stationAngles, ...map.aggregateAngles });
  ensureAplObjectsForNewStations(map, previousLimit);
  if (liveInput) {
    loadMachineMapIntoRuntime(map, false);
    refreshAfterBuilderEdit({ persist: true });
    return;
  }
  loadMachineMapIntoRuntime(map, true);
  saveCurrentSettings();
  renderWipeDownBuilder();
}

function bindWipeDownBuilder() {
  if (!els.addBuilderObject) return;
  document.querySelector("#undoBuilderEdit")?.addEventListener("click", () => restoreBuilderHistory("undo"));
  document.querySelector("#redoBuilderEdit")?.addEventListener("click", () => restoreBuilderHistory("redo"));
  document.querySelector("#guidedMapSetup")?.addEventListener("click", () => {
    const map = editableMachineMap();
    const machineType = String(window.prompt("Machine type (TopMatic, Autocol, or TopModul):", map.machineType || "TopModul") || "").trim();
    if (!machineType) return;
    const headCount = Math.max(1, Math.min(120, Math.round(num(window.prompt("Head count:", String(map.headCount || 45)), map.headCount || 45))));
    const stations = Math.max(1, Math.min(6, Math.round(num(window.prompt("Number of active application stations:", String(map.stationCount || 3)), map.stationCount || 3))));
    const labels = String(window.prompt("Label order by station (comma separated):", stations === 3 ? "neck,body,back" : "neck,neck,body,body,back,back") || "").split(",").map((value) => value.trim().toLowerCase());
    recordBuilderHistory("Guided map setup");
    map.machineType = machineType;
    map.headCount = headCount;
    map.enabledAggregates = Array.from({ length: 6 }, (_, index) => index < stations);
    map.enabledStations = Array.from({ length: 6 }, (_, index) => index < stations);
    map.aggregateCount = stations;
    map.stationCount = stations;
    map.stationSections = {};
    labels.slice(0, stations).forEach((section, index) => {
      if (["neck", "body", "back", "none"].includes(section)) map.stationSections[String(index + 1)] = section;
    });
    ensureAplObjectsForNewStations(map);
    loadMachineMapIntoRuntime(map, true);
    saveCurrentSettings();
    render();
    renderWipeDownBuilder();
  });
  document.querySelector("#optimizeColdGlueMap")?.addEventListener("click", () => {
    recordBuilderHistory("Optimize Cold Glue map");
    if (!optimizeColdGlueMapExample()) {
      state.builderHistory.undo.pop();
      window.alert("Select a Cold Glue label specification before optimizing this map.");
      return;
    }
    builderExpandedStation = String(activeSlotNumbers(activeMachineMap().enabledStations)[0] || 1);
    refreshAfterBuilderEdit({ persist: true });
    renderWipeDownBuilder();
  });
  document.querySelector("#builderObjectType")?.addEventListener("change", updateBuilderTypeControls);
  els.mapLibrarySelect?.addEventListener("change", () => {
    const selected = state.mapLibrary.find((map) => map.id === els.mapLibrarySelect.value);
    if (selected) { loadMachineMapIntoRuntime(selected, true); saveCurrentSettings(); renderWipeDownBuilder(); }
  });
  els.newMachineMap?.addEventListener("click", () => {
    const base = activeMachineMap();
    const copy = createMachineMap({ ...deepClone(base), id: uniqueMapId("machine-map"), name: uniqueMapName(`${base.name} Copy`), isTemplate: false });
    state.mapLibrary.push(copy); loadMachineMapIntoRuntime(copy, true); saveCurrentSettings(); renderWipeDownBuilder();
  });
  els.saveMachineMap?.addEventListener("click", saveMapDefinitionFromControls);
  els.mapMachineType?.addEventListener("change", saveMapDefinitionFromControls);
  els.addMachineType?.addEventListener("click", () => {
    const entered = String(window.prompt("Enter the new machine type name:", "") || "").trim();
    if (!entered) return;
    state.machineTypes = [...new Set([...(state.machineTypes || []), entered])];
    editableMachineMap().machineType = entered;
    saveCurrentSettings();
    renderWipeDownBuilder();
  });
  els.deleteMachineMap?.addEventListener("click", () => {
    if (state.mapLibrary.length <= 1) { window.alert("At least one machine map must remain in the library."); return; }
    const index = state.mapLibrary.findIndex((map) => map.id === state.activeMapId);
    if (index >= 0) state.mapLibrary.splice(index, 1);
    loadMachineMapIntoRuntime(state.mapLibrary[Math.max(0, index - 1)] || state.mapLibrary[0], true);
    saveCurrentSettings(); renderWipeDownBuilder();
  });
  [els.mapName, els.mapHeadCount, els.mapRadius, els.mapReferencePitchRadiusMm, els.mapEncoderCountsPerRev, els.mapServoGearRatio, els.mapZeroAngle, els.mapMaxMoveRatio].forEach((control) => {
    control?.addEventListener("input", saveMapDefinitionFromControls);
    control?.addEventListener("change", saveMapDefinitionFromControls);
  });
  [els.applicationMode, els.mapDirection, els.mapAutoScaleTableMap].forEach((control) => control?.addEventListener("change", saveMapDefinitionFromControls));

  els.addBuilderObject.addEventListener("click", () => {
    recordBuilderHistory("Add map object");
    const machineMap = editableMachineMap();
    const type = document.querySelector("#builderObjectType")?.value || (state.applicationMode === "cold-glue" ? "brush" : "pad");
    const side = document.querySelector("#builderObjectSide")?.value === "inner" ? "inner" : "outer";
    const station = Math.max(1, Math.min(6, Math.round(num(document.querySelector("#builderObjectStation")?.value, nextAplStation()))));
    const start = num(document.querySelector("#builderObjectStart")?.value, 0);
    const end = num(document.querySelector("#builderObjectEnd")?.value, start + 10);
    const name = String(document.querySelector("#builderObjectName")?.value || "").trim() || (type === "coding" ? "Coding" : type === "sensor" ? "Label Sensor" : `${side === "inner" ? "Inside" : "Outside"} ${type === "pad" ? "wipe-down pad" : type}`);
    const addedObject = normalizeBuilderObject({
      id: uniqueMapId(state.applicationMode), name, kind: type, application: state.applicationMode, side, start, end,
      angle: type === "sensor" || (state.applicationMode === "cold-glue" && type === "roller") ? start : undefined,
      wipeSpanDeg: state.applicationMode === "apl" && type === "roller" ? Math.max(0.1, Math.abs(end - start)) : undefined,
      extension: num(document.querySelector("#builderObjectExtension")?.value, 20),
      servoAssist: type === "sensor" && Boolean(document.querySelector("#builderSensorAssist")?.checked),
      requiredVisibilityPercent: type === "sensor" ? num(document.querySelector("#builderSensorVisibility")?.value, 50) : 50,
      station: type === "coding" ? null : station
    }, machineMap.applicationMode, machineMap.stationCount);
    machineMap.objects.push(addedObject);
    if (machineMap.applicationMode === "cold-glue") {
      // Keep the working renderer/profile list synchronized immediately. A
      // full application render can reload persisted map state before the new
      // object has reached this list, making the brush appear to vanish.
      const normalizedColdGlueObjects = normalizeColdGlueMap(machineMap.objects);
      machineMap.objects.splice(0, machineMap.objects.length, ...normalizedColdGlueObjects);
      state.coldGlueMap = machineMap.objects.map((item) => ({ ...item }));
    }
    builderExpandedStation = String(type === "coding" ? "coding" : station);
    if (els.configuredMapObjectsSection) els.configuredMapObjectsSection.open = true;
    refreshAfterBuilderEdit({ persist: true });
    renderWipeDownBuilder();
  });
  els.resetBuilderMap?.addEventListener("click", () => {
    const machineMap = activeMachineMap();
    if (machineMap.restoreDefaultObjects === false) {
      machineMap.objects = [];
    } else {
      machineMap.objects = machineMap.applicationMode === "cold-glue"
        ? []
        : createMachineMap({ applicationMode: "apl", aggregateCount: 6, stationCount: 6 }).objects;
    }
    loadMachineMapIntoRuntime(machineMap, true); saveCurrentSettings(); renderWipeDownBuilder();
  });
}
