"use strict";

(function installIncrementalRotationProfile() {
  const PROFILE_ID = "incremental-rotations";
  const RETRY_MS = 25;
  let installed = false;
  let generationWrapped = false;
  let programWrapped = false;
  let profileApplyPending = false;
  let pausedWorkbench = null;

  const PROFILE = Object.freeze({
    id: PROFILE_ID,
    name: "Incremental Rotations",
    description: "Continues bottle rotation between compatible TopModul processes instead of reversing to the shortest signed orientation. Inside wipe-down support is required on both active members of an aggregate pair; unsafe candidates retain the normal referenced path.",
    machineProfile: "DEFAULT",
    intents: ["Hold", "Rotate", "Rotate", "Hold"],
    builtIn: true,
    plannerStrategy: PROFILE_ID
  });

  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function activeMap() {
    return typeof activeMachineMap === "function" ? activeMachineMap() : null;
  }

  function selectedProfileId() {
    return String(state.selectedMotionProfileId || state.defaultMotionProfileId || "automatic");
  }

  function profileSelected() {
    return selectedProfileId() === PROFILE_ID;
  }

  function selectedProfile() {
    const profiles = typeof allMotionProfiles === "function" ? allMotionProfiles() : [];
    return profiles.find((profile) => profile?.id === selectedProfileId()) || profiles[0] || null;
  }

  function installProfileEntry() {
    if (typeof allMotionProfiles !== "function" || allMotionProfiles.incrementalRotationProfile) return;
    const before = allMotionProfiles;
    const wrapped = function allMotionProfilesWithIncrementalRotations(...args) {
      const profiles = before.apply(this, args);
      return profiles.some((profile) => profile?.id === PROFILE_ID) ? profiles : [...profiles, PROFILE];
    };
    wrapped.incrementalRotationProfile = true;
    allMotionProfiles = wrapped;
    window.allMotionProfiles = wrapped;
  }

  function patchPlanner(name) {
    const driver = window[name];
    if (!driver?.buildPlan || driver.incrementalRotationProfile) return;
    const before = driver.buildPlan.bind(driver);
    window[name] = Object.freeze({
      ...driver,
      incrementalRotationProfile: true,
      buildPlan(rows, options = {}) {
        if (String(options.profileId || "").toLowerCase() !== PROFILE_ID) return before(rows, options);
        const plan = before(rows, { ...options, profileId: "rest-correction" });
        return {
          ...plan,
          requestedProfileId: PROFILE_ID,
          profileId: PROFILE_ID,
          incrementalRotationStrategy: true,
          steps: (plan.steps || []).map((step) => ({
            ...step,
            requestedProfileId: PROFILE_ID,
            profileId: PROFILE_ID,
            incrementalRotationStrategy: true,
            reason: `${step.reason || "Mechanical event planned."} Incremental Rotations keeps CMD 3/CMD 7 grammar and optimizes equivalent bottle angles.`
          }))
        };
      }
    });
  }

  function context() {
    const map = activeMap();
    return {
      map,
      machineType: map?.machineType || map?.name || "",
      applicationMode: state.applicationMode || map?.applicationMode || "apl",
      objects: map?.objects || [],
      aplObjects: state.aplMapObjects,
      coldGlueObjects: state.coldGlueMap,
      maxMoveRatio: state.maxMoveRatio,
      allowFallback: true
    };
  }

  function syncPlan(plan, rows, result) {
    if (!plan || !Array.isArray(plan.steps)) return;
    plan.profileId = PROFILE_ID;
    plan.requestedProfileId = PROFILE_ID;
    plan.incrementalRotation = result;
    plan.steps = rows.map((row, index) => ({
      ...(plan.steps[index] || {}),
      index,
      hmi: row.hmi ?? index + 1,
      plc: row.plc ?? index,
      tableAngle: number(row.tableAngle),
      plateAngle: number(row.plateAngle),
      tableEnd: number(rows[index + 1]?.tableAngle, number(row.tableAngle)),
      plateTarget: number(rows[index + 1]?.plateAngle, number(row.plateAngle)),
      action: String(row.action || ""),
      recommendedCommand: Number(row.cmd),
      intent: row.plannerIntent || (Number(row.cmd) === 7 ? "ROTATE" : "HOLD"),
      reason: row.plannerReason || "",
      incrementalRotation: Boolean(row.incrementalRotation),
      incrementalRotationDirection: row.incrementalRotationDirection || "",
      insideWipeObjectIds: row.incrementalRotationInsideObjectIds || []
    }));
  }

  function applyResult(result) {
    state.program = result.rows.map((row, index) => ({ ...row, hmi: index + 1, plc: index }));
    state.incrementalRotation = result;

    if (state.motionTranslation) {
      state.motionTranslation.rows = state.program;
      state.motionTranslation.profileId = PROFILE_ID;
      state.motionTranslation.requestedProfileId = PROFILE_ID;
      state.motionTranslation.incrementalRotation = result;
      syncPlan(state.motionTranslation.plan, state.program, result);
    }
    if (state.motionPlan) {
      state.motionPlan.rows = state.program;
      state.motionPlan.incrementalRotation = result;
      if (state.motionPlan.translation) {
        state.motionPlan.translation.profileId = PROFILE_ID;
        state.motionPlan.translation.requestedProfileId = PROFILE_ID;
        state.motionPlan.translation.incrementalRotation = result;
      }
      syncPlan(state.motionPlan.planner, state.program, result);
    }
    syncPlan(state.plannerPreview, state.program, result);

    const grammar = window.LabelerMachineFamilyGrammarDriver;
    if (grammar?.annotateCorrectionChains) {
      const annotated = grammar.annotateCorrectionChains(state.program, {
        ...context(),
        rows: state.program,
        family: "TOPMODUL",
        machineFamily: "TOPMODUL"
      });
      state.program = annotated.rows;
      state.machineFamilyGrammar = {
        family: annotated.family,
        rule: annotated.rule,
        chains: annotated.chains,
        chainCount: annotated.chains.length
      };
      if (state.motionTranslation) state.motionTranslation.rows = state.program;
      if (state.motionPlan) state.motionPlan.rows = state.program;
      syncPlan(state.motionTranslation?.plan, state.program, result);
      syncPlan(state.motionPlan?.planner, state.program, result);
      syncPlan(state.plannerPreview, state.program, result);
    }
  }

  function runTransform() {
    if (!profileSelected() || !Array.isArray(state.program) || !state.program.length) {
      state.incrementalRotation = null;
      return null;
    }
    const result = window.LabelerIncrementalRotationDriver?.transform?.(state.program, context());
    if (result) applyResult(result);
    return result;
  }

  function pauseWorkbenchMutationLoop() {
    const workbench = document.querySelector(".servo-motion-workbench");
    if (!workbench || workbench.classList.contains("servo-motion-workbench-paused")) return;
    pausedWorkbench = workbench;
    workbench.classList.remove("servo-motion-workbench");
    workbench.classList.add("servo-motion-workbench-paused");
  }

  function resumeWorkbenchMutationLoop() {
    const workbench = pausedWorkbench || document.querySelector(".servo-motion-workbench-paused");
    if (!workbench) return;
    workbench.classList.remove("servo-motion-workbench-paused");
    workbench.classList.add("servo-motion-workbench");
    pausedWorkbench = null;
  }

  function setMapInteraction(active) {
    state.mapPointerInteractionActive = Boolean(active);
    document.documentElement.classList.toggle("map-pointer-interaction-active", Boolean(active));
    if (active) pauseWorkbenchMutationLoop();
    else resumeWorkbenchMutationLoop();
  }

  function installMapInteractionGuard() {
    const svg = document.querySelector("#mapSvg");
    if (!svg || svg.dataset.incrementalInteractionGuard === "true") return;
    svg.dataset.incrementalInteractionGuard = "true";
    svg.style.touchAction = "none";

    svg.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      setMapInteraction(true);
    }, true);

    const finish = () => setMapInteraction(false);
    svg.addEventListener("pointerup", finish, true);
    svg.addEventListener("pointercancel", finish, true);
    svg.addEventListener("lostpointercapture", finish, true);
    window.addEventListener("blur", finish);
  }

  function installGenerationHook() {
    if (generationWrapped || typeof applyGeneratedServoProfile !== "function") return;
    generationWrapped = true;
    const before = applyGeneratedServoProfile;
    applyGeneratedServoProfile = function applyGeneratedServoProfileWithIncrementalRotations(...args) {
      if (state.mapPointerInteractionActive) {
        state.mapProfileRegenerationPending = true;
        return state.program;
      }
      const output = before.apply(this, args);
      state.mapProfileRegenerationPending = false;
      runTransform();
      return output;
    };
  }

  function summary(result) {
    const profile = selectedProfile();
    if (!profile) return "No motion profile is available.";
    if (profile.id !== PROFILE_ID) return `${profile.name} applied to the generated servo program.`;
    if (!result) return "Incremental Rotations selected. Regenerate the servo program to evaluate the active map.";
    if (!result.eligible) return result.fallbacks?.[0]?.message || "The active machine does not support this strategy.";
    if (!result.applied) return result.fallbacks?.length
      ? `The normal referenced path was retained. ${result.fallbacks.map((item) => item.message).join(" ")}`
      : "The current path already follows a compatible direction; no equivalent turn was required.";
    const before = result.baselineMetrics;
    const after = result.incrementalMetrics;
    return `${result.appliedMoves.length} continued turn${result.appliedMoves.length === 1 ? "" : "s"} applied. Direction reversals ${before.directionReversals} → ${after.directionReversals}; total rotation ${before.totalAbsoluteRotation.toFixed(1)}° → ${after.totalAbsoluteRotation.toFixed(1)}°; maximum ratio ${before.maximumRatio.toFixed(1)}:1 → ${after.maximumRatio.toFixed(1)}:1.`;
  }

  function panelMarkup(result) {
    const applied = result?.appliedMoves || [];
    const fallbacks = result?.fallbacks || [];
    const status = !result || !result.eligible ? "REVIEW" : result.applied ? "ACTIVE" : fallbacks.length ? "FALLBACK" : "READY";
    return `<section class="incremental-rotation-panel" data-status="${status}">
      <div class="incremental-rotation-head"><div><h2>Incremental Rotations</h2><p>Continuous equivalent turns between compatible TopModul processes.</p></div><span>${status}</span></div>
      <div class="incremental-rotation-summary">${escapeHtml(summary(result))}</div>
      ${applied.length ? `<details open><summary>Applied turns (${applied.length})</summary><div class="incremental-rotation-list">${applied.map((move) => `<article><strong>HMI ${move.hmi} • Aggregate ${move.departingAggregate}${move.destinationAggregate ? ` → ${move.destinationAggregate}` : ""}</strong><span>${escapeHtml(move.message)}</span><small>Inside support: ${escapeHtml(move.insideWipeObjectNames.join(", ") || "mapped inner wipe")}</small></article>`).join("")}</div></details>` : ""}
      ${fallbacks.length ? `<details${applied.length ? "" : " open"}><summary>Safe fallbacks (${fallbacks.length})</summary><div class="incremental-rotation-list">${fallbacks.map((item) => `<article><strong>${item.hmi ? `HMI ${item.hmi}` : "Profile"}</strong><span>${escapeHtml(item.message)}</span></article>`).join("")}</div></details>` : ""}
    </section>`;
  }

  function renderPanel() {
    const diagnostics = document.querySelector("#diagnostics");
    if (diagnostics) {
      diagnostics.querySelector(".incremental-rotation-panel")?.remove();
      const anchor = diagnostics.querySelector('[data-diagnostics-slot="timeline"]')
        || diagnostics.querySelector('[data-diagnostics-slot="optimizer"]')
        || diagnostics.querySelector(".diagnostics-overview");
      anchor?.insertAdjacentHTML("afterend", panelMarkup(state.incrementalRotation));
    }

    const summaryNode = document.querySelector("#motionProfileSummary");
    if (summaryNode) {
      summaryNode.textContent = summary(state.incrementalRotation);
      summaryNode.dataset.profileApplied = selectedProfileId();
    }

    const workbench = document.querySelector(".servo-motion-workbench, .servo-motion-workbench-paused");
    if (!workbench) return;
    let statusNode = workbench.querySelector(".motion-profile-application-status");
    if (!statusNode) {
      statusNode = document.createElement("div");
      statusNode.className = "motion-profile-application-status";
      workbench.querySelector("#motionProfileSummary")?.insertAdjacentElement("afterend", statusNode);
    }
    if (statusNode) {
      const result = state.incrementalRotation;
      statusNode.dataset.status = selectedProfileId() === PROFILE_ID
        ? result?.applied ? "ACTIVE" : result?.fallbacks?.length ? "FALLBACK" : "READY"
        : "ACTIVE";
      statusNode.textContent = summary(result);
    }
  }

  function regenerateSelectedProfile() {
    if (profileApplyPending) return;
    profileApplyPending = true;
    window.setTimeout(() => {
      profileApplyPending = false;
      try {
        applyGeneratedServoProfile();
        if (typeof saveCurrentSettings === "function") saveCurrentSettings();
        if (typeof render === "function") render();
        window.requestAnimationFrame(renderPanel);
      } catch (error) {
        console.error("Motion profile regeneration failed", error);
        const status = document.querySelector(".motion-profile-application-status");
        if (status) {
          status.dataset.status = "FAIL";
          status.textContent = `Unable to apply the selected motion profile: ${error.message}`;
        }
      }
    }, 0);
  }

  function installSelectionHandler() {
    if (document.documentElement.dataset.incrementalProfileSelection === "true") return;
    document.documentElement.dataset.incrementalProfileSelection = "true";
    document.addEventListener("change", (event) => {
      if (event.target?.id !== "motionProfileSelect") return;
      state.selectedMotionProfileId = String(event.target.value || "automatic");
      const profile = selectedProfile();
      const input = document.querySelector("#servoIntentInput");
      if (input && profile?.intents) input.value = profile.intents.join(", ");
      renderPanel();
      regenerateSelectedProfile();
    }, true);
  }

  function installStyles() {
    if (document.querySelector("#incrementalRotationStyles")) return;
    const style = document.createElement("style");
    style.id = "incrementalRotationStyles";
    style.textContent = `
      #mapSvg{touch-action:none;pointer-events:auto}
      .map-pointer-interaction-active #mapSvg{cursor:grabbing}
      .servo-motion-workbench-paused{width:100%;max-width:100%;box-sizing:border-box;overflow:hidden;margin:0 0 8px;padding:9px;border:1px solid var(--line);border-radius:9px;background:var(--panel);font-size:11px}
      .motion-profile-application-status{margin:0 0 7px;padding:6px 8px;border-left:3px solid var(--green);border-radius:5px;background:var(--input);font-size:9px;line-height:1.3}
      .motion-profile-application-status[data-status="FALLBACK"]{border-left-color:#d79a3c;color:#ffc56b}
      .motion-profile-application-status[data-status="FAIL"]{border-left-color:#d85b5b;color:#ff8181}
      .incremental-rotation-panel{margin:0 0 7px;padding:8px;border:1px solid var(--line);border-radius:8px;background:var(--panel);font-size:9px}
      .incremental-rotation-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.incremental-rotation-head h2,.incremental-rotation-head p{margin:0}.incremental-rotation-head h2{font-size:13px}.incremental-rotation-head p{margin-top:2px;color:var(--muted);font-size:8px}.incremental-rotation-head>span{padding:3px 7px;border:1px solid var(--green);border-radius:999px;color:var(--green);font-size:8px;font-weight:800}.incremental-rotation-panel[data-status="FALLBACK"] .incremental-rotation-head>span,.incremental-rotation-panel[data-status="REVIEW"] .incremental-rotation-head>span{border-color:#d79a3c;color:#ffc56b}
      .incremental-rotation-summary{margin-top:6px;padding:6px 7px;border-left:3px solid var(--green);border-radius:5px;background:var(--input);line-height:1.3}.incremental-rotation-panel details{margin-top:6px;border:1px solid var(--line);border-radius:6px;background:var(--panel-hi)}.incremental-rotation-panel summary{padding:5px 7px;cursor:pointer;font-weight:700}.incremental-rotation-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;padding:0 7px 7px}.incremental-rotation-list article{min-width:0;padding:6px;border-left:3px solid var(--green);border-radius:5px;background:var(--input)}.incremental-rotation-list strong,.incremental-rotation-list span,.incremental-rotation-list small{display:block;overflow-wrap:anywhere}.incremental-rotation-list span{margin-top:3px;line-height:1.25}.incremental-rotation-list small{margin-top:3px;color:var(--muted);font-size:7px}@media(max-width:700px){.incremental-rotation-list{grid-template-columns:1fr}.incremental-rotation-head{display:grid}.incremental-rotation-head>span{justify-self:start}}
    `;
    document.head.appendChild(style);
  }

  function installProgramHook() {
    if (programWrapped || typeof renderProgram !== "function") return;
    programWrapped = true;
    const before = renderProgram;
    renderProgram = function renderProgramWithIncrementalDiagnostics(...args) {
      const output = before.apply(this, args);
      window.requestAnimationFrame(renderPanel);
      return output;
    };
  }

  function install() {
    if (installed) return true;
    if (typeof state === "undefined"
      || typeof allMotionProfiles !== "function"
      || typeof applyGeneratedServoProfile !== "function"
      || !window.LabelerIncrementalRotationDriver) return false;

    installed = true;
    installProfileEntry();
    patchPlanner("LabelerMotionPlannerDriver");
    patchPlanner("LabelerMechanicalEventPlannerDriver");
    installGenerationHook();
    installMapInteractionGuard();
    installStyles();
    installProgramHook();
    installSelectionHandler();
    if (typeof render === "function") window.setTimeout(() => render(), 0);
    return true;
  }

  function waitForDependencies() {
    if (install()) return;
    window.setTimeout(waitForDependencies, RETRY_MS);
  }

  waitForDependencies();
})();
