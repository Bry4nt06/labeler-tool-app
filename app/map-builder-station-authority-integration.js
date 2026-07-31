"use strict";

(function installMapBuilderStationAuthority() {
  const RETRY_MS = 50;
  const SECTIONS = ["neck", "body", "back"];
  let installed = false;
  let pendingAdd = null;
  let wrappedGenerator = false;

  function finiteStation(value) {
    const station = Math.round(Number(value));
    return Number.isFinite(station) && station >= 1 && station <= 6 ? station : null;
  }

  function activeMap() {
    try {
      return typeof activeMachineMap === "function" ? activeMachineMap() : null;
    } catch {
      return null;
    }
  }

  function isColdGlueObject(item) {
    return item?.application === "cold-glue"
      || ["brush", "brush-channel", "gripper", "pallet", "roller"].includes(String(item?.kind || ""));
  }

  function gripperSectionByStation(map) {
    const result = new Map();
    (Array.isArray(map?.objects) ? map.objects : [])
      .filter((item) => ["gripper", "pallet"].includes(String(item?.kind || "")))
      .forEach((gripper) => {
        const station = finiteStation(gripper.station);
        const section = String(gripper.labelSection || "");
        if (station && SECTIONS.includes(section)) result.set(station, section);
      });
    return result;
  }

  function applyOperatorStation(item, station, sections) {
    const resolved = finiteStation(station);
    if (!item || !resolved || item.kind === "coding") return false;
    let changed = false;
    if (Number(item.station) !== resolved) {
      item.station = resolved;
      changed = true;
    }
    if (Number(item.operatorStation) !== resolved) {
      item.operatorStation = resolved;
      changed = true;
    }
    if (item.stationAssignmentSource !== "operator") {
      item.stationAssignmentSource = "operator";
      changed = true;
    }
    const section = sections.get(resolved);
    if (section && String(item.labelSection || "") !== section) {
      item.labelSection = section;
      changed = true;
    }
    return changed;
  }

  function normalizeStationAuthority(map = activeMap()) {
    if (!map || map.applicationMode !== "cold-glue" || !Array.isArray(map.objects)) return false;
    const sections = gripperSectionByStation(map);
    let changed = false;
    map.objects.forEach((item) => {
      if (!isColdGlueObject(item) || item.kind === "coding") return;
      const locked = finiteStation(item.operatorStation);
      if (locked) {
        changed = applyOperatorStation(item, locked, sections) || changed;
        return;
      }
      const station = finiteStation(item.station);
      const section = sections.get(station);
      if (station && section && (!SECTIONS.includes(String(item.labelSection)) || item.labelSection === "auto")) {
        item.labelSection = section;
        changed = true;
      }
    });
    return changed;
  }

  function persistAndRender() {
    try { if (typeof syncApplicationMapToLegacyState === "function") syncApplicationMapToLegacyState(); } catch { }
    try { if (typeof saveCurrentSettings === "function") saveCurrentSettings(); } catch { }
    try { if (typeof applyGeneratedServoProfile === "function") applyGeneratedServoProfile(); } catch { }
    try { if (typeof renderWipeDownBuilder === "function") renderWipeDownBuilder(); } catch { }
    try { if (typeof renderMap === "function") renderMap(); } catch { }
  }

  function finishPendingAdd() {
    const request = pendingAdd;
    pendingAdd = null;
    if (!request) return;
    const map = activeMap();
    if (!map || map.id !== request.mapId) return;
    const sections = gripperSectionByStation(map);
    const added = map.objects.filter((item) => !request.beforeIds.has(String(item.id)));
    if (!added.length) return;
    let changed = false;
    added.forEach((item) => {
      if (item.kind !== "coding") changed = applyOperatorStation(item, request.station, sections) || changed;
    });
    if (changed) persistAndRender();
  }

  function captureAddRequest(event) {
    if (!event.target.closest?.("#addBuilderObject")) return;
    const map = activeMap();
    const station = finiteStation(document.querySelector("#builderObjectStation")?.value);
    if (!map || !station) return;
    pendingAdd = {
      mapId: map.id,
      station,
      beforeIds: new Set(map.objects.map((item) => String(item.id)))
    };
    window.setTimeout(finishPendingAdd, 0);
  }

  function captureStationEdit(event) {
    const control = event.target.closest?.('.wipe-builder-row [data-builder-field="station"]');
    if (!control) return;
    const map = activeMap();
    const row = control.closest(".wipe-builder-row[data-builder-object-id]");
    const item = map?.objects?.find((entry) => String(entry.id) === String(row?.dataset.builderObjectId));
    const station = finiteStation(control.value);
    if (!map || !item || !station) return;
    applyOperatorStation(item, station, gripperSectionByStation(map));
  }

  function wrapProfileGeneration() {
    if (wrappedGenerator || typeof applyGeneratedServoProfile !== "function") return false;
    const before = applyGeneratedServoProfile;
    applyGeneratedServoProfile = function applyGeneratedServoProfileWithStationAuthority(...args) {
      normalizeStationAuthority(activeMap());
      const output = before.apply(this, args);
      normalizeStationAuthority(activeMap());
      return output;
    };
    applyGeneratedServoProfile.stationAuthority = true;
    wrappedGenerator = true;
    return true;
  }

  function install() {
    if (installed) return true;
    if (typeof state === "undefined" || typeof activeMachineMap !== "function") return false;
    if (!wrapProfileGeneration()) return false;
    installed = true;
    document.addEventListener("click", captureAddRequest, true);
    document.addEventListener("input", captureStationEdit, true);
    document.addEventListener("change", captureStationEdit, true);
    if (normalizeStationAuthority(activeMap())) persistAndRender();
    return true;
  }

  function wait() {
    if (install()) return;
    window.setTimeout(wait, RETRY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait, { once: true });
  else wait();
})();
