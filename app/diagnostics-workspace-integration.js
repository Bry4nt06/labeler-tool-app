"use strict";

(function installDiagnosticsWorkspace() {
  const RETRY_MS = 25;
  let installed = false;
  let refreshPending = false;
  let renderProgramWrapped = false;
  let renderValidationWrapped = false;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function ensureWorkspace() {
    const tabs = document.querySelector(".tabs");
    const simulationTab = tabs?.querySelector('[data-tab="simulation"]');
    let diagnosticsTab = tabs?.querySelector('[data-tab="diagnostics"]');
    if (tabs && !diagnosticsTab) {
      diagnosticsTab = document.createElement("button");
      diagnosticsTab.type = "button";
      diagnosticsTab.className = "tab diagnostics-tab";
      diagnosticsTab.dataset.tab = "diagnostics";
      diagnosticsTab.innerHTML = '<span>Diagnostics</span><span class="diagnostics-tab-count" hidden>0</span>';
      simulationTab?.insertAdjacentElement("beforebegin", diagnosticsTab);
    }

    const program = document.querySelector("#program");
    let diagnostics = document.querySelector("#diagnostics");
    if (!diagnostics && program) {
      diagnostics = document.createElement("section");
      diagnostics.id = "diagnostics";
      diagnostics.className = "table-wrap diagnostics-workspace";
      diagnostics.innerHTML = `
        <div class="diagnostics-workspace-head">
          <div><h2>Diagnostics</h2><p>Engineering details are separated from the operator-facing Servo Program table.</p></div>
          <span class="diagnostics-workspace-status" data-status="PASS">PASS</span>
        </div>
        <div class="diagnostics-overview" aria-live="polite"></div>
        <div class="diagnostics-slot" data-diagnostics-slot="motion"></div>
        <div class="diagnostics-slot" data-diagnostics-slot="timeline"></div>
        <div class="diagnostics-slot" data-diagnostics-slot="optimizer"></div>`;
      program.insertAdjacentElement("afterend", diagnostics);
    }

    if (diagnosticsTab && diagnosticsTab.dataset.diagnosticsBound !== "true") {
      diagnosticsTab.dataset.diagnosticsBound = "true";
      diagnosticsTab.addEventListener("click", () => switchWorkspaceTab("diagnostics"));
    }

    return { tabs, diagnosticsTab, diagnostics, program };
  }

  function switchWorkspaceTab(tabName) {
    if (typeof state !== "undefined") state.activeTab = tabName;
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === tabName));
    document.querySelectorAll(".table-wrap").forEach((panel) => panel.classList.toggle("active", panel.id === tabName));
    if (tabName === "diagnostics") scheduleRefresh();
  }

  function installStyles() {
    if (document.querySelector("#diagnosticsWorkspaceStyles")) return;
    const style = document.createElement("style");
    style.id = "diagnosticsWorkspaceStyles";
    style.textContent = `
      .diagnostics-tab { display:inline-flex;align-items:center;gap:5px; }
      .diagnostics-tab-count { min-width:17px;padding:1px 5px;border-radius:999px;background:#8c3232;color:#fff;font-size:8px;line-height:1.5;text-align:center; }
      .diagnostics-workspace { padding:8px; }
      .diagnostics-workspace-head { display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:7px;padding:8px;border:1px solid var(--line);border-radius:8px;background:var(--panel); }
      .diagnostics-workspace-head h2,.diagnostics-workspace-head p { margin:0; }
      .diagnostics-workspace-head h2 { font-size:14px; }
      .diagnostics-workspace-head p { margin-top:2px;color:var(--muted);font-size:9px; }
      .diagnostics-workspace-status { padding:3px 8px;border:1px solid var(--green);border-radius:999px;color:var(--green);font-size:9px;font-weight:800; }
      .diagnostics-workspace-status[data-status="REVIEW"] { border-color:#d79a3c;color:#ffc56b; }
      .diagnostics-workspace-status[data-status="FAIL"] { border-color:#d85b5b;color:#ff8181; }
      .diagnostics-overview { display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px;margin-bottom:7px; }
      .diagnostics-overview>div { min-width:0;padding:6px 7px;border:1px solid var(--line);border-radius:7px;background:var(--panel); }
      .diagnostics-overview span,.diagnostics-overview strong { display:block;overflow-wrap:anywhere; }
      .diagnostics-overview span { color:var(--muted);font-size:7px;text-transform:uppercase;letter-spacing:.04em; }
      .diagnostics-overview strong { margin-top:2px;font-size:10px; }
      .diagnostics-slot:empty { display:none; }
      .diagnostics-slot>.servo-motion-workbench,.diagnostics-slot>.mechanical-timeline,.diagnostics-slot>.program-optimizer-panel { margin-bottom:7px; }
      .servo-program-health-strip { display:flex;align-items:center;gap:8px;margin:0 0 6px;padding:6px 8px;border:1px solid var(--line);border-radius:7px;background:var(--panel);font-size:9px; }
      .servo-program-health-strip strong { color:var(--green);white-space:nowrap; }
      .servo-program-health-strip[data-status="REVIEW"] strong { color:#ffc56b; }
      .servo-program-health-strip[data-status="FAIL"] strong { color:#ff8181; }
      .servo-program-health-strip>span { min-width:0;color:var(--muted);overflow-wrap:anywhere; }
      .servo-program-health-actions { display:flex;gap:5px;margin-left:auto; }
      .servo-program-health-actions button { min-height:25px;padding:3px 7px;font-size:8px;white-space:nowrap; }
      #diagnostics .mechanical-timeline { margin:0 0 7px;padding:6px; }
      #diagnostics .mechanical-timeline-head { align-items:center;margin-bottom:4px; }
      #diagnostics .mechanical-timeline-head p { display:none; }
      #diagnostics .mechanical-timeline-summary span { padding:2px 5px;font-size:7px; }
      #diagnostics .mechanical-timeline-track { gap:3px;padding:0 0 3px; }
      #diagnostics .mechanical-event { flex:0 0 auto;display:flex;align-items:center;gap:6px;min-height:24px;max-width:none;padding:4px 6px;white-space:nowrap; }
      #diagnostics .mechanical-event strong,#diagnostics .mechanical-event span,#diagnostics .mechanical-event small { display:inline;margin:0;white-space:nowrap;overflow-wrap:normal;line-height:1; }
      #diagnostics .mechanical-event strong { font-size:8px; }
      #diagnostics .mechanical-event span { font-size:8px; }
      #diagnostics .mechanical-event small { color:var(--muted);font-size:7px; }
      .diagnostics-hmi-pulse { animation:diagnosticsHmiPulse 1.2s ease-out; }
      @keyframes diagnosticsHmiPulse { 0%,45%{box-shadow:inset 4px 0 0 #ffc56b;background:rgba(255,197,107,.16)} 100%{box-shadow:none} }
      @media(max-width:900px){.diagnostics-overview{grid-template-columns:repeat(3,minmax(0,1fr));}.servo-program-health-strip{align-items:flex-start;flex-wrap:wrap}.servo-program-health-actions{margin-left:0}}
      @media(max-width:560px){.diagnostics-overview{grid-template-columns:repeat(2,minmax(0,1fr));}.diagnostics-workspace-head{display:grid}.diagnostics-workspace-status{justify-self:start}}
    `;
    document.head.appendChild(style);
  }

  function statusSnapshot() {
    const pipeline = state?.servoPipelineValidation || state?.machineFamilyGrammarValidation || null;
    const optimization = state?.programOptimization?.result || null;
    const faults = Number(pipeline?.summary?.bad || 0);
    const warnings = Number(pipeline?.summary?.warn || 0);
    const optimizerFindings = Array.isArray(optimization?.diagnostics) ? optimization.diagnostics : [];
    const optimizerActions = optimizerFindings.filter((item) => item.level === "bad").length;
    const optimizerReviews = optimizerFindings.filter((item) => item.level === "warn").length;
    const rows = Array.isArray(state?.program) ? state.program.filter((row) => Number(row?.cmd) !== 0).length : 0;
    const chains = Number(state?.machineFamilyGrammar?.chainCount || state?.mechanicalTimeline?.processes?.length || 0);
    const grammar = pipeline?.machineGrammarName
      || state?.machineFamilyGrammar?.rule?.name
      || pipeline?.machineProfile
      || "Machine grammar";
    const status = faults || optimizerActions ? "FAIL" : warnings || optimizerReviews ? "REVIEW" : "PASS";
    return { pipeline, optimization, faults, warnings, optimizerActions, optimizerReviews, rows, chains, grammar, status };
  }

  function compactTimeline(timeline) {
    if (!timeline) return;
    timeline.querySelectorAll(".mechanical-event").forEach((event) => {
      if (event.dataset.singleLine === "true") return;
      const eventText = event.querySelector(":scope > strong")?.textContent?.trim() || "Mechanical event";
      const commandText = event.querySelector(":scope > span")?.textContent?.trim() || "";
      const actionText = event.querySelector(":scope > small")?.textContent?.trim() || "";
      const chain = event.dataset.correctionChain ? ` • ${event.dataset.correctionChain}` : "";
      event.innerHTML = `<strong>${escapeHtml(eventText)}</strong><span>${escapeHtml(commandText + chain)}</span><small>${escapeHtml(actionText)}</small>`;
      event.dataset.singleLine = "true";
    });
  }

  function replaceSlot(slot, node, selector) {
    if (!slot || !node) return;
    const existing = slot.querySelector(selector);
    if (existing && existing !== node) existing.remove();
    if (node.parentElement !== slot) slot.appendChild(node);
  }

  function moveAdvancedPanels() {
    const { diagnostics, program } = ensureWorkspace();
    if (!diagnostics || !program) return;

    const motion = program.querySelector(".servo-motion-workbench");
    const timeline = program.querySelector(".mechanical-timeline");
    const optimizer = program.querySelector(".program-optimizer-panel");

    replaceSlot(diagnostics.querySelector('[data-diagnostics-slot="motion"]'), motion, ".servo-motion-workbench");
    replaceSlot(diagnostics.querySelector('[data-diagnostics-slot="timeline"]'), timeline, ".mechanical-timeline");
    replaceSlot(diagnostics.querySelector('[data-diagnostics-slot="optimizer"]'), optimizer, ".program-optimizer-panel");
    compactTimeline(diagnostics.querySelector(".mechanical-timeline"));
  }

  function renderOverview() {
    const { diagnostics, diagnosticsTab, program } = ensureWorkspace();
    if (!diagnostics || !program) return;
    const snapshot = statusSnapshot();
    const overview = diagnostics.querySelector(".diagnostics-overview");
    const status = diagnostics.querySelector(".diagnostics-workspace-status");
    if (status) {
      status.textContent = snapshot.status;
      status.dataset.status = snapshot.status;
    }
    if (overview) {
      overview.innerHTML = `
        <div><span>Servo pipeline</span><strong>${escapeHtml(snapshot.status)}</strong></div>
        <div><span>Faults / warnings</span><strong>${snapshot.faults} / ${snapshot.warnings}</strong></div>
        <div><span>CMD rows</span><strong>${snapshot.rows}</strong></div>
        <div><span>Correction chains</span><strong>${snapshot.chains}</strong></div>
        <div><span>Grammar</span><strong>${escapeHtml(snapshot.grammar)}</strong></div>`;
    }

    const attentionCount = snapshot.faults + snapshot.warnings + snapshot.optimizerActions + snapshot.optimizerReviews;
    const tabCount = diagnosticsTab?.querySelector(".diagnostics-tab-count");
    if (tabCount) {
      tabCount.hidden = attentionCount === 0;
      tabCount.textContent = String(attentionCount);
    }

    program.querySelector(".servo-program-health-strip")?.remove();
    const table = program.querySelector(":scope > table");
    if (table) {
      table.insertAdjacentHTML("beforebegin", `
        <div class="servo-program-health-strip" data-status="${snapshot.status}">
          <strong>Program Health: ${snapshot.status}</strong>
          <span>${escapeHtml(snapshot.grammar)} • ${snapshot.rows} CMD rows • ${snapshot.faults} faults • ${snapshot.warnings} warnings</span>
          <div class="servo-program-health-actions">
            <button type="button" data-open-diagnostics>Open Diagnostics</button>
            <button type="button" class="secondary-button" data-open-simulation>Open Simulation</button>
          </div>
        </div>`);
    }
  }

  function refreshWorkspace() {
    refreshPending = false;
    moveAdvancedPanels();
    renderOverview();
  }

  function scheduleRefresh() {
    if (refreshPending) return;
    refreshPending = true;
    window.requestAnimationFrame(refreshWorkspace);
  }

  function installNavigation() {
    if (document.documentElement.dataset.diagnosticsNavigationBound === "true") return;
    document.documentElement.dataset.diagnosticsNavigationBound = "true";
    document.addEventListener("click", (event) => {
      if (event.target.closest("[data-open-diagnostics]")) {
        switchWorkspaceTab("diagnostics");
        return;
      }
      if (event.target.closest("[data-open-simulation]")) {
        switchWorkspaceTab("simulation");
        return;
      }
      const jump = event.target.closest("[data-optimizer-jump]");
      if (jump) {
        const hmi = Number(jump.dataset.optimizerJump);
        window.setTimeout(() => {
          switchWorkspaceTab("program");
          const row = document.querySelector(`#program tbody tr[data-program-hmi="${hmi}"]`);
          if (row) {
            row.classList.add("diagnostics-hmi-pulse");
            row.scrollIntoView({ behavior: "smooth", block: "center" });
            window.setTimeout(() => row.classList.remove("diagnostics-hmi-pulse"), 1400);
          }
        }, 0);
      }
    });
  }

  function installRenderHooks() {
    if (!renderProgramWrapped && typeof renderProgram === "function") {
      renderProgramWrapped = true;
      const before = renderProgram;
      renderProgram = function renderProgramWithDiagnosticsWorkspace(...args) {
        const output = before.apply(this, args);
        scheduleRefresh();
        return output;
      };
    }
    if (!renderValidationWrapped && typeof renderValidation === "function") {
      renderValidationWrapped = true;
      const before = renderValidation;
      renderValidation = function renderValidationWithDiagnosticsWorkspace(...args) {
        const output = before.apply(this, args);
        scheduleRefresh();
        return output;
      };
    }
  }

  function install() {
    if (installed) return true;
    if (typeof state === "undefined" || typeof renderProgram !== "function") return false;
    installed = true;
    installStyles();
    ensureWorkspace();
    installNavigation();
    installRenderHooks();
    scheduleRefresh();
    return true;
  }

  function waitForApplication() {
    if (install()) return;
    window.setTimeout(waitForApplication, RETRY_MS);
  }

  if (document.readyState === "complete") waitForApplication();
  else window.addEventListener("load", waitForApplication, { once: true });
})();
