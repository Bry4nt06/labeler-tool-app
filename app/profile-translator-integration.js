"use strict";

(function connectProfileTranslatorUi() {
  let profileRenderPending = false;
  let workbenchRefreshPending = false;
  let installed = false;

  function translationService() {
    return window.LabelerProfileTranslationService || null;
  }

  function persistMotionProfileSelection() {
    if (typeof settingsSnapshot === "function" && !settingsSnapshot.motionProfilePersistenceInstalled) {
      const settingsSnapshotBeforeProfiles = settingsSnapshot;
      const wrapped = function settingsSnapshotWithMotionProfiles(...args) {
        return {
          ...settingsSnapshotBeforeProfiles.apply(this, args),
          selectedMotionProfileId: state.selectedMotionProfileId || "automatic",
          defaultMotionProfileId: state.defaultMotionProfileId || "automatic"
        };
      };
      wrapped.motionProfilePersistenceInstalled = true;
      wrapped.previousSettingsSnapshot = settingsSnapshotBeforeProfiles;
      settingsSnapshot = wrapped;
      window.settingsSnapshot = wrapped;
    }

    if (typeof loadSavedSettings === "function" && !loadSavedSettings.motionProfilePersistenceInstalled) {
      const loadSavedSettingsBeforeProfiles = loadSavedSettings;
      const wrapped = function loadSavedSettingsWithMotionProfiles(...args) {
        const result = loadSavedSettingsBeforeProfiles.apply(this, args);
        try {
          const saved = JSON.parse(readStorage(SETTINGS_KEY) || "{}");
          if (typeof saved.selectedMotionProfileId === "string") state.selectedMotionProfileId = saved.selectedMotionProfileId;
          if (typeof saved.defaultMotionProfileId === "string") state.defaultMotionProfileId = saved.defaultMotionProfileId;
        } catch {
          // Continue with the built-in Automatic profile.
        }
        return result;
      };
      wrapped.motionProfilePersistenceInstalled = true;
      wrapped.previousLoadSavedSettings = loadSavedSettingsBeforeProfiles;
      loadSavedSettings = wrapped;
      window.loadSavedSettings = wrapped;
    }
  }

  function scheduleProfileRegeneration() {
    if (profileRenderPending) return;
    profileRenderPending = true;
    window.setTimeout(() => {
      profileRenderPending = false;
      if (typeof saveCurrentSettings === "function") saveCurrentSettings();
      if (typeof render === "function") render();
    }, 0);
  }

  function installProfileSelectionRegeneration() {
    document.addEventListener("change", (event) => {
      if (event.target?.id !== "motionProfileSelect") return;
      scheduleProfileRegeneration();
    }, true);
    document.addEventListener("click", (event) => {
      if (event.target?.id !== "setDefaultMotionProfile") return;
      scheduleProfileRegeneration();
    }, true);
  }

  function installTranslatorStyles() {
    if (document.querySelector("#profileTranslatorStyles")) return;
    const style = document.createElement("style");
    style.id = "profileTranslatorStyles";
    style.textContent = `
      .profile-translator-status { margin-top:6px;padding:6px 8px;border:1px solid var(--line);border-radius:7px;background:var(--panel-hi);font-size:9px;line-height:1.3; }
      .profile-translator-status strong { color:var(--green); }
      .profile-translator-status[data-level="warn"] strong { color:#ffc56b; }
    `;
    document.head.appendChild(style);
  }

  function refreshTranslatorWorkbench() {
    const service = translationService();
    const workbench = document.querySelector(".servo-motion-workbench");
    if (!service || !workbench) return;
    const profile = service.selectedProfile();
    const result = state.motionTranslation;
    const headingCopy = workbench.querySelector(".servo-motion-head p");
    const statusBadge = workbench.querySelector(".servo-motion-status");
    const summary = workbench.querySelector("#motionProfileSummary");
    if (headingCopy) headingCopy.textContent = "The selected profile now drives planner intents and the generated CMD program.";

    const machineName = window.LabelerServoCommandDriver?.profileDefinition?.(result?.machineProfile || service.machineProfile(profile))?.name
      || result?.machineProfile
      || "Machine profile";
    const modeText = result?.advancedCommandsApplied
      ? `${result.advancedCount} advanced CMD${result.advancedCount === 1 ? "" : "s"}`
      : "Rest / Correction";
    if (statusBadge) statusBadge.textContent = `${machineName} • ${modeText}`;

    let translatorStatus = workbench.querySelector(".profile-translator-status");
    if (!translatorStatus) {
      translatorStatus = document.createElement("div");
      translatorStatus.className = "profile-translator-status";
      summary?.insertAdjacentElement("afterend", translatorStatus);
    }
    if (!translatorStatus) return;
    const fallbackCount = Number(result?.fallbackCount || 0);
    translatorStatus.dataset.level = fallbackCount ? "warn" : "ok";
    translatorStatus.innerHTML = result
      ? `<strong>${profile.name || result.requestedProfileId} applied.</strong> ${result.translatedCount} command row${result.translatedCount === 1 ? "" : "s"} translated; ${fallbackCount} fallback${fallbackCount === 1 ? "" : "s"}. Final command remains CMD 3 Rest.`
      : `<strong>${profile.name || "Automatic"} selected.</strong> The translator will apply when the servo program is generated.`;
  }

  function scheduleWorkbenchRefresh() {
    if (workbenchRefreshPending) return;
    workbenchRefreshPending = true;
    window.requestAnimationFrame(() => {
      workbenchRefreshPending = false;
      refreshTranslatorWorkbench();
    });
  }

  function installAppliedPlanView() {
    if (typeof currentMechanicalMotionPlan !== "function" || currentMechanicalMotionPlan.translationPlanViewInstalled) return;
    const currentMechanicalMotionPlanBeforeTranslation = currentMechanicalMotionPlan;
    const wrapped = function currentAppliedMechanicalMotionPlan(...args) {
      return state.motionTranslation?.plan || currentMechanicalMotionPlanBeforeTranslation.apply(this, args);
    };
    wrapped.translationPlanViewInstalled = true;
    wrapped.previousCurrentMechanicalMotionPlan = currentMechanicalMotionPlanBeforeTranslation;
    currentMechanicalMotionPlan = wrapped;
    window.currentMechanicalMotionPlan = wrapped;
  }

  function install() {
    if (installed) return true;
    if (!translationService()) return false;
    installed = true;

    persistMotionProfileSelection();
    installProfileSelectionRegeneration();
    installTranslatorStyles();
    installAppliedPlanView();
    window.addEventListener("servoforge:profile-translated", scheduleWorkbenchRefresh);

    const observer = new MutationObserver(scheduleWorkbenchRefresh);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    scheduleWorkbenchRefresh();
    return true;
  }

  function start() {
    Promise.resolve(window.ServoForgeProfileGenerationReady)
      .then(() => {
        if (!install()) window.setTimeout(start, 25);
      })
      .catch((error) => console.error("Unable to initialize profile translator UI.", error));
  }

  start();
})();
