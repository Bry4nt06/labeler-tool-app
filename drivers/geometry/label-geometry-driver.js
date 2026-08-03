(function installServoForgeStartupProgress(global) {
  "use strict";
  if (global.ServoForgeStartupProgress) return;

  const STYLE_ID = "servoforgeStartupProgressStyles";
  const OVERLAY_ID = "servoforgeStartupOverlay";
  let currentPercent = 0;
  let releaseTimer = null;

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      body.servoforge-initializing {
        overflow: hidden;
      }

      body.servoforge-initializing > .app,
      body.servoforge-initializing > .staging-environment-banner {
        visibility: hidden;
      }

      #${OVERLAY_ID} {
        --startup-progress: 0%;
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: grid;
        place-items: center;
        padding: 24px;
        color: var(--ink, #e6f0ed);
        background:
          radial-gradient(circle at 50% 34%, rgba(65, 200, 137, 0.18), transparent 30%),
          linear-gradient(145deg, var(--bg-a, #081017), var(--bg, #0b1218) 52%, var(--bg-b, #101b24));
        opacity: 1;
        transition: opacity 320ms ease, visibility 320ms ease;
      }

      #${OVERLAY_ID}.is-complete,
      #${OVERLAY_ID}.is-released {
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
      }

      #${OVERLAY_ID} .servoforge-startup-card {
        width: min(460px, calc(100vw - 40px));
        display: grid;
        gap: 18px;
        justify-items: center;
        padding: 30px 30px 26px;
        border: 1px solid var(--panel-accent, rgba(65, 200, 137, 0.32));
        border-radius: 18px;
        background:
          linear-gradient(150deg, rgba(255, 255, 255, 0.045), transparent 38%),
          color-mix(in srgb, var(--panel, #122029) 94%, transparent);
        box-shadow: 0 28px 80px rgba(0, 0, 0, 0.52), 0 0 48px rgba(65, 200, 137, 0.08);
        backdrop-filter: blur(12px);
      }

      #${OVERLAY_ID} .servoforge-startup-logo {
        position: relative;
        display: grid;
        place-items: center;
        width: 118px;
        height: 118px;
      }

      #${OVERLAY_ID} .servoforge-startup-logo::before {
        content: "";
        position: absolute;
        inset: -7px;
        border: 3px solid color-mix(in srgb, var(--line, #263943) 72%, transparent);
        border-top-color: var(--accent, var(--green, #41c889));
        border-right-color: var(--blue, #58aeca);
        border-radius: 50%;
        animation: servoforge-startup-spin 1.25s linear infinite;
        filter: drop-shadow(0 0 8px color-mix(in srgb, var(--accent, #41c889) 45%, transparent));
      }

      #${OVERLAY_ID} .servoforge-startup-logo img {
        width: 92px;
        height: 92px;
        border-radius: 20px;
        box-shadow: 0 14px 32px rgba(0, 0, 0, 0.42);
      }

      #${OVERLAY_ID} .servoforge-startup-copy {
        display: grid;
        gap: 5px;
        text-align: center;
      }

      #${OVERLAY_ID} .servoforge-startup-copy strong {
        font-size: clamp(22px, 5vw, 30px);
        letter-spacing: 0.015em;
      }

      #${OVERLAY_ID} .servoforge-startup-copy span {
        color: var(--muted, #91a7a3);
        font-size: 12px;
        letter-spacing: 0.11em;
        text-transform: uppercase;
      }

      #${OVERLAY_ID} .servoforge-startup-progress {
        width: 100%;
        display: grid;
        gap: 8px;
      }

      #${OVERLAY_ID} .servoforge-startup-track {
        position: relative;
        width: 100%;
        height: 12px;
        overflow: hidden;
        border: 1px solid var(--line, #263943);
        border-radius: 999px;
        background: var(--input, #091117);
        box-shadow: inset 0 2px 5px rgba(0, 0, 0, 0.42);
      }

      #${OVERLAY_ID} .servoforge-startup-fill {
        position: absolute;
        inset: 0 auto 0 0;
        width: var(--startup-progress);
        border-radius: inherit;
        background:
          linear-gradient(90deg, var(--green-dark, #1f7f58), var(--accent, var(--green, #41c889)), var(--blue, #58aeca));
        box-shadow: 0 0 16px color-mix(in srgb, var(--accent, #41c889) 54%, transparent);
        transition: width 300ms ease;
      }

      #${OVERLAY_ID} .servoforge-startup-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        color: var(--muted, #91a7a3);
        font-size: 12px;
      }

      #${OVERLAY_ID} .servoforge-startup-percent {
        flex: 0 0 auto;
        color: var(--ink, #e6f0ed);
        font-weight: 800;
        font-variant-numeric: tabular-nums;
      }

      #${OVERLAY_ID}.is-failed .servoforge-startup-logo::before {
        border-color: var(--red, #e66b6b);
        animation: none;
      }

      #${OVERLAY_ID}.is-failed .servoforge-startup-fill {
        background: var(--red, #e66b6b);
      }

      @keyframes servoforge-startup-spin {
        to { transform: rotate(360deg); }
      }

      @media (prefers-reduced-motion: reduce) {
        #${OVERLAY_ID},
        #${OVERLAY_ID} .servoforge-startup-fill {
          transition: none;
        }
        #${OVERLAY_ID} .servoforge-startup-logo::before {
          animation-duration: 2.8s;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureOverlay() {
    installStyles();
    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay && document.body) {
      overlay = document.createElement("div");
      overlay.id = OVERLAY_ID;
      overlay.setAttribute("role", "status");
      overlay.setAttribute("aria-live", "polite");
      overlay.setAttribute("aria-busy", "true");
      overlay.innerHTML = `
        <div class="servoforge-startup-card">
          <div class="servoforge-startup-logo"><img src="assets/labeler-tool-icon.svg" alt="ServoForge Labeler"></div>
          <div class="servoforge-startup-copy"><strong>ServoForge</strong><span>Initializing Labeler Tool</span></div>
          <div class="servoforge-startup-progress">
            <div class="servoforge-startup-track" role="progressbar" aria-label="ServoForge startup progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="servoforge-startup-fill"></div></div>
            <div class="servoforge-startup-meta"><span class="servoforge-startup-status">Loading core modules…</span><span class="servoforge-startup-percent">0%</span></div>
          </div>
        </div>`;
      document.body.prepend(overlay);
    }
    if (document.body) document.body.classList.add("servoforge-initializing");
    return overlay;
  }

  function set(percent, status) {
    const overlay = ensureOverlay();
    if (!overlay) return 0;
    const parsed = Number(percent);
    const next = Math.max(currentPercent, Math.min(100, Number.isFinite(parsed) ? parsed : currentPercent));
    currentPercent = next;
    overlay.style.setProperty("--startup-progress", `${next}%`);
    const track = overlay.querySelector("[role='progressbar']");
    const percentText = overlay.querySelector(".servoforge-startup-percent");
    const statusText = overlay.querySelector(".servoforge-startup-status");
    if (track) track.setAttribute("aria-valuenow", String(Math.round(next)));
    if (percentText) percentText.textContent = `${Math.round(next)}%`;
    if (statusText && status) statusText.textContent = String(status);
    return next;
  }

  function release(className, delay) {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      document.body?.classList.remove("servoforge-initializing");
      return;
    }
    if (releaseTimer) global.clearTimeout(releaseTimer);
    overlay.classList.add(className);
    overlay.setAttribute("aria-busy", "false");
    document.body?.classList.remove("servoforge-initializing");
    releaseTimer = global.setTimeout(() => overlay.remove(), delay);
  }

  function complete(status = "ServoForge ready") {
    set(100, status);
    release("is-complete", 380);
  }

  function fail(error) {
    const message = error?.message ? `Startup issue: ${error.message}` : "Startup issue detected";
    set(100, message);
    document.getElementById(OVERLAY_ID)?.classList.add("is-failed");
    release("is-released", 1050);
  }

  global.ServoForgeStartupProgress = Object.freeze({
    set,
    complete,
    fail,
    ensure: ensureOverlay,
    get percent() { return currentPercent; }
  });
  set(7, "Loading core modules…");
})(window);

(function (global) {
  "use strict";
  function finite(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
  function positive(value, fallback = null) { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : fallback; }
  function effectiveDiameterMm(bottle) { const d = positive(bottle?.diameterTargetMm); return d ? d - Math.max(0, finite(bottle?.radiusReductionMm)) * 2 : null; }
  function circumferenceFromDiameterMm(diameterMm) { const d = positive(diameterMm); return d ? Math.PI * d : null; }
  function bodyCircumferenceMm(bottle) { return circumferenceFromDiameterMm(effectiveDiameterMm(bottle)); }
  function degreesFromMm(lengthMm, circumferenceMm) { const c = positive(circumferenceMm); const l = Number(lengthMm); return c && Number.isFinite(l) ? (l / c) * 360 : null; }
  function mmFromDegrees(degrees, circumferenceMm) { const c = positive(circumferenceMm); const d = Number(degrees); return c && Number.isFinite(d) ? (d / 360) * c : null; }
  function tableDegreesFromArcMm(arcMm, pitchRadiusMm) { const r = positive(pitchRadiusMm); const a = Number(arcMm); return r && Number.isFinite(a) ? (a / (2 * Math.PI * r)) * 360 : null; }
  function tableArcMmFromDegrees(degrees, pitchRadiusMm) { const r = positive(pitchRadiusMm); const d = Number(degrees); return r && Number.isFinite(d) ? (d / 360) * 2 * Math.PI * r : null; }
  function scaleTableAngle(angle, options) { const current = positive(options?.currentPitchRadiusMm); const reference = positive(options?.referencePitchRadiusMm); const zero = finite(options?.zeroAngle, 0); const raw = Number(angle); return Number.isFinite(raw) && current && reference && options?.enabled !== false ? zero + (raw - zero) * (reference / current) : raw; }
  function encoderCountsFromPlateDegrees(plateDegrees, encoderCountsPerRev, gearRatio = 1) { const counts = positive(encoderCountsPerRev); const ratio = positive(gearRatio, 1); const deg = Number(plateDegrees); return counts && Number.isFinite(deg) ? (deg / 360) * counts * ratio : null; }
  function solveSection(options) {
    const mode = options?.mode === "leading-edge" ? "leading-edge" : "center-tack-two-stage";
    const labelDeg = degreesFromMm(options?.labelLengthMm, options?.circumferenceMm);
    const contactDeg = Math.max(0, finite(degreesFromMm(options?.contactMm, options?.circumferenceMm), 0));
    const explicitOverWipeDeg = Number(options?.overWipeDeg);
    const overWipeDeg = Math.max(0, Number.isFinite(explicitOverWipeDeg)
      ? explicitOverWipeDeg
      : finite(degreesFromMm(options?.overWipeMm, options?.circumferenceMm), 0));
    if (!Number.isFinite(labelDeg)) return null;
    if (mode === "center-tack-two-stage") {
      const stageRequired = labelDeg / 2 + overWipeDeg;
      return { mode, labelDeg, contactDeg, overWipeDeg, baseCoveragePerStage: labelDeg / 2, stageRequired, baseCoverageRequired: labelDeg, overWipeRequired: overWipeDeg * 2, totalRequired: stageRequired * 2, stages: [{ key: "outer", requiredRotation: stageRequired }, { key: "inner", requiredRotation: stageRequired }] };
    }
    // Workbook leading-edge sequence:
    //   1. back-spin by contact + one over-wipe allowance
    //   2. forward wipe by the full label + two over-wipe allowances
    const backSpinRequired = contactDeg + overWipeDeg;
    const forwardWipeRequired = labelDeg + overWipeDeg * 2;
    return { mode, labelDeg, contactDeg, overWipeDeg, contactSetDown: contactDeg, backSpinRequired, forwardWipeRequired, baseCoverageRequired: labelDeg + contactDeg, overWipeRequired: overWipeDeg * 3, stageRequired: forwardWipeRequired, totalRequired: backSpinRequired + forwardWipeRequired, stages: [{ key: "set-down", requiredRotation: backSpinRequired }, { key: "wipe", requiredRotation: forwardWipeRequired }] };
  }
  function planTwoSurfaceWipe(options) {
    const labelDeg = Math.max(0, finite(options?.labelDeg, 0));
    const totalRequired = Math.max(0, finite(options?.totalRequired, 0));
    const preferredOutside = Math.max(0, Math.min(totalRequired, finite(options?.preferredOutside, totalRequired / 2)));
    const outsideSpan = Math.max(0, finite(options?.outsideSpan, 0));
    const insideSpan = Math.max(0, finite(options?.insideSpan, 0));
    const maxRatio = positive(options?.maxRatio, 21);
    const safetyFactor = Math.min(0.98, Math.max(0.25, finite(options?.safetyFactor, 0.9)));
    const safeRatio = maxRatio * safetyFactor;
    const outsideCapacity = outsideSpan * safeRatio;
    const insideCapacity = insideSpan * safeRatio;
    const minimumOutside = Math.max(0, totalRequired - insideCapacity);
    const maximumOutside = Math.min(totalRequired, outsideCapacity);
    const outsideRotation = Math.min(maximumOutside, Math.max(minimumOutside, preferredOutside));
    const insideRotation = Math.max(0, totalRequired - outsideRotation);
    const shortfall = Math.max(0, totalRequired - outsideCapacity - insideCapacity);
    return {
      longWrap: labelDeg > 360,
      labelDeg,
      totalRequired,
      preferredOutside,
      outsideRotation,
      insideRotation,
      outsideSpan,
      insideSpan,
      outsideCapacity,
      insideCapacity,
      outsideRequiredTableSpan: outsideRotation / safeRatio,
      insideRequiredTableSpan: insideRotation / safeRatio,
      safeRatio,
      shortfall,
      fits: shortfall <= 0.001
    };
  }
  function planColdGlueSection(options) {
    const labelDeg = Math.max(0, finite(options?.labelDeg, 0));
    const overWipeDeg = Math.max(0, finite(options?.overWipeDeg, 0));
    const maxRatio = positive(options?.maxRatio, 21);
    const safetyFactor = Math.min(0.98, Math.max(0.25, finite(options?.safetyFactor, 0.9)));
    const windows = Array.isArray(options?.windows) ? options.windows.map((window) => ({
      ...window,
      span: Math.max(0, finite(window?.end) - finite(window?.start))
    })) : [];
    const halfCoverage = labelDeg / 2;
    const stageRequired = halfCoverage + overWipeDeg;
    const fullWrap = labelDeg >= 330;
    const outside = windows.filter((window) => window.stage === "outer");
    const inside = windows.filter((window) => window.stage === "inner");

    function allocate(required, candidates) {
      let remaining = Math.max(0, required);
      const allocations = [];
      const usable = candidates.filter((window) => window.span > 0);
      const totalSpan = usable.reduce((sum, window) => sum + window.span, 0);
      usable.forEach((window, index) => {
        const capacity = window.span * maxRatio * safetyFactor;
        const proportional = totalSpan > 0 ? required * (window.span / totalSpan) : 0;
        const amount = index === usable.length - 1
          ? Math.min(capacity, remaining)
          : Math.min(capacity, remaining, proportional);
        allocations.push({ ...window, rotation: amount, ratio: window.span > 0 ? amount / window.span : Infinity });
        remaining -= amount;
      });
      if (remaining > 0.001 && usable.length) {
        for (const allocation of allocations) {
          const capacity = allocation.span * maxRatio * safetyFactor;
          const spare = Math.max(0, capacity - allocation.rotation);
          const add = Math.min(spare, remaining);
          allocation.rotation += add;
          allocation.ratio = allocation.rotation / allocation.span;
          remaining -= add;
          if (remaining <= 0.001) break;
        }
      }
      return { allocations, remaining: Math.max(0, remaining) };
    }

    const outsidePlan = allocate(stageRequired, outside);
    // After the outside brush carries the center-tacked label slightly past
    // one edge, the plate reverses through the complete label and both
    // over-wipe allowances to finish slightly past the opposite edge.
    const insideRequired = labelDeg + overWipeDeg * 2;
    const insideCandidates = fullWrap ? inside : inside.filter((window) => window.role !== "final-neck");
    const insidePlan = allocate(insideRequired, insideCandidates.length ? insideCandidates : inside);
    const issues = [];
    if (outsidePlan.remaining > 0.001) issues.push({ level: "bad", code: "cold-glue-outer-capacity", message: `Outside brush windows are short by ${outsidePlan.remaining.toFixed(1)} deg of bottle rotation.` });
    if (insidePlan.remaining > 0.001) issues.push({ level: "bad", code: "cold-glue-inner-capacity", message: `Inside brush windows are short by ${insidePlan.remaining.toFixed(1)} deg of bottle rotation.` });
    return {
      labelDeg, overWipeDeg, halfCoverage, stageRequired, fullWrap,
      outside: outsidePlan.allocations, inside: insidePlan.allocations,
      insideRequired, totalRequired: stageRequired + insideRequired,
      issues
    };
  }
  global.LabelerGeometryDriver = { effectiveDiameterMm, circumferenceFromDiameterMm, bodyCircumferenceMm, degreesFromMm, mmFromDegrees, tableDegreesFromArcMm, tableArcMmFromDegrees, scaleTableAngle, encoderCountsFromPlateDegrees, solveSection, planTwoSurfaceWipe, planColdGlueSection };
})(window);
