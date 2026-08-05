"use strict";

(function installSensorStationLabelDriver(global) {
  if (global.LabelerSensorStationLabelDriver) return;

  const SECTION_BY_STATION = Object.freeze({
    1: "neck",
    2: "neck",
    3: "body",
    4: "body",
    5: "back",
    6: "back"
  });

  const STATIONS_BY_SECTION = Object.freeze({
    neck: Object.freeze([1, 2]),
    body: Object.freeze([3, 4]),
    back: Object.freeze([5, 6])
  });

  const SENSOR_AIM_LIMIT_DEG = 90;
  const AUTO_SENSOR_NAME = /^(?:label sensor|sensor|neck sensor|body sensor|back sensor|neck\s*\/\s*body sensor|body\s*\/\s*neck sensor|neck\s*\/\s*body label inspection|body\s*\/\s*neck label inspection|neck label inspection|body label inspection|back label inspection)$/i;

  function finite(value, fallback = 0) {
    if (value === null || value === undefined || value === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function sensorAimOffset(value) {
    return Math.max(-SENSOR_AIM_LIMIT_DEG, Math.min(SENSOR_AIM_LIMIT_DEG, finite(value, 0)));
  }

  function sectionForStation(station) {
    const value = Math.round(Number(station));
    return SECTION_BY_STATION[value] || "none";
  }

  function sectionLabel(section) {
    return ({ neck: "Neck", body: "Body", back: "Back" })[section] || "Unassigned";
  }

  function sensorName(section) {
    return `${sectionLabel(section)} Sensor`;
  }

  function stationPairLabel(section) {
    const stations = STATIONS_BY_SECTION[section] || [];
    return stations.length === 2 ? `Stations ${stations[0]} & ${stations[1]}` : "Unassigned stations";
  }

  function normalizeSensor(item, { rename = true } = {}) {
    if (!item || item.kind !== "sensor") return false;
    const section = sectionForStation(item.station);
    const manuallyEnabled = item.enabled !== false;
    let changed = false;

    const assign = (key, value) => {
      if (item[key] === value) return;
      item[key] = value;
      changed = true;
    };

    assign("labelSection", section);
    assign("orientationLabelSection", section);
    assign("orientationConfigured", true);
    assign("sensorLabelSource", "station-pair");
    assign("sensorLabelLocked", true);
    assign("sensorAimOffsetDeg", sensorAimOffset(item.sensorAimOffsetDeg));

    // Sensor enabled is the single authority for both inspection and the
    // shortest servo correction. The legacy servoAssist field is retained for
    // the profile pipeline, but is no longer exposed as a second checkbox.
    assign("enabled", manuallyEnabled);
    assign("servoAssist", manuallyEnabled);
    assign("orientBottle", manuallyEnabled);

    if (rename && section !== "none" && AUTO_SENSOR_NAME.test(String(item.name || "").trim())) {
      assign("name", sensorName(section));
    }
    return changed;
  }

  function normalizeMap(map, options = {}) {
    if (!map || !Array.isArray(map.objects)) return false;
    let changed = false;
    map.objects.forEach((item) => {
      if (normalizeSensor(item, options)) changed = true;
    });
    return changed;
  }

  const api = Object.freeze({
    SECTION_BY_STATION,
    STATIONS_BY_SECTION,
    SENSOR_AIM_LIMIT_DEG,
    finite,
    sensorAimOffset,
    sectionForStation,
    sectionLabel,
    sensorName,
    stationPairLabel,
    normalizeSensor,
    normalizeMap
  });

  global.LabelerSensorStationLabelDriver = api;
  global.LabelerDriverRegistry?.register("profile.sensorStationLabel", api, {
    source: "drivers/profile/sensor-station-label-driver.js",
    replace: true
  });

  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
