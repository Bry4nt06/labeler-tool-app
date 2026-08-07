"use strict";

(function installMapSchemaAdapter(global) {
  const driver = global.LabelerDriverRegistry?.resolve("map.schema")
    || global.LabelerMapSchemaDriver;
  if (!driver) throw new Error("Map schema driver is not loaded.");

  function setGlobal(name, implementation) {
    global[name] = implementation;
  }

  function aplAggregateDefaults() {
    return typeof defaultAplAggregateAngles === "function" ? defaultAplAggregateAngles() : {};
  }

  function aplStationDefaults() {
    return typeof defaultAplStationAngles === "function" ? defaultAplStationAngles() : {};
  }

  const adapter = {
    uniqueMapName(baseName) {
      return driver.uniqueMapName(baseName, state.mapLibrary || []);
    },
    uniqueMapId(prefix) {
      return driver.uniqueMapId(prefix);
    },
    inferredMapObjectStation(item) {
      return driver.inferredMapObjectStation(item);
    },
    normalizeBuilderObject(item, mode, stationCount = 6) {
      return driver.normalizeBuilderObject(item, mode, stationCount, {
        idFactory: (prefix) => driver.uniqueMapId(prefix)
      });
    },
    itemApplicationMode(item) {
      return driver.itemApplicationMode(item);
    },
    normalizeEnabledSlots(value, fallbackCount) {
      return driver.normalizeEnabledSlots(value, fallbackCount);
    },
    activeSlotNumbers(value) {
      return driver.activeSlotNumbers(value);
    },
    isAggregateEnabled(machineMap, aggregate) {
      return driver.isAggregateEnabled(machineMap, aggregate);
    },
    isStationEnabled(machineMap, station) {
      return driver.isStationEnabled(machineMap, station);
    },
    activeAplStationNumbers(machineMap) {
      return driver.activeAplStationNumbers(machineMap);
    },
    activeAplStationLimit(machineMap) {
      return driver.activeAplStationLimit(machineMap);
    },
    defaultColdGlueAggregateAngles(objects = []) {
      return driver.defaultColdGlueAggregateAngles(objects);
    },
    normalizeAggregateAngles(value, mode = "apl", objects = []) {
      return driver.normalizeAggregateAngles(value, mode, objects, {
        aplDefaults: aplAggregateDefaults()
      });
    },
    normalizeStationAngles(value) {
      return driver.normalizeStationAngles(value, { defaults: aplStationDefaults() });
    },
    normalizeSpenderPlateAngles(value) {
      return driver.normalizeSpenderPlateAngles(value);
    },
    sortAplMapObjects(objects) {
      return driver.sortAplMapObjects(objects);
    },
    inferredAplStation(item) {
      return driver.inferredAplStation(item);
    },
    repairAplStationAssignments(machineMap) {
      return driver.repairAplStationAssignments(machineMap);
    },
    ensureAplObjectsForNewStations(machineMap) {
      return driver.ensureAplObjectsForNewStations(machineMap, {
        defaultObjects: typeof defaultAplMapObjects === "function" ? defaultAplMapObjects() : [],
        clone: typeof deepClone === "function"
          ? deepClone
          : (value) => JSON.parse(JSON.stringify(value)),
        idFactory: (prefix) => driver.uniqueMapId(prefix),
        normalizeObject: driver.normalizeBuilderObject
      });
    },
    inferAplStationSections(machineMap) {
      return driver.inferAplStationSections(machineMap);
    },
    inferredMachineMapApplicationMode(map) {
      return driver.inferredMachineMapApplicationMode(map);
    },
    createMachineMap(input = {}) {
      return driver.createMachineMap(input, {
        current: {
          headCount: state?.headCount,
          radius: state?.radius,
          referencePitchRadiusMm: state?.referencePitchRadiusMm,
          encoderCountsPerRev: state?.encoderCountsPerRev,
          servoGearRatio: state?.servoGearRatio,
          zeroAngle: state?.zeroAngle,
          maxMoveRatio: state?.maxMoveRatio,
          depths: state?.depths
        },
        defaultAplObjects: () => typeof defaultAplMapObjects === "function" ? defaultAplMapObjects() : [],
        defaultAplAggregateAngles: aplAggregateDefaults,
        defaultAplStationAngles: aplStationDefaults,
        mapLocationFor: (map) => typeof mapLocationFor === "function"
          ? mapLocationFor(map)
          : { zone: map?.zone || "", site: map?.site || "" },
        idFactory: (prefix) => driver.uniqueMapId(prefix)
      });
    }
  };

  Object.entries(adapter).forEach(([name, implementation]) => setGlobal(name, implementation));

  global.LabelerMapSchemaAdapter = Object.freeze({
    driver: "map.schema",
    functions: Object.freeze(Object.keys(adapter)),
    schemaVersion: driver.MACHINE_MAP_SCHEMA_VERSION
  });
})(typeof window !== "undefined" ? window : globalThis);
