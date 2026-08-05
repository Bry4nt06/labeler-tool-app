"use strict";

(function installSensorActivationController(global) {
  if (global.LabelerSensorActivationController?.installed) return;

  const VALID_SECTIONS = new Set(["neck", "body", "back"]);
  const STYLE_ID = "servoforgeSensorActivationStyles";
  let renderBuilderWrapped = false;
  let renderMapWrapped = false;
  let validationWrapped = false;
  let profileWrapped = false;
  let driverPatched = false;

  function machineMap(source = null) {
    if (source) return source;
    try { return typeof activeMachineMap === "function" ? activeMachineMap() : null; }
    catch { return null; }
  }

  function applications() {
    try {
      if (typeof selectedLabelApplicationState === "function") {
        const result = selectedLabelApplicationState();
        return {
          neck: Boolean(result?.neck),
          body: Boolean(result?.body),
          back: Boolean(result?.back)
        };
      }
    } catch { }
    return { neck: true, body: true, back: true };
  }

  function sectionForSensor(sensor, sourceMap = null) {
    if (sensor?.kind !== "sensor") return "none";
    const explicit = String(
      sensor.orientationLabelSection
      || sensor.labelSection
      || "auto"
    ).trim().toLowerCase();
    if (VALID_SECTIONS.has(explicit) || explicit === "none") return explicit;

    const map = machineMap(sourceMap);
    const station = Number(sensor.station);
    try {
      const inferred = typeof inferAplStationSections === "function"
        ? inferAplStationSections(map)?.[String(station)]
        : map?.stationSections?.[String(station)];
      if (VALID_SECTIONS.has(inferred) || inferred === "none") return inferred;
    } catch { }
    try {
      const fallback = typeof labelSectionForStation === "function"
        ? labelSectionForStation(station)
        : "none";
      if (VALID_SECTIONS.has(fallback) || fallback === "none") return fallback;
    } catch { }
    return "none";
  }

  function status(sensor, sourceMap = null) {
    const section = sectionForSensor(sensor, sourceMap);
    const assigned = VALID_SECTIONS.has(section);
    const manualEnabled = sensor?.enabled !== false;
    const active = applications();
    const labelPresent = assigned && Boolean(active[section]);
    const automaticallyRemoved = !assigned || !labelPresent;
    const enabled = manualEnabled && labelPresent;
    const shownOnMap = assigned && labelPresent;

    return {
      section,
      assigned,
      manualEnabled,
      labelPresent,
      automaticallyRemoved,
      enabled,
      shownOnMap,
      reason: !assigned
        ? "Not shown on the map because this sensor is not assigned to a label."
        : !labelPresent
          ? `Not shown on the map because the selected Brand has no ${section} label.`
          : !manualEnabled
            ? "Disabled in Map Builder; shown only as physical hardware."
            : "Active"
    };
  }

  function isEnabled(sensor, sourceMap = null) {
    return Boolean(status(sensor, sourceMap).enabled);
  }

  function shouldRender(sensor, sourceMap = null) {
    return Boolean(status(sensor, sourceMap).shownOnMap);
  }

  function findSensor(objectId, sourceMap = null) {
    const map = machineMap(sourceMap);
    return map?.objects?.find((item) => item?.kind === "sensor" && String(item.id) === String(objectId)) || null;
  }

  function disabledSensors(sourceMap = null) {
    const map = machineMap(sourceMap);
    return (map?.objects || []).filter((item) => item?.kind === "sensor" && !isEnabled(item, map));
  }

  function disabledSensorIds(sourceMap = null) {
    return new Set(disabledSensors(sourceMap).map((item) => String(item.id)));
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .sensor-activation-control {
        grid-column: 1 / -1;
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 5px 8px;
        width: fit-content;
        max-width: 100%;
        padding: 4px 7px;
        border: 1px solid var(--line);
        border-radius: 6px;
        background: color-mix(in srgb, var(--input) 92%, transparent);
        font-size: .82rem;
      }
      .sensor-activation-control > span {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-weight: 700;
        white-space: nowrap;
      }
      .sensor-activation-control input[type="checkbox"] {
        inline-size: 14px !important;
        block-size: 14px !important;
        min-inline-size: 14px !important;
        margin: 0 !important;
      }
      .sensor-activation-control small {
        flex: 1 1 190px;
        line-height: 1.25;
        font-size: .74rem;
      }
      .wipe-builder-row.sensor-object-disabled {
        opacity: .78;
        border-color: color-mix(in srgb, var(--health-info, #59aee9) 52%, var(--line)) !important;
      }
      .wipe-builder-row.sensor-object-unassigned {
        border-style: dashed !important;
      }
      .wipe-builder-row.sensor-object-disabled .sensor-inline-status {
        border-left-color: var(--health-info, #59aee9) !important;
        background: var(--health-info-bg, rgba(58,139,201,.13)) !important;
      }
      #mapSvg [data-map-object-id][data-sensor-disabled="true"] {
        opacity: .45;
        filter: saturate(.4);
      }
    `;
    document.head.appendChild(style);
  }

  function decorateSensorRow(row, sensor, sourceMap) {
    const grid = row.querySelector(".builder-row-grid");
    if (!grid) return;
    const current = status(sensor, sourceMap);
    let control = grid.querySelector(".sensor-activation-control");
    if (!control) {
      control = document.createElement("label");
      control.className = "sensor-activation-control";
      control.innerHTML = `<span><input type="checkbox" data-sensor-enabled> Sensor enabled</span><small data-sensor-enabled-note></small>`;
      grid.prepend(control);
    }
    const checkbox = control.querySelector("[data-sensor-enabled]");
    const note = control.querySelector("[data-sensor-enabled-note]");
    checkbox.checked = current.manualEnabled;
    checkbox.indeterminate = false;
    checkbox.dataset.sensorObjectId = String(sensor.id);
    note.textContent = current.reason;
    row.classList.toggle("sensor-object-disabled", !current.enabled);
    row.classList.toggle("sensor-object-unassigned", current.automaticallyRemoved);
    row.dataset.sensorEffectiveEnabled = String(current.enabled);
    row.dataset.sensorShownOnMap = String(current.shownOnMap);

    const inlineStatus = row.querySelector(".sensor-inline-status");
    if (inlineStatus && !current.enabled) {
      inlineStatus.classList.remove("sensor-status-pass", "sensor-status-fail");
      inlineStatus.dataset.health = "info";
      const strong = inlineStatus.querySelector("strong");
      const span = inlineStatus.querySelector("span");
      if (strong) strong.textContent = current.automaticallyRemoved ? "Sensor not used" : "Sensor disabled";
      if (span) span.textContent = current.reason;
    }
  }

  function decorateBuilder() {
    const map = machineMap();
    if (!map) return;
    document.querySelectorAll("#wipeBuilderList .wipe-builder-row[data-builder-object-id]").forEach((row) => {
      const sensor = findSensor(row.dataset.builderObjectId, map);
      if (sensor) decorateSensorRow(row, sensor, map);
    });
  }

  function decorateMap() {
    const map = machineMap();
    if (!map) return;
    document.querySelectorAll("#mapSvg [data-map-object-id]").forEach((node) => {
      const sensor = findSensor(node.dataset.mapObjectId, map);
      if (!sensor) return;
      const current = status(sensor, map);
      node.hidden = !current.shownOnMap;
      node.style.display = current.shownOnMap ? "" : "none";
      node.dataset.sensorDisabled = String(current.shownOnMap && !current.manualEnabled);
      node.dataset.sensorRemovedForRecipe = String(!current.shownOnMap);
      node.setAttribute("aria-label", `${sensor.name || "Label Sensor"}: ${current.reason}`);
    });
  }

  function updateSensor(objectId, enabled) {
    const map = machineMap();
    const sensor = findSensor(objectId, map);
    if (!sensor) return false;
    if (typeof recordBuilderHistory === "function") {
      try { recordBuilderHistory(`${enabled ? "Enable" : "Disable"} ${sensor.name || "Label Sensor"}`); }
      catch { }
    }
    sensor.enabled = Boolean(enabled);
    if (typeof refreshAfterBuilderEdit === "function") refreshAfterBuilderEdit({ persist: true });
    else {
      if (typeof applyGeneratedServoProfile === "function") applyGeneratedServoProfile();
      if (typeof saveCurrentSettings === "function") saveCurrentSettings();
      if (typeof render === "function") render();
    }
    if (typeof renderWipeDownBuilder === "function") renderWipeDownBuilder();
    decorateMap();
    return true;
  }

  function noteBelongsToDisabledSensor(note, sensors = disabledSensors()) {
    const objectId = note?.[2]?.objectId || note?.metadata?.objectId || note?.objectId;
    if (objectId && sensors.some((sensor) => String(sensor.id) === String(objectId))) return true;
    const text = String(note?.[1] || note?.message || "");
    return sensors.some((sensor) => {
      const name = String(sensor?.name || "Label Sensor").trim();
      return name && text.includes(name) && /sensor|label|visibility|assigned|orientation|wipe/i.test(text);
    });
  }

  function filterDisabledSensorNotes(notes) {
    const sensors = disabledSensors();
    if (!sensors.length) return Array.isArray(notes) ? notes : [];
    return (Array.isArray(notes) ? notes : []).filter((note) => !noteBelongsToDisabledSensor(note, sensors));
  }

  function updateValidationResult(notes) {
    if (typeof state === "undefined") return;
    const summary = { bad: 0, warn: 0, info: 0, ok: 0, total: 0 };
    notes.forEach((note) => {
      const level = ["bad", "warn", "info", "ok"].includes(note?.[0]) ? note[0] : "warn";
      summary[level] += 1;
      summary.total += 1;
    });
    state.validationResult = {
      ...(state.validationResult || {}),
      valid: summary.bad === 0,
      status: summary.bad ? "FAIL" : summary.warn ? "REVIEW" : "PASS",
      summary,
      sourceCount: summary.total,
      issues: notes.map((note) => ({ level: note[0], message: note[1], metadata: note[2] || {} }))
    };
  }

  function pruneMotionIssues() {
    const sensors = disabledSensors();
    if (!sensors.length || !Array.isArray(state?.motionPlan?.issues)) return;
    state.motionPlan.issues = state.motionPlan.issues.filter((issue) => !noteBelongsToDisabledSensor(issue, sensors));
  }

  function withActiveSensors(sourceMap, callback) {
    const map = machineMap(sourceMap);
    if (!map || !Array.isArray(map.objects)) return callback();
    const original = map.objects;
    map.objects = original.filter((item) => item?.kind !== "sensor" || isEnabled(item, map));
    try { return callback(); }
    finally { map.objects = original; }
  }

  function patchOrientationDriver() {
    if (driverPatched) return true;
    const base = global.LabelerDriverRegistry?.resolve?.("profile.mapObjectOrientation")
      || global.LabelerMapObjectOrientationDriver;
    if (!base) return false;
    const patched = Object.freeze({
      ...base,
      enabled(item) {
        if (item?.kind === "sensor") {
          return isEnabled(item) && Boolean(item.orientBottle ?? item.servoAssist);
        }
        return base.enabled(item);
      }
    });
    global.LabelerMapObjectOrientationDriver = patched;
    global.LabelerDriverRegistry?.register?.("profile.mapObjectOrientation", patched, {
      dependencies: ["profile.coderOrientation"],
      source: "app/controllers/sensor-activation-controller.js",
      replace: true
    });
    driverPatched = true;
    return true;
  }

  function patchProfileGeneration() {
    if (profileWrapped || typeof global.generatedAplMapDrivenProfile !== "function") return profileWrapped;
    const base = global.generatedAplMapDrivenProfile;
    global.generatedAplMapDrivenProfile = function generatedAplMapDrivenProfileWithSensorActivation(map, ...args) {
      return withActiveSensors(map, () => base.call(this, map, ...args));
    };
    profileWrapped = true;
    return true;
  }

  function patchValidation() {
    if (validationWrapped || typeof global.validate !== "function") return validationWrapped;
    const base = global.validate;
    global.validate = function validateWithSensorActivation(...args) {
      pruneMotionIssues();
      const notes = withActiveSensors(null, () => base.apply(this, args));
      const filtered = filterDisabledSensorNotes(notes);
      updateValidationResult(filtered);
      return filtered;
    };
    validationWrapped = true;
    return true;
  }

  function patchRenderers() {
    if (!renderBuilderWrapped && typeof global.renderWipeDownBuilder === "function") {
      const base = global.renderWipeDownBuilder;
      global.renderWipeDownBuilder = function renderWipeDownBuilderWithSensorActivation(...args) {
        const result = base.apply(this, args);
        decorateBuilder();
        return result;
      };
      renderBuilderWrapped = true;
    }
    if (!renderMapWrapped && typeof global.renderMap === "function") {
      const base = global.renderMap;
      global.renderMap = function renderMapWithSensorActivation(...args) {
        const result = base.apply(this, args);
        decorateMap();
        return result;
      };
      renderMapWrapped = true;
    }
    return renderBuilderWrapped && renderMapWrapped;
  }

  function install() {
    installStyles();
    const complete = patchOrientationDriver()
      && patchProfileGeneration()
      && patchValidation()
      && patchRenderers();
    if (complete) {
      pruneMotionIssues();
      decorateBuilder();
      decorateMap();
    }
    return complete;
  }

  document.addEventListener("change", (event) => {
    const input = event.target?.closest?.("[data-sensor-enabled]");
    if (!input) return;
    event.stopImmediatePropagation();
    updateSensor(input.dataset.sensorObjectId, input.checked);
  }, true);

  const retry = () => {
    if (!install()) global.setTimeout(retry, 50);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", retry, { once: true });
  else retry();

  global.LabelerSensorActivationController = Object.freeze({
    installed: true,
    sectionForSensor,
    status,
    isEnabled,
    shouldRender,
    disabledSensorIds,
    filterDisabledSensorNotes,
    updateSensor,
    refresh() {
      pruneMotionIssues();
      decorateBuilder();
      decorateMap();
    }
  });
})(window);
