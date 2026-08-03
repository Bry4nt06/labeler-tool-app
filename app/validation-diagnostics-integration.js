"use strict";

(function installValidationDiagnosticsBoundary() {
  const RETRY_MS = 25;
  let installed = false;

  function driversReady() {
    return window.LabelerValidationIssueDriver && window.LabelerValidationResultAggregator;
  }

  function currentResult() {
    return state.validationResult || null;
  }

  function installStyles() {
    if (document.querySelector("#validationDiagnosticsStyles")) return;
    const style = document.createElement("style");
    style.id = "validationDiagnosticsStyles";
    style.textContent = `
      .validation-diagnostics-summary { grid-column:1/-1;display:grid;grid-template-columns:minmax(120px,1fr) repeat(4,minmax(48px,auto));gap:5px;align-items:center;padding:7px 8px;border:1px solid var(--line);border-radius:7px;background:var(--panel-hi); }
      .validation-diagnostics-summary strong { font-size:10px; }
      .validation-diagnostics-summary span { padding:3px 5px;border-radius:5px;background:var(--input);font-size:8px;text-align:center;white-space:nowrap; }
      .validation-diagnostics-summary[data-status="PASS"] strong { color:var(--green); }
      .validation-diagnostics-summary[data-status="REVIEW"] strong { color:#ffc56b; }
      .validation-diagnostics-summary[data-status="FAIL"] strong { color:#ff8181; }
    `;
    document.head.appendChild(style);
  }

  function renderSummary() {
    const result = currentResult();
    const host = els?.validationDetails;
    if (!result || !host) return;
    host.querySelector(".validation-diagnostics-summary")?.remove();
    const summary = document.createElement("div");
    summary.className = "validation-diagnostics-summary";
    summary.dataset.status = result.status;
    summary.innerHTML = `
      <strong>Validation ${result.status}</strong>
      <span>${result.summary.bad} faults</span>
      <span>${result.summary.warn} warnings</span>
      <span>${result.summary.ok} checks</span>
      <span>${result.duplicateCount} duplicates removed</span>`;
    host.prepend(summary);
  }

  function aggregateNotes(notes) {
    const result = window.LabelerValidationResultAggregator.aggregateNotes(notes, { source: "application-validation" });
    state.validationResult = result;
    return result;
  }

  function install() {
    if (installed) return true;
    if (!driversReady() || typeof state === "undefined" || typeof validate !== "function" || typeof renderValidation !== "function") return false;
    installed = true;
    installStyles();

    const validateBeforeDiagnostics = validate;
    const wrappedValidate = function validateWithDiagnosticsBoundary(...args) {
      const notes = validateBeforeDiagnostics.apply(this, args);
      return window.LabelerValidationResultAggregator.toNotes(aggregateNotes(notes));
    };
    wrappedValidate.validationDiagnosticsBoundary = true;
    wrappedValidate.previousValidate = validateBeforeDiagnostics;
    validate = wrappedValidate;
    window.validate = wrappedValidate;

    const renderValidationBeforeDiagnostics = renderValidation;
    const wrappedRenderValidation = function renderValidationWithDiagnosticsBoundary(...args) {
      const output = renderValidationBeforeDiagnostics.apply(this, args);
      renderSummary();
      return output;
    };
    wrappedRenderValidation.validationDiagnosticsBoundary = true;
    wrappedRenderValidation.previousRenderValidation = renderValidationBeforeDiagnostics;
    renderValidation = wrappedRenderValidation;
    window.renderValidation = wrappedRenderValidation;

    window.LabelerValidationDiagnostics = Object.freeze({
      aggregateNotes,
      currentResult,
      renderSummary
    });
    return true;
  }

  function wait() {
    if (!install()) window.setTimeout(wait, RETRY_MS);
  }

  wait();
})();
