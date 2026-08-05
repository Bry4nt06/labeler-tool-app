"use strict";

(function installInactiveLabelSensorSuppression(global) {
  if (global.LabelerInactiveLabelSensorSuppression?.installed) return;

  const RETRY_MS = 50;
  const SECTIONS = Object.freeze(["neck", "body", "back"]);

  function activeMap() {
    try { return typeof global.activeMachineMap === "function" ? global.activeMachineMap() : null; }
    catch { return null; }
  }

  function activeApplications() {
    try {
      return typeof global.selectedLabelApplicationState === "function"
        ? global.selectedLabelApplicationState()
        : { neck: true, body: true, back: true };
    } catch {
      return { neck: true, body: true, back: true };
    }
  }

  function stationSections(map) {
    try {
      if (typeof global.inferAplStationSections === "function") {
        return global.inferAplStationSections(map) || {};
      }
    } catch { }
    return map?.stationSections || {};
  }

  function sensorSection(sensor, map, sections = stationSections(map)) {
    const explicit = String(
      sensor?.orientationLabelSection
      || sensor?.labelSection
      || "auto"
    ).trim().toLowerCase();
    if (SECTIONS.includes(explicit)) return explicit;

    const station = Number(sensor?.station);
    const inherited = String(sections?.[String(station)] || "").trim().toLowerCase();
    if (SECTIONS.includes(inherited)) return inherited;

    try {
      const fallback = typeof global.labelSectionForStation === "function"
        ? String(global.labelSectionForStation(station) || "").trim().toLowerCase()
        : "";
      return SECTIONS.includes(fallback) ? fallback : "none";
    } catch {
      return "none";
    }
  }

  function inactiveSensorIds() {
    const map = activeMap();
    if (!map) return new Set();
    const applications = activeApplications();
    const sections = stationSections(map);
    return new Set((Array.isArray(map.objects) ? map.objects : [])
      .filter((item) => item?.kind === "sensor")
      .filter((sensor) => {
        const section = sensorSection(sensor, map, sections);
        return SECTIONS.includes(section) && applications[section] === false;
      })
      .map((sensor) => String(sensor.id)));
  }

  function suppressNotes(notes) {
    const inactive = inactiveSensorIds();
    if (!inactive.size || !Array.isArray(notes)) return notes;
    return notes.filter((note) => {
      const objectId = note?.[2]?.objectId;
      return objectId === null || objectId === undefined || !inactive.has(String(objectId));
    });
  }

  function installValidationWrapper() {
    const base = global.validate;
    if (typeof base !== "function") return false;
    if (base.inactiveLabelSensorSuppressionV1) return true;

    const wrapped = function validateWithoutInactiveLabelSensorDiagnostics(...args) {
      return suppressNotes(base.apply(this, args));
    };
    wrapped.inactiveLabelSensorSuppressionV1 = true;
    wrapped.previousValidate = base;
    global.validate = wrapped;
    return true;
  }

  function install() {
    if (!installValidationWrapper()) return false;
    global.LabelerInactiveLabelSensorSuppression = Object.freeze({
      installed: true,
      SECTIONS,
      activeApplications,
      sensorSection,
      inactiveSensorIds,
      suppressNotes
    });

    try {
      if (global.state?.selectedBrand) global.applyGeneratedServoProfile?.();
      global.renderValidation?.();
    } catch (error) {
      console.error("Unable to refresh inactive-label sensor diagnostics.", error);
    }
    return true;
  }

  function wait() {
    if (!install()) global.setTimeout(wait, RETRY_MS);
  }

  wait();
})(typeof window !== "undefined" ? window : globalThis);
