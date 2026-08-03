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
      .validation-diagnostics-summary {
        grid-column: 1 / -1;
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 6px;
        align-items: stretch;
        inline-size: 100%;
        max-inline-size: 100%;
        min-inline-size: 0;
        padding: 8px;
        overflow-x: clip;
        overflow-y: visible;
        contain: inline-size;
        border: 1px solid var(--line);
        border-radius: 7px;
        background: var(--panel-hi);
        box-sizing: border-box;
      }

      .validation-diagnostics-summary,
      .validation-diagnostics-summary * {
        box-sizing: border-box;
        min-width: 0;
        max-width: 100%;
      }

      .validation-diagnostics-summary strong {
        display: block;
        inline-size: 100%;
        max-inline-size: 100%;
        min-inline-size: 0;
        padding: 2px 4px 5px;
        font-size: 10px;
        line-height: 1.2;
        white-space: normal;
        overflow-wrap: anywhere;
        word-break: break-word;
      }

      .validation-diagnostics-summary span {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        inline-size: 100%;
        max-inline-size: 100%;
        min-inline-size: 0;
        min-height: 32px;
        padding: 6px 8px;
        border-radius: 5px;
        background: var(--input);
        box-sizing: border-box;
        font-size: 9px;
        line-height: 1.2;
        text-align: left;
        white-space: normal;
        overflow-wrap: anywhere;
        word-break: break-word;
      }

      .validation-diagnostics-summary[data-status="PASS"] strong { color: var(--health-good-text, #6df0a5); }
      .validation-diagnostics-summary[data-status="REVIEW"] strong { color: var(--health-warn-text, #ffd86d); }
      .validation-diagnostics-summary[data-status="FAIL"] strong { color: var(--health-bad-text, #ff8991); }
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
