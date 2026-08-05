"use strict";

(function installSpecificationRequiredFieldsController(global) {
  if (global.LabelerSpecificationRequiredFieldsController?.installed) return;

  const DIALOG_ID = "specificationRequiredDialog";
  const STYLE_ID = "specificationRequiredBlankOnlyStyles";
  const LABEL_NUMERIC_FIELDS = Object.freeze([
    "bodyLengthMm",
    "backLengthMm",
    "neckHeightMm",
    "neckLengthMm",
    "neckBottomCurveMm",
    "neckBottomCircumferenceMm",
    "codeBoxCenterMm"
  ]);
  const BOTTLE_NUMERIC_FIELDS = Object.freeze([
    "diameterTargetMm",
    "radiusReductionMm"
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
  let lastIssues = [];

  function runtimeState() {
    try { return typeof state !== "undefined" ? state : global.state; }
    catch { return global.state; }
  }

  function blank(value) {
    return value === null || value === undefined || String(value).trim() === "";
  }

  function validNumber(value) {
    if (blank(value)) return false;
    return Number.isFinite(Number(value));
  }

  function addIssue(issues, library, index, field, rowName) {
    issues.push({
      library,
      index,
      field,
      rowName,
      message: `${FIELD_NAMES[field] || field} is required.`
    });
  }

  function validateBottle(spec, index, issues) {
    const rowName = String(spec?.bottleType || `Bottle row ${index + 1}`);
    if (blank(spec?.bottleType)) addIssue(issues, "bottle", index, "bottleType", rowName);
    BOTTLE_NUMERIC_FIELDS.forEach((field) => {
      if (!validNumber(spec?.[field])) addIssue(issues, "bottle", index, field, rowName);
    });
  }

  function validateLabel(spec, index, issues) {
    const rowName = String(spec?.brand || `Label row ${index + 1}`);
    ["brand", "specNumber", "applicationMode"].forEach((field) => {
      if (blank(spec?.[field])) addIssue(issues, "label", index, field, rowName);
    });
    LABEL_NUMERIC_FIELDS.forEach((field) => {
      if (!validNumber(spec?.[field])) addIssue(issues, "label", index, field, rowName);
    });
  }

  function validateSpecifications(source = runtimeState()) {
    const issues = [];
    (Array.isArray(source?.bottleSpecs) ? source.bottleSpecs : [])
      .forEach((spec, index) => validateBottle(spec, index, issues));
    (Array.isArray(source?.labelSpecs) ? source.labelSpecs : [])
      .forEach((spec, index) => validateLabel(spec, index, issues));
    return issues;
  }

  global.LabelerSpecificationRequirements = Object.freeze({
    blankOnly: true,
    zeroIsComplete: true,
    validateState: validateSpecifications,
    validateBottle,
    validateLabel
  });

  if (typeof document === "undefined") {
    global.LabelerSpecificationRequiredFieldsController = Object.freeze({
      installed: true,
      validateSpecifications
    });
    return;
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #specs .spec-required-missing {
        border-color: var(--health-bad, #ed5965) !important;
        background: color-mix(in srgb, var(--health-bad-bg, rgba(215,53,67,.15)) 72%, var(--input)) !important;
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--health-bad, #ed5965) 32%, transparent) !important;
      }
      #specs tr.spec-row-has-required-fields > td:first-child {
        box-shadow: inset 4px 0 0 var(--health-bad, #ed5965) !important;
      }
      #${DIALOG_ID} {
        width: min(560px, calc(100vw - 28px));
        max-height: min(76vh, 680px);
        padding: 0;
        overflow: hidden;
        border: 1px solid var(--health-bad, #ed5965);
        border-radius: 12px;
        color: var(--ink);
        background: var(--panel);
        box-shadow: 0 24px 64px rgba(0,0,0,.48);
      }
      #${DIALOG_ID}::backdrop { background: rgba(4,8,12,.72); backdrop-filter: blur(3px); }
      #${DIALOG_ID} .spec-required-head,
      #${DIALOG_ID} .spec-required-actions { padding: 14px 16px; }
      #${DIALOG_ID} .spec-required-head { border-bottom: 1px solid var(--line); }
      #${DIALOG_ID} .spec-required-head strong { color: var(--health-bad-text, #ff8991); font-size: 16px; }
      #${DIALOG_ID} .spec-required-head p { margin-top: 5px; font-size: 12px; line-height: 1.4; }
      #${DIALOG_ID} .spec-required-list {
        display: grid;
        gap: 7px;
        max-height: 48vh;
        margin: 0;
        padding: 14px 28px 14px 36px;
        overflow: auto;
      }
      #${DIALOG_ID} .spec-required-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        border-top: 1px solid var(--line);
      }
    `;
    document.head.appendChild(style);
  }

  function escapeText(value) {
    return String(value ?? "").replace(/[<>&"]/g, "");
  }

  function fieldControl(issue) {
    const row = document.querySelector(
      `#specs tbody tr[data-spec-library="${issue.library}"][data-spec-index="${issue.index}"]`
    );
    return row?.querySelector(`[data-spec-field="${issue.field}"]`) || null;
  }

  function clearHighlights() {
    document.querySelectorAll("#specs .spec-required-missing").forEach((control) => {
      control.classList.remove("spec-required-missing");
      control.removeAttribute("aria-invalid");
      control.removeAttribute("data-required-message");
    });
    document.querySelectorAll("#specs tr.spec-row-has-required-fields")
      .forEach((row) => row.classList.remove("spec-row-has-required-fields"));
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
      <div class="spec-required-head">
        <strong id="specRequiredTitle">Complete Required Specifications</strong>
        <p id="specRequiredSummary"></p>
      </div>
      <ol class="spec-required-list"></ol>
      <div class="spec-required-actions">
        <button type="button" class="secondary-button" data-spec-required-close>Close</button>
        <button type="button" data-spec-required-review>Review first field</button>
      </div>`;
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
    global.LabelerTabsController?.activate?.("specs", tab);
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
    dialog.querySelector("#specRequiredSummary").textContent =
      `${issues.length} blank or invalid field${issues.length === 1 ? "" : "s"} must be completed before continuing. Numeric 0 is accepted.`;
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

  global.addEventListener("click", (event) => {
    const tab = event.target?.closest?.(".tab[data-tab]");
    const source = runtimeState();
    if (!tab || tab.dataset.tab === "specs" || source?.activeTab !== "specs") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!validateAndPrompt()) return;
    global.LabelerTabsController?.activate?.(tab.dataset.tab, tab);
  }, true);

  global.addEventListener("change", (event) => {
    const select = event.target?.closest?.("#brandSelect");
    if (!select) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!validateAndPrompt()) {
      select.value = String(runtimeState()?.selectedBrand || "");
      return;
    }
    const build = global.LabelerBuildInputsController
      || global.LabelerSetupEventControllers?.buildInputs;
    build?.selectBrand?.(select.value);
  }, true);

  global.addEventListener("input", (event) => {
    if (!event.target?.closest?.("#specs") || !lastIssues.length) return;
    lastIssues = validateSpecifications();
    applyHighlights(lastIssues);
  }, true);

  installStyles();

  global.LabelerSpecificationRequiredFieldsController = Object.freeze({
    installed: true,
    zeroIsComplete: true,
    validateSpecifications,
    validateAndPrompt,
    showRequiredDialog
  });
})(typeof window !== "undefined" ? window : globalThis);
