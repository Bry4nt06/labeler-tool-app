"use strict";

(function installAssemblyDriverAdapter(global) {
  const model = global.LabelerAssemblyModelDriver;
  const geometry = global.LabelerAssemblyGeometryDriver;
  if (!model || !geometry) throw new Error("Assembly drivers must load before the assembly adapter.");

  function number(value, fallback = 0) {
    return typeof num === "function" ? num(value, fallback) : (Number.isFinite(Number(value)) ? Number(value) : fallback);
  }

  function normalize(value) {
    return model.normalizeAssembly(value, { defaults: defaultAssemblies, number });
  }

  function geometryContext() {
    return {
      tablePitchRadiusMm: state.tablePitchRadiusMm,
      padClearanceMm: state.padClearanceMm,
      number
    };
  }

  function fullContext() {
    return {
      ...geometryContext(),
      defaults: defaultAssemblies,
      assemblies: state.assemblies,
      normalize,
      mapPointAngle,
      profileTiming,
      maxMoveRatio: state.maxMoveRatio,
      format: fmt
    };
  }

  function install(name, implementation) {
    global[name] = implementation;
    try { globalThis[name] = implementation; } catch { }
  }

  install("normalizeAssembly", normalize);
  install("mmToTableDegrees", (mm) => geometry.mmToTableDegrees(mm, geometryContext()));
  install("padStartAngle", (assembly) => geometry.padStartAngle(assembly, geometryContext()));
  install("padAnglesForSide", (assembly, side = "outer") => geometry.padAnglesForSide(assembly, side, geometryContext()));
  install("padProfileTableAngles", (station) => geometry.padProfileTableAngles(station, fullContext()));
  install("assemblyAngles", (assembly, side = null) => geometry.assemblyAngles(assembly, side, geometryContext()));
  install("assemblySpan", (assembly) => geometry.assemblySpan(assembly, geometryContext()));
  install("assemblyRequiredRatio", (assembly) => geometry.requiredRatio(assembly, geometryContext()));
  install("assemblyStatus", (assembly) => geometry.status(assembly, fullContext()));
  install("mapPointStation", geometry.mapPointStation);
  install("syncMapPointsFromAssemblies", () => geometry.syncMapPointsFromAssemblies({
    ...geometryContext(),
    applicationMode: state.applicationMode,
    assemblies: state.assemblies,
    mapPoints: state.mapPoints,
    normalize
  }));
  install("assemblyTypeLabel", model.typeLabel);
  install("assemblyPositionLabel", model.positionLabel);
  install("assemblySelectValue", model.selectValue);

  global.LabelerAssemblyDriverAdapter = Object.freeze({
    model,
    geometry,
    normalize,
    geometryContext
  });
})(window);
