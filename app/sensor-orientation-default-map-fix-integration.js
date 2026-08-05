"use strict";

(function installSensorOrientationDefaultMapFix(global) {
  if (global.LabelerSensorOrientationDefaultMapFix?.installed) return;

  const RETRY_MS = 50;
  const DEFAULT_VERSION = 5;
  const DEFAULT_NAMES = Object.freeze({
    "map-l85-workbook-reference-3-label-apl": "Standard 45H TopModul",
    "map-45h-topmodul-3-label-apl-wipe-down-pads": "Standard 45H TopModul Wipe-Down Pads"
  });
  const DEFAULT_IDS = new Set(Object.keys(DEFAULT_NAMES));
  let installed = false;
  let refreshPending = false;

  const num = (value, fallback = NaN) => {
    if (value === null || value === undefined || value === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  const sectionLabelText = (section) => ({ neck: "Neck label", body: "Body label", back: "Back label" })[section] || "No label";
  const mapNow = () => {
    try { return typeof global.activeMachineMap === "function" ? global.activeMachineMap() : null; }
    catch { return null; }
  };
  const editMap = () => {
    try { return typeof global.editableMachineMap === "function" ? global.editableMachineMap() : mapNow(); }
    catch { return mapNow(); }
  };
  const policy = () => global.LabelerDriverRegistry?.resolve("profile.sensorTargetPolicy")
    || global.LabelerSensorTargetPolicyDriver
    || null;
  const constraintDriver = () => global.LabelerDriverRegistry?.resolve("profile.orientationConstraintPlanner")
    || global.LabelerOrientationConstraintPlannerDriver
    || null;
  const targetService = () => global.LabelerOrientationConstraintTargetService || null;

  function stationSections(map) {
    try {
      return typeof global.inferAplStationSections === "function"
        ? global.inferAplStationSections(map)
        : { ...(map?.stationSections || {}) };
    } catch {
      return { ...(map?.stationSections || {}) };
    }
  }

  function activeApplications(map) {
    try {
      const active = global.selectedLabelApplicationState?.();
      if (active && ["neck", "body", "back"].some((section) => active[section])) return active;
    } catch { }
    const sections = new Set(Object.values(stationSections(map)));
    return {
      neck: sections.has("neck"),
      body: sections.has("body"),
      back: sections.has("back")
    };
  }

  function policyOptions(item, map) {
    return {
      item,
      map,
      activeApplications: activeApplications(map),
      stationSections: stationSections(map)
    };
  }

  function normalizedTarget(item, map) {
    const driver = policy();
    if (!driver) return String(item?.orientationLabelSection || "auto");
    return driver.normalizeSelection({
      selection: item?.orientationLabelSection,
      ...policyOptions(item, map)
    });
  }

  function isProtectedMap(map) {
    return Boolean(map?.companyDefaultProgram === true || map?.protectedDefaultMap === true || DEFAULT_IDS.has(String(map?.id || "")));
  }

  function normalizeMaps() {
    if (!global.state || !Array.isArray(global.state.mapLibrary)) return false;
    let changed = false;
    global.state.mapLibrary.forEach((map) => {
      const expectedName = DEFAULT_NAMES[String(map?.id || "")];
      if (expectedName) {
        if (map.name !== expectedName) {
          map.name = expectedName;
          changed = true;
        }
        if (map.companyDefaultProgram !== true) {
          map.companyDefaultProgram = true;
          changed = true;
        }
        if (Number(map.companyDefaultProgramVersion) !== DEFAULT_VERSION) {
          map.companyDefaultProgramVersion = DEFAULT_VERSION;
          changed = true;
        }
        if (map.protectedDefaultMap !== true) {
          map.protectedDefaultMap = true;
          changed = true;
        }
      }

      if (String(map?.applicationMode || "apl") !== "apl") return;
      (map.objects || []).filter((item) => ["sensor", "coding"].includes(item?.kind)).forEach((item) => {
        const next = normalizedTarget(item, map);
        if (next && item.orientationLabelSection !== next) {
          item.orientationLabelSection = next;
          item.orientationConfigured = true;
          changed = true;
        }
      });
    });
    return changed;
  }

  function ensureConstraintStage() {
    const pipeline = global.LabelerDriverRegistry?.resolve("profile.pipeline")
      || global.LabelerProfilePipelineDriver;
    const process = global.LabelerOrientationConstraintProgramPlanner?.process;
    if (!pipeline?.registerStage || typeof process !== "function") return false;
    pipeline.registerStage({
      id: "orientation.map-objects",
      phase: "orientation",
      order: 300,
      source: "app/sensor-orientation-default-map-fix-integration.js",
      description: "Use chronological label targets and merge compatible sensor/coder windows.",
      process
    });
    global.LabelerMapObjectOrientationProcessor = process;
    global.LabelerOrientationConstraintPlannerProcessor = process;
    global.LabelerOrientationConstraintPlannerInstalled = true;
    return true;
  }

  function scheduleProfileRefresh({ render = true } = {}) {
    if (refreshPending) return;
    refreshPending = true;
    global.setTimeout(() => {
      refreshPending = false;
      ensureConstraintStage();
      try {
        if (typeof global.applyGeneratedServoProfile === "function") global.applyGeneratedServoProfile();
        if (typeof global.saveCurrentSettings === "function") global.saveCurrentSettings();
        if (render && typeof global.render === "function") global.render();
        else if (typeof global.renderValidation === "function") global.renderValidation();
      } catch (error) {
        console.error("Unable to refresh corrected sensor orientation.", error);
      }
    }, 0);
  }

  function sensorStatus(item) {
    const map = mapNow();
    const svc = targetService();
    const driver = constraintDriver();
    if (!map || !svc || !driver) return null;
    const placement = num(item?.angle, item?.start);
    const resolution = driver.resolveSection({
      item,
      rows: global.state?.program || [],
      before: placement,
      activeApplications: activeApplications(map),
      stationSections: stationSections(map),
      fallbackStationSection: (station) => global.labelSectionForStation?.(station)
    });
    if (!resolution?.section || resolution.section === "none") {
      return { passes: false, percent: 0, required: num(item?.requiredVisibilityPercent, 50), section: "none" };
    }
    const plate = svc.plateAt(placement, global.state?.program || []);
    const target = svc.targetFor(item, resolution.section, global.state?.program || [], plate, placement);
    const percent = svc.visibilityAt({ item, target }, plate);
    const required = Math.min(100, Math.max(1, num(item?.requiredVisibilityPercent, target?.required || 50)));
    return {
      passes: percent + 0.001 >= required,
      percent,
      required,
      section: resolution.section,
      source: resolution.source
    };
  }

  function sectionOptions(item, map) {
    const driver = policy();
    const selected = normalizedTarget(item, map);
    const eligible = driver?.eligibleSections(policyOptions(item, map)) || ["neck", "body", "back"];
    const options = [["auto", "Auto — last applied label"]];
    eligible.forEach((section) => options.push([section, sectionLabelText(section)]));
    options.push(["none", "No servo orientation"]);
    return options.map(([value, label]) => `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`).join("");
  }

  function stationApplicationContext(row, item, map) {
    const select = row.querySelector("[data-station-section]");
    const label = select?.closest("label");
    if (!label) return;
    const section = stationSections(map)?.[String(item.station)] || global.labelSectionForStation?.(item.station) || "none";
    if (item.kind === "sensor") {
      label.className = `${label.className || ""} sensor-station-application-context`.trim();
      label.innerHTML = `Station application<div class="sensor-station-application-value">${escapeHtml(sectionLabelText(section))}</div><small>This describes the label applied at Station ${escapeHtml(item.station)}. Choose the inspection label below.</small>`;
      return;
    }
    const text = [...label.childNodes].find((node) => node.nodeType === 3);
    if (text) text.textContent = "Station application";
  }

  function updateInlineSensorStatus(row, item) {
    const status = sensorStatus(item);
    const box = row.querySelector(".sensor-inline-status");
    if (!box || !status) return;
    box.classList.toggle("sensor-status-pass", status.passes);
    box.classList.toggle("sensor-status-fail", !status.passes);
    const strong = box.querySelector("strong");
    const span = box.querySelector("span");
    if (strong) strong.textContent = `${num(status.percent, 0).toFixed(1)}% visible`;
    if (span) span.textContent = `Required: ${num(status.required, 0).toFixed(0)}% • ${sectionLabelText(status.section)}`;
  }

  function saveOrientation(itemId, field, control) {
    const map = editMap();
    const item = map?.objects?.find((entry) => String(entry.id) === String(itemId));
    if (!item) return;
    global.recordBuilderHistory?.(`Update ${item.name || item.kind} orientation`);
    if (field === "orientationLabelSection") {
      item.orientationLabelSection = policy()?.normalizeSelection({
        selection: control.value,
        ...policyOptions(item, map)
      }) || control.value;
    } else if (field === "orientationTarget") {
      item.orientationTarget = control.value === "label-center" ? "label-center" : "code-box";
    }
    item.orientationConfigured = true;
    ensureConstraintStage();
    if (typeof global.refreshAfterBuilderEdit === "function") global.refreshAfterBuilderEdit({ persist: true });
    else scheduleProfileRefresh({ render: true });
    global.renderWipeDownBuilder?.();
  }

  function orientationControls(item, map) {
    const target = item.kind === "coding"
      ? `<label>Orientation point<select data-corrected-orientation-field="orientationTarget"><option value="code-box"${item.orientationTarget !== "label-center" ? " selected" : ""}>Code box center</option><option value="label-center"${item.orientationTarget === "label-center" ? " selected" : ""}>Label centerline</option></select></label>`
      : "";
    return `<div class="map-object-orientation-fields corrected-orientation-fields" data-orientation-object-id="${escapeHtml(item.id)}">
      <label>${item.kind === "sensor" ? "Inspection label" : "Coding label"}<select data-corrected-orientation-field="orientationLabelSection">${sectionOptions(item, map)}</select><small>Only labels applied before this object are available. Auto uses the last completed label application.</small></label>
      ${target}
    </div>`;
  }

  function decorateRows() {
    const map = mapNow();
    if (!map) return;
    document.querySelectorAll(".wipe-builder-row[data-builder-object-id]").forEach((row) => {
      const item = map.objects?.find((entry) => String(entry.id) === String(row.dataset.builderObjectId));
      if (!item) return;
      stationApplicationContext(row, item, map);
      if (!["sensor", "coding"].includes(item.kind)) return;

      row.querySelectorAll(".map-object-orientation-fields").forEach((node) => node.remove());
      const grid = row.querySelector(".builder-row-grid");
      if (!grid) return;
      grid.insertAdjacentHTML("beforeend", orientationControls(item, map));
      grid.querySelectorAll("[data-corrected-orientation-field]").forEach((control) => {
        control.addEventListener("change", () => saveOrientation(item.id, control.dataset.correctedOrientationField, control));
      });

      if (item.kind === "sensor") {
        const assist = row.querySelector('[data-builder-field="servoAssist"]');
        const note = assist?.closest("label")?.querySelector("small");
        if (note) note.textContent = "Adds the shortest correction only when current visibility is below the required percentage.";
        updateInlineSensorStatus(row, item);
      }
    });
  }

  function applyProtectedMapUi() {
    const map = mapNow();
    const protectedMap = isProtectedMap(map);
    if (global.els?.deleteMachineMap) {
      global.els.deleteMachineMap.disabled = protectedMap;
      global.els.deleteMachineMap.title = protectedMap
        ? "Company default maps cannot be deleted. Create a copy to customize or remove."
        : "Delete this map.";
    }
    if (global.els?.mapName) {
      global.els.mapName.readOnly = protectedMap;
      global.els.mapName.title = protectedMap ? "The company default map name is fixed." : "";
    }
  }

  function protectedDeleteActiveMachineMap() {
    const map = mapNow();
    if (isProtectedMap(map)) {
      global.alert?.("Company default maps cannot be deleted. Create a copy first if you need a removable version.");
      return false;
    }
    return protectedDeleteActiveMachineMap.base?.();
  }

  function installDeleteProtection() {
    const actions = global.LabelerMapBuilderDomainActions;
    const current = actions?.deleteActiveMachineMap || global.deleteActiveMachineMap;
    if (typeof current !== "function") return false;
    if (!protectedDeleteActiveMachineMap.base) protectedDeleteActiveMachineMap.base = current;
    global.deleteActiveMachineMap = protectedDeleteActiveMachineMap;
    global.LabelerMapBuilderDomainActions = Object.freeze({
      ...(actions || {}),
      deleteActiveMachineMap: protectedDeleteActiveMachineMap
    });
    return true;
  }

  function installRenderHooks() {
    if (typeof global.renderMapLibraryControls === "function" && !global.renderMapLibraryControls.sensorOrientationDefaultMapFix) {
      const baseControls = global.renderMapLibraryControls;
      const wrappedControls = function renderMapLibraryControlsWithDefaultProtection(...args) {
        const result = baseControls.apply(this, args);
        applyProtectedMapUi();
        return result;
      };
      wrappedControls.sensorOrientationDefaultMapFix = true;
      global.renderMapLibraryControls = wrappedControls;
    }

    if (typeof global.renderWipeDownBuilder === "function" && !global.renderWipeDownBuilder.sensorOrientationDefaultMapFix) {
      const baseBuilder = global.renderWipeDownBuilder;
      const wrappedBuilder = function renderWipeDownBuilderWithCorrectedTargets(...args) {
        const changedBefore = normalizeMaps();
        ensureConstraintStage();
        const result = baseBuilder.apply(this, args);
        const changedAfter = normalizeMaps();
        decorateRows();
        applyProtectedMapUi();
        if (changedBefore || changedAfter) scheduleProfileRefresh({ render: false });
        return result;
      };
      wrappedBuilder.sensorOrientationDefaultMapFix = true;
      global.renderWipeDownBuilder = wrappedBuilder;
    }
    return true;
  }

  function installCompanyDefaultsHook() {
    const service = global.LabelerCompanyDefaultsService;
    if (!service?.reconcile || service.sensorOrientationDefaultMapFix) return Boolean(service?.sensorOrientationDefaultMapFix);
    const baseReconcile = service.reconcile.bind(service);
    global.LabelerCompanyDefaultsService = Object.freeze({
      ...service,
      async reconcile(...args) {
        const result = await baseReconcile(...args);
        const changed = normalizeMaps();
        if (changed) scheduleProfileRefresh({ render: true });
        return { ...result, correctedSensorTargets: changed, companyDefaultsVersion: DEFAULT_VERSION };
      },
      sensorOrientationDefaultMapFix: true
    });
    return true;
  }

  function installStyles() {
    if (document.querySelector("#sensorOrientationDefaultMapFixStyles")) return;
    const style = document.createElement("style");
    style.id = "sensorOrientationDefaultMapFixStyles";
    style.textContent = `
      .corrected-orientation-fields{display:contents}
      .corrected-orientation-fields>label{border-left:3px solid var(--blue);padding-left:7px}
      .sensor-station-application-context{display:flex;flex-direction:column;gap:4px}
      .sensor-station-application-value{min-height:32px;display:flex;align-items:center;padding:0 10px;border:1px solid var(--line);border-radius:5px;background:var(--panel-strong);font-weight:700}
    `;
    document.head.appendChild(style);
  }

  function install() {
    if (installed) return true;
    if (!global.state
      || typeof global.renderWipeDownBuilder !== "function"
      || !policy()
      || !global.LabelerOrientationConstraintProgramPlanner?.process) return false;

    installStyles();
    ensureConstraintStage();
    installCompanyDefaultsHook();
    installDeleteProtection();
    installRenderHooks();
    global.labelSensorMapStatus = sensorStatus;
    installed = true;

    const changed = normalizeMaps();
    global.renderWipeDownBuilder();
    applyProtectedMapUi();
    if (changed) scheduleProfileRefresh({ render: true });
    else {
      ensureConstraintStage();
      try {
        global.applyGeneratedServoProfile?.();
        global.renderValidation?.();
      } catch (error) {
        console.error("Unable to apply corrected orientation stage.", error);
      }
    }

    [250, 1000].forEach((delay) => global.setTimeout(() => {
      installCompanyDefaultsHook();
      installDeleteProtection();
      installRenderHooks();
      const normalized = normalizeMaps();
      ensureConstraintStage();
      if (normalized) scheduleProfileRefresh({ render: true });
      else {
        decorateRows();
        applyProtectedMapUi();
      }
    }, delay));
    return true;
  }

  function wait() {
    if (!install()) global.setTimeout(wait, RETRY_MS);
  }

  global.LabelerSensorOrientationDefaultMapFix = Object.freeze({
    installed: true,
    DEFAULT_VERSION,
    DEFAULT_NAMES,
    isProtectedMap,
    normalizeMaps,
    sensorStatus,
    ensureConstraintStage
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait, { once: true });
  else wait();
})(typeof window !== "undefined" ? window : globalThis);
