"use strict";

(function loadDiagnosticsWorkspace() {
  if (document.querySelector('script[data-servoforge-diagnostics-workspace="0.9.1"]')) return;
  const script = document.createElement("script");
  script.src = "app/diagnostics-workspace-integration.js?v=0.9.1";
  script.dataset.servoforgeDiagnosticsWorkspace = "0.9.1";
  document.head.appendChild(script);
})();

(function installReleaseReadinessInterface() {
  const RELEASE_VERSION = "0.9.1";
  const RETRY_MS = 25;
  let installed = false;
  let running = false;
  let preparingOffline = false;
  let lastReport = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function readinessOptions() {
    if (typeof MACHINE_MAP_SCHEMA_VERSION !== "undefined") {
      window.MACHINE_MAP_SCHEMA_VERSION = MACHINE_MAP_SCHEMA_VERSION;
    }
    return {
      expectedVersion: RELEASE_VERSION,
      environment: "production",
      state,
      activeMachineMap: typeof activeMachineMap === "function" ? activeMachineMap : null,
      settingsSnapshot: typeof settingsSnapshot === "function" ? settingsSnapshot : null,
      programSegments: typeof programSegments === "function" ? programSegments : null,
      manifestUrl: document.querySelector('meta[name="update-manifest-url"]')?.content || "./update-manifest.json",
      releaseNotesUrl: "./release-notes.json",
      timeoutMs: 10000
    };
  }

  function readinessStore() {
    state.releaseReadiness ||= {
      lastRunAt: "",
      status: "NOT RUN",
      summary: { pass: 0, review: 0, fail: 0, total: 0 },
      report: null,
      offlinePreparedAt: ""
    };
    return state.releaseReadiness;
  }

  function installStyles() {
    if (document.querySelector("#releaseReadinessStyles")) return;
    const style = document.createElement("style");
    style.id = "releaseReadinessStyles";
    style.textContent = `
      .release-readiness-controls { grid-column:1/-1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:1px;padding-top:8px;border-top:1px solid var(--line); }
      .release-readiness-controls button { min-width:0;min-height:36px;padding:6px 8px;font-size:10px; }
      .release-readiness-controls button[disabled] { opacity:.55;cursor:not-allowed; }
      .release-readiness-status { grid-column:1/-1;display:grid;grid-template-columns:auto repeat(4,minmax(44px,auto));gap:5px;align-items:center;padding:7px 8px;border:1px solid var(--line);border-radius:7px;background:var(--panel-hi);font-size:8px; }
      .release-readiness-status strong { font-size:10px;color:var(--green); }
      .release-readiness-status span { min-width:0;padding:3px 5px;border-radius:5px;background:var(--input);text-align:center;overflow-wrap:anywhere; }
      .release-readiness-status[data-status="REVIEW"] strong { color:#ffc56b; }
      .release-readiness-status[data-status="FAIL"] strong { color:#ff8181; }
      .release-readiness-status[data-status="RUNNING"] strong { color:#7fbfff; }
      .release-readiness-report { grid-column:1/-1;border:1px solid var(--line);border-radius:7px;background:var(--panel);overflow:hidden; }
      .release-readiness-report>summary { padding:7px 8px;cursor:pointer;font-size:9px;font-weight:700; }
      .release-readiness-report-body { display:grid;gap:6px;max-height:420px;overflow:auto;padding:0 8px 8px;scrollbar-width:thin; }
      .release-readiness-category { border:1px solid var(--line);border-radius:6px;background:var(--panel-hi);overflow:hidden; }
      .release-readiness-category>summary { display:flex;justify-content:space-between;gap:6px;padding:6px 7px;cursor:pointer;font-size:8px;font-weight:700;text-transform:capitalize; }
      .release-readiness-category>summary span { color:var(--muted);font-weight:600; }
      .release-readiness-results { display:grid;gap:4px;padding:0 6px 6px; }
      .release-readiness-result { padding:5px 6px;border-left:3px solid var(--green);border-radius:5px;background:var(--input);font-size:8px;line-height:1.25; }
      .release-readiness-result[data-level="review"] { border-left-color:#d79a3c; }
      .release-readiness-result[data-level="fail"] { border-left-color:#d85b5b; }
      .release-readiness-result-head { display:flex;justify-content:space-between;gap:6px; }
      .release-readiness-result-head strong { overflow-wrap:anywhere; }
      .release-readiness-result-head span { color:var(--muted);font-size:7px;text-transform:uppercase; }
      .release-readiness-result p { margin:3px 0 0;overflow-wrap:anywhere; }
      .release-readiness-empty { padding:7px;color:var(--muted);font-size:8px; }
      .release-readiness-offline { grid-column:1/-1;color:var(--muted);font-size:8px;line-height:1.25; }
      @media(max-width:650px){.release-readiness-controls{grid-template-columns:1fr}.release-readiness-status{grid-template-columns:repeat(2,minmax(0,1fr))}.release-readiness-status strong{grid-column:1/-1}}
    `;
    document.head.appendChild(style);
  }

  function reportResultsByCategory(report) {
    const groups = new Map();
    (report?.results || []).forEach((item) => {
      const category = String(item?.category || "general");
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(item);
    });
    return groups;
  }

  function categoryMarkup(category, items) {
    const counts = items.reduce((summary, item) => {
      const level = item?.level || "review";
      summary[level] = (summary[level] || 0) + 1;
      return summary;
    }, { pass: 0, review: 0, fail: 0 });
    const open = counts.fail || counts.review ? " open" : "";
    return `<details class="release-readiness-category"${open}>
      <summary>${escapeHtml(category)}<span>${counts.fail} fail • ${counts.review} review • ${counts.pass} pass</span></summary>
      <div class="release-readiness-results">${items.map((item) => `
        <article class="release-readiness-result" data-level="${escapeHtml(item.level)}">
          <div class="release-readiness-result-head"><strong>${escapeHtml(item.id)}</strong><span>${escapeHtml(item.level)}</span></div>
          <p>${escapeHtml(item.message)}</p>
        </article>`).join("")}</div>
    </details>`;
  }

  function reportMarkup(report) {
    if (!report) return '<div class="release-readiness-empty">Run the production release check to validate application files, saved data, machine grammar, exports, updates, and offline readiness.</div>';
    const groups = reportResultsByCategory(report);
    return [...groups.entries()].map(([category, items]) => categoryMarkup(category, items)).join("");
  }

  function statusMarkup(report = lastReport) {
    const store = readinessStore();
    const status = running ? "RUNNING" : report?.status || store.status || "NOT RUN";
    const summary = report?.summary || store.summary || { pass: 0, review: 0, fail: 0, total: 0 };
    const completed = report?.completedAt || store.lastRunAt;
    return `<section class="release-readiness-status" data-status="${escapeHtml(status)}" aria-live="polite">
      <strong>${running ? "Release Check Running" : `Release Readiness ${escapeHtml(status)}`}</strong>
      <span>${summary.fail || 0} fail</span>
      <span>${summary.review || 0} review</span>
      <span>${summary.pass || 0} pass</span>
      <span>${completed ? escapeHtml(new Date(completed).toLocaleString()) : "Not run"}</span>
    </section>`;
  }

  function controlsMarkup() {
    const store = readinessStore();
    return `<section class="release-readiness-controls" aria-label="Release readiness controls">
      <button id="runReleaseReadiness" type="button"${running ? " disabled" : ""}>${running ? "Running Release Check…" : "Run Release Check"}</button>
      <button id="prepareOfflineRelease" type="button" class="secondary-button"${preparingOffline ? " disabled" : ""}>${preparingOffline ? "Preparing Offline…" : "Prepare Offline"}</button>
      <button id="exportReleaseReadiness" type="button" class="secondary-button"${lastReport ? "" : " disabled"}>Export Check Report</button>
      ${statusMarkup()}
      <details class="release-readiness-report"${lastReport?.status === "FAIL" ? " open" : ""}><summary>Release check details</summary><div class="release-readiness-report-body">${reportMarkup(lastReport)}</div></details>
      <div class="release-readiness-offline">Release checks do not modify maps, specifications, generated servo rows, or custom simulations. Prepare Offline caches the verified production application shell for recovery when the network is unavailable.${store.offlinePreparedAt ? ` Last prepared ${escapeHtml(new Date(store.offlinePreparedAt).toLocaleString())}.` : ""}</div>
    </section>`;
  }

  function panelHost() {
    return document.querySelector(".top-settings-panel");
  }

  function renderPanel() {
    const host = panelHost();
    if (!host) return;
    host.querySelector(".release-readiness-controls")?.remove();
    host.insertAdjacentHTML("beforeend", controlsMarkup());
    bindPanel();
  }

  function downloadReport(report) {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `servoforge-production-readiness-${report.version}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function runReadiness() {
    if (running) return;
    const driver = window.LabelerReleaseReadinessDriver;
    if (!driver?.run) return;
    running = true;
    renderPanel();
    try {
      lastReport = await driver.run(readinessOptions());
      const store = readinessStore();
      store.report = lastReport;
      store.status = lastReport.status;
      store.summary = lastReport.summary;
      store.lastRunAt = lastReport.completedAt;
    } catch (error) {
      lastReport = {
        schemaVersion: 1,
        version: RELEASE_VERSION,
        environment: "production",
        completedAt: new Date().toISOString(),
        status: "FAIL",
        summary: { pass: 0, review: 0, fail: 1, total: 1 },
        categories: { runtime: { pass: 0, review: 0, fail: 1, total: 1 } },
        results: [{ id: "readiness-run", category: "runtime", level: "fail", message: `Release readiness check failed: ${error.message}.` }]
      };
      const store = readinessStore();
      store.report = lastReport;
      store.status = "FAIL";
      store.summary = lastReport.summary;
      store.lastRunAt = lastReport.completedAt;
      console.error("Release readiness check failed", error);
    } finally {
      running = false;
      renderPanel();
    }
  }

  async function prepareOffline() {
    if (preparingOffline) return;
    const driver = window.LabelerReleaseReadinessDriver;
    if (!driver?.prepareOffline) return;
    preparingOffline = true;
    renderPanel();
    try {
      const response = await driver.prepareOffline(readinessOptions());
      if (!response?.ok) throw new Error(response?.message || "The service worker could not cache the application shell.");
      readinessStore().offlinePreparedAt = new Date().toISOString();
      await runReadiness();
    } catch (error) {
      window.alert(`Unable to prepare the staging app for offline startup: ${error.message}`);
      console.error("Offline preparation failed", error);
    } finally {
      preparingOffline = false;
      renderPanel();
    }
  }

  function bindPanel() {
    const host = panelHost();
    if (!host) return;
    host.querySelector("#runReleaseReadiness")?.addEventListener("click", runReadiness);
    host.querySelector("#prepareOfflineRelease")?.addEventListener("click", prepareOffline);
    host.querySelector("#exportReleaseReadiness")?.addEventListener("click", () => {
      if (lastReport) downloadReport(lastReport);
    });
  }

  function restorePreviousReport() {
    const stored = readinessStore().report;
    if (stored && stored.version === RELEASE_VERSION && Array.isArray(stored.results)) lastReport = stored;
  }

  function install() {
    if (installed) return true;
    if (typeof state === "undefined"
      || !window.LabelerReleaseReadinessDriver
      || typeof settingsSnapshot !== "function"
      || typeof programSegments !== "function") return false;

    installed = true;
    installStyles();
    restorePreviousReport();
    renderPanel();

    const versionMeta = document.querySelector('meta[name="application-version"]');
    if (versionMeta) versionMeta.content = RELEASE_VERSION;
    const versionStatus = document.querySelector("#updateCheckStatus");
    if (versionStatus && /^Version\s+/i.test(versionStatus.textContent || "")) {
      versionStatus.textContent = `Version ${RELEASE_VERSION} • Updates are checked automatically.`;
    }
    return true;
  }

  function waitForDependencies() {
    if (install()) return;
    window.setTimeout(waitForDependencies, RETRY_MS);
  }

  waitForDependencies();
})();
