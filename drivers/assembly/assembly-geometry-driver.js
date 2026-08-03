"use strict";

(function installAssemblyGeometryDriver(global) {
  if (global.LabelerAssemblyGeometryDriver) return;

  function mmToTableDegrees(mm, { tablePitchRadiusMm, number }) {
    const radius = Math.max(0.001, number(tablePitchRadiusMm, 572.958));
    return (number(mm) / radius) * (180 / Math.PI);
  }

  function padStartAngle(assembly, context) {
    return context.number(assembly.spenderAngle) + mmToTableDegrees(context.padClearanceMm, context);
  }

  function padAnglesForSide(assembly, side = "outer", context) {
    const baseStart = padStartAngle(assembly, context);
    const bothSelected = assembly.sides?.includes("outer") && assembly.sides?.includes("inner");
    const offset = bothSelected && side === "inner"
      ? Math.max(0, context.number(assembly.padSideOffsetDeg, 3))
      : 0;
    const start = baseStart + offset;
    return [start, start + Math.max(0.1, context.number(assembly.padSpanDeg, 20))];
  }

  function padProfileTableAngles(station, context) {
    const fallback = context.defaults[station - 1];
    const assembly = context.normalize(
      context.assemblies.find((entry) => Number(entry.station) === Number(station)) || fallback
    );
    if (assembly.type !== "pads" || !assembly.sides.length) {
      const start = context.mapPointAngle(new RegExp(`Agg ${station} .*Start`, "i"));
      const stop = context.mapPointAngle(new RegExp(`Agg ${station} .*Stop`, "i"), start + 20);
      return [start, Math.min(stop, start + context.profileTiming.wipe1Duration), stop, stop + 0.5];
    }
    const outer = assembly.sides.includes("outer") ? padAnglesForSide(assembly, "outer", context) : null;
    const inner = assembly.sides.includes("inner") ? padAnglesForSide(assembly, "inner", context) : null;
    if (outer && inner) return [outer[0], inner[0], inner[1], Math.max(outer[1], inner[1]) + 0.5];
    const window = outer || inner;
    return [window[0], Math.min(window[1], window[0] + context.profileTiming.wipe1Duration), window[1], window[1] + 0.5];
  }

  function assemblyAngles(assembly, side = null, context) {
    if (assembly.type === "rollers") {
      const sides = side ? [side] : assembly.sides;
      return sides
        .flatMap((position) => position === "inner" ? assembly.innerRollerAngles : assembly.outerRollerAngles)
        .filter(Number.isFinite);
    }
    if (assembly.type === "pads") {
      const sides = side ? [side] : assembly.sides;
      return sides.flatMap((position) => padAnglesForSide(assembly, position, context)).filter(Number.isFinite);
    }
    if (assembly.type === "brushes") {
      const sides = side ? [side] : assembly.sides;
      return sides
        .flatMap((position) => position === "inner" ? assembly.innerBrushAngles : assembly.outerBrushAngles)
        .filter(Number.isFinite);
    }
    return [];
  }

  function assemblySpan(assembly, context) {
    const angles = assemblyAngles(assembly, null, context);
    return angles.length ? Math.max(...angles) - Math.min(...angles) : 0;
  }

  function requiredRatio(assembly, context) {
    const span = assemblySpan(assembly, context);
    return span > 0 ? Math.abs(context.number(assembly.requiredPlateRotation)) / span : Infinity;
  }

  function status(assembly, context) {
    if (!assembly.enabled || assembly.type === "none" || !assembly.sides?.length) {
      return { level: "off", text: "Removed", ratio: 0 };
    }
    const span = assemblySpan(assembly, context);
    const ratio = requiredRatio(assembly, context);
    if (span <= 0) return { level: "bad", text: "Invalid contact distance", ratio };
    if (ratio >= context.maxMoveRatio) return { level: "bad", text: `Servo fault (${context.format(ratio, 2)}:1)`, ratio };
    if (ratio >= context.maxMoveRatio * 0.85) return { level: "warn", text: `Near limit (${context.format(ratio, 2)}:1)`, ratio };
    return { level: "ok", text: `Optimized (${context.format(ratio, 2)}:1)`, ratio };
  }

  function mapPointStation(name) {
    const match = String(name || "").match(/Agg\s*(\d+)/i);
    return match ? Number(match[1]) : null;
  }

  function syncMapPointsFromAssemblies(context) {
    if (context.applicationMode === "cold-glue") return;
    context.assemblies.forEach((raw) => {
      const assembly = context.normalize(raw);
      const station = assembly.station;
      const spender = context.mapPoints.find((point) => new RegExp(`Agg ${station} Spender`, "i").test(point.name));
      if (spender) spender.angle = assembly.spenderAngle;

      const rollerPoints = context.mapPoints.filter((point) => new RegExp(`Agg ${station} Roller`, "i").test(point.name));
      const rollerAngles = [...assembly.outerRollerAngles, ...assembly.innerRollerAngles];
      rollerPoints.forEach((point, index) => {
        if (Number.isFinite(rollerAngles[index])) point.angle = rollerAngles[index];
      });

      const startPoint = context.mapPoints.find((point) => new RegExp(`Agg ${station} .*Start`, "i").test(point.name));
      const stopPoint = context.mapPoints.find((point) => new RegExp(`Agg ${station} .*Stop`, "i").test(point.name));
      if (assembly.type === "brushes") {
        if (startPoint) startPoint.angle = assembly.brushStartAngle;
        if (stopPoint) stopPoint.angle = assembly.brushEndAngle;
      } else {
        if (startPoint) startPoint.angle = padAnglesForSide(assembly, /Inner/i.test(startPoint.name) ? "inner" : "outer", context)[0];
        if (stopPoint) stopPoint.angle = padAnglesForSide(assembly, /Inner/i.test(stopPoint.name) ? "inner" : "outer", context)[1];
      }
    });
  }

  const api = Object.freeze({
    mmToTableDegrees,
    padStartAngle,
    padAnglesForSide,
    padProfileTableAngles,
    assemblyAngles,
    assemblySpan,
    requiredRatio,
    status,
    mapPointStation,
    syncMapPointsFromAssemblies
  });

  global.LabelerAssemblyGeometryDriver = api;
  global.LabelerDriverRegistry?.register("assembly.geometry", api, {
    dependencies: ["assembly.model"],
    stage: "assembly-geometry"
  });
})(window);
