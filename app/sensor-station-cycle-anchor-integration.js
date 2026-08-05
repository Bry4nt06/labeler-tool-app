"use strict";

(function installSensorStationCycleAnchor(global) {
  if (global.LabelerSensorStationCycleAnchorIntegration?.installed) return;

  const RETRY_MS = 25;
  const EPS = 0.001;

  function finite(value, fallback = NaN) {
    if (value === null || value === undefined || value === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function stationApplicationAnchor(item, rows = []) {
    if (item?.kind !== "sensor") return NaN;
    const station = Number(item?.station);
    if (!Number.isFinite(station)) return NaN;

    const source = Array.isArray(rows) ? rows : [];
    const stationRows = source.filter((row) =>
      Number(row?.station) === station
      && /application/i.test(String(row?.action || ""))
      && Number.isFinite(finite(row?.tableAngle, NaN))
    );
    const fallbackRows = source.filter((row) =>
      new RegExp(`\\bAgg\\s*${station}\\b`, "i").test(String(row?.action || ""))
      && /application/i.test(String(row?.action || ""))
      && Number.isFinite(finite(row?.tableAngle, NaN))
    );
    const candidates = stationRows.length ? stationRows : fallbackRows;
    if (!candidates.length) return NaN;

    const references = candidates.filter((row) => Number(row?.cmd) === 3);
    const selected = [...(references.length ? references : candidates)]
      .sort((left, right) => finite(left?.tableAngle, 0) - finite(right?.tableAngle, 0))[0];
    return finite(selected?.tableAngle, NaN);
  }

  function install() {
    const base = global.LabelerDriverRegistry?.resolve?.("profile.mapObjectOrientation")
      || global.LabelerMapObjectOrientationDriver;
    if (!base?.objectWindow) return false;
    if (base.sensorStationCycleAnchorV1) return true;

    const patched = Object.freeze({
      ...base,
      sensorStationCycleAnchorV1: true,
      stationApplicationAnchor,
      objectWindow(options = {}) {
        const window = base.objectWindow(options);
        const item = options.item;
        if (item?.kind !== "sensor") return window;

        const anchor = stationApplicationAnchor(item, options.rows);
        if (!Number.isFinite(anchor)) return window;

        let start = finite(window?.start, finite(item?.angle, item?.start));
        let end = finite(window?.end, start + 3);
        let center = finite(item?.angle, item?.start);
        while (center < anchor - EPS) {
          start += 360;
          end += 360;
          center += 360;
        }
        return {
          ...window,
          start,
          end,
          stationApplicationAnchor: anchor,
          stationCycleAnchored: center >= anchor - EPS
        };
      }
    });

    global.LabelerMapObjectOrientationDriver = patched;
    global.LabelerDriverRegistry?.register?.("profile.mapObjectOrientation", patched, {
      dependencies: ["profile.coderOrientation"],
      source: "app/sensor-station-cycle-anchor-integration.js",
      replace: true
    });
    global.LabelerSensorStationCycleAnchorIntegration = Object.freeze({
      installed: true,
      stationApplicationAnchor,
      refresh: install
    });
    return true;
  }

  function wait() {
    if (!install()) global.setTimeout(wait, RETRY_MS);
  }

  wait();
})(typeof window !== "undefined" ? window : globalThis);
