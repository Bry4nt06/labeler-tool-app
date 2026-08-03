"use strict";

(function installProductionMotionProfileReference(global) {
  const STORAGE_KEY = "servoforge-staging-motion-profiles-v1";
  const PROFILE_ID = "production-continuous-reference-v1";
  const pattern = global.LabelerProductionMotionPatternDriver?.PATTERNS?.CONTINUOUS_SPEED_CHANGE;
  if (!pattern) throw new Error("Production motion pattern driver must load before its profile reference.");

  function readProfiles() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeProfiles(profiles) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
      return true;
    } catch {
      return false;
    }
  }

  function referenceProfile() {
    return {
      id: PROFILE_ID,
      name: "Production Continuous Reference",
      description: "Observed HMI chain: Rest (3) → Startup (1) → Continuous (5) → Changeover (6) → Continuous (5) → End (2) → Rest (3). Preview/reference only; automatic production generation remains on the validated 3/7 strategy until machine-specific timing rules are supplied.",
      machineProfile: "MULTIMODUL_FUTURE",
      intents: [...pattern.intents],
      builtIn: true,
      readOnly: true,
      evidence: pattern.source,
      commandPattern: [...pattern.commands]
    };
  }

  function reconcile() {
    const profiles = readProfiles();
    const reference = referenceProfile();
    const index = profiles.findIndex((profile) => profile?.id === PROFILE_ID);
    if (index >= 0) profiles[index] = { ...profiles[index], ...reference };
    else profiles.push(reference);
    return writeProfiles(profiles);
  }

  reconcile();

  global.LabelerProductionMotionProfileReference = Object.freeze({
    profileId: PROFILE_ID,
    pattern,
    referenceProfile,
    reconcile
  });
})(window);
