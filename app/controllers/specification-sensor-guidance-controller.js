"use strict";

(function installSpecificationSensorGuidanceController(global) {
  if (global.LabelerSpecificationSensorGuidanceController?.installed) return;

  const MIN_LABEL_MM = 1;
  const NUMERIC_LABEL_FIELDS = Object.freeze([
    "bodyLengthMm",
    "backLengthMm",
    "neckHeightMm",
    "neckLengthMm",
    "neckBottomCurveMm",
    "neckBottomCircumferenceMm",
    "codeBoxCenterMm"
  ]);
  const NECK_FIELDS = Object.freeze([
    "neckHeightMm",
    "neckLengthMm",
    "neckBottomCurveMm",
    "neckBottomCircumferenceMm"
  ]);
  const FIELD_NAMES = Object.freeze({
    bottleType: "Bottle Type",
    diameterTargetMm: "Diameter Target",
    radiusReductionMm: "Radius Reduction",
    brand: "Brand",
    specNumber: "Spec #",
    applicationMode: "Application",
    bodyLengthMm: "Body Length",
    backLengthMm: "Back Length",
    neckHeightMm: "Neck Height",
    neckLengthMm: "Neck Length",
    neckBottomCurveMm: "Neck Curve Bottom",
    neckBottomCircumferenceMm: "Neck Bottom Circumference",
    codeBoxCenterMm: "Code Box Center"
  });
  const STYLE_ID = "servoforgeSpecificationSensorGuidanceStyles";
  const DIALOG_ID = "specificationRequiredDialog";
  let lastIssues = [];
  let refreshQueued = false;
  let validationInstalled = false;

  function runtimeState() {
    try { return typeof state !== "undefined" ? state : global.state; }
    catch { return global.state; }
  }

  function finite(value, fallback = NaN) {
    if (value === null || value === undefined || String(value).trim() === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function addIssue(issues, library, index, field, rowName, message) {
    issues.push({ library, index, field, rowName, message });
  }

  function validateBottle(spec, index, issues) {
    const rowName = String(spec?.bottleType || `Bottle row ${index + 1}`);
    if (!String(spec?.bottleType || "").trim()) {
      addIssue(issues, "bottle", index, "bottleType", rowName, "Bottle Type is required.");
    }
    const diameter = finite(spec?.diameterTargetMm);
    if (!Number.isFinite(diameter) || diameter <= MIN_LABEL_MM) {
      addIssue(issues, "bottle", index, "diameterTargetMm", rowName, "Diameter Target must be greater than 1 mm.");
    }
    const reduction = finite(spec?.radiusReductionMm);
    if (!Number.isFinite(reduction) || reduction < 0) {
      addIssue(issues, "bottle", index, "radiusReductionMm", rowName, "Radius Reduction is required and cannot be negative.");
    }
  }

  function validateLabel(spec, index, issues) {
    const rowName = String(spec?.brand || `Label row ${index + 1}`);
    if (!String(spec?.brand || "").trim()) addIssue(issues, "label", index, "brand", rowName, "Brand is required.");
    if (!String(spec?.specNumber || "").trim()) addIssue(issues, "label", index, "specNumber", rowName, "Spec # is required.");
    if (!["apl", "cold-glue"].includes(String(spec?.applicationMode || "").toLowerCase())) {
      addIssue(issues, "label", index, "applicationMode", rowName, "Application is required.");
    }

    const values = {};
    NUMERIC_LABEL_FIELDS.forEach((field) => {
      values[field] = finite(spec?.[field]);
      if (!Number.isFinite(values[field]) || values[field] < 0) {
        addIssue(issues, "label", index, field, rowName, `${FIELD_NAMES[field]} requires a value of 0 or greater.`);
      }
    });

    ["bodyLengthMm", "backLengthMm"].forEach((field) => {
      const value = values[field];
      if (Number.isFinite(value) && value > 0 && value <= MIN_LABEL_MM) {
        addIssue(issues, "label", index, field, rowName, `${FIELD_NAMES[field]} must be 0 for no label or greater than 1 mm for an installed label.`);
      }
    });

    const neckConfigured = NECK_FIELDS.some((field) => Number.isFinite(values[field]) && values[field] > 0);
    if (neckConfigured) {
      NECK_FIELDS.forEach((field) => {
        if (!(values[field] > MIN_LABEL_MM)) {
          addIssue(issues, "label", index, field, rowName, `${FIELD_NAMES[field]} must be greater than 1 mm when a neck label is configured.`);
        }
      });
    }

    const hasBody = values.bodyLengthMm > MIN_LABEL_MM;
    const hasBack = values.backLengthMm > MIN_LABEL_MM;
    const hasNeck = neckConfigured && NECK_FIELDS.every((field) => values[field] > MIN_LABEL_MM);
    if (!hasBody && !hasBack && !hasNeck) {
      addIssue(issues, "label", index, "bodyLengthMm", rowName, "At least one Neck, Body, or Back label must have dimensions greater than 1 mm.");
    }
  }

  function validateSpecifications(source = runtimeState()) {
    const issues = [];
    (Array.isArray(source?.bottleSpecs) ? source.bottleSpecs : []).forEach((spec, index) => validateBottle(spec, index, issues));
    (Array.isArray(source?.labelSpecs) ? source.labelSpecs : []).forEach((spec, index) => validateLabel(spec, index, issues));
    return issues;
  }

  global.LabelerSpecificationRequirements = Object.freeze({
    minimumLabelMm: MIN_LABEL_MM,
    validateState: validateSpecifications,
    validateBottle,
    validateLabel
  });

  if (typeof document === "undefined") {
    global.LabelerSpecificationSensorGuidanceController = Object.freeze({ installed: true, validateSpecifications });
    return;
  }

  function escapeText(value) {
    return String(value ?? "").replace(/[<>&"]/g, "");
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #specs .spec-required-missing {
        border-color: var(--health-bad, #ed5965) !important;
        background: color-mix(in srgb, var(--health-bad-bg, rgba(215,53,67,.15)) 72%, var(--input)) !important;
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--health-bad, #ed5965) 38%, transparent) !important;
      }
      #specs tr.spec-row-has-required-fields > td:first-child { box-shadow: inset 4px 0 0 var(--health-bad, #ed5965); }
      #${DIALOG_ID} {
        width: min(560px, calc(100vw - 28px));
        max-height: min(76vh, 680px);
        padding: 0;
        overflow: hidden;
        border: 1px solid var(--health-bad, #ed5965);
        border-radius: 12px;
        color: var(--ink);
        background: var(--panel);
        box-shadow: 0 28px 80px rgba(0,0,0,.55);
      }
      #${DIALOG_ID}::backdrop { background: rgba(4,8,12,.72); backdrop-filter: blur(3px); }
      #${DIALOG_ID} .spec-required-head, #${DIALOG_ID} .spec-required-actions { padding: 14px 16px; }
      #${DIALOG_ID} .spec-required-head { border-bottom: 1px solid var(--line); }
      #${DIALOG_ID} .spec-required-head strong { color: var(--health-bad-text, #ff8991); font-size: 16px; }
      #${DIALOG_ID} .spec-required-head p { margin-top: 5px; font-size: 12px; line-height: 1.4; }
      #${DIALOG_ID} .spec-required-list { display: grid; gap: 7px; max-height: 48vh; margin: 0; padding: 14px 28px 14px 36px; overflow: auto; }
      #${DIALOG_ID} .spec-required-list li { padding-left: 2px; line-height: 1.35; }
      #${DIALOG_ID} .spec-required-actions { display: flex; justify-content: flex-end; gap: 8px; border-top: 1px solid var(--line); }
      .panel.validation .notice.info, .panel.validation .notice[data-guidance="sensor"] {
        border-left-color: var(--health-info, #59aee9) !important;
        background: var(--health-info-bg, rgba(58,139,201,.13)) !important;
        color: var(--ink) !important;
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--health-info, #59aee9) 18%, transparent), 0 0 6px var(--health-info-glow, rgba(89,174,233,.07)) !important;
      }
    `;
    document.head.appendChild(style);
  }

  function fieldControl(issue) {
    const row = document.querySelector(`#specs tbody tr[data-spec-library="${issue.library}"][data-spec-index="${issue.index}"]`);
    return row?.querySelector(`[data-spec-field="${issue.field}"]`) || null;
  }

  function clearHighlights() {
    document.querySelectorAll("#specs .spec-required-missing").forEach((control) => {
      control.classList.remove("spec-required-missing");
      control.removeAttribute("aria-invalid");
      control.removeAttribute("data-required-message");
    });
    document.querySelectorAll("#specs tr.spec-row-has-required-fields").forEach((row) => row.classList.remove("spec-row-has-required-fields"));
  }

  function applyHighlights(issues) {
    clearHighlights();
    issues.forEach((issue) => {
      const control = fieldControl(issue);
      if (!control) return;
      control.classList.add("spec-required-missing");
      control.setAttribute("aria-invalid", "true");
      control.dataset.requiredMessage = issue.message;
      control.closest("tr")?.classList.add("spec-row-has-required-fields");
    });
  }

  function ensureDialog() {
    let dialog = document.getElementById(DIALOG_ID);
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.id = DIALOG_ID;
    dialog.setAttribute("aria-labelledby", "specRequiredTitle");
    dialog.innerHTML = `
      <div class="spec-required-head"><strong id="specRequiredTitle">Complete Required Specifications</strong><p id="specRequiredSummary"></p></div>
      <ol class="spec-required-list"></ol>
      <div class="spec-required-actions"><button type="button" class="secondary-button" data-spec-required-close>Close</button><button type="button" data-spec-required-review>Review first field</button></div>`;
    document.body.appendChild(dialog);
    dialog.addEventListener("click", (event) => {
      if (event.target.closest?.("[data-spec-required-close]")) dialog.close?.();
      if (event.target.closest?.("[data-spec-required-review]")) {
        dialog.close?.();
        focusFirstIssue();
      }
    });
    return dialog;
  }

  function activateSpecsTab() {
    const tab = document.querySelector('.tab[data-tab="specs"]');
    if (global.LabelerTabsController?.activate) global.LabelerTabsController.activate("specs", tab);
  }

  function focusFirstIssue() {
    const control = fieldControl(lastIssues[0]);
    document.querySelector("#specs")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    control?.scrollIntoView?.({ behavior: "smooth", block: "center", inline: "center" });
    global.setTimeout(() => control?.focus?.({ preventScroll: true }), 220);
  }

  function showRequiredDialog(issues = validateSpecifications()) {
    lastIssues = issues;
    applyHighlights(issues);
    if (!issues.length) return false;
    activateSpecsTab();
    const dialog = ensureDialog();
    dialog.querySelector("#specRequiredSummary").textContent = `${issues.length} required field${issues.length === 1 ? "" : "s"} need attention before continuing.`;
    const unique = new Map();
    issues.forEach((issue) => unique.set(`${issue.rowName}|${issue.message}`, issue));
    dialog.querySelector(".spec-required-list").innerHTML = [...unique.values()]
      .map((issue) => `<li><strong>${escapeText(issue.rowName)}</strong>: ${escapeText(issue.message)}</li>`)
      .join("");
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else dialog.setAttribute("open", "");
    return true;
  }

  function validateAndPrompt() {
    const issues = validateSpecifications();
    if (!issues.length) {
      lastIssues = [];
      clearHighlights();
      return true;
    }
    showRequiredDialog(issues);
    return false;
  }

  function scheduleHighlightRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    global.requestAnimationFrame(() => {
      refreshQueued = false;
      if (!lastIssues.length) return;
      lastIssues = validateSpecifications();
      applyHighlights(lastIssues);
    });
  }

  function activeMap() {
    try { return typeof activeMachineMap === "function" ? activeMachineMap() : null; }
    catch { return null; }
  }

  function stationSections(machineMap) {
    try { return typeof inferAplStationSections === "function" ? inferAplStationSections(machineMap) : { ...(machineMap?.stationSections || {}) }; }
    catch { return { ...(machineMap?.stationSections || {}) }; }
  }

  function plannedSensorReference(sensor) {
    const source = runtimeState();
    const objectId = String(sensor?.id || "");
    const program = Array.isArray(source?.program) ? source.program : [];
    const hold = program.find((row) =>
      String(row?.sensorId || "") === objectId
      && Number(row?.cmd) === 3
      && Number.isFinite(finite(row?.plannedLabelVisibilityPercent))
      && Number.isFinite(finite(row?.plateAngle))
    );
    if (hold) return {
      visibilityPercent: finite(hold.plannedLabelVisibilityPercent, 0),
      targetPlateAngle: finite(hold.plateAngle),
      source: "planned servo-assist orientation"
    };
    const plan = (Array.isArray(source?.motionPlan?.mapObjectOrientationPlans)
      ? source.motionPlan.mapObjectOrientationPlans
      : []).find((entry) =>
        String(entry?.objectId || "") === objectId
        && Number.isFinite(finite(entry?.plannedVisibilityPercent))
        && Number.isFinite(finite(entry?.targetPlateAngle))
      );
    return plan ? {
      visibilityPercent: finite(plan.plannedVisibilityPercent, 0),
      targetPlateAngle: finite(plan.targetPlateAngle),
      source: "planned servo-assist orientation"
    } : null;
  }

  function sensorApplicationTarget(section) {
    const source = runtimeState();
    const program = Array.isArray(source?.program) ? source.program : [];
    const sectionName = typeof sectionLabel === "function" ? sectionLabel(section) : section;
    const exact = program.find((row) =>
      String(row?.section || "").toLowerCase() === section
      && row?.applicationReference
      && Number.isFinite(finite(row?.plateAngle))
    );
    if (exact) return finite(exact.plateAngle, 0);
    const pattern = new RegExp(`Hold(?:\\s+for)?\\s+${sectionName}\\s+Application`, "i");
    const action = program.find((row) => pattern.test(String(row?.action || "")) && Number.isFinite(finite(row?.plateAngle)));
    if (action) return finite(action.plateAngle, 0);
    try {
      const seed = typeof generatedAplSeedProfile === "function" ? generatedAplSeedProfile() : [];
      return finite(seed?.[section === "neck" ? 1 : section === "body" ? 11 : 21]?.plateAngle, 0);
    } catch { return 0; }
  }

  function correctedSensorNotes() {
    const source = runtimeState();
    const machineMap = activeMap();
    if (!machineMap || machineMap.applicationMode !== "apl") return [];
    const applications = typeof selectedLabelApplicationState === "function"
      ? selectedLabelApplicationState()
      : { neck: true, body: true, back: true };
    const sections = stationSections(machineMap);
    const notes = [];
    (machineMap.objects || []).filter((item) => item?.kind === "sensor").forEach((sensor) => {
      const station = Number(sensor.station);
      if (typeof isStationEnabled === "function" && !isStationEnabled(machineMap, station)) return;
      const section = sections[String(station)] || (typeof labelSectionForStation === "function" ? labelSectionForStation(station) : null);
      const placement = finite(sensor.angle, finite(sensor.start, 0));
      const meta = { objectId: sensor.id, guidanceSource: "sensor-plan" };
      if (!section || section === "none" || !applications[section]) {
        notes.push(["bad", `${sensor.name || "Label Sensor"} at Station ${station} is assigned to a label that is not active.`, meta]);
        return;
      }
      const wipe = typeof sectionWipePlan === "function" ? sectionWipePlan(section) : null;
      const labelWidth = Math.min(360, Math.max(3, finite(wipe?.labelDeg, 0)));
      const target = sensorApplicationTarget(section);
      const labelCenter = typeof labelSensorInspectionCenter === "function"
        ? labelSensorInspectionCenter(section, target, labelWidth)
        : target;
      const planned = sensor.servoAssist ? plannedSensorReference(sensor) : null;
      const bottleAngle = Number.isFinite(finite(planned?.targetPlateAngle))
        ? finite(planned.targetPlateAngle, target)
        : typeof plateAngleAt === "function"
          ? plateAngleAt(placement, source.program)
          : target;
      const required = Math.min(100, Math.max(1, finite(sensor.requiredVisibilityPercent, 50)));
      const visibility = planned
        ? { percent: finite(planned.visibilityPercent, 0) }
        : typeof labelSensorVisibility === "function"
          ? labelSensorVisibility(labelCenter, bottleAngle, labelWidth, 180)
          : { percent: 0 };
      const percent = finite(visibility.percent, 0);
      const visible = percent + 0.001 >= required;
      const labelName = typeof sectionLabel === "function" ? sectionLabel(section).toLowerCase() : section;
      const value = typeof fmt === "function" ? fmt(percent, 1) : percent.toFixed(1);
      const requiredValue = typeof fmt === "function" ? fmt(required, 0) : required.toFixed(0);
      const placementValue = typeof fmt === "function" ? fmt(placement, 1) : placement.toFixed(1);
      const reference = planned?.source || "generated application reference";
      notes.push([visible ? "ok" : "warn", visible
        ? `${sensor.name || "Label Sensor"} at Station ${station} can view ${value}% of the ${labelName} label through its 3 deg table window (${requiredValue}% required). The calculation uses the ${reference}.`
        : `${sensor.name || "Label Sensor"} at Station ${station} can view ${value}% of the ${labelName} label at ${placementValue} deg table; at least ${requiredValue}% is required. The calculation uses the ${reference}.${sensor.servoAssist ? " Servo assist is enabled; confirm there is open table travel before the sensor for the corrective turn." : " Enable Orient bottle for sensor or move the sensor to a position where the label centerline faces it."}`,
      meta]);
    });
    return notes;
  }

  function sensorObjectById(objectId) {
    return (activeMap()?.objects || []).find((item) => String(item?.id || "") === String(objectId || "") && item?.kind === "sensor");
  }

  function normalizeSensorMotionGuidance() {
    const source = runtimeState();
    const issues = source?.motionPlan?.issues;
    if (!Array.isArray(issues)) return;
    issues.forEach((issue) => {
      const message = String(issue?.message || "");
      const sensor = sensorObjectById(issue?.objectId);
      if (!sensor || (issue?.code !== "map-object-overlaps-physical-wipe" && !/Sensor begins while .*still active/i.test(message))) return;
      const action = message.match(/while\s+"([^"]+)"/i)?.[1] || "the current wipe";
      issue.level = "ok";
      issue.guidance = true;
      issue.message = `${sensor.name || "Label Sensor"} is positioned during "${action}". Servo assist waits for the wipe to reach its CMD 3 hold before applying a correction. Move the sensor later only when additional correction travel is needed.`;
    });
  }

  function transformValidationNotes(notes) {
    const machineMap = activeMap();
    const sensorIds = new Set((machineMap?.objects || []).filter((item) => item?.kind === "sensor").map((item) => String(item.id)));
    const retained = (Array.isArray(notes) ? notes : []).filter((note) => {
      const objectId = note?.[2]?.objectId;
      return !objectId || !sensorIds.has(String(objectId));
    }).map((note) => {
      const message = String(note?.[1] || "");
      if (/Sensor .*is positioned during|Sensor begins while .*still active/i.test(message)) {
        return ["info", message, { ...(note?.[2] || {}), guidance: "sensor" }];
      }
      return note;
    });
    return [...retained, ...correctedSensorNotes()];
  }

  function updateValidationSummary(notes) {
    const source = runtimeState();
    const summary = { bad: 0, warn: 0, info: 0, ok: 0, total: 0 };
    notes.forEach((note) => {
      const level = ["bad", "warn", "info", "ok"].includes(note?.[0]) ? note[0] : "warn";
      summary[level] += 1;
      summary.total += 1;
    });
    const previous = source?.validationResult || {};
    source.validationResult = {
      ...previous,
      valid: summary.bad === 0,
      status: summary.bad ? "FAIL" : summary.warn ? "REVIEW" : "PASS",
      summary,
      sourceCount: summary.total,
      issues: notes.map((note) => ({ level: note[0], message: note[1], metadata: note[2] || {} }))
    };
  }

  function decorateGuidanceNotices() {
    document.querySelectorAll("#validationList .notice").forEach((notice) => {
      if (!/Sensor .*is positioned during|Sensor begins while .*still active/i.test(notice.textContent || "")) return;
      notice.classList.remove("bad", "warn");
      notice.classList.add("info");
      notice.dataset.health = "info";
      notice.dataset.guidance = "sensor";
    });
  }

  function installValidationPatch() {
    if (validationInstalled || typeof validate !== "function" || typeof renderValidation !== "function") return false;
    validationInstalled = true;
    const baseValidate = validate;
    validate = function validateWithSensorPlanGuidance(...args) {
      normalizeSensorMotionGuidance();
      const notes = transformValidationNotes(baseValidate.apply(this, args));
      updateValidationSummary(notes);
      return notes;
    };
    window.validate = validate;

    const baseRenderValidation = renderValidation;
    renderValidation = function renderValidationWithSensorGuidance(...args) {
      const result = baseRenderValidation.apply(this, args);
      decorateGuidanceNotices();
      return result;
    };
    window.renderValidation = renderValidation;
    try { renderValidation(); } catch { }
    return true;
  }

  function waitForValidationPatch() {
    if (installValidationPatch()) return;
    global.setTimeout(waitForValidationPatch, 75);
  }

  document.addEventListener("click", (event) => {
    const tab = event.target.closest?.(".tab[data-tab]");
    const source = runtimeState();
    if (!tab || tab.dataset.tab === "specs" || source?.activeTab !== "specs") return;
    if (validateAndPrompt()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  document.addEventListener("change", (event) => {
    const brandSelect = event.target.closest?.("#brandSelect");
    if (!brandSelect) return;
    const issues = validateSpecifications();
    if (!issues.length) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    brandSelect.value = String(runtimeState()?.selectedBrand || "");
    showRequiredDialog(issues);
  }, true);

  document.addEventListener("input", (event) => {
    if (event.target.closest?.("#specs")) scheduleHighlightRefresh();
  }, true);

  const observer = new MutationObserver((records) => {
    if (!lastIssues.length) return;
    if (records.some((record) => record.target.closest?.("#specs") || record.target.id === "specs")) scheduleHighlightRefresh();
  });
  observer.observe(document.documentElement, { subtree: true, childList: true });

  installStyles();
  if (global.ServoForgeFeatureIntegrationsReady?.then) {
    global.ServoForgeFeatureIntegrationsReady.then(waitForValidationPatch, waitForValidationPatch);
  } else waitForValidationPatch();

  global.LabelerSpecificationSensorGuidanceController = Object.freeze({
    installed: true,
    validateSpecifications,
    validateAndPrompt,
    showRequiredDialog,
    plannedSensorReference,
    correctedSensorNotes,
    normalizeSensorMotionGuidance,
    installValidationPatch
  });
})(typeof window !== "undefined" ? window : globalThis);
