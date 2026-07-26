"use strict";

(function installServoReplayMilestone() {
  const RELEASE_VERSION = "0.8.6";
  const RETRY_MS = 25;
  let installed = false;
  let replayFrame = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function ensureReplayState() {
    state.servoReplay ||= {
      selectedIndex: 0,
      pauseAtReferences: true,
      lastFrameIndex: -1,
      lastPausedHmi: null,
      signature: ""
    };
    return state.servoReplay;
  }

  function activePlan() {
    return state.motionTranslation?.plan
      || state.motionPlan?.planner
      || state.plannerPreview
      || null;
  }

  function generatedProgram() {
    return Array.isArray(state.program) ? state.program : [];
  }

  function customProgram() {
    if (!state.simulation?.useCustom || typeof simulationProgram !== "function") return [];
    return simulationProgram();
  }

  function replayProgram() {
    return state.activeTab === "simulation" && state.simulation?.useCustom
      ? customProgram()
      : generatedProgram();
  }

  function activeMapContext() {
    const map = typeof activeMachineMap === "function" ? activeMachineMap() : null;
    const enabled = map?.enabledStations
      || state.coldGlueAggregateSettings?.enabledStations
      || [];
    const enabledStations = typeof activeSlotNumbers === "function"
      ? activeSlotNumbers(enabled)
      : Array.isArray(enabled)
        ? enabled.map(Number).filter(Number.isFinite)
        : [];
    return {
      map,
      objects: map?.objects || [],
      aplObjects: state.aplMapObjects,
      coldGlueObjects: state.coldGlueMap,
      enabledStations
    };
  }

  function replayFrames(program = replayProgram()) {
    return window.LabelerServoReplayDriver.buildFrames(program, {
      plan: activePlan(),
      commandDriver: window.LabelerServoCommandDriver
    });
  }

  function frameSignature(frames) {
    return frames.map((frame) => [
      frame.hmi,
      frame.command,
      frame.tableStart,
      frame.plateStart,
      frame.eventId,
      frame.chainId
    ].join("|")).join(";");
  }

  function activeSnapshot(frames) {
    const replay = ensureReplayState();
    const active = typeof activeSegmentForProgram === "function"
      ? activeSegmentForProgram(replayProgram(), state.previewAngle)
      : null;
    const snapshot = window.LabelerServoReplayDriver.snapshot(frames, state.previewAngle, active?.hmi);
    if (snapshot.index >= 0) replay.selectedIndex = snapshot.index;
    return snapshot;
  }

  function comparisonResult() {
    return window.LabelerServoReplayDriver.comparePrograms(generatedProgram(), customProgram(), {
      plan: activePlan(),
      commandDriver: window.LabelerServoCommandDriver
    });
  }

  function mapAlignmentResult(frames) {
    return window.LabelerServoReplayDriver.detectMapMismatches(frames, activeMapContext());
  }

  function setPlaybackState(playing) {
    state.isPlaying = Boolean(playing);
    if (state.isPlaying) lastAnimationTime = performance.now();
    if (els.playPause) {
      els.playPause.textContent = state.isPlaying ? "Pause" : "Play";
      els.playPause.setAttribute("aria-pressed", String(state.isPlaying));
    }
  }

  function jumpToFrame(frames, index) {
    if (!frames.length) return;
    const bounded = Math.max(0, Math.min(frames.length - 1, Number(index) || 0));
    const frame = frames[bounded];
    const replay = ensureReplayState();
    replay.selectedIndex = bounded;
    replay.lastFrameIndex = bounded;
    replay.lastPausedHmi = frame.hmi;
    state.previewAngle = typeof norm === "function" ? norm(frame.tableStart) : frame.tableStart;
    setPlaybackState(false);
    if (els.previewAngle) els.previewAngle.value = state.previewAngle;
    if (els.tableAngleJump) els.tableAngleJump.value = typeof fmt === "function" ? fmt(state.previewAngle, 1) : String(state.previewAngle);
    if (typeof renderAnimationFrame === "function") renderAnimationFrame();
    else {
      if (typeof renderMap === "function") renderMap();
      if (typeof renderSimulationMap === "function") renderSimulationMap(replayProgram());
    }
  }

  function moveReplay(frames, direction, mode) {
    const replay = ensureReplayState();
    const next = window.LabelerServoReplayDriver.nextIndex(frames, replay.selectedIndex, direction, mode);
    jumpToFrame(frames, next);
  }

  function firstMismatchIndex(frames, comparison, mapAlignment) {
    const first = comparison?.mismatches?.[0] || mapAlignment?.mismatches?.[0] || null;
    if (!first) return -1;
    return frames.findIndex((frame) => Number(frame.hmi) === Number(first.hmi) || frame.eventId === first.eventId);
  }

  function eventOptionsMarkup(frames, selectedIndex) {
    return window.LabelerServoReplayDriver.eventOptions(frames).map((event) => {
      const index = frames.findIndex((frame) => frame.eventId === event.eventId);
      return `<option value="${index}"${index === selectedIndex ? " selected" : ""}>${escapeHtml(event.label)}</option>`;
    }).join("");
  }

  function installStyles() {
    if (document.querySelector("#servoReplayMilestoneStyles")) return;
    const style = document.createElement("style");
    style.id = "servoReplayMilestoneStyles";
    style.textContent = `
      .servo-replay-panel { margin:0 0 8px;padding:8px;border:1px solid var(--line);border-radius:8px;background:var(--panel);font-size:9px; }
      .servo-replay-head { display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:7px; }
      .servo-replay-head h2,.servo-replay-head p { margin:0; }
      .servo-replay-head h2 { font-size:13px; }
      .servo-replay-head p { margin-top:2px;color:var(--muted);font-size:8px;line-height:1.25; }
      .servo-replay-badge { padding:3px 7px;border:1px solid var(--green);border-radius:999px;color:var(--green);font-size:8px;font-weight:800;white-space:nowrap; }
      .servo-replay-controls { display:grid;grid-template-columns:repeat(5,auto) minmax(190px,1fr) auto;gap:5px;align-items:end; }
      .servo-replay-controls button { min-height:28px;padding:4px 7px;font-size:8px;white-space:nowrap; }
      .servo-replay-controls label { min-width:0;display:grid;gap:3px;color:var(--muted);font-size:7px; }
      .servo-replay-controls select { min-width:0;width:100%;height:28px;font-size:8px; }
      .servo-replay-pause { display:flex!important;grid-auto-flow:column;align-items:center;justify-content:start;gap:5px!important;min-height:28px;padding:0 5px;border:1px solid var(--line);border-radius:6px;background:var(--input);white-space:nowrap; }
      .servo-replay-grid { display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:5px;margin-top:7px; }
      .servo-replay-grid>div { min-width:0;padding:5px 6px;border:1px solid var(--line);border-radius:6px;background:var(--input); }
      .servo-replay-grid span,.servo-replay-grid strong { display:block;overflow-wrap:anywhere; }
      .servo-replay-grid span { color:var(--muted);font-size:7px;text-transform:uppercase;letter-spacing:.04em; }
      .servo-replay-grid strong { margin-top:2px;font-size:9px;line-height:1.15; }
      .servo-replay-explanation,.servo-replay-diagnostic { margin-top:6px;padding:6px 7px;border:1px solid var(--line);border-radius:6px;background:var(--panel-hi);line-height:1.3; }
      .servo-replay-explanation strong,.servo-replay-diagnostic strong { color:var(--green); }
      .servo-replay-diagnostic[data-level="warn"] strong { color:#ffc56b; }
      .servo-replay-diagnostic[data-level="bad"] strong { color:#ff8181; }
      .servo-replay-diagnostic button { margin-left:6px;min-height:24px;padding:3px 6px;font-size:8px; }
      #simulation tbody tr.replay-active-row,#program tbody tr.replay-active-row { box-shadow:inset 3px 0 0 var(--green);background:rgba(30,155,105,.12); }
      #simulation tbody tr.replay-chain-row,#program tbody tr.replay-chain-row { background:rgba(215,154,60,.09); }
      .mechanical-event.replay-chain-event { border-color:#d79a3c;box-shadow:inset 0 0 0 1px rgba(215,154,60,.45); }
      @media(max-width:1100px){.servo-replay-controls{grid-template-columns:repeat(5,auto);}.servo-replay-controls label{grid-column:1/-1}.servo-replay-grid{grid-template-columns:repeat(3,minmax(0,1fr));}}
      @media(max-width:620px){.servo-replay-head{display:grid}.servo-replay-badge{justify-self:start}.servo-replay-controls{grid-template-columns:repeat(2,minmax(0,1fr));}.servo-replay-controls button{white-space:normal}.servo-replay-grid{grid-template-columns:repeat(2,minmax(0,1fr));}}
    `;
    document.head.appendChild(style);
  }

  function panelMarkup(frames, snapshot, comparison, mapAlignment) {
    const replay = ensureReplayState();
    const frame = snapshot.frame;
    const comparisonText = !comparison.available
      ? "Generated only"
      : comparison.matches
        ? "Programs match"
        : `${comparison.mismatchCount} differences`;
    const alignmentText = mapAlignment.valid ? "Map aligned" : `${mapAlignment.mismatchCount} mismatches`;
    const diagnostic = comparison?.mismatches?.[0] || mapAlignment?.mismatches?.[0] || null;
    const diagnosticLevel = comparison?.mismatches?.length ? "warn" : mapAlignment?.mismatches?.length ? "bad" : "ok";
    const diagnosticText = diagnostic?.message || "Generated events, the active program, and active map are aligned for replay.";
    const explanation = window.LabelerServoReplayDriver.explainFrame(frame);
    const signature = escapeHtml(frameSignature(frames));

    return `<section class="servo-replay-panel" data-replay-signature="${signature}" aria-label="Servo replay controls">
      <div class="servo-replay-head">
        <div><h2>Servo Replay &amp; Diagnostics</h2><p>Step through HMI rows or mechanical events, pause on references, inspect correction chains, and compare generated versus custom motion.</p></div>
        <span class="servo-replay-badge" data-replay-badge>HMI ${frame?.hmi ?? "--"} / ${frames.length}</span>
      </div>
      <div class="servo-replay-controls">
        <button type="button" class="secondary-button" data-replay-action="previous-event">Previous Event</button>
        <button type="button" class="secondary-button" data-replay-action="previous-hmi">Previous HMI</button>
        <button type="button" data-replay-action="play-pause">${state.isPlaying ? "Pause" : "Play"}</button>
        <button type="button" class="secondary-button" data-replay-action="next-hmi">Next HMI</button>
        <button type="button" class="secondary-button" data-replay-action="next-event">Next Event</button>
        <label>Jump to mechanical event<select data-replay-event-select>${eventOptionsMarkup(frames, replay.selectedIndex)}</select></label>
        <label class="servo-replay-pause"><input type="checkbox" data-replay-pause-reference${replay.pauseAtReferences ? " checked" : ""}> Pause at references</label>
      </div>
      <div class="servo-replay-grid">
        <div><span>Mechanical event</span><strong data-replay-event>${escapeHtml(frame?.eventId || "--")}</strong></div>
        <div><span>Process / aggregate</span><strong data-replay-process>${escapeHtml(frame ? `${frame.processId}${Number.isFinite(frame.aggregate) ? ` • A${frame.aggregate}` : ""}` : "--")}</strong></div>
        <div><span>CMD / intent</span><strong data-replay-command>${escapeHtml(frame ? `CMD ${frame.command} • ${frame.plannerIntent}` : "--")}</strong></div>
        <div><span>Correction chain</span><strong data-replay-chain>${escapeHtml(frame?.chainId || "None")}</strong></div>
        <div><span>Net bottle rotation</span><strong data-replay-net>${snapshot.cumulativeNet.toFixed(1)}°</strong></div>
        <div><span>Total bottle rotation</span><strong data-replay-total>${snapshot.cumulativeAbsolute.toFixed(1)}°</strong></div>
        <div><span>Move progress</span><strong data-replay-progress>${Math.round(snapshot.progress * 100)}%</strong></div>
        <div><span>Bottle angle</span><strong data-replay-bottle>${snapshot.bottleAngle.toFixed(1)}°</strong></div>
        <div><span>Generated / custom</span><strong data-replay-comparison>${escapeHtml(comparisonText)}</strong></div>
        <div><span>Map alignment</span><strong data-replay-map>${escapeHtml(alignmentText)}</strong></div>
        <div><span>Table window</span><strong data-replay-table>${frame ? `${frame.tableStart.toFixed(1)}° → ${frame.tableEnd.toFixed(1)}°` : "--"}</strong></div>
        <div><span>Turn ratio</span><strong data-replay-ratio>${frame ? `${frame.speedRatio.toFixed(1)}:1` : "--"}</strong></div>
      </div>
      <div class="servo-replay-explanation"><strong>Why this command</strong><div data-replay-explanation>${escapeHtml(explanation)}</div></div>
      <div class="servo-replay-diagnostic" data-level="${diagnosticLevel}"><strong>${diagnostic ? "Replay diagnostic" : "Replay health"}</strong><span data-replay-diagnostic> ${escapeHtml(diagnosticText)}</span>${diagnostic ? '<button type="button" class="secondary-button" data-replay-action="first-mismatch">Jump to issue</button>' : ""}</div>
    </section>`;
  }

  function ensurePanel(frames, snapshot, comparison, mapAlignment) {
    const host = document.querySelector("#simulation");
    if (!host) return null;
    const signature = frameSignature(frames);
    let panel = host.querySelector(".servo-replay-panel");
    if (!panel || panel.dataset.replaySignature !== signature) {
      panel?.remove();
      const anchor = host.querySelector(".simulator-runtime");
      if (anchor) anchor.insertAdjacentHTML("afterend", panelMarkup(frames, snapshot, comparison, mapAlignment));
      else host.insertAdjacentHTML("afterbegin", panelMarkup(frames, snapshot, comparison, mapAlignment));
      panel = host.querySelector(".servo-replay-panel");
      bindPanel(panel);
    }
    return panel;
  }

  function bindPanel(panel) {
    if (!panel || panel.dataset.replayBound === "true") return;
    panel.dataset.replayBound = "true";

    panel.addEventListener("click", (event) => {
      const action = event.target.closest("[data-replay-action]")?.dataset.replayAction;
      if (!action) return;
      const frames = replayFrames();
      if (action === "previous-hmi") moveReplay(frames, -1, "hmi");
      else if (action === "next-hmi") moveReplay(frames, 1, "hmi");
      else if (action === "previous-event") moveReplay(frames, -1, "event");
      else if (action === "next-event") moveReplay(frames, 1, "event");
      else if (action === "play-pause") setPlaybackState(!state.isPlaying);
      else if (action === "first-mismatch") {
        const comparison = comparisonResult();
        const mapAlignment = mapAlignmentResult(frames);
        const index = firstMismatchIndex(frames, comparison, mapAlignment);
        if (index >= 0) jumpToFrame(frames, index);
      }
    });

    panel.querySelector("[data-replay-event-select]")?.addEventListener("change", (event) => {
      jumpToFrame(replayFrames(), Number(event.currentTarget.value));
    });

    panel.querySelector("[data-replay-pause-reference]")?.addEventListener("change", (event) => {
      const replay = ensureReplayState();
      replay.pauseAtReferences = event.currentTarget.checked;
      replay.lastPausedHmi = null;
    });
  }

  function setText(panel, selector, value) {
    const node = panel?.querySelector(selector);
    if (node && node.textContent !== String(value)) node.textContent = value;
  }

  function updatePanel(panel, frames, snapshot, comparison, mapAlignment) {
    const frame = snapshot.frame;
    if (!panel) return;
    setText(panel, "[data-replay-badge]", `HMI ${frame?.hmi ?? "--"} / ${frames.length}`);
    setText(panel, "[data-replay-event]", frame?.eventId || "--");
    setText(panel, "[data-replay-process]", frame ? `${frame.processId}${Number.isFinite(frame.aggregate) ? ` • A${frame.aggregate}` : ""}` : "--");
    setText(panel, "[data-replay-command]", frame ? `CMD ${frame.command} • ${frame.plannerIntent}` : "--");
    setText(panel, "[data-replay-chain]", frame?.chainId || "None");
    setText(panel, "[data-replay-net]", `${snapshot.cumulativeNet.toFixed(1)}°`);
    setText(panel, "[data-replay-total]", `${snapshot.cumulativeAbsolute.toFixed(1)}°`);
    setText(panel, "[data-replay-progress]", `${Math.round(snapshot.progress * 100)}%`);
    setText(panel, "[data-replay-bottle]", `${snapshot.bottleAngle.toFixed(1)}°`);
    setText(panel, "[data-replay-comparison]", !comparison.available ? "Generated only" : comparison.matches ? "Programs match" : `${comparison.mismatchCount} differences`);
    setText(panel, "[data-replay-map]", mapAlignment.valid ? "Map aligned" : `${mapAlignment.mismatchCount} mismatches`);
    setText(panel, "[data-replay-table]", frame ? `${frame.tableStart.toFixed(1)}° → ${frame.tableEnd.toFixed(1)}°` : "--");
    setText(panel, "[data-replay-ratio]", frame ? `${frame.speedRatio.toFixed(1)}:1` : "--");
    setText(panel, "[data-replay-explanation]", window.LabelerServoReplayDriver.explainFrame(frame));
    const playButton = panel.querySelector('[data-replay-action="play-pause"]');
    if (playButton) playButton.textContent = state.isPlaying ? "Pause" : "Play";
    const select = panel.querySelector("[data-replay-event-select]");
    if (select && Number(select.value) !== Number(snapshot.index)) {
      const selectedFrame = frames[Number(select.value)];
      if (!selectedFrame || selectedFrame.eventId !== frame?.eventId) select.value = String(snapshot.index);
    }
  }

  function highlightReplayContext(frames, snapshot) {
    const frame = snapshot.frame;
    const chainId = frame?.chainId || "";
    const activeHmi = Number(frame?.hmi);

    document.querySelectorAll("#simulation tbody tr").forEach((row, index) => {
      const candidate = frames[index];
      row.classList.toggle("replay-active-row", Number(candidate?.hmi) === activeHmi);
      row.classList.toggle("replay-chain-row", Boolean(chainId) && candidate?.chainId === chainId);
    });

    const generatedFrames = window.LabelerServoReplayDriver.buildFrames(generatedProgram(), {
      plan: activePlan(),
      commandDriver: window.LabelerServoCommandDriver
    });
    document.querySelectorAll("#program tbody tr[data-program-hmi]").forEach((row) => {
      const hmi = Number(row.dataset.programHmi);
      const candidate = generatedFrames.find((item) => Number(item.hmi) === hmi);
      row.classList.toggle("replay-active-row", hmi === activeHmi);
      row.classList.toggle("replay-chain-row", Boolean(chainId) && candidate?.chainId === chainId);
    });

    document.querySelectorAll(".mechanical-event").forEach((card) => {
      card.classList.toggle("replay-chain-event", Boolean(chainId) && card.dataset.correctionChain === chainId);
    });
  }

  function pauseAtReference(snapshot) {
    const replay = ensureReplayState();
    if (snapshot.index < replay.lastFrameIndex) replay.lastPausedHmi = null;
    const enteredNewFrame = snapshot.index !== replay.lastFrameIndex;
    if (state.activeTab === "simulation"
      && state.isPlaying
      && replay.pauseAtReferences
      && enteredNewFrame
      && snapshot.frame?.pauseReference
      && Number(snapshot.frame.hmi) !== Number(replay.lastPausedHmi)) {
      replay.lastPausedHmi = snapshot.frame.hmi;
      setPlaybackState(false);
    }
    replay.lastFrameIndex = snapshot.index;
  }

  function replayLoop() {
    try {
      if (state.activeTab === "simulation") {
        const frames = replayFrames();
        const replay = ensureReplayState();
        const signature = frameSignature(frames);
        if (replay.signature !== signature) {
          replay.signature = signature;
          replay.selectedIndex = Math.max(0, Math.min(frames.length - 1, replay.selectedIndex));
          replay.lastFrameIndex = -1;
          replay.lastPausedHmi = null;
        }
        const snapshot = activeSnapshot(frames);
        const comparison = comparisonResult();
        const mapAlignment = mapAlignmentResult(frames);
        const panel = ensurePanel(frames, snapshot, comparison, mapAlignment);
        pauseAtReference(snapshot);
        updatePanel(panel, frames, snapshot, comparison, mapAlignment);
        highlightReplayContext(frames, snapshot);
        window.dispatchEvent(new CustomEvent("servoforge:replay-frame", {
          detail: { frame: snapshot.frame, snapshot, comparison, mapAlignment }
        }));
      }
    } catch (error) {
      console.error("Servo replay update failed", error);
    }
    replayFrame = window.requestAnimationFrame(replayLoop);
  }

  function install() {
    if (installed) return true;
    if (typeof state === "undefined"
      || !window.LabelerServoReplayDriver
      || typeof simulationProgram !== "function"
      || typeof activeSegmentForProgram !== "function") return false;

    installed = true;
    ensureReplayState();
    installStyles();
    const versionMeta = document.querySelector('meta[name="application-version"]');
    if (versionMeta) versionMeta.content = RELEASE_VERSION;
    if (replayFrame !== null) window.cancelAnimationFrame(replayFrame);
    replayFrame = window.requestAnimationFrame(replayLoop);
    return true;
  }

  function waitForDependencies() {
    if (install()) return;
    window.setTimeout(waitForDependencies, RETRY_MS);
  }

  waitForDependencies();
})();
