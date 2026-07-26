"use strict";

(function connectProfileTranslator() {
  const TRANSLATOR_RELEASE_VERSION = "0.7.96";
  const LEGACY_COMMANDS = new Set([3, 7]);
  let profileRenderPending = false;
  let workbenchRefreshPending = false;

  function selectedTranslatorProfile() {
    const profiles = typeof allMotionProfiles === "function" ? allMotionProfiles() : [];
    const selectedId = state.selectedMotionProfileId || state.defaultMotionProfileId || "automatic";
    return profiles.find((profile) => profile.id === selectedId) || profiles[0] || {
      id: "automatic",
      name: "Automatic",
      description: "Uses the active machine profile.",
      machineProfile: "AUTO",
      intents: [],
      builtIn: true
    };
  }

  function translatorMachineProfile(profile) {
    return typeof resolveProfileMachine === "function" ? resolveProfileMachine(profile) : "DEFAULT";
  }

  function syncTranslatedRows(result, normalizedRows) {
    result.rows = normalizedRows;
    result.plan = {
      ...(result.plan || {}),
      steps: normalizedRows.map((row, index) => ({
        ...(result.plan?.steps?.[index] || {}),
        index,
        eventId: row.motionEventId || `EV${String(index + 1).padStart(3, "0")}`,
        eventType: row.motionEventType || "GENERAL",
        hmi: row.hmi ?? index + 1,
        tableAngle: Number(row.tableAngle),
        plateAngle: Number(row.plateAngle),
        action: String(row.action || ""),
        baseCommand: Number(row.baseCmd ?? row.cmd),
        requestedCommand: Number(row.plannerRequestedCommand ?? row.cmd),
        recommendedCommand: Number(row.cmd),
        recommendedCommandName: row.translatedCommandName || `CMD ${row.cmd}`,
        intent: row.plannerIntent || (Number(row.cmd) === 7 ? "ROTATE" : "HOLD"),
        reason: row.plannerReason || "",
        fallbackUsed: Boolean(row.plannerFallbackUsed),
        fallbackReason: String(row.plannerFallbackReason || "")
      }))
    };
    return result;
  }

  function buildAndTranslateProgram() {
    const planner = window.LabelerMotionPlannerDriver;
    const translator = window.LabelerProfileTranslatorDriver;
    if (!planner?.buildPlan || !translator?.translate || !Array.isArray(state.program)) return null;

    const profile = selectedTranslatorProfile();
    const requestedProfileId = profile.id || "automatic";
    const machineProfile = translatorMachineProfile(profile);
    const plan = planner.buildPlan(state.program, {
      profileId: requestedProfileId,
      machineProfile,
      customIntents: profile.builtIn ? [] : profile.intents || []
    });
    const result = translator.translate(state.program, plan, {
      requestedProfileId,
      profileId: plan.profileId,
      machineProfile
    });

    state.program = result.rows;
    if (typeof normalizeServoProgramTableAngles === "function") {
      const normalized = normalizeServoProgramTableAngles(state.program);
      state.program = normalized.rows;
      state.tableAngleSequence = {
        valid: true,
        minimumStep: normalized.minimumStep,
        adjustedRows: normalized.adjustedRows,
        adjustedCount: normalized.adjustedRows.length
      };
      syncTranslatedRows(result, state.program);
    }

    state.motionPlan = {
      ...(state.motionPlan || {}),
      planner: result.plan,
      translation: {
        requestedProfileId: result.requestedProfileId,
        profileId: result.profileId,
        machineProfile: result.machineProfile,
        translated: result.translated,
        translatedCount: result.translatedCount,
        advancedCommandsApplied: result.advancedCommandsApplied,
        advancedCount: result.advancedCount,
        fallbackCount: result.fallbackCount,
        commandSummary: result.commandSummary,
        issues: result.issues
      }
    };
    state.motionTranslation = result;
    return result;
  }

  function installTranslatorAwareCommandValidation() {
    const baseDriver = window.LabelerServoCommandDriver;
    if (!baseDriver || baseDriver.translatorAwareValidation) return;

    function validateTranslatedReferences(rows, tolerance = 0.001) {
      const sourceRows = Array.isArray(rows) ? rows : [];
      const usesAdvancedCommands = sourceRows.some((row) => !LEGACY_COMMANDS.has(Number(row?.cmd)));
      if (!usesAdvancedCommands) return baseDriver.validateReferences(sourceRows, tolerance);

      const issues = [];
      sourceRows.forEach((row, index) => {
        const command = Number(row?.cmd);
        const definition = baseDriver.moveDefinition(command);
        const machineProfile = String(row?.translatedMachineProfile || state.motionTranslation?.machineProfile || "DEFAULT").toUpperCase();
        if (!definition) {
          issues.push({
            level: "bad",
            code: "unknown-translated-command",
            hmi: row?.hmi ?? index + 1,
            message: `HMI ${row?.hmi ?? index + 1} uses unknown CMD ${row?.cmd}.`
          });
          return;
        }
        if (!baseDriver.profileSupportsMove(machineProfile, command)) {
          issues.push({
            level: "bad",
            code: "unsupported-translated-command",
            hmi: row?.hmi ?? index + 1,
            message: `HMI ${row?.hmi ?? index + 1} uses ${definition.name} (CMD ${command}), which is not enabled for ${machineProfile}.`
          });
        }
        if (index > 0 && Number(row.tableAngle) <= Number(sourceRows[index - 1].tableAngle) + tolerance) {
          issues.push({
            level: "bad",
            code: "translated-table-order",
            hmi: row?.hmi ?? index + 1,
            message: `HMI ${row?.hmi ?? index + 1} must have a table angle greater than the preceding command.`
          });
        }
      });

      const finalRow = sourceRows[sourceRows.length - 1];
      if (sourceRows.length && !(Number(finalRow?.cmd) === 3 && (finalRow?.terminalRest === true || /end\s*(?:of\s*)?curve|end curve.*rest/i.test(String(finalRow?.action || ""))))) {
        issues.push({
          level: "bad",
          code: "translated-terminal-rest",
          hmi: finalRow?.hmi,
          message: "The translated servo curve must finish with Rest (CMD 3) at End Curve."
        });
      }
      return issues;
    }

    window.LabelerServoCommandDriver = Object.freeze({
      ...baseDriver,
      validateGrammar: validateTranslatedReferences,
      validateReferences: validateTranslatedReferences,
      translatorAwareValidation: true
    });
  }

  function persistMotionProfileSelection() {
    if (typeof settingsSnapshot === "function") {
      const settingsSnapshotBeforeProfiles = settingsSnapshot;
      settingsSnapshot = function settingsSnapshotWithMotionProfiles(...args) {
        return {
          ...settingsSnapshotBeforeProfiles.apply(this, args),
          selectedMotionProfileId: state.selectedMotionProfileId || "automatic",
          defaultMotionProfileId: state.defaultMotionProfileId || "automatic"
        };
      };
    }

    if (typeof loadSavedSettings === "function") {
      const loadSavedSettingsBeforeProfiles = loadSavedSettings;
      loadSavedSettings = function loadSavedSettingsWithMotionProfiles(...args) {
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
    const workbench = document.querySelector(".servo-motion-workbench");
    if (!workbench) return;
    const profile = selectedTranslatorProfile();
    const result = state.motionTranslation;
    const headingCopy = workbench.querySelector(".servo-motion-head p");
    const statusBadge = workbench.querySelector(".servo-motion-status");
    const summary = workbench.querySelector("#motionProfileSummary");
    if (headingCopy) headingCopy.textContent = "The selected profile now drives planner intents and the generated CMD program.";

    const machineName = window.LabelerServoCommandDriver?.profileDefinition?.(result?.machineProfile || translatorMachineProfile(profile))?.name
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

  installTranslatorAwareCommandValidation();
  persistMotionProfileSelection();
  installProfileSelectionRegeneration();
  installTranslatorStyles();

  if (typeof applyGeneratedServoProfile === "function") {
    const applyGeneratedServoProfileBeforeTranslation = applyGeneratedServoProfile;
    applyGeneratedServoProfile = function applyGeneratedServoProfileWithTranslation(...args) {
      const output = applyGeneratedServoProfileBeforeTranslation.apply(this, args);
      buildAndTranslateProgram();
      scheduleWorkbenchRefresh();
      return output;
    };
  }

  if (typeof currentMechanicalMotionPlan === "function") {
    const currentMechanicalMotionPlanBeforeTranslation = currentMechanicalMotionPlan;
    currentMechanicalMotionPlan = function currentAppliedMechanicalMotionPlan(...args) {
      return state.motionTranslation?.plan || currentMechanicalMotionPlanBeforeTranslation.apply(this, args);
    };
  }

  if (typeof validate === "function") {
    const validateBeforeTranslation = validate;
    validate = function validateWithTranslation(...args) {
      const notes = validateBeforeTranslation.apply(this, args);
      const translator = window.LabelerProfileTranslatorDriver;
      if (!translator?.validate || !state.motionTranslation) return notes;
      translator.validate(state.motionTranslation).forEach((issue) => {
        notes.push([issue.level, issue.message]);
      });
      return notes;
    };
  }

  const observer = new MutationObserver(scheduleWorkbenchRefresh);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  const versionMeta = document.querySelector('meta[name="application-version"]');
  if (versionMeta) versionMeta.content = TRANSLATOR_RELEASE_VERSION;
  const versionStatus = document.querySelector("#updateCheckStatus");
  if (versionStatus) versionStatus.textContent = `Version ${TRANSLATOR_RELEASE_VERSION} • Updates are checked automatically.`;
})();
