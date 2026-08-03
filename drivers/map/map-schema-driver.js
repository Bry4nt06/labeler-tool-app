"use strict";

(function installMapSchemaDriver(global) {
  if (global.LabelerMapSchemaDriver) return;

  const MACHINE_MAP_SCHEMA_VERSION = 11;
  const STELLA_330_FULL_WRAP_CALIBRATION_VERSION = 2;
  const BLANK_MAP_SEED_VERSION = 1;
  const VALID_OBJECT_KINDS = Object.freeze([
    "pad", "brush", "brush-channel", "roller", "gripper", "coding", "sensor"
  ]);
  const VALID_LABEL_SECTIONS = Object.freeze(["neck", "body", "back", "none"]);

  function finite(value, fallback = NaN) {
    if (value === null || value === undefined || value === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function normalizeAngle(value) {
    const angle = finite(value, 0) % 360;
    return angle < 0 ? angle + 360 : angle;
  }

  function uniqueMapName(baseName, maps = []) {
    const base = String(baseName || "Machine Map").trim() || "Machine Map";
    const names = new Set((Array.isArray(maps) ? maps : []).map((map) => String(map?.name || "").toLowerCase()));
    if (!names.has(base.toLowerCase())) return base;
    let suffix = 2;
    while (names.has(`${base} ${suffix}`.toLowerCase())) suffix += 1;
    return `${base} ${suffix}`;
  }

  function uniqueMapId(prefix, { now = Date.now, random = Math.random } = {}) {
    return `${prefix}-${now()}-${Math.floor(random() * 10000)}`;
  }

  function inferredMapObjectStation(item) {
    const explicit = Number(item?.station);
    if (Number.isFinite(explicit) && explicit >= 1 && explicit <= 6) return Math.round(explicit);
    const match = String(item?.name || "").match(/station\s*(\d+)/i);
    const parsed = Number(match?.[1]);
    return Number.isFinite(parsed) && parsed >= 1 && parsed <= 6 ? Math.round(parsed) : null;
  }

  function itemApplicationMode(item) {
    return item?.application === "cold-glue"
      || item?.kind === "brush"
      || item?.kind === "brush-channel"
      || item?.kind === "gripper"
      ? "cold-glue"
      : "apl";
  }

  function normalizeBuilderObject(item, mode, stationCount = 6, { idFactory } = {}) {
    const kind = VALID_OBJECT_KINDS.includes(item?.kind) ? item.kind : VALID_OBJECT_KINDS[0];
    const application = item?.application === "cold-glue"
      || kind === "brush"
      || kind === "brush-channel"
      || kind === "gripper"
      ? "cold-glue"
      : "apl";
    const aplRoller = application === "apl" && kind === "roller";
    const singlePoint = kind === "gripper"
      || kind === "sensor"
      || (application === "cold-glue" && kind === "roller");
    const start = finite(singlePoint ? item?.angle : item?.start, 0);
    const originalEnd = finite(singlePoint ? item?.angle : item?.end, start + 10);
    const wipeSpanDeg = aplRoller
      ? Math.max(0.1, finite(item?.wipeSpanDeg, Math.abs(originalEnd - start) || 10))
      : 0;
    const end = kind === "coding"
      ? start + 5
      : kind === "sensor"
        ? start + 3
        : aplRoller
          ? start + wipeSpanDeg
          : originalEnd;
    const outerStart = finite(item?.outerStart, start);
    const outerEnd = Math.max(outerStart, finite(item?.outerEnd, originalEnd));
    const innerStart = finite(item?.innerStart, start);
    const innerEnd = Math.max(innerStart, finite(item?.innerEnd, originalEnd));
    const holdWindowStart = kind === "brush-channel" ? Math.min(outerStart, innerStart) : start;
    const holdWindowEnd = kind === "brush-channel" ? Math.max(outerEnd, innerEnd) : end;
    const bottleHoldStartDeg = Math.min(
      holdWindowEnd,
      Math.max(holdWindowStart, finite(item?.bottleHoldStartDeg, holdWindowStart))
    );
    const createId = typeof idFactory === "function"
      ? idFactory
      : (prefix) => uniqueMapId(prefix);

    return {
      ...item,
      id: String(item?.id || createId(mode)),
      name: String(item?.name || `${kind[0].toUpperCase()}${kind.slice(1)} object`),
      kind,
      application,
      side: item?.side === "inner" ? "inner" : "outer",
      role: application === "cold-glue"
        && kind === "brush"
        && ["process", "final", "hold"].includes(item?.role)
        ? item.role
        : "process",
      coveragePercent: application === "cold-glue" && kind === "brush"
        ? Math.max(0, Math.min(100, finite(item?.coveragePercent, 0)))
        : 0,
      start,
      end,
      outerStart,
      outerEnd,
      innerStart,
      innerEnd,
      wipeSpanDeg,
      angle: singlePoint ? start : item?.angle,
      holdBottleAngle: application === "cold-glue"
        && (kind === "brush" || kind === "brush-channel")
        && Boolean(item?.holdBottleAngle),
      holdCurrentBottleAngle: application === "cold-glue"
        && (kind === "brush" || kind === "brush-channel")
        && Boolean(item?.holdCurrentBottleAngle),
      bottleHoldAngleDeg: application === "cold-glue"
        && (kind === "brush" || kind === "brush-channel")
        ? finite(item?.bottleHoldAngleDeg, 90)
        : 90,
      bottleHoldStartDeg,
      servoAssist: kind === "sensor" && Boolean(item?.servoAssist),
      requiredVisibilityPercent: kind === "sensor"
        ? Math.min(100, Math.max(1, finite(item?.requiredVisibilityPercent, 50)))
        : 50,
      extension: Math.max(4, finite(item?.extension, 20)),
      station: kind === "coding"
        ? null
        : Math.max(1, Math.min(6, Math.round(finite(item?.station, inferredMapObjectStation(item) || 1))))
    };
  }

  function normalizeEnabledSlots(value, fallbackCount) {
    const source = Array.isArray(value) ? value : [];
    const count = Math.max(1, Math.min(6, Math.round(finite(fallbackCount, 6))));
    const result = Array.from(
      { length: 6 },
      (_, index) => source[index] === undefined ? index < count : Boolean(source[index])
    );
    if (!result.some(Boolean)) result[0] = true;
    return result;
  }

  function activeSlotNumbers(value) {
    return normalizeEnabledSlots(value, 1)
      .map((enabled, index) => enabled ? index + 1 : null)
      .filter(Boolean);
  }

  function isAggregateEnabled(machineMap, aggregate) {
    return Boolean(normalizeEnabledSlots(
      machineMap?.enabledAggregates,
      machineMap?.aggregateCount
    )[aggregate - 1]);
  }

  function isStationEnabled(machineMap, station) {
    return Boolean(normalizeEnabledSlots(
      machineMap?.enabledStations,
      machineMap?.stationCount
    )[station - 1]);
  }

  function activeAplStationNumbers(machineMap) {
    return Array.from({ length: 6 }, (_, index) => index + 1)
      .filter((station) => isStationEnabled(machineMap, station));
  }

  function activeAplStationLimit(machineMap) {
    const active = activeAplStationNumbers(machineMap);
    return active.length ? Math.max(...active) : 1;
  }

  function defaultColdGlueAggregateAngles(objects = []) {
    const defaults = { "1": 75, "2": 153, "3": 231, "4": 271, "5": 311, "6": 351 };
    const grippers = (Array.isArray(objects) ? objects : [])
      .filter((item) => item?.kind === "gripper" || item?.kind === "pallet")
      .map((item) => finite(item?.angle, item?.start))
      .filter(Number.isFinite);
    grippers.slice(0, 6).forEach((angle, index) => {
      defaults[String(index + 1)] = angle;
    });
    return defaults;
  }

  function normalizeAngleRecord(value, defaults = {}) {
    const source = value && typeof value === "object" ? value : {};
    const result = {};
    for (let slot = 1; slot <= 6; slot += 1) {
      result[String(slot)] = finite(source[String(slot)], finite(defaults[String(slot)], 0));
    }
    return result;
  }

  function normalizeAggregateAngles(value, mode = "apl", objects = [], { aplDefaults = {} } = {}) {
    const defaults = mode === "cold-glue"
      ? defaultColdGlueAggregateAngles(objects)
      : aplDefaults;
    return normalizeAngleRecord(value, defaults);
  }

  function normalizeStationAngles(value, { defaults = {} } = {}) {
    return normalizeAngleRecord(value, defaults);
  }

  function sortAplMapObjects(objects) {
    const sideOrder = { outer: 0, inner: 1 };
    return objects.sort((a, b) => Number(a.station) - Number(b.station)
      || (sideOrder[a.side] ?? 9) - (sideOrder[b.side] ?? 9)
      || String(a.name).localeCompare(String(b.name)));
  }

  function inferredAplStation(item) {
    const idMatch = String(item?.id || "").match(/apl-station-(\d+)/i);
    const nameMatch = String(item?.name || "").match(/station\s+(\d+)/i);
    const parsed = Number(idMatch?.[1] || nameMatch?.[1]);
    return Number.isFinite(parsed) && parsed >= 1 && parsed <= 6 ? parsed : null;
  }

  function repairAplStationAssignments(machineMap) {
    if (!machineMap || machineMap.applicationMode !== "apl") return machineMap;
    machineMap.objects = (Array.isArray(machineMap.objects) ? machineMap.objects : []).map((item) => {
      const expected = inferredAplStation(item);
      return expected && Number(item.station) !== expected ? { ...item, station: expected } : item;
    });
    return machineMap;
  }

  function ensureAplObjectsForNewStations(machineMap, {
    defaultObjects = [],
    clone = (value) => JSON.parse(JSON.stringify(value)),
    idFactory,
    normalizeObject = normalizeBuilderObject
  } = {}) {
    if (!machineMap
      || machineMap.applicationMode !== "apl"
      || machineMap.restoreDefaultObjects === false) return machineMap;
    repairAplStationAssignments(machineMap);
    const activeStations = activeAplStationNumbers(machineMap);
    const defaultsByStation = new Map();
    defaultObjects.forEach((item) => {
      const station = Number(item.station);
      if (!defaultsByStation.has(station)) defaultsByStation.set(station, []);
      defaultsByStation.get(station).push(item);
    });

    for (const station of activeStations) {
      const stationObjects = machineMap.objects.filter((item) =>
        Number(item.station) === station && (item.kind === "pad" || item.kind === "roller")
      );
      if (stationObjects.length) continue;
      (defaultsByStation.get(station) || []).forEach((item) => {
        const restored = normalizeObject(clone(item), "apl", 6, { idFactory });
        restored.station = station;
        restored.id = `apl-station-${station}-${restored.side}`;
        restored.name = `Station ${station} ${restored.side === "inner" ? "Inside" : "Outside"} ${restored.kind === "roller" ? "Rollers" : "Wipe-Down Pad"}`;
        machineMap.objects.push(restored);
      });
    }
    machineMap.objects = sortAplMapObjects(machineMap.objects);
    return machineMap;
  }

  function inferAplStationSections(machineMap) {
    if (!machineMap || machineMap.applicationMode !== "apl") return {};
    const explicit = machineMap.stationSections && typeof machineMap.stationSections === "object"
      ? machineMap.stationSections
      : {};
    const result = {};
    Object.entries(explicit).forEach(([station, section]) => {
      if (VALID_LABEL_SECTIONS.includes(section)) result[String(station)] = section;
    });

    const mechanical = (machineMap.objects || []).filter((item) =>
      (item.kind === "roller" || item.kind === "pad")
      && isStationEnabled(machineMap, Number(item.station))
    );
    const rollerStations = [...new Set(mechanical
      .filter((item) => item.kind === "roller")
      .map((item) => Number(item.station)))].sort((a, b) => a - b);
    const padStations = [...new Set(mechanical
      .filter((item) => item.kind === "pad")
      .map((item) => Number(item.station)))].sort((a, b) => a - b);
    const installedStations = [...new Set(mechanical
      .map((item) => Number(item.station)))].sort((a, b) => a - b);

    if (installedStations.length === 3) {
      ["neck", "body", "back"].forEach((section, index) => {
        const station = String(installedStations[index]);
        if (!result[station]) result[station] = section;
      });
      return result;
    }

    rollerStations.forEach((station) => {
      if (!result[String(station)]) result[String(station)] = "neck";
    });
    padStations.forEach((station, index) => {
      if (!result[String(station)]) result[String(station)] = index < 2 ? "body" : "back";
    });
    return result;
  }

  function inferredMachineMapApplicationMode(map) {
    if (map?.applicationMode === "cold-glue") return "cold-glue";
    const name = String(map?.name || "");
    return /cold[ -]?glue/i.test(name) || /(^|[\s_-])cg([\s_-]|$)/i.test(name)
      ? "cold-glue"
      : "apl";
  }

  function createMachineMap(input = {}, context = {}) {
    const normalizedMachineType = String(input.machineType || "TopModul");
    const mode = input.applicationMode === "cold-glue" ? "cold-glue" : "apl";
    const aggregates = Math.max(1, Math.min(6, Math.round(finite(
      input.aggregateCount,
      mode === "cold-glue" ? 3 : 6
    ))));
    const stations = Math.max(1, Math.min(6, Math.round(finite(input.stationCount, aggregates))));
    const defaultAplObjects = typeof context.defaultAplObjects === "function"
      ? context.defaultAplObjects()
      : [];
    const sourceObjects = Array.isArray(input.objects)
      ? input.objects.map((item) => ({ ...item }))
      : mode === "cold-glue"
        ? []
        : defaultAplObjects;

    if (mode === "apl"
      && input.restoreDefaultObjects !== false
      && !sourceObjects.some((item) => item.kind === "coding")) {
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

    const current = context.current || {};
    const location = typeof context.mapLocationFor === "function"
      ? context.mapLocationFor({ zone: input.zone, site: input.site })
      : { zone: input.zone || "", site: input.site || "" };
    const aplAggregateDefaults = typeof context.defaultAplAggregateAngles === "function"
      ? context.defaultAplAggregateAngles()
      : {};
    const stationDefaults = typeof context.defaultAplStationAngles === "function"
      ? context.defaultAplStationAngles()
      : {};
    const normalizedStationAngles = normalizeStationAngles(input.stationAngles, { defaults: stationDefaults });
    const normalizedObjects = sourceObjects.map((item) => normalizeBuilderObject(
      { ...item, kind: item.kind === "wipe" ? "brush" : item.kind },
      mode,
      stations,
      { idFactory: context.idFactory }
    ));

    return {
      schemaVersion: MACHINE_MAP_SCHEMA_VERSION,
      blankSeedVersion: Math.max(0, Math.round(finite(input.blankSeedVersion, 0))),
      isTemplate: Boolean(input.isTemplate),
      id: String(input.id || (typeof context.idFactory === "function"
        ? context.idFactory("machine-map")
        : uniqueMapId("machine-map"))),
      name: String(input.name || `${mode === "cold-glue" ? "Cold Glue" : "APL"} ${aggregates}-Aggregate Map`),
      zone: location.zone,
      site: location.site,
      machineType: normalizedMachineType,
      applicationMode: mode,
      headCount: Math.max(1, Math.min(120, Math.round(finite(
        input.headCount,
        input.machineSettings?.headCount !== undefined
          ? input.machineSettings.headCount
          : finite(current.headCount, 60)
      )))),
      aggregateCount: normalizeEnabledSlots(input.enabledAggregates, aggregates).filter(Boolean).length,
      stationCount: normalizeEnabledSlots(input.enabledStations, stations).filter(Boolean).length,
      enabledAggregates: normalizeEnabledSlots(input.enabledAggregates, aggregates),
      enabledStations: normalizeEnabledSlots(input.enabledStations, stations),
      aggregateAngles: normalizeAggregateAngles(
        { ...normalizedStationAngles, ...(input.aggregateAngles || {}) },
        mode,
        sourceObjects,
        { aplDefaults: aplAggregateDefaults }
      ),
      stationAngles: normalizeStationAngles(
        { ...(input.stationAngles || {}), ...(input.aggregateAngles || {}) },
        { defaults: stationDefaults }
      ),
      stationSections: input.stationSections && typeof input.stationSections === "object"
        ? { ...input.stationSections }
        : {},
      machineSettings: {
        // Stored direction values remain exactly compatible with the existing
        // ServoForge mapping. This driver does not reinterpret cw/ccw.
        direction: input.machineSettings?.direction === "cw" ? "cw" : "ccw",
        radius: Math.max(1, finite(input.machineSettings?.radius, finite(current.radius, 250))),
        referencePitchRadiusMm: Math.max(1, finite(
          input.machineSettings?.referencePitchRadiusMm,
          finite(current.referencePitchRadiusMm, 572.958)
        )),
        encoderCountsPerRev: Math.max(1, finite(
          input.machineSettings?.encoderCountsPerRev,
          finite(current.encoderCountsPerRev, 10000)
        )),
        servoGearRatio: Math.max(0.001, finite(
          input.machineSettings?.servoGearRatio,
          finite(current.servoGearRatio, 1)
        )),
        autoScaleTableMap: input.machineSettings?.autoScaleTableMap !== false,
        zeroAngle: normalizeAngle(finite(input.machineSettings?.zeroAngle, finite(current.zeroAngle, 0))),
        maxMoveRatio: Math.max(0.1, finite(
          input.machineSettings?.maxMoveRatio,
          finite(current.maxMoveRatio, 21)
        ))
      },
      coldGlueProfile: mode === "cold-glue"
        && input.coldGlueProfile
        && typeof input.coldGlueProfile === "object"
        ? { ...input.coldGlueProfile }
        : undefined,
      depths: { ...(current.depths || {}), ...(input.depths || {}) },
      restoreDefaultObjects: input.restoreDefaultObjects !== false,
      objects: normalizedObjects
    };
  }

  const api = Object.freeze({
    MACHINE_MAP_SCHEMA_VERSION,
    STELLA_330_FULL_WRAP_CALIBRATION_VERSION,
    BLANK_MAP_SEED_VERSION,
    VALID_OBJECT_KINDS,
    VALID_LABEL_SECTIONS,
    finite,
    normalizeAngle,
    uniqueMapName,
    uniqueMapId,
    inferredMapObjectStation,
    itemApplicationMode,
    normalizeBuilderObject,
    normalizeEnabledSlots,
    activeSlotNumbers,
    isAggregateEnabled,
    isStationEnabled,
    activeAplStationNumbers,
    activeAplStationLimit,
    defaultColdGlueAggregateAngles,
    normalizeAggregateAngles,
    normalizeStationAngles,
    sortAplMapObjects,
    inferredAplStation,
    repairAplStationAssignments,
    ensureAplObjectsForNewStations,
    inferAplStationSections,
    inferredMachineMapApplicationMode,
    createMachineMap
  });

  global.LabelerMapSchemaDriver = api;
  global.LabelerDriverRegistry?.register("map.schema", api, {
    dependencies: [],
    source: "drivers/map/map-schema-driver.js",
    replace: true
  });

  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
