"use strict";

(function installMotionProfileRegenerationIntegration() {
  const RETRY_MS = 50;
  let installed = false;
  let regenerationPending = false;
  let renderingProgram = false;

  function activeMapSafe() {
    try {
      return typeof activeMachineMap === "function" ? activeMachineMap() : null;
    } catch {
      return null;
    }
  }

  function actualMachineProfile() {
    const map = activeMapSafe();
    const identity = `${map?.machineType || ""} ${map?.name || ""}`.toUpperCase();
    if (identity.includes("MULTIMODUL")) return "MULTIMODUL_FUTURE";
    if (identity.includes("AUTOCOL")) return "AUTOCOL_FUTURE";
    return state?.applicationMode === "cold-glue" ? "COLD_GLUE" : "APL";
  }

  function machineDisplayName(profileName = actualMachineProfile()) {
    return window.LabelerServoCommandDriver?.profileDefinition?.(profileName)?.name
      || (profileName === "APL" ? "TopModul APL" : profileName.replaceAll("_", " "));
  }

  function profileById(profileId) {
    const profiles = typeof allMotionProfiles === "function" ? allMotionProfiles() : [];
    return profiles.find((profile) => profile.id === profileId) || profiles[0] || null;
  }

  function normalizedIntent(value) {
    return window.LabelerMotionPlannerDriver?.normalizeIntentName?.(value)
      || String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  }

  function requestedCommands(profile) {
    const commands = window.LabelerMotionPlannerDriver?.INTENT_COMMANDS || {};
    return (profile?.intents || [])
      .map(normalizedIntent)
      .map((intent) => Number(commands[intent]))
      .filter(Number.isFinite);
  }

  function profileSupported(profile, machineProfile = actualMachineProfile()) {
    if (!profile) return false;
    if (["automatic", "rest-correction"].includes(String(profile.id))) return true;
    const driver = window.LabelerServoCommandDriver;
    if (!driver?.profileSupportsMove) return false;
    const requested = requestedCommands(profile);
    return requested.length > 0 && requested.every((command) => driver.profileSupportsMove(machineProfile, command));
  }

  function supportedSelection(profileId) {
    const profile = profileById(profileId);
    return profileSupported(profile) ? profileId : "rest-correction";
  }

  function installMachineAuthority() {
    const authoritativeResolver = function resolveMotionProfileMachineFromActiveMap() {
      return actualMachineProfile();
    };
    authoritativeResolver.motionProfileMachineAuthority = true;
    try { resolveProfileMachine = authoritativeResolver; } catch { }
    window.resolveProfileMachine = authoritativeResolver;
  }

  function decorateProfileOptions() {
    const select = document.querySelector("#motionProfileSelect");
    if (!select) return;
    const machineProfile = actualMachineProfile();
    const machineName = machineDisplayName(machineProfile);

    [...select.options].forEach((option) => {
      const profile = profileById(option.value);
      const supported = profileSupported(profile, machineProfile);
      option.disabled = !supported;
      const baseName = String(profile?.name || option.textContent || option.value).replace(/\s+—\s+unavailable.*$/i, "");
      option.textContent = supported ? baseName : `${baseName} — unavailable for ${machineName}`;
    });

    if (!profileSupported(profileById(select.value), machineProfile)) {
      select.value = "rest-correction";
      state.selectedMotionProfileId = "rest-correction";
    }

    const workbench = select.closest(".servo-motion-workbench");
    const heading = workbench?.querySelector(".servo-motion-head p");
    if (heading) {
      heading.textContent = ["APL", "COLD_GLUE"].includes(machineProfile)
        ? `${machineName} currently supports Rest (CMD 3) and Correction (CMD 7). Selecting a supported profile rebuilds the generated program from the active map.`
        : `Selecting a motion profile rebuilds the generated program from the active map and applies commands supported by ${machineName}.`;
    }
  }

  function refreshGeneratedViews() {
    if (typeof renderProgram === "function" && !renderingProgram) {
      renderingProgram = true;
      try { renderProgram(); } finally { renderingProgram = false; }
    }
    try { if (typeof renderSimulation === "function") renderSimulation(); } catch { }
    try { if (typeof renderValidation === "function") renderValidation(); } catch { }
    try { if (typeof renderWipeDownData === "function") renderWipeDownData(); } catch { }
    try { if (typeof updateMapAnimationFrame === "function") updateMapAnimationFrame(); } catch { }
    decorateProfileOptions();
  }

  function regenerate(profileId, { persist = true } = {}) {
    if (regenerationPending) return;
    regenerationPending = true;
    window.setTimeout(() => {
      regenerationPending = false;
      const selectedId = supportedSelection(profileId || state.selectedMotionProfileId || state.defaultMotionProfileId || "automatic");
      state.selectedMotionProfileId = selectedId;
      installMachineAuthority();
      try {
        if (typeof applyGeneratedServoProfile === "function") applyGeneratedServoProfile();
        if (persist && typeof saveCurrentSettings === "function") saveCurrentSettings();
        refreshGeneratedViews();
      } catch (error) {
        console.error("Unable to regenerate the servo program for the selected motion profile.", error);
      }
    }, 0);
  }

  function installEvents() {
    document.addEventListener("change", (event) => {
      if (event.target?.id !== "motionProfileSelect") return;
      const requestedId = event.target.value;
      const selectedId = supportedSelection(requestedId);
      if (selectedId !== requestedId) event.target.value = selectedId;
      state.selectedMotionProfileId = selectedId;
      regenerate(selectedId);
    }, false);

    document.addEventListener("click", (event) => {
      if (event.target?.id !== "setDefaultMotionProfile") return;
      const selectedId = supportedSelection(document.querySelector("#motionProfileSelect")?.value || "automatic");
      state.defaultMotionProfileId = selectedId;
      state.selectedMotionProfileId = selectedId;
      regenerate(selectedId);
    }, false);
  }

  function installRenderHook() {
    if (typeof injectServoMotionWorkbench !== "function" || injectServoMotionWorkbench.motionProfileRegeneration) return;
    const base = injectServoMotionWorkbench;
    injectServoMotionWorkbench = function injectServoMotionWorkbenchWithMachineProfiles(...args) {
      const result = base.apply(this, args);
      decorateProfileOptions();
      return result;
    };
    injectServoMotionWorkbench.motionProfileRegeneration = true;
    window.injectServoMotionWorkbench = injectServoMotionWorkbench;
  }

  function install() {
    if (installed) return true;
    if (typeof state === "undefined"
      || typeof applyGeneratedServoProfile !== "function"
      || typeof allMotionProfiles !== "function"
      || !window.LabelerServoCommandDriver
      || !window.LabelerMotionPlannerDriver) return false;

    installed = true;
    installMachineAuthority();
    installEvents();
    installRenderHook();

    const currentId = state.selectedMotionProfileId || state.defaultMotionProfileId || "automatic";
    const selectedId = supportedSelection(currentId);
    state.selectedMotionProfileId = selectedId;
    if (state.defaultMotionProfileId && !profileSupported(profileById(state.defaultMotionProfileId))) {
      state.defaultMotionProfileId = "rest-correction";
    }
    decorateProfileOptions();
    regenerate(selectedId, { persist: selectedId !== currentId });
    return true;
  }

  function wait() {
    if (!install()) window.setTimeout(wait, RETRY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait, { once: true });
  else wait();
})();
