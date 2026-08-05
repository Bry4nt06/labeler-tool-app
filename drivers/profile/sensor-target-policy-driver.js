"use strict";

(function installSensorTargetPolicyDriver(global) {
  if (global.LabelerSensorTargetPolicyDriver) return;

  const SECTIONS = Object.freeze(["neck", "body", "back"]);

  function finite(value, fallback = NaN) {
    if (value === null || value === undefined || value === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function normalizedSection(value, fallback = "auto") {
    const section = String(value || fallback).trim().toLowerCase();
    return ["auto", ...SECTIONS, "none"].includes(section) ? section : fallback;
  }

  function stationSection(map, station, stationSections = {}) {
    const key = String(station);
    const section = String(
      stationSections?.[key]
      || map?.stationSections?.[key]
      || ""
    ).trim().toLowerCase();
    return SECTIONS.includes(section) ? section : "none";
  }

  function stationEnabled(map, station) {
    if (!Array.isArray(map?.enabledStations)) return true;
    return map.enabledStations[Number(station) - 1] !== false;
  }

  function eligibleEntries({ item, map, activeApplications = {}, stationSections = {} } = {}) {
    const placement = finite(item?.angle, finite(item?.start, Infinity));
    const latest = new Map();

    for (let station = 1; station <= 6; station += 1) {
      if (!stationEnabled(map, station)) continue;
      const section = stationSection(map, station, stationSections);
      if (!SECTIONS.includes(section) || activeApplications[section] === false) continue;
      const angle = finite(
        map?.aggregateAngles?.[String(station)],
        finite(map?.stationAngles?.[String(station)], NaN)
      );
      if (!Number.isFinite(angle) || angle >= placement - 0.001) continue;
      latest.set(section, Math.max(angle, latest.get(section) ?? -Infinity));
    }

    (Array.isArray(map?.objects) ? map.objects : [])
      .filter((entry) => ["roller", "pad", "brush"].includes(entry?.kind))
      .forEach((entry) => {
        const section = normalizedSection(
          entry?.labelSection || stationSection(map, entry?.station, stationSections),
          "none"
        );
        if (!SECTIONS.includes(section) || activeApplications[section] === false) return;
        const completion = finite(entry?.end, finite(entry?.start, NaN));
        if (!Number.isFinite(completion) || completion >= placement - 0.001) return;
        latest.set(section, Math.max(completion, latest.get(section) ?? -Infinity));
      });

    return SECTIONS
      .filter((section) => latest.has(section))
      .map((section) => ({ section, latestApplicationAngle: latest.get(section) }));
  }

  function eligibleSections(options = {}) {
    return eligibleEntries(options).map((entry) => entry.section);
  }

  function latestEligibleSection(options = {}) {
    const entries = eligibleEntries(options);
    return entries.sort((left, right) => right.latestApplicationAngle - left.latestApplicationAngle)[0]?.section || "none";
  }

  function normalizeSelection({ selection, ...options } = {}) {
    const selected = normalizedSection(selection, "auto");
    if (selected === "auto" || selected === "none") return selected;
    const eligible = eligibleSections(options);
    return eligible.includes(selected) ? selected : latestEligibleSection(options);
  }

  const api = Object.freeze({
    SECTIONS,
    finite,
    normalizedSection,
    stationSection,
    stationEnabled,
    eligibleEntries,
    eligibleSections,
    latestEligibleSection,
    normalizeSelection
  });

  global.LabelerSensorTargetPolicyDriver = api;
  global.LabelerDriverRegistry?.register("profile.sensorTargetPolicy", api, {
    source: "drivers/profile/sensor-target-policy-driver.js",
    replace: true
  });

  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
