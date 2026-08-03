"use strict";

(function installValidationPanelUiController(global) {
  if (global.LabelerValidationPanelUiController?.installed) return;

  const STYLE_ID = "servoforgeValidationPanelUiStyles";

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return false;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .panel.validation {
        width: 100%;
        max-width: 100%;
        min-width: 0;
        overflow-x: clip !important;
        overflow-y: auto !important;
        scrollbar-gutter: stable;
        contain: inline-size;
      }

      .panel.validation,
      .panel.validation *,
      .panel.validation *::before,
      .panel.validation *::after {
        box-sizing: border-box;
        min-width: 0;
      }

      .panel.validation > *,
      .validation-details,
      #validationList {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0;
        overflow-x: clip;
      }

      .validation-details,
      #validationList {
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) !important;
        align-items: stretch;
      }

      .validation-details > *,
      #validationList > *,
      .panel.validation .pipeline-validation-summary,
      .panel.validation .program-health-strip,
      .panel.validation .diagnostics-health-strip,
      .panel.validation .optimizer-health-strip,
      .panel.validation .release-readiness-summary,
      .panel.validation .notice {
        justify-self: stretch;
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0;
        margin-right: 0 !important;
        margin-left: 0 !important;
      }

      .validation-head {
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) !important;
        align-items: stretch !important;
        width: 100%;
        max-width: 100%;
      }

      .validation-head-actions {
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        width: 100%;
        max-width: 100%;
        white-space: normal !important;
      }

      .validation-head-actions .compact-builder-button {
        width: 100%;
        max-width: 100%;
        min-width: 0;
        white-space: normal;
        overflow-wrap: anywhere;
      }

      .pipeline-validation-summary {
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) !important;
        align-items: stretch !important;
        overflow: hidden;
      }

      .pipeline-validation-summary > strong,
      .pipeline-validation-summary > span {
        display: block;
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0;
        overflow-wrap: anywhere;
        word-break: break-word;
      }

      .pipeline-validation-summary > strong {
        padding-bottom: 3px;
      }

      .pipeline-validation-summary > span {
        padding: 6px 8px !important;
        text-align: left !important;
        white-space: normal !important;
        line-height: 1.2;
      }

      .panel.validation .notice,
      .panel.validation strong,
      .panel.validation span,
      .panel.validation small,
      .panel.validation p,
      .panel.validation code {
        max-width: 100%;
        white-space: normal;
        overflow-wrap: anywhere;
        word-break: break-word;
      }

      @media (max-width: 430px) {
        .validation-head-actions {
          grid-template-columns: minmax(0, 1fr);
        }
      }
    `;
    document.head.appendChild(style);
    return true;
  }

  installStyles();

  global.LabelerValidationPanelUiController = Object.freeze({
    installed: true,
    installStyles
  });
})(window);
