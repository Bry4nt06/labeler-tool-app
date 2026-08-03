"use strict";

(function installMapColdGlueOptimizationService(global) {
  function optimizeColdGlueMapExample({ requireStella660 = false } = {}) {
    const machineMap = activeMachineMap();
    if (!machineMap || machineMap.applicationMode !== "cold-glue") return false;
    const stella660Pattern = /(?=.*stella)(?=.*660)/i;
    const specification = requireStella660
      ? state.labelSpecs.find((spec) =>
        normalizeLabelApplicationMode(spec.applicationMode) === "cold-glue"
        && stella660Pattern.test(String(spec.brand || ""))
      )
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
      const aggregateAngle = norm(num(
        machineMap.aggregateAngles?.[String(station)],
        num(machineMap.stationAngles?.[String(station)], station * 40 + 35)
      ));
      const nextStation = stations[index + 1];
      let nextBoundary = nextStation
        ? norm(num(
          machineMap.aggregateAngles?.[String(nextStation)],
          num(machineMap.stationAngles?.[String(nextStation)], aggregateAngle + 80)
        ))
        : 359;
      while (nextBoundary <= aggregateAngle + pitch) nextBoundary += 360;
      nextBoundary = Math.min(359, nextBoundary);
      const channelStart = Math.min(356, aggregateAngle + Math.max(6, pitch));
      const availableSpan = Math.max(4, nextBoundary - channelStart - Math.max(3, pitch / 2));
      const wipe = sectionWipePlan(section);
      const labelDeg = Math.max(0, num(wipe?.labelDeg, 0));
      const overWipeDeg = Math.max(0, num(wipe?.overWipeDeg, 0));
      const totalRequiredRotation = labelDeg * 1.5 + overWipeDeg * 3;
      const desiredSpan = Math.max(12, totalRequiredRotation / 8);
      const channelEnd = Math.min(359, channelStart + Math.min(availableSpan, desiredSpan));
      const sectionName = sectionLabel(section);
      newObjects.push(
        normalizeBuilderObject({
          id: `stella-660-${station}-${section}-outer`,
          name: `${sectionName} Outside Brush Channel`,
          kind: "brush",
          application: "cold-glue",
          station,
          side: "outer",
          role: "process",
          coveragePercent: 50,
          start: channelStart,
          end: channelEnd,
          extension: 20
        }, "cold-glue", machineMap.stationCount),
        normalizeBuilderObject({
          id: `stella-660-${station}-${section}-inner`,
          name: `${sectionName} Inside Brush Channel`,
          kind: "brush",
          application: "cold-glue",
          station,
          side: "inner",
          role: "final",
          coveragePercent: 0,
          start: channelStart,
          end: channelEnd,
          extension: 20
        }, "cold-glue", machineMap.stationCount)
      );
      machineMap.stationSections = {
        ...(machineMap.stationSections || {}),
        [String(station)]: section
      };
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
    if (!machineMap
      || machineMap.coldGlueOptimizationVersion >= 1
      || String(machineMap.name || "").trim().toLowerCase() !== "60h cg mab1") return false;
    return optimizeColdGlueMapExample({ requireStella660: true });
  }

  global.optimizeColdGlueMapExample = optimizeColdGlueMapExample;
  global.initializeStella660ColdGlueExample = initializeStella660ColdGlueExample;
  global.LabelerMapColdGlueOptimizationService = Object.freeze({
    optimizeColdGlueMapExample,
    initializeStella660ColdGlueExample
  });
})(typeof window !== "undefined" ? window : globalThis);
