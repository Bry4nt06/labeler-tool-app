"use strict";

(function installMapRuntimeService(global) {
  let runtimeMapId = null;

  function currentMapId() {
    return runtimeMapId;
  }

  function invalidateRuntimeMap() {
    runtimeMapId = null;
  }

  function activeMachineMap() {
    if (typeof ensurePersistentApplicationMaps === "function") ensurePersistentApplicationMaps();
    return state.mapLibrary?.find((map) => map.id === state.activeMapId) || state.mapLibrary?.[0] || null;
  }

  function editableMachineMap() {
    return activeMachineMap();
  }

  function activeBuilderMap() {
    return activeMachineMap()?.objects || [];
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
    machineMap.objects = (machineMap.objects || []).map((item) => normalizeBuilderObject(item, "apl", 6));
    const coldGlueObjects = machineMap.objects.filter((item) => item.application === "cold-glue");
    if (coldGlueObjects.length) {
      state.coldGlueMap = coldGlueObjects.map((item) => ({
        ...item,
        kind: item.kind,
        angle: item.kind === "gripper" ? num(item.angle, item.start) : item.angle
      }));
    }
    const stationSections = inferAplStationSections(machineMap);
    state.aplMapObjects = machineMap.objects
      .filter((item) => item.application !== "cold-glue")
      .filter((item) => item.kind === "coding" || activeAplStationNumbers(machineMap).includes(Number(item.station)));
    const grouped = new Map();
    machineMap.objects
      .filter((item) => item.application !== "cold-glue" && (item.kind === "pad" || item.kind === "roller"))
      .forEach((item) => {
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
      const aggregateAngle = num(
        machineMap.aggregateAngles?.[String(station)],
        machineMap.stationAngles?.[String(station)] ?? fallback.spenderAngle
      );
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
          target[1] = Math.max(...sideItems.map((item) =>
            num(item.end, num(item.start, 0) + num(item.wipeSpanDeg, 0.1))
          ));
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

  function loadMachineMapIntoRuntime(map, shouldRender = true) {
    if (!map) return;
    const location = mapLocationFor(map);
    map.zone = location.zone;
    map.site = location.site;
    state.selectedZone = location.zone;
    state.selectedSite = location.site;
    runtimeMapId = map.id;
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
    const normalizedObjects = (map.objects || []).map((item) => normalizeBuilderObject(item, "apl", 6));
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
    const runtimeFields = [
      "headCount", "radius", "referencePitchRadiusMm", "encoderCountsPerRev",
      "servoGearRatio", "zeroAngle", "maxMoveRatio", "direction"
    ];
    runtimeFields.forEach((key) => {
      if (els[key]) els[key].value = state[key];
    });
    if (els.autoScaleTableMap) els.autoScaleTableMap.checked = Boolean(state.autoScaleTableMap);
    Object.entries({
      spenderDepth: "spender",
      opRollerDepth: "opRoller",
      nonOpRollerDepth: "nonOpRoller",
      wipeInnerDepth: "wipeInner",
      wipeOuterDepth: "wipeOuter"
    }).forEach(([elementKey, depthKey]) => {
      if (els[elementKey]) els[elementKey].value = state.depths[depthKey];
    });
    if (shouldRender) render();
  }

  global.activeMachineMap = activeMachineMap;
  global.editableMachineMap = editableMachineMap;
  global.activeBuilderMap = activeBuilderMap;
  global.syncApplicationMapToLegacyState = syncApplicationMapToLegacyState;
  global.loadMachineMapIntoRuntime = loadMachineMapIntoRuntime;
  global.LabelerMapRuntimeService = Object.freeze({
    currentMapId,
    invalidateRuntimeMap,
    activeMachineMap,
    editableMachineMap,
    activeBuilderMap,
    syncApplicationMapToLegacyState,
    loadMachineMapIntoRuntime
  });
})(typeof window !== "undefined" ? window : globalThis);
