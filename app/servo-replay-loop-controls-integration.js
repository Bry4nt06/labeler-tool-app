"use strict";

(function installServoReplayLoopControls() {
  const RETRY_MS = 50;
  const END_PROGRESS = 0.995;
  let installed = false;
  let observer = null;
  let decoratePending = false;
  let resetPending = false;
  let retargetOnNextFrame = false;
  let loopTarget = null;
  let previousPauseAtReferences = null;
  let lastReplayDetail = null;

  const ICONS = Object.freeze({
    "previous-event": { text: "<", label: "Previous event" },
    "previous-hmi": { text: "<<", label: "Previous HMI" },
    "play-only": { text: "|>", label: "Play" },
    "next-hmi": { text: ">>", label: "Next HMI" },
    "next-event": { text: ">", label: "Next event" }
  });

  function finite(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function replayState() {
    state.servoReplay ||= {
      selectedIndex: 0,
      pauseAtReferences: true,
      lastFrameIndex: -1,
      lastPausedHmi: null,
      signature: ""
    };
    return state.servoReplay;
  }

  function setPlaying(playing) {
    state.isPlaying = Boolean(playing);
    if (state.isPlaying) {
      try { lastAnimationTime = performance.now(); } catch { /* global may not be writable */ }
    }
    if (typeof els !== "undefined" && els.playPause) {
      els.playPause.textContent = state.isPlaying ? "Pause" : "Play";
      els.playPause.setAttribute("aria-pressed", String(state.isPlaying));
    }
  }

  function updatePreviewAngle(angle) {
    const resolved = typeof norm === "function" ? norm(angle) : finite(angle, 0);
    state.previewAngle = resolved;
    if (typeof els !== "undefined") {
      if (els.previewAngle) els.previewAngle.value = resolved;
      if (els.tableAngleJump) {
        els.tableAngleJump.value = typeof fmt === "function" ? fmt(resolved, 1) : String(resolved);
      }
    }
    if (typeof renderAnimationFrame === "function") renderAnimationFrame();
    else {
      if (typeof renderMap === "function") renderMap();
      if (typeof renderSimulationMap === "function" && typeof simulationProgram === "function") {
        renderSimulationMap(simulationProgram());
      }
    }
  }

  function currentPanelSignature() {
    return document.querySelector("#simulation .servo-replay-panel")?.dataset.replaySignature || "";
  }

  function setLoopTarget(detail) {
    const frame = detail?.frame;
    if (!frame) return false;
    const replay = replayState();
    if (previousPauseAtReferences === null) previousPauseAtReferences = Boolean(replay.pauseAtReferences);
    replay.pauseAtReferences = false;
    replay.lastPausedHmi = null;
    loopTarget = {
      hmi: Number(frame.hmi),
      eventId: String(frame.eventId || ""),
      tableStart: finite(frame.tableStart, 0),
      tableEnd: finite(frame.tableEnd, finite(frame.tableStart, 0)),
      index: Number(detail?.snapshot?.index ?? replay.selectedIndex ?? 0),
      signature: currentPanelSignature()
    };
    replay.selectedIndex = loopTarget.index;
    updatePreviewAngle(loopTarget.tableStart);
    setPlaying(true);
    updateControlState();
    return true;
  }

  function disableLoop({ pause = true } = {}) {
    const replay = replayState();
    loopTarget = null;
    retargetOnNextFrame = false;
    resetPending = false;
    if (previousPauseAtReferences !== null) replay.pauseAtReferences = previousPauseAtReferences;
    previousPauseAtReferences = null;
    if (pause) setPlaying(false);
    updateControlState();
  }

  function restartLoopTarget() {
    if (!loopTarget || resetPending) return;
    resetPending = true;
    window.requestAnimationFrame(() => {
      resetPending = false;
      if (!loopTarget) return;
      const replay = replayState();
      replay.selectedIndex = loopTarget.index;
      replay.lastFrameIndex = loopTarget.index;
      replay.lastPausedHmi = null;
      updatePreviewAngle(loopTarget.tableStart);
      setPlaying(true);
    });
  }

  function ensureExtraButtons(controls) {
    let play = controls.querySelector('[data-replay-action="play-only"]');
    if (!play) {
      play = controls.querySelector('[data-replay-action="play-pause"]');
      if (play) play.dataset.replayAction = "play-only";
    }
    if (!play) return;

    if (!controls.querySelector('[data-replay-loop-control="pause"]')) {
      play.insertAdjacentHTML("beforebegin", '<button type="button" class="secondary-button servo-replay-icon-button" data-replay-loop-control="pause" title="Pause" aria-label="Pause">||</button>');
    }
    if (!controls.querySelector('[data-replay-loop-control="loop"]')) {
      play.insertAdjacentHTML("afterend", '<button type="button" class="secondary-button servo-replay-icon-button servo-replay-loop-button" data-replay-loop-control="loop" title="Loop selected HMI" aria-label="Loop selected HMI" aria-pressed="false">↻</button>');
    }
  }

  function applyIcons(controls) {
    const originalPlay = controls.querySelector('[data-replay-action="play-pause"]');
    if (originalPlay) originalPlay.dataset.replayAction = "play-only";
    Object.entries(ICONS).forEach(([action, spec]) => {
      const button = controls.querySelector(`[data-replay-action="${action}"]`);
      if (!button) return;
      button.textContent = spec.text;
      button.title = spec.label;
      button.setAttribute("aria-label", spec.label);
      button.classList.add("servo-replay-icon-button");
    });
  }

  function decoratePanel() {
    decoratePending = false;
    const panel = document.querySelector("#simulation .servo-replay-panel");
    const controls = panel?.querySelector(".servo-replay-controls");
    if (!controls) return;
    ensureExtraButtons(controls);
    applyIcons(controls);
    updateControlState();
  }

  function scheduleDecorate() {
    if (decoratePending) return;
    decoratePending = true;
    window.requestAnimationFrame(decoratePanel);
  }

  function updateControlState() {
    const panel = document.querySelector("#simulation .servo-replay-panel");
    if (!panel) return;
    const loopButton = panel.querySelector('[data-replay-loop-control="loop"]');
    if (loopButton) {
      loopButton.classList.toggle("is-active", Boolean(loopTarget));
      loopButton.setAttribute("aria-pressed", String(Boolean(loopTarget)));
      loopButton.title = loopTarget
        ? `Stop looping HMI ${loopTarget.hmi}`
        : "Loop selected HMI";
      loopButton.setAttribute("aria-label", loopButton.title);
    }
    const pauseReference = panel.querySelector("[data-replay-pause-reference]");
    if (pauseReference) {
      pauseReference.disabled = Boolean(loopTarget);
      if (loopTarget) pauseReference.checked = false;
      else pauseReference.checked = Boolean(replayState().pauseAtReferences);
    }
    const pauseLabel = pauseReference?.closest("label");
    if (pauseLabel) {
      pauseLabel.title = loopTarget
        ? "Pause at references is temporarily disabled while one HMI is looping."
        : "Pause playback at reference rows.";
    }
  }

  function handleControlClick(event) {
    const panel = event.target.closest?.("#simulation .servo-replay-panel");
    if (!panel) return;

    const special = event.target.closest("[data-replay-loop-control]")?.dataset.replayLoopControl;
    if (special === "pause") {
      event.preventDefault();
      event.stopImmediatePropagation();
      disableLoop({ pause: true });
      return;
    }
    if (special === "loop") {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (loopTarget) disableLoop({ pause: true });
      else setLoopTarget(lastReplayDetail);
      return;
    }

    const action = event.target.closest("[data-replay-action]")?.dataset.replayAction;
    if (action === "play-only") {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (loopTarget) restartLoopTarget();
      else setPlaying(true);
      return;
    }

    if (loopTarget && ["previous-event", "previous-hmi", "next-hmi", "next-event"].includes(action)) {
      retargetOnNextFrame = true;
    }
  }

  function handleSelectionChange(event) {
    if (!loopTarget || !event.target.closest?.("#simulation [data-replay-event-select]")) return;
    retargetOnNextFrame = true;
  }

  function handleReplayFrame(event) {
    lastReplayDetail = event.detail || null;
    scheduleDecorate();
    if (!loopTarget) return;

    if (retargetOnNextFrame) {
      retargetOnNextFrame = false;
      setLoopTarget(lastReplayDetail);
      return;
    }

    const signature = currentPanelSignature();
    if (loopTarget.signature && signature && signature !== loopTarget.signature) {
      disableLoop({ pause: true });
      return;
    }

    const frame = event.detail?.frame;
    const snapshot = event.detail?.snapshot;
    const activeHmi = Number(frame?.hmi);
    if (activeHmi !== loopTarget.hmi || finite(snapshot?.progress, 0) >= END_PROGRESS) {
      restartLoopTarget();
      return;
    }

    if (!state.isPlaying) setPlaying(true);
    updateControlState();
  }

  function installStyles() {
    if (document.querySelector("#servoReplayLoopControlStyles")) return;
    const style = document.createElement("style");
    style.id = "servoReplayLoopControlStyles";
    style.textContent = `
      #simulation .servo-replay-controls{grid-template-columns:repeat(7,30px) minmax(190px,1fr) auto;align-items:end}
      #simulation .servo-replay-controls .servo-replay-icon-button{display:grid;place-items:center;width:30px;min-width:30px;min-height:28px;padding:3px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px;font-weight:900;line-height:1;white-space:nowrap}
      #simulation .servo-replay-controls .servo-replay-loop-button.is-active{border-color:var(--green);background:color-mix(in srgb,var(--green) 28%,var(--panel));color:var(--green);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--green) 62%,transparent)}
      #simulation .servo-replay-controls [data-replay-pause-reference]:disabled{opacity:.55}
      @media(max-width:1100px){#simulation .servo-replay-controls{grid-template-columns:repeat(7,30px) minmax(150px,1fr)}#simulation .servo-replay-controls>label{grid-column:auto}#simulation .servo-replay-controls>label:first-of-type{grid-column:1/-1}}
      @media(max-width:620px){#simulation .servo-replay-controls{grid-template-columns:repeat(7,minmax(28px,1fr))}#simulation .servo-replay-controls .servo-replay-icon-button{width:100%;min-width:0}#simulation .servo-replay-controls>label{grid-column:1/-1}}
    `;
    document.head.appendChild(style);
  }

  function install() {
    if (installed) return true;
    const host = document.querySelector("#simulation");
    if (typeof state === "undefined" || !host) return false;
    installed = true;
    installStyles();
    document.addEventListener("click", handleControlClick, true);
    document.addEventListener("change", handleSelectionChange, true);
    window.addEventListener("servoforge:replay-frame", handleReplayFrame);
    observer = new MutationObserver(scheduleDecorate);
    observer.observe(host, { childList: true, subtree: true });
    scheduleDecorate();
    return true;
  }

  function wait() {
    if (install()) return;
    window.setTimeout(wait, RETRY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait, { once: true });
  else wait();
})();
