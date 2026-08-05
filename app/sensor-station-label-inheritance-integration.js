"use strict";

(function installSensorStationLabelInheritance(global) {
  if (global.LabelerSensorStationLabelInheritance?.CATALOG_VERSION >= 11) return;

  const RETRY_MS = 50;
  const CATALOG_VERSION = 11;
  const DEFAULT_MAP_IDS = new Set([
    "map-l85-workbook-reference-3-label-apl",
    "map-45h-topmodul-3-label-apl-wipe-down-pads"
  ]);
  const SVG_NS = "http://www.w3.org/2000/svg";
  let installed = false;
  let observer = null;
  let enforceTimer = null;
  let regenerationTimer = null;

  const driver = () => global.LabelerDriverRegistry?.resolve("profile.sensorStationLabel")
    || global.LabelerSensorStationLabelDriver
    || null;

  function activeMap() {
    try { return typeof global.activeMachineMap === "function" ? global.activeMachineMap() : null; }
    catch { return null; }
  }

  function editableMap() {
    try { return typeof global.editableMachineMap === "function" ? global.editableMachineMap() : activeMap(); }
    catch { return activeMap(); }
  }

  function normalizeDefaultMetadata(map) {
    if (!map || !DEFAULT_MAP_IDS.has(String(map.id || ""))) return false;
    let changed = false;
    const assign = (key, value) => {
      if (map[key] === value) return;
      map[key] = value;
      changed = true;
    };
    assign("companyDefaultProgram", true);
    assign("companyDefaultProgramVersion", CATALOG_VERSION);
    assign("protectedDefaultMap", true);
    if (String(map.id) === "map-45h-topmodul-3-label-apl-wipe-down-pads") {
      assign("defaultCatalogVersion", CATALOG_VERSION);
    }
    return changed;
  }

  function normalizeMap(map) {
    const policy = driver();
    if (!policy || !map) return false;
    const sensorsChanged = policy.normalizeMap(map, { rename: true });
    const metadataChanged = normalizeDefaultMetadata(map);
    return sensorsChanged || metadataChanged;
  }

  function normalizeRuntime() {
    if (!global.state || !driver()) return false;
    let changed = false;
    (Array.isArray(global.state.mapLibrary) ? global.state.mapLibrary : []).forEach((map) => {
      if (normalizeMap(map)) changed = true;
    });
    if (Array.isArray(global.state.aplMapObjects)) {
      global.state.aplMapObjects.forEach((item) => {
        if (driver().normalizeSensor(item, { rename: true })) changed = true;
      });
    }
    const current = activeMap();
    if (current && normalizeMap(current)) changed = true;
    return changed;
  }

  function sensorForRow(row, map) {
    if (!row || !map || !Array.isArray(map.objects)) return null;
    return map.objects.find((item) => String(item?.id) === String(row.dataset.builderObjectId) && item?.kind === "sensor") || null;
  }

  function inheritedLabelField(item) {
    const policy = driver();
    const section = policy.sectionForStation(item.station);
    const field = document.createElement("div");
    field.className = "sensor-inherited-label-field sensor-grid-field sensor-field-label";
    field.innerHTML = `<span class="sensor-field-caption">Inspection label</span><strong class="sensor-inherited-label-value">${policy.sectionLabel(section)} label</strong><small>${policy.stationPairLabel(section)}</small>`;
    return field;
  }

  function aimField(item) {
    const field = document.createElement("label");
    field.className = "sensor-grid-field sensor-field-aim";
    field.innerHTML = `Sensor aim (deg)<input data-builder-field="sensorAimOffsetDeg" type="number" min="-90" max="90" step="0.5" value="${driver().sensorAimOffset(item.sensorAimOffsetDeg)}"><small>−90° to +90°</small>`;
    return field;
  }

  function removeLegacySensorControls(row) {
    row.querySelectorAll(".map-object-orientation-fields").forEach((node) => node.remove());

    const legacyAssist = row.querySelector('[data-builder-field="servoAssist"]');
    legacyAssist?.closest("label")?.remove();

    row.querySelectorAll("label").forEach((label) => {
      if (label.classList.contains("sensor-activation-control")) return;
      const text = String(label.textContent || "").replace(/\s+/g, " ").trim();
      const hasLabelSelector = label.querySelector(
        "[data-station-section], [data-object-orientation-field='orientationLabelSection'], [data-corrected-orientation-field='orientationLabelSection']"
      );
      if (hasLabelSelector || /^(?:Label use|Target label|Inspection label|Station application|Coding label)\b/i.test(text)) {
        label.remove();
      }
    });
  }

  function labelForControl(row, selector, className) {
    const label = row.querySelector(selector)?.closest("label");
    if (label && className) label.classList.add("sensor-grid-field", className);
    return label;
  }

  function activationField(row, item) {
    let control = row.querySelector(".sensor-activation-control");
    if (!control) {
      control = document.createElement("label");
      control.className = "sensor-activation-control";
      control.innerHTML = `<span><input type="checkbox" data-sensor-enabled> Sensor enabled</span><small data-sensor-enabled-note></small>`;
    }
    control.classList.add("sensor-grid-field", "sensor-field-enabled");
    const checkbox = control.querySelector("[data-sensor-enabled]");
    const note = control.querySelector("[data-sensor-enabled-note]");
    if (checkbox) {
      checkbox.checked = item.enabled !== false;
      checkbox.dataset.sensorObjectId = String(item.id);
    }
    if (note) note.textContent = item.enabled === false ? "Disabled" : "Active";
    return control;
  }

  function updateInheritedField(row, item) {
    const grid = row.querySelector(".builder-row-grid");
    if (!grid) return null;
    const section = driver().sectionForStation(item.station);
    const expectedValue = `${driver().sectionLabel(section)} label`;
    const expectedHelp = driver().stationPairLabel(section);
    let field = grid.querySelector(".sensor-inherited-label-field");
    if (!field) {
      field = inheritedLabelField(item);
      grid.appendChild(field);
      return field;
    }
    const value = field.querySelector(".sensor-inherited-label-value");
    const help = field.querySelector("small");
    if (value && value.textContent !== expectedValue) value.textContent = expectedValue;
    if (help && help.textContent !== expectedHelp) help.textContent = expectedHelp;
    return field;
  }

  function updateAimField(row, item) {
    const grid = row.querySelector(".builder-row-grid");
    if (!grid) return null;
    let field = grid.querySelector(".sensor-field-aim");
    if (!field) {
      field = aimField(item);
      grid.appendChild(field);
      return field;
    }
    const input = field.querySelector('[data-builder-field="sensorAimOffsetDeg"]');
    const expected = driver().sensorAimOffset(item.sensorAimOffsetDeg);
    if (input && Number(input.value) !== expected && document.activeElement !== input) input.value = expected;
    return field;
  }

  function compactSensorGrid(row, item) {
    const grid = row.querySelector(".builder-row-grid");
    if (!grid) return;
    row.classList.add("sensor-station-inherited-row");
    removeLegacySensorControls(row);

    const enabled = activationField(row, item);
    const station = labelForControl(row, '[data-builder-field="station"]', "sensor-field-station");
    const placement = labelForControl(row, '[data-builder-field="angle"]', "sensor-field-placement");
    const aim = updateAimField(row, item);
    const inherited = updateInheritedField(row, item);
    const required = labelForControl(row, '[data-builder-field="requiredVisibilityPercent"]', "sensor-field-required");
    const status = row.querySelector(".sensor-inline-status");

    if (required) {
      const small = required.querySelector("small");
      if (small) small.textContent = "1% edge • 100% centered";
    }
    if (status) status.classList.add("sensor-grid-field", "sensor-field-status");

    [enabled, station, placement, aim, inherited, required, status]
      .filter(Boolean)
      .forEach((node) => grid.appendChild(node));
  }

  function decorateSensorRows() {
    const map = activeMap();
    const policy = driver();
    if (!map || !policy) return false;
    let changed = false;
    document.querySelectorAll(".wipe-builder-row[data-builder-object-id]").forEach((row) => {
      const item = sensorForRow(row, map);
      if (!item) return;
      if (policy.normalizeSensor(item, { rename: true })) changed = true;
      compactSensorGrid(row, item);

      const status = row.querySelector(".sensor-inline-status span");
      const section = policy.sectionForStation(item.station);
      const baseStatus = status ? String(status.textContent || "").replace(/\s*•\s*(?:Neck|Body|Back) label$/i, "") : "";
      const expectedStatus = `${baseStatus} • ${policy.sectionLabel(section)} label`;
      if (status && status.textContent !== expectedStatus) status.textContent = expectedStatus;

      const title = row.querySelector("summary strong");
      const nameInput = row.querySelector('[data-builder-field="name"]');
      if (title && title.textContent !== item.name) title.textContent = item.name;
      if (nameInput && nameInput.value !== item.name) nameInput.value = item.name;
      row.dataset.sensorAimOffsetDeg = String(policy.sensorAimOffset(item.sensorAimOffsetDeg));
    });
    return changed;
  }

  function decorateSensorMap() {
    const map = activeMap();
    const policy = driver();
    if (!map || !policy || !global.state || typeof global.angleToXY !== "function" || typeof global.angleToSvgRotation !== "function") return;

    (map.objects || []).filter((item) => item?.kind === "sensor").forEach((item) => {
      const objectLayer = document.querySelector(`#mapSvg [data-map-object-id="${CSS.escape(String(item.id))}"]`);
      if (!objectLayer) return;
      objectLayer.querySelectorAll("[data-sensor-aim-indicator]").forEach((node) => node.remove());

      const placement = Number(item.angle ?? item.start);
      if (!Number.isFinite(placement)) return;
      const radius = Number(global.state.radius || 0) + Number(global.state.depths?.opRoller || 0) + 7;
      const xy = global.angleToXY(placement, radius);
      const directionSign = global.state.direction === "cw" ? -1 : 1;
      const aim = policy.sensorAimOffset(item.sensorAimOffsetDeg);
      const rotation = global.angleToSvgRotation(placement) + 180 + directionSign * aim;

      const group = document.createElementNS(SVG_NS, "g");
      group.setAttribute("transform", `translate(${xy.x} ${xy.y}) rotate(${rotation})`);
      group.setAttribute("data-sensor-aim-indicator", String(item.id));
      group.setAttribute("pointer-events", "none");

      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", "0");
      line.setAttribute("y1", "0");
      line.setAttribute("x2", "28");
      line.setAttribute("y2", "0");
      line.setAttribute("stroke", "#58aeca");
      line.setAttribute("stroke-width", "2.5");
      line.setAttribute("stroke-linecap", "round");
      group.appendChild(line);

      const arrow = document.createElementNS(SVG_NS, "path");
      arrow.setAttribute("d", "M 28 0 L 21 -4 L 21 4 Z");
      arrow.setAttribute("fill", "#58aeca");
      group.appendChild(arrow);

      const title = document.createElementNS(SVG_NS, "title");
      title.textContent = `${item.name || "Sensor"} aim: ${aim}°`;
      group.appendChild(title);
      objectLayer.appendChild(group);
    });
  }

  function scheduleRegeneration() {
    if (regenerationTimer) return;
    regenerationTimer = global.setTimeout(() => {
      regenerationTimer = null;
      try {
        global.saveCurrentSettings?.();
        if (global.state?.selectedBrand) global.applyGeneratedServoProfile?.();
        global.renderValidation?.();
        decorateSensorMap();
      } catch (error) {
        console.error("Unable to apply station-pair sensor geometry.", error);
      }
    }, 0);
  }

  function enforceSensorPolicy() {
    enforceTimer = null;
    const changed = normalizeRuntime();
    const rowChanged = decorateSensorRows();
    decorateSensorMap();
    if (changed || rowChanged) scheduleRegeneration();
    return changed || rowChanged;
  }

  function enforceSoon() {
    if (enforceTimer) return;
    enforceTimer = global.setTimeout(enforceSensorPolicy, 0);
  }

  function installObserver() {
    if (observer || typeof MutationObserver !== "function" || !document.documentElement) return;
    observer = new MutationObserver((mutations) => {
      const meaningfulAddition = mutations.some((mutation) => {
        if (mutation.type !== "childList" || !mutation.addedNodes.length) return false;
        return [...mutation.addedNodes].some((node) => !(
          node instanceof Element
          && node.matches?.("[data-sensor-aim-indicator]")
        ));
      });
      if (meaningfulAddition) enforceSoon();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function wrapFunction(name, marker, after) {
    const base = global[name];
    if (typeof base !== "function") return false;
    if (base[marker]) return true;
    const wrapped = function sensorStationLabelWrappedFunction(...args) {
      const result = base.apply(this, args);
      after(args, result);
      enforceSoon();
      return result;
    };
    wrapped[marker] = true;
    wrapped.previousFunction = base;
    global[name] = wrapped;
    return true;
  }

  function installHooks() {
    wrapFunction("loadSavedSettings", "sensorStationLabelInheritanceV11", () => normalizeRuntime());
    wrapFunction("loadMachineMapIntoRuntime", "sensorStationLabelInheritanceV11", ([map]) => normalizeMap(map));
    wrapFunction("refreshAfterBuilderEdit", "sensorStationLabelInheritanceV11", () => normalizeMap(editableMap()));
    wrapFunction("renderWipeDownBuilder", "sensorStationLabelInheritanceV11", () => {
      normalizeMap(editableMap());
      decorateSensorRows();
    });
    wrapFunction("renderMap", "sensorStationLabelInheritanceV11", () => decorateSensorMap());

    const service = global.LabelerCompanyDefaultsService;
    if (service?.reconcile && !service.sensorStationLabelInheritanceV11) {
      const baseReconcile = service.reconcile.bind(service);
      global.LabelerCompanyDefaultsService = Object.freeze({
        ...service,
        async reconcile(...args) {
          const result = await baseReconcile(...args);
          const changed = normalizeRuntime();
          if (changed) global.saveCurrentSettings?.();
          enforceSoon();
          return {
            ...result,
            changed: Boolean(result?.changed || changed),
            sensorStationLabelsNormalized: changed,
            companyDefaultsVersion: Math.max(Number(result?.version || 0), CATALOG_VERSION)
          };
        },
        sensorStationLabelInheritanceV11: true
      });
    }
  }

  function installStyles() {
    document.querySelector("#sensorStationLabelInheritanceStyles")?.remove();
    const style = document.createElement("style");
    style.id = "sensorStationLabelInheritanceStyles";
    style.textContent = `
      .sensor-station-inherited-row .builder-object-editor{padding:7px!important}
      .sensor-station-inherited-row .builder-row-title{margin-bottom:6px!important}
      .sensor-station-inherited-row .builder-row-title input{height:34px!important;min-height:34px!important}
      .sensor-station-inherited-row .builder-row-grid{
        display:grid!important;
        grid-template-columns:repeat(4,minmax(0,1fr))!important;
        gap:6px!important;
        align-items:stretch!important;
      }
      .sensor-station-inherited-row .builder-row-grid>.sensor-grid-field{
        grid-column:auto!important;
        min-width:0!important;
        min-height:52px!important;
        height:auto!important;
        margin:0!important;
        padding:5px 7px!important;
        border:1px solid var(--line)!important;
        border-radius:6px!important;
        background:color-mix(in srgb,var(--panel-hi) 78%,var(--input))!important;
      }
      .sensor-station-inherited-row label.sensor-grid-field{display:flex!important;flex-direction:column!important;justify-content:center!important;gap:3px!important}
      .sensor-station-inherited-row label.sensor-grid-field input:not([type="checkbox"]),
      .sensor-station-inherited-row label.sensor-grid-field select{height:29px!important;min-height:29px!important;padding-block:3px!important}
      .sensor-station-inherited-row .sensor-activation-control{
        display:flex!important;
        flex-direction:column!important;
        align-items:flex-start!important;
        justify-content:center!important;
        gap:3px!important;
        width:auto!important;
        max-width:none!important;
        font-size:11px!important;
      }
      .sensor-station-inherited-row .sensor-activation-control>span{font-size:11px!important}
      .sensor-station-inherited-row .sensor-activation-control small,
      .sensor-station-inherited-row .sensor-grid-field small{font-size:8.5px!important;line-height:1.1!important;color:var(--muted)!important}
      .sensor-inherited-label-field{display:flex!important;flex-direction:column!important;justify-content:center!important;gap:2px!important}
      .sensor-field-caption{font-size:9px!important;font-weight:700!important;color:var(--muted)!important}
      .sensor-inherited-label-value{font-size:13px!important;line-height:1.05!important;color:var(--ink)!important}
      .sensor-station-inherited-row .sensor-field-status{
        grid-column:span 2!important;
        display:flex!important;
        flex-direction:column!important;
        justify-content:center!important;
        align-items:flex-start!important;
        gap:2px!important;
      }
      .sensor-station-inherited-row .sensor-inline-status strong{font-size:13px!important;line-height:1.05!important}
      .sensor-station-inherited-row .sensor-inline-status span{font-size:9px!important;line-height:1.1!important}
      .sensor-station-inherited-row .builder-object-actions{margin-top:6px!important;gap:6px!important}
      .sensor-station-inherited-row .builder-object-actions button{padding:5px 8px!important;min-height:28px!important}
      @media (max-width:1100px){
        .sensor-station-inherited-row .builder-row-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
        .sensor-station-inherited-row .sensor-field-status{grid-column:span 2!important}
      }
      @media (max-width:600px){
        .sensor-station-inherited-row .builder-row-grid{grid-template-columns:1fr!important}
        .sensor-station-inherited-row .sensor-field-status{grid-column:auto!important}
      }
    `;
    document.head.appendChild(style);
  }

  function install() {
    installObserver();
    installStyles();
    installHooks();
    if (installed) {
      enforceSoon();
      return true;
    }
    if (!driver() || !global.state) return false;

    installed = true;
    global.LabelerSensorStationLabelInheritance = Object.freeze({
      installed: true,
      CATALOG_VERSION,
      normalizeMap,
      normalizeRuntime,
      decorateSensorRows,
      decorateSensorMap,
      enforceSensorPolicy
    });

    enforceSensorPolicy();
    [50, 250, 750, 1500].forEach((delay) => global.setTimeout(() => {
      installHooks();
      enforceSensorPolicy();
    }, delay));
    return true;
  }

  function wait() {
    if (!install()) global.setTimeout(wait, RETRY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait, { once: true });
  else wait();
})(typeof window !== "undefined" ? window : globalThis);
