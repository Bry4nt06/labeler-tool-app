"use strict";

(function installProgramDiagnosticsMilestone() {
  const RELEASE_VERSION = "0.9.0";
  const RETRY_MS = 25;
  let installed = false;
  let programWrapped = false;
  let validationWrapped = false;
  let simulationWrapped = false;

  function clone(value) {
    if (typeof structuredClone === "function") {
      try { return structuredClone(value); } catch { /* fall through */ }
    }
    return JSON.parse(JSON.stringify(value));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function activePlan() {
    return state.motionTranslation?.plan
      || state.motionPlan?.planner
      || state.plannerPreview
      || null;
  }

  function activeMap() {
    return typeof activeMachineMap === "function" ? activeMachineMap() : null;
  }

  function optimizerState() {
    state.programOptimization ||= {
      lastSignature: "",
      result: null,
      previewActive: false,
      previewBackup: null,
      previewSignature: ""
    };
    return state.programOptimization;
  }

  function analysisContext() {
    const map = activeMap();
    return {
      map,
      objects: map?.objects || [],
      aplObjects: state.aplMapObjects,
      coldGlueObjects: state.coldGlueMap,
      plan: activePlan(),
      commandDriver: window.LabelerServoCommandDriver,
      maxMoveRatio: state.maxMoveRatio,
      safetyFactor: 0.8,
      minMotionWindowDeg: 1.5
    };
  }

  function programSignature(rows = state.program) {
    return (Array.isArray(rows) ? rows : []).map((row) => [
      row?.hmi,
      row?.cmd,
      number(row?.tableAngle),
      number(row?.plateAngle),
      String(row?.action || ""),
      row?.machineCorrectionChainId || ""
    ].join("|")).join(";");
  }

  function candidatePlan(rows) {
    const plan = clone(activePlan() || {});
    if (!Array.isArray(plan.steps)) return plan;
    plan.steps = rows.map((row, index) => ({
      ...(plan.steps[index] || {}),
      index,
      hmi: row.hmi ?? index + 1,
      plc: row.plc ?? index,
      tableAngle: number(row.tableAngle),
      plateAngle: number(row.plateAngle),
      recommendedCommand: number(row.cmd, 3),
      requestedCommand: number(row.plannerRequestedCommand, number(row.cmd, 3)),
      action: String(row.action || "")
    }));
    return plan;
  }

  function machineProfileForCandidate() {
    const map = activeMap();
    const machineType = String(map?.machineType || "").toUpperCase();
    if (machineType.includes("TOPMODUL")) return "TOPMODUL";
    if (machineType.includes("AUTOCOL")) return "AUTOCOL_FUTURE";
    if (machineType.includes("MULTIMODUL")) return "MULTIMODUL_FUTURE";
    return state.motionTranslation?.machineProfile
      || state.motionPlan?.translation?.machineProfile
      || (state.applicationMode === "cold-glue" ? "COLD_GLUE" : "APL");
  }

  function buildSafeCandidate(result) {
    const rows = clone(result?.sourceRows || state.program || []);
    const changes = (result?.candidateChanges || []).filter((change) => change.type === "rebalance-chain" && change.field === "tableAngle");
    changes.forEach((change) => {
      const index = rows.findIndex((row) => Number(row.hmi) === Number(change.hmi));
      if (index < 0) return;
      rows[index].tableAngle = number(change.after, rows[index].tableAngle);
      rows[index].generatedTableAngle = rows[index].tableAngle;
      rows[index].tableAngleOverride = null;
      rows[index].optimizationPreview = true;
    });
    const candidateRows = rows.map((row, index) => ({ ...row, hmi: index + 1, plc: index }));
    const plan = candidatePlan(candidateRows);
    const validator = window.LabelerServoPipelineValidator;
    const validation = validator?.analyze ? validator.analyze({
      rows: candidateRows,
      plan,
      translation: state.motionTranslation || state.motionPlan?.translation || null,
      machineProfile: machineProfileForCandidate(),
      profileId: state.motionTranslation?.profileId
        || state.motionPlan?.translation?.profileId
        || state.selectedMotionProfileId
        || state.defaultMotionProfileId
        || "rest-correction",
      maxMoveRatio: state.maxMoveRatio,
      tolerance: 0.001
    }) : null;
    const strictlyIncreasing = candidateRows.every((row, index) => index === 0 || number(row.tableAngle) > number(candidateRows[index - 1].tableAngle));
    const terminalMatches = Number(candidateRows.at(-1)?.cmd) === Number(state.program?.at(-1)?.cmd)
      && Boolean(candidateRows.at(-1)?.terminalRest) === Boolean(state.program?.at(-1)?.terminalRest);
    const valid = changes.length > 0
      && strictlyIncreasing
      && terminalMatches
      && !(validation?.issues || []).some((issue) => issue.level === "bad");
    const metrics = window.LabelerProgramOptimizerDriver.calculateMetrics(candidateRows, analysisContext());
    return { rows: candidateRows, plan, changes, validation, metrics, valid, strictlyIncreasing, terminalMatches };
  }

  function runAnalysis(force = false) {
    const store = optimizerState();
    const signature = programSignature();
    if (!force && store.result && store.lastSignature === signature) return store.result;
    const driver = window.LabelerProgramOptimizerDriver;
    if (!driver?.analyze) return null;
    const result = driver.analyze(state.program, analysisContext());
    result.safeCandidate = buildSafeCandidate(result);
    result.previewMetrics = result.safeCandidate.metrics;
    result.comparison = driver.compareMetrics(result.currentMetrics, result.previewMetrics);
    store.lastSignature = signature;
    store.result = result;
    return result;
  }

  function issueCounts(result) {
    return (result?.diagnostics || []).reduce((counts, item) => {
      counts[item.level] = (counts[item.level] || 0) + 1;
      return counts;
    }, { bad: 0, warn: 0, info: 0 });
  }

  function metricCard(label, value, note = "") {
    return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${note ? `<small>${escapeHtml(note)}</small>` : ""}</div>`;
  }

  function signed(value, suffix = "") {
    const numeric = number(value);
    return `${numeric > 0 ? "+" : ""}${numeric.toFixed(1)}${suffix}`;
  }

  function diagnosticsMarkup(result) {
    const diagnostics = result?.diagnostics || [];
    if (!diagnostics.length) return '<div class="optimizer-empty">No optimization findings for the current program.</div>';
    return diagnostics.slice(0, 14).map((item) => `
      <article class="optimizer-finding" data-level="${escapeHtml(item.level)}">
        <div class="optimizer-finding-head"><strong>${escapeHtml(item.category || "diagnostic")}${item.hmi ? ` • HMI ${item.hmi}` : ""}</strong><span>${escapeHtml(item.level)}</span></div>
        <p>${escapeHtml(item.message)}</p>
        <small>${escapeHtml(item.recommendation || "Review this item against the active machine map.")}</small>
        ${item.hmi ? `<button type="button" class="secondary-button" data-optimizer-jump="${item.hmi}">Jump to HMI</button>` : ""}
      </article>`).join("");
  }

  function changesMarkup(candidate) {
    if (!candidate?.changes?.length) return '<span>No automatically safe timing changes were found.</span>';
    return candidate.changes.map((change) => `<span>${escapeHtml(change.message)}</span>`).join("");
  }

  function panelMarkup(result) {
    const counts = issueCounts(result);
    const current = result.currentMetrics;
    const preview = result.previewMetrics;
    const comparison = result.comparison;
    const candidate = result.safeCandidate;
    const previewActive = optimizerState().previewActive;
    const canPreview = Boolean(candidate?.valid && candidate.changes.length);
    const status = result.status;
    const comparisonText = canPreview
      ? `${current.maxSpeed.toFixed(1)}:1 → ${preview.maxSpeed.toFixed(1)}:1 max ratio`
      : "No validated automatic candidate";

    return `<section class="program-optimizer-panel" data-status="${status}" aria-label="Program diagnostics and optimization">
      <div class="program-optimizer-head">
        <div><h2>Program Diagnostics &amp; Optimization</h2><p>Analyze servo timing, wipe contact, duplicate events, reference use, and safe alternative correction splits. Generated production rows are never changed automatically.</p></div>
        <span class="program-optimizer-badge">${status}</span>
      </div>
      <div class="program-optimizer-actions">
        <button type="button" class="secondary-button" data-optimizer-action="reanalyze">Reanalyze</button>
        <button type="button" data-optimizer-action="preview"${canPreview ? "" : " disabled"}>Preview Safe Candidate</button>
        <button type="button" class="secondary-button" data-optimizer-action="restore"${previewActive ? "" : " disabled"}>Restore Previous Simulation</button>
      </div>
      <div class="program-optimizer-metrics">
        ${metricCard("Program rows", String(current.rowCount), `${current.motionCount} moving`)}
        ${metricCard("Maximum ratio", `${current.maxSpeed.toFixed(1)}:1`, current.maxSpeedHmi ? `HMI ${current.maxSpeedHmi}` : "No movement")}
        ${metricCard("Shortest window", `${current.minimumMotionWindow.toFixed(1)}°`, current.minimumWindowHmi ? `HMI ${current.minimumWindowHmi}` : "No movement")}
        ${metricCard("Speed faults", String(current.speedFaults), `${current.nearLimitMoves} near limit`)}
        ${metricCard("Findings", `${counts.bad} / ${counts.warn} / ${counts.info}`, "fault / review / advisory")}
        ${metricCard("Safe preview", candidate?.valid ? `${candidate.changes.length} change${candidate.changes.length === 1 ? "" : "s"}` : "None", comparisonText)}
      </div>
      <div class="program-optimizer-comparison" data-valid="${canPreview}">
        <strong>Before / After Preview</strong>
        <span>Max ratio ${current.maxSpeed.toFixed(1)}:1 → ${preview.maxSpeed.toFixed(1)}:1 (${signed(comparison.maxSpeedChange, ":1")})</span>
        <span>Minimum window ${current.minimumMotionWindow.toFixed(1)}° → ${preview.minimumMotionWindow.toFixed(1)}° (${signed(comparison.minimumWindowChange, "°")})</span>
        <span>Speed faults ${current.speedFaults} → ${preview.speedFaults}</span>
        <span>Total commanded rotation ${current.totalBottleRotation.toFixed(1)}° → ${preview.totalBottleRotation.toFixed(1)}°</span>
      </div>
      <details class="program-optimizer-changes"${canPreview ? " open" : ""}><summary>Safe candidate changes</summary><div>${changesMarkup(candidate)}</div>${candidate?.validation && !candidate.valid ? '<small>The candidate was withheld because final validation did not pass.</small>' : ""}</details>
      <details class="program-optimizer-findings" open><summary>Diagnostics and recommendations</summary><div>${diagnosticsMarkup(result)}</div></details>
    </section>`;
  }

  function installStyles() {
    if (document.querySelector("#programOptimizerStyles")) return;
    const style = document.createElement("style");
    style.id = "programOptimizerStyles";
    style.textContent = `
      .program-optimizer-panel { margin:0 0 8px;padding:8px;border:1px solid var(--line);border-radius:8px;background:var(--panel);font-size:9px; }
      .program-optimizer-head { display:flex;align-items:flex-start;justify-content:space-between;gap:8px; }
      .program-optimizer-head h2,.program-optimizer-head p { margin:0; }
      .program-optimizer-head h2 { font-size:13px; }
      .program-optimizer-head p { margin-top:2px;color:var(--muted);font-size:8px;line-height:1.3; }
      .program-optimizer-badge { padding:3px 7px;border:1px solid var(--green);border-radius:999px;color:var(--green);font-size:8px;font-weight:800;white-space:nowrap; }
      .program-optimizer-panel[data-status="REVIEW"] .program-optimizer-badge { border-color:#d79a3c;color:#ffc56b; }
      .program-optimizer-panel[data-status="ACTION"] .program-optimizer-badge { border-color:#d85b5b;color:#ff8181; }
      .program-optimizer-actions { display:flex;flex-wrap:wrap;gap:5px;margin-top:7px; }
      .program-optimizer-actions button { min-height:28px;padding:4px 8px;font-size:8px; }
      .program-optimizer-metrics { display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:5px;margin-top:7px; }
      .program-optimizer-metrics>div { min-width:0;padding:5px 6px;border:1px solid var(--line);border-radius:6px;background:var(--input); }
      .program-optimizer-metrics span,.program-optimizer-metrics strong,.program-optimizer-metrics small { display:block;overflow-wrap:anywhere; }
      .program-optimizer-metrics span { color:var(--muted);font-size:7px;text-transform:uppercase;letter-spacing:.04em; }
      .program-optimizer-metrics strong { margin-top:2px;font-size:9px; }
      .program-optimizer-metrics small { margin-top:2px;color:var(--muted);font-size:7px; }
      .program-optimizer-comparison { display:grid;grid-template-columns:auto repeat(4,minmax(0,1fr));gap:5px;align-items:center;margin-top:7px;padding:6px;border:1px solid var(--line);border-radius:6px;background:var(--panel-hi); }
      .program-optimizer-comparison strong { color:var(--green);font-size:8px; }
      .program-optimizer-comparison span { min-width:0;font-size:7px;overflow-wrap:anywhere; }
      .program-optimizer-comparison[data-valid="false"] { opacity:.65; }
      .program-optimizer-changes,.program-optimizer-findings { margin-top:6px;border:1px solid var(--line);border-radius:6px;background:var(--panel-hi); }
      .program-optimizer-changes>summary,.program-optimizer-findings>summary { padding:5px 7px;cursor:pointer;font-size:8px;font-weight:700; }
      .program-optimizer-changes>div { display:grid;gap:3px;padding:0 7px 7px;color:var(--muted);font-size:8px; }
      .program-optimizer-findings>div { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;padding:0 7px 7px; }
      .optimizer-finding { min-width:0;padding:6px;border-left:3px solid var(--green);border-radius:5px;background:var(--input); }
      .optimizer-finding[data-level="warn"] { border-left-color:#d79a3c; }
      .optimizer-finding[data-level="bad"] { border-left-color:#d85b5b; }
      .optimizer-finding-head { display:flex;justify-content:space-between;gap:5px; }
      .optimizer-finding-head strong { font-size:8px; }
      .optimizer-finding-head span { color:var(--muted);font-size:7px;text-transform:uppercase; }
      .optimizer-finding p { margin:4px 0 2px;font-size:8px;line-height:1.25; }
      .optimizer-finding small { display:block;color:var(--muted);font-size:7px;line-height:1.25; }
      .optimizer-finding button { margin-top:5px;min-height:23px;padding:3px 6px;font-size:7px; }
      .optimizer-empty { grid-column:1/-1;padding:7px;color:var(--muted); }
      .optimizer-validation-summary { display:grid;gap:2px;padding:6px 7px;border:1px solid var(--line);border-radius:6px;background:var(--panel-hi);font-size:8px; }
      .optimizer-validation-summary strong { color:var(--green); }
      .optimizer-validation-summary[data-status="REVIEW"] strong { color:#ffc56b; }
      .optimizer-validation-summary[data-status="ACTION"] strong { color:#ff8181; }
      .optimization-preview-banner { margin:0 0 7px;padding:6px 8px;border:1px solid #d79a3c;border-radius:6px;background:rgba(215,154,60,.1);font-size:8px; }
      .optimization-preview-banner strong { color:#ffc56b; }
      @media(max-width:1100px){.program-optimizer-metrics{grid-template-columns:repeat(3,minmax(0,1fr));}.program-optimizer-comparison{grid-template-columns:repeat(2,minmax(0,1fr));}.program-optimizer-findings>div{grid-template-columns:1fr;}}
      @media(max-width:620px){.program-optimizer-head{display:grid}.program-optimizer-badge{justify-self:start}.program-optimizer-metrics{grid-template-columns:repeat(2,minmax(0,1fr));}}
    `;
    document.head.appendChild(style);
  }

  function switchToTab(tabName) {
    state.activeTab = tabName;
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === tabName));
    document.querySelectorAll(".table-wrap").forEach((panel) => panel.classList.toggle("active", panel.id === tabName));
  }

  function loadCandidatePreview(result) {
    const candidate = result?.safeCandidate;
    if (!candidate?.valid || !candidate.rows.length) return;
    const store = optimizerState();
    if (!store.previewActive) store.previewBackup = clone(state.simulation || {});
    state.simulation.turns = candidate.rows.map((row) => Number.isFinite(Number(row.plateAngle)) ? Number(row.plateAngle) : null);
    state.simulation.rows = candidate.rows.map((row) => ({ cmd: row.cmd, tableAngle: row.tableAngle, action: row.action }));
    state.simulation.deletedRows = [];
    state.simulation.lines = candidate.rows.map((row) => ({ ...row, optimizationPreview: true }));
    state.simulation.useCustom = true;
    state.simulation.optimizationPreview = {
      createdAt: new Date().toISOString(),
      sourceSignature: programSignature(),
      changes: clone(candidate.changes),
      currentMetrics: clone(result.currentMetrics),
      previewMetrics: clone(result.previewMetrics)
    };
    store.previewActive = true;
    store.previewSignature = programSignature(candidate.rows);
    switchToTab("simulation");
    if (typeof render === "function") render();
  }

  function restoreSimulation() {
    const store = optimizerState();
    if (store.previewBackup) state.simulation = clone(store.previewBackup);
    else if (state.simulation) {
      state.simulation.useCustom = false;
      delete state.simulation.optimizationPreview;
    }
    store.previewActive = false;
    store.previewBackup = null;
    store.previewSignature = "";
    if (typeof render === "function") render();
  }

  function jumpToHmi(hmi) {
    const row = (state.program || []).find((item) => Number(item.hmi) === Number(hmi));
    if (!row) return;
    state.previewAngle = typeof norm === "function" ? norm(number(row.tableAngle)) : number(row.tableAngle);
    state.isPlaying = false;
    if (els.previewAngle) els.previewAngle.value = state.previewAngle;
    if (els.tableAngleJump) els.tableAngleJump.value = typeof fmt === "function" ? fmt(state.previewAngle, 1) : String(state.previewAngle);
    if (els.playPause) els.playPause.textContent = "Play";
    if (typeof renderAnimationFrame === "function") renderAnimationFrame();
  }

  function bindPanel(panel, result) {
    if (!panel || panel.dataset.optimizerBound === "true") return;
    panel.dataset.optimizerBound = "true";
    panel.addEventListener("click", (event) => {
      const action = event.target.closest("[data-optimizer-action]")?.dataset.optimizerAction;
      const hmi = event.target.closest("[data-optimizer-jump]")?.dataset.optimizerJump;
      if (hmi) {
        jumpToHmi(hmi);
        return;
      }
      if (action === "reanalyze") {
        optimizerState().lastSignature = "";
        const updated = runAnalysis(true);
        renderOptimizerPanel(updated);
      } else if (action === "preview") {
        loadCandidatePreview(result);
      } else if (action === "restore") {
        restoreSimulation();
      }
    });
  }

  function renderOptimizerPanel(result = runAnalysis()) {
    const host = document.querySelector("#program");
    if (!host || !result) return;
    host.querySelector(".program-optimizer-panel")?.remove();
    const timeline = host.querySelector(".mechanical-timeline");
    const workbench = host.querySelector(".servo-motion-workbench");
    const anchor = timeline || workbench || host.firstElementChild;
    if (anchor) anchor.insertAdjacentHTML("afterend", panelMarkup(result));
    else host.insertAdjacentHTML("afterbegin", panelMarkup(result));
    bindPanel(host.querySelector(".program-optimizer-panel"), result);
  }

  function renderValidationSummary() {
    const result = runAnalysis();
    const host = els?.validationDetails;
    if (!host || !result) return;
    host.querySelector(".optimizer-validation-summary")?.remove();
    const counts = issueCounts(result);
    const node = document.createElement("div");
    node.className = "optimizer-validation-summary";
    node.dataset.status = result.status;
    node.innerHTML = `<strong>Optimization ${result.status}</strong><span>${counts.bad} action • ${counts.warn} review • ${counts.info} advisory</span><span>${result.safeCandidate?.valid ? `${result.safeCandidate.changes.length} safe preview change${result.safeCandidate.changes.length === 1 ? "" : "s"}` : "No automatic change proposed"}</span>`;
    host.appendChild(node);
  }

  function renderSimulationBanner() {
    const host = document.querySelector("#simulation");
    if (!host) return;
    host.querySelector(".optimization-preview-banner")?.remove();
    const preview = state.simulation?.optimizationPreview;
    if (!preview || !state.simulation?.useCustom) return;
    const changes = Array.isArray(preview.changes) ? preview.changes.length : 0;
    host.insertAdjacentHTML("afterbegin", `<div class="optimization-preview-banner"><strong>Optimization Preview</strong> — ${changes} safe candidate timing change${changes === 1 ? "" : "s"} loaded into the custom simulator. The generated Servo Program has not been changed.</div>`);
  }

  function installRenderHooks() {
    if (!programWrapped && typeof renderProgram === "function") {
      programWrapped = true;
      const before = renderProgram;
      renderProgram = function renderProgramWithOptimization(...args) {
        const output = before.apply(this, args);
        renderOptimizerPanel();
        return output;
      };
    }
    if (!validationWrapped && typeof renderValidation === "function") {
      validationWrapped = true;
      const before = renderValidation;
      renderValidation = function renderValidationWithOptimization(...args) {
        const output = before.apply(this, args);
        renderValidationSummary();
        return output;
      };
    }
    if (!simulationWrapped && typeof renderSimulation === "function") {
      simulationWrapped = true;
      const before = renderSimulation;
      renderSimulation = function renderSimulationWithOptimization(...args) {
        const output = before.apply(this, args);
        renderSimulationBanner();
        return output;
      };
    }
  }

  function install() {
    if (installed) return true;
    if (typeof state === "undefined"
      || !window.LabelerProgramOptimizerDriver
      || typeof renderProgram !== "function"
      || typeof renderValidation !== "function"
      || typeof renderSimulation !== "function") return false;

    installed = true;
    ensureProgramOptimizationState();
    installStyles();
    installRenderHooks();
    const versionMeta = document.querySelector('meta[name="application-version"]');
    if (versionMeta) versionMeta.content = RELEASE_VERSION;
    const versionStatus = document.querySelector("#updateCheckStatus");
    if (versionStatus && /^Version\s+/i.test(versionStatus.textContent || "")) {
      versionStatus.textContent = `Version ${RELEASE_VERSION} • Updates are checked automatically.`;
    }
    if (typeof render === "function") render();
    return true;
  }

  function ensureProgramOptimizationState() {
    optimizerState();
  }

  function waitForDependencies() {
    if (install()) return;
    window.setTimeout(waitForDependencies, RETRY_MS);
  }

  waitForDependencies();
})();
