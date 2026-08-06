"use strict";

(function installBuildInputsFitIntegration(global) {
  if (global.LabelerBuildInputsFitIntegration?.installed) return;

  const STYLE_ID = "buildInputsFitStyles";
  let observer = null;
  let applyPending = false;

  function ensureStyles() {
    if (global.document?.getElementById(STYLE_ID)) return;
    const style = global.document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #buildInputs {
        container-type: inline-size;
        min-width: 0;
        max-width: 100%;
        overflow-x: hidden;
      }

      #buildInputs .build-grid {
        grid-template-columns: minmax(280px, 0.85fr) minmax(0, 1.15fr) !important;
        width: 100%;
        min-width: 0;
        max-width: 100%;
      }

      #buildInputs .build-card {
        min-width: 0;
        max-width: 100%;
        overflow-x: hidden;
      }

      #buildInputs .workbook-feed-table,
      #buildInputs .build-card:nth-child(2) table {
        width: 100%;
        min-width: 0 !important;
        max-width: 100%;
        table-layout: fixed;
      }

      #buildInputs .workbook-feed-table th:first-child,
      #buildInputs .workbook-feed-table td:first-child,
      #buildInputs .build-card:nth-child(2) th:first-child,
      #buildInputs .build-card:nth-child(2) td:first-child {
        width: 56%;
        white-space: normal;
        overflow-wrap: anywhere;
      }

      #buildInputs .workbook-feed-table th:last-child,
      #buildInputs .workbook-feed-table td:last-child,
      #buildInputs .build-card:nth-child(2) th:last-child,
      #buildInputs .build-card:nth-child(2) td:last-child {
        width: 44%;
        text-align: left;
        white-space: normal;
        overflow-wrap: anywhere;
        word-break: break-word;
      }

      @container (max-width: 720px) {
        #buildInputs .build-grid {
          grid-template-columns: minmax(0, 1fr) !important;
        }
      }
    `;
    global.document.head.appendChild(style);
  }

  function apply() {
    applyPending = false;
    ensureStyles();
    const root = global.document?.querySelector("#buildInputs");
    const cards = root?.querySelectorAll(".build-card");
    const workbookCard = cards?.[1];
    const table = workbookCard?.querySelector("table");
    workbookCard?.classList.add("workbook-feed-card");
    table?.classList.add("workbook-feed-table");
  }

  function schedule() {
    if (applyPending) return;
    applyPending = true;
    const requestFrame = global.requestAnimationFrame || ((callback) => global.setTimeout(callback, 0));
    requestFrame(apply);
  }

  function observe() {
    if (observer || !global.MutationObserver || !global.document?.body) return;
    observer = new global.MutationObserver((records) => {
      if (records.some((record) => record.type === "childList")) schedule();
    });
    observer.observe(global.document.body, { subtree: true, childList: true });
  }

  function start() {
    ensureStyles();
    observe();
    apply();
    global.setTimeout(schedule, 250);
    global.setTimeout(schedule, 1000);
  }

  global.LabelerBuildInputsFitIntegration = Object.freeze({
    installed: true,
    ensureStyles,
    apply,
    schedule
  });

  if (global.document?.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", start, { once: true });
  } else start();
})(typeof window !== "undefined" ? window : globalThis);
