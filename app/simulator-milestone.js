"use strict";

(function installSimulatorMilestone() {
  const SIMULATOR_RELEASE_VERSION = "0.7.99";
  const INSTALL_RETRY_MS = 25;
  let installed = false;
  let runtimeFrame = null;

  function generatedServoProgram() {
    return Array.isArray(state.program) ? state.program : [];
  }

  function customSimulationAvailable() {
    return Boolean(state.simulation?.useCustom && Array.isArray(state.simulation?.lines) && state.simulation.lines.length);
  }

  function simulatorProgram() {
    return customSimulationAvailable() ? simulationProgram() : generatedServoProgram();
  }

  function mapProgramSource() {
    return state.activeTab === "simulation" && customSimulationAvailable()
      ? { key: "custom", label: "Custom simulation", program: simulatorProgram() }
      : { key: "generated", label: "Generated servo program", program: generatedServoProgram() };
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function programSignature(rows) {
    return (Array.isArray(rows) ? rows : []).map((row) => [
      Number(row?.cmd),
      Number(row?.tableAngle),
      Number(row?.plateAngle),
      String(row?.action || "")
    ].join("|")).join(";");
  }

  function simulatorHealth(program) {
    const rows = Array.isArray(program) ? program : [];
    const segments = typeof programSegments === "function" ? programSegments(rows) : [];
    const faults = [];
    const warnings = [];

    if (!rows.length) faults.push("No servo rows are loaded.");
    rows.forEach((row, index) => {
      const hmi = row?.hmi ?? index + 1;
      if (!Number.isFinite(Number(row?.tableAngle))) faults.push(`HMI ${hmi} has no table angle.`);
      if (Number(row?.cmd) !== 0 && !Number.isFinite(Number(row?.plateAngle))) faults.push(`HMI ${hmi} has no bottle angle.`);
      if (index > 0 && Number(row?.tableAngle) <= Number(rows[index - 1]?.tableAngle)) {
        faults.push(`HMI ${hmi} does not have an increasing table angle.`);
      }
    });

    segments.filter((row) => row?.moveFault).forEach((row) => {
      faults.push(`HMI ${row.hmi} exceeds the ${Number(state.maxMoveRatio).toFixed(1)}:1 turn-speed limit.`);
    });

    const finalRow = rows[rows.length - 1];
    if (rows.length && !(Number(finalRow?.cmd) === 3 && (finalRow?.terminalRest === true || /end\s*(?:of\s*)?curve|coding/i.test(String(finalRow?.action || ""))))) {
      warnings.push("The simulator does not finish with a confirmed CMD 3 terminal Rest.");
    }

    const status = faults.length ? "FAIL" : warnings.length ? "REVIEW" : "PASS";
    return { status, faults, warnings, rowCount: rows.length };
  }

  function activeSimulatorSnapshot(program = simulatorProgram()) {
    const segments = typeof programSegments === "function" ? programSegments(program) : [];
    const active = typeof activeSegmentForProgram === "function"
      ? activeSegmentForProgram(program, state.previewAngle)
      : null;
    const index = segments.findIndex((row) => Number(row?.hmi) === Number(active?.hmi));
    const next = index >= 0 ? segments[index + 1] : null;
    const tableStart = Number(active?.tableAngle);
    const tableEnd = Number(next?.tableAngle);
    const progress = Number.isFinite(tableStart) && Number.isFinite(tableEnd) && tableEnd > tableStart
      ? Math.max(0, Math.min(1, (Number(state.previewAngle) - tableStart) / (tableEnd - tableStart)))
      : 0;
    const bottleAngle = typeof plateAngleAt === "function"
      ? plateAngleAt(state.previewAngle, program)
      : Number(active?.plateAngle || 0);
    return { segments, active, next, progress, bottleAngle };
  }

  function copyGeneratedProgramToSimulator() {
    const rows = generatedServoProgram();
    state.simulation.turns = rows.map((row) => Number.isFinite(Number(row.plateAngle)) ? Number(row.plateAngle) : null);
    state.simulation.rows = rows.map((row) => ({ cmd: row.cmd, tableAngle: row.tableAngle, action: row.action }));
    state.simulation.deletedRows = [];
    state.simulation.lines = rows.map((row) => ({ ...row }));
    state.simulation.useCustom = true;
    state.simulation.generatedSignature = programSignature(rows);
    state.simulation.loadedAt = new Date().toISOString();
    if (typeof saveCurrentSettings === "function") saveCurrentSettings();
    if (typeof render === "function") render();
  }

  function useGeneratedProgramInSimulator() {
    state.simulation.useCustom = false;
    if (typeof saveCurrentSettings === "function") saveCurrentSettings();
    if (typeof render === "function") render();
  }

  function useExistingCustomSimulation() {
    if (!Array.isArray(state.simulation?.lines) || !state.simulation.lines.length) {
      copyGeneratedProgramToSimulator();
      return;
    }
    state.simulation.useCustom = true;
    if (typeof saveCurrentSettings === "function") saveCurrentSettings();
    if (typeof render === "function") render();
  }

  function installSimulatorStyles() {
    if (document.querySelector("#simulatorMilestoneStyles")) return;
    const style = document.createElement("style");
    style.id = "simulatorMilestoneStyles";
    style.textContent = `
      .map-program-source { display:inline-flex;align-items:center;min-height:20px;padding:2px 7px;border:1px solid var(--line);border-radius:999px;background:var(--input);color:var(--muted);font-size:8px;font-weight:700;white-space:nowrap; }
      .map-program-source[data-source="custom"] { border-color:#d79a3c;color:#ffc56b; }
      .simulator-runtime { margin:0 0 8px;padding:8px;border:1px solid var(--line);border-radius:8px;background:var(--panel); }
      .simulator-runtime-head { display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:7px; }
      .simulator-runtime-head h2,.simulator-runtime-head p { margin:0; }
      .simulator-runtime-head h2 { font-size:13px; }
      .simulator-runtime-head p { margin-top:2px;color:var(--muted);font-size:9px;line-height:1.25; }
      .simulator-runtime-badge { padding:3px 7px;border:1px solid var(--green);border-radius:999px;color:var(--green);font-size:9px;font-weight:800;white-space:nowrap; }
      .simulator-runtime[data-status="REVIEW"] .simulator-runtime-badge { border-color:#d79a3c;color:#ffc56b; }
      .simulator-runtime[data-status="FAIL"] .simulator-runtime-badge { border-color:#d85b5b;color:#ff8181; }
      .simulator-runtime-grid { display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:5px; }
      .simulator-runtime-grid>div { min-width:0;padding:5px 6px;border:1px solid var(--line);border-radius:6px;background:var(--input); }
      .simulator-runtime-grid span,.simulator-runtime-grid strong { display:block;overflow-wrap:anywhere; }
      .simulator-runtime-grid span { color:var(--muted);font-size:7px;text-transform:uppercase;letter-spacing:.04em; }
      .simulator-runtime-grid strong { margin-top:2px;font-size:9px;line-height:1.15; }
      .simulator-runtime-actions { display:flex;flex-wrap:wrap;gap:5px;margin-top:7px; }
      .simulator-runtime-actions button { min-height:28px;padding:4px 8px;font-size:9px; }
      .simulator-runtime-note { margin-top:6px;color:var(--muted);font-size:8px;line-height:1.25; }
      #simulation tbody tr[data-simulation-hmi] { cursor:pointer; }
      #simulation tbody tr.active-simulator-row { box-shadow:inset 3px 0 0 var(--green);background:rgba(30,155,105,.09); }
      @media(max-width:900px){.simulator-runtime-grid{grid-template-columns:repeat(3,minmax(0,1fr));}}
      @media(max-width:560px){.simulator-runtime-grid{grid-template-columns:repeat(2,minmax(0,1fr));}.simulator-runtime-head{display:grid;}.simulator-runtime-badge{justify-self:start;}}
    `;
    document.head.appendChild(style);
  }

  function ensureMapSourceBadge() {
    const heading = document.querySelector(".map-heading");
    if (!heading) return null;
    let badge = heading.querySelector(".map-program-source");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "map-program-source";
      heading.appendChild(badge);
    }
    return badge;
  }

  function updateMapSourceBadge() {
    const badge = ensureMapSourceBadge();
    if (!badge) return;
    const source = mapProgramSource();
    badge.dataset.source = source.key;
    badge.textContent = source.label;
    badge.title = source.key === "custom"
      ? "The Mechanical Map is previewing the custom simulation because the Servo Simulation tab is active."
      : "The Mechanical Map is using the current generated servo program.";
  }

  function runtimePanelMarkup() {
    const source = customSimulationAvailable() ? "Custom simulation" : "Generated servo program";
    const program = simulatorProgram();
    const health = simulatorHealth(program);
    const snapshot = activeSimulatorSnapshot(program);
    const active = snapshot.active;
    const generatedSignature = programSignature(generatedServoProgram());
    const customSignature = customSimulationAvailable() ? programSignature(program) : generatedSignature;
    const differs = customSimulationAvailable() && generatedSignature !== customSignature;
    return `<section class="simulator-runtime" data-status="${health.status}" aria-label="Servo simulator runtime">
      <div class="simulator-runtime-head">
        <div><h2>Simulator Runtime</h2><p>Custom simulation is isolated to this tab. The Mechanical Map uses the generated CMD program everywhere else.</p></div>
        <span class="simulator-runtime-badge" data-simulator-status>${health.status}</span>
      </div>
      <div class="simulator-runtime-grid">
        <div><span>Program source</span><strong data-simulator-source>${escapeHtml(source)}</strong></div>
        <div><span>Active HMI</span><strong data-simulator-hmi>${active?.hmi ?? "--"}</strong></div>
        <div><span>Command</span><strong data-simulator-command>${active ? `CMD ${active.cmd}` : "--"}</strong></div>
        <div><span>Move progress</span><strong data-simulator-progress>${Math.round(snapshot.progress * 100)}%</strong></div>
        <div><span>Bottle angle</span><strong data-simulator-bottle>${Number.isFinite(snapshot.bottleAngle) ? `${fmt(snapshot.bottleAngle, 1)}°` : "--"}</strong></div>
        <div><span>Rows / faults</span><strong data-simulator-health>${health.rowCount} / ${health.faults.length}</strong></div>
      </div>
      <div class="simulator-runtime-actions">
        <button id="simulatorUseGenerated" type="button" class="secondary-button">Use Generated Program</button>
        <button id="simulatorUseCustom" type="button">${customSimulationAvailable() ? "Use Custom Simulation" : "Create Custom Copy"}</button>
        <button id="simulatorReloadGenerated" type="button" class="secondary-button">Reload Generated Into Custom</button>
      </div>
      <div class="simulator-runtime-note" data-simulator-note>${differs ? "The custom simulation differs from the current generated program." : customSimulationAvailable() ? "The custom simulation currently matches the generated program." : "Editing is disabled until a custom copy is created."}</div>
    </section>`;
  }

  function decorateSimulationRows() {
    const program = simulatorProgram();
    const segments = typeof programSegments === "function" ? programSegments(program) : [];
    document.querySelectorAll("#simulation tbody tr").forEach((row, index) => {
      const segment = segments[index];
      if (!segment) return;
      row.dataset.simulationHmi = String(segment.hmi ?? index + 1);
      row.addEventListener("click", (event) => {
        if (event.target.closest("input,select,button,a")) return;
        state.previewAngle = norm(Number(segment.tableAngle) || 0);
        state.isPlaying = false;
        if (els.previewAngle) els.previewAngle.value = state.previewAngle;
        if (els.tableAngleJump) els.tableAngleJump.value = fmt(state.previewAngle, 1);
        if (els.playPause) els.playPause.textContent = "Play";
        if (typeof renderAnimationFrame === "function") renderAnimationFrame();
        else {
          if (typeof renderMap === "function") renderMap();
          if (typeof renderSimulationMap === "function") renderSimulationMap(program);
        }
      });
    });
  }

  function decorateSimulator() {
    const panel = document.querySelector("#simulation");
    if (!panel) return;
    panel.querySelector(".simulator-runtime")?.remove();
    const firstChild = panel.firstElementChild;
    if (firstChild) firstChild.insertAdjacentHTML("beforebegin", runtimePanelMarkup());
    else panel.insertAdjacentHTML("afterbegin", runtimePanelMarkup());

    panel.querySelector("#simulatorUseGenerated")?.addEventListener("click", useGeneratedProgramInSimulator);
    panel.querySelector("#simulatorUseCustom")?.addEventListener("click", useExistingCustomSimulation);
    panel.querySelector("#simulatorReloadGenerated")?.addEventListener("click", copyGeneratedProgramToSimulator);
    decorateSimulationRows();
    updateSimulatorRuntime();
  }

  function updateSimulatorRuntime() {
    const panel = document.querySelector("#simulation .simulator-runtime");
    if (!panel) return;
    const program = simulatorProgram();
    const source = customSimulationAvailable() ? "Custom simulation" : "Generated servo program";
    const health = simulatorHealth(program);
    const snapshot = activeSimulatorSnapshot(program);
    const active = snapshot.active;
    panel.dataset.status = health.status;
    const setText = (selector, value) => {
      const node = panel.querySelector(selector);
      if (node) node.textContent = value;
    };
    setText("[data-simulator-status]", health.status);
    setText("[data-simulator-source]", source);
    setText("[data-simulator-hmi]", active?.hmi ?? "--");
    setText("[data-simulator-command]", active ? `CMD ${active.cmd}` : "--");
    setText("[data-simulator-progress]", `${Math.round(snapshot.progress * 100)}%`);
    setText("[data-simulator-bottle]", Number.isFinite(snapshot.bottleAngle) ? `${fmt(snapshot.bottleAngle, 1)}°` : "--");
    setText("[data-simulator-health]", `${health.rowCount} / ${health.faults.length}`);

    document.querySelectorAll("#simulation tbody tr[data-simulation-hmi]").forEach((row) => {
      row.classList.toggle("active-simulator-row", Number(row.dataset.simulationHmi) === Number(active?.hmi));
    });
  }

  function updateSimulationActionButtons() {
    if (els.loadGeneratedTurns) {
      els.loadGeneratedTurns.hidden = state.activeTab !== "simulation";
      els.loadGeneratedTurns.textContent = "Copy Generated to Custom";
    }
    if (els.clearCustomTurns) {
      els.clearCustomTurns.hidden = state.activeTab !== "simulation" || !customSimulationAvailable();
      els.clearCustomTurns.textContent = "Discard Custom Simulation";
    }
  }

  function runtimeLoop() {
    updateMapSourceBadge();
    updateSimulationActionButtons();
    updateSimulatorRuntime();
    runtimeFrame = window.requestAnimationFrame(runtimeLoop);
  }

  function installHooks() {
    if (installed) return true;
    if (typeof state === "undefined"
      || typeof currentProgram !== "function"
      || typeof simulationProgram !== "function"
      || typeof renderSimulation !== "function"
      || typeof programSegments !== "function") return false;

    installed = true;
    installSimulatorStyles();

    // Custom simulator rows must never replace the generated program used by the
    // Mechanical Map, validation, wipe telemetry, or exports outside this tab.
    currentProgram = function isolatedCurrentProgram() {
      return state.activeTab === "simulation" && customSimulationAvailable()
        ? simulationProgram()
        : generatedServoProgram();
    };

    const renderSimulationBeforeMilestone = renderSimulation;
    renderSimulation = function renderSimulationWithRuntime(...args) {
      const output = renderSimulationBeforeMilestone.apply(this, args);
      decorateSimulator();
      return output;
    };

    const versionMeta = document.querySelector('meta[name="application-version"]');
    if (versionMeta) versionMeta.content = SIMULATOR_RELEASE_VERSION;
    const versionStatus = document.querySelector("#updateCheckStatus");
    if (versionStatus) versionStatus.textContent = `Version ${SIMULATOR_RELEASE_VERSION} • Updates are checked automatically.`;

    if (typeof render === "function") render();
    if (runtimeFrame !== null) window.cancelAnimationFrame(runtimeFrame);
    runtimeFrame = window.requestAnimationFrame(runtimeLoop);
    return true;
  }

  function waitForApplication() {
    if (installHooks()) return;
    window.setTimeout(waitForApplication, INSTALL_RETRY_MS);
  }

  if (document.readyState === "complete") waitForApplication();
  else window.addEventListener("load", waitForApplication, { once: true });
})();
