"use strict";

(function installLocalPersistenceController(global) {
  if (global.LabelerLocalPersistenceController?.installed) return;

  const DEBOUNCE_MS = 300;
  const AUDIT_MS = 2000;
  const VOLATILE_SNAPSHOT_KEYS = Object.freeze([
    "previewAngle",
    "previewBottleAngle"
  ]);

  let initialized = false;
  let suspended = false;
  let saveTimer = 0;
  let auditTimer = 0;
  let lastFingerprint = "";

  function currentSnapshot() {
    if (typeof settingsSnapshot !== "function") return null;
    try {
      return settingsSnapshot();
    } catch (error) {
      console.error("Unable to create the local workspace snapshot", error);
      return null;
    }
  }

  function fingerprint(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return "";
    const durable = { ...snapshot };
    VOLATILE_SNAPSHOT_KEYS.forEach((key) => delete durable[key]);
    try {
      return JSON.stringify(durable);
    } catch (error) {
      console.error("Unable to compare the local workspace snapshot", error);
      return "";
    }
  }

  function savedFingerprint() {
    if (typeof readStorage !== "function" || typeof SETTINGS_KEY !== "string") return "";
    const raw = readStorage(SETTINGS_KEY);
    if (!raw) return "";
    try {
      return fingerprint(JSON.parse(raw));
    } catch {
      return "";
    }
  }

  function persist(snapshot) {
    if (!snapshot || typeof writeStorage !== "function" || typeof SETTINGS_KEY !== "string") return false;
    const ok = writeStorage(SETTINGS_KEY, JSON.stringify(snapshot));
    if (typeof state !== "undefined") state.builderSaveState = ok ? "saved" : "failed";
    if (!ok && typeof els !== "undefined" && els.builderStatus) {
      els.builderStatus.textContent = "Save failed • Browser storage unavailable";
    }
    return ok;
  }

  function flush() {
    if (!initialized || suspended) return false;
    if (saveTimer) {
      global.clearTimeout(saveTimer);
      saveTimer = 0;
    }

    const snapshot = currentSnapshot();
    const nextFingerprint = fingerprint(snapshot);
    if (!nextFingerprint || nextFingerprint === lastFingerprint) return false;
    if (!persist(snapshot)) return false;

    lastFingerprint = nextFingerprint;
    return true;
  }

  function schedule() {
    if (!initialized || suspended) return false;
    if (saveTimer) global.clearTimeout(saveTimer);
    saveTimer = global.setTimeout(flush, DEBOUNCE_MS);
    return true;
  }

  function handleVisibilityChange() {
    if (global.document?.visibilityState === "hidden") flush();
  }

  function initialize() {
    if (initialized) return true;
    if (typeof settingsSnapshot !== "function") return false;

    initialized = true;
    lastFingerprint = savedFingerprint();

    global.document?.addEventListener("input", schedule, true);
    global.document?.addEventListener("change", schedule, true);
    global.document?.addEventListener("click", schedule, true);
    global.document?.addEventListener("visibilitychange", handleVisibilityChange);
    global.addEventListener("pagehide", flush, { capture: true });
    auditTimer = global.setInterval(flush, AUDIT_MS);

    // Reconciled company defaults and startup migrations may have changed the
    // in-memory workspace after the original saved settings were restored.
    flush();
    return true;
  }

  function suspend() {
    suspended = true;
    if (saveTimer) {
      global.clearTimeout(saveTimer);
      saveTimer = 0;
    }
    return true;
  }

  function resume(options = {}) {
    suspended = false;
    if (options.flushNow !== false) flush();
    return true;
  }

  function destroy() {
    suspend();
    if (auditTimer) {
      global.clearInterval(auditTimer);
      auditTimer = 0;
    }
    global.document?.removeEventListener("input", schedule, true);
    global.document?.removeEventListener("change", schedule, true);
    global.document?.removeEventListener("click", schedule, true);
    global.document?.removeEventListener("visibilitychange", handleVisibilityChange);
    global.removeEventListener("pagehide", flush, { capture: true });
    initialized = false;
    return true;
  }

  global.LabelerLocalPersistenceController = Object.freeze({
    installed: true,
    initialize,
    schedule,
    flush,
    suspend,
    resume,
    destroy,
    fingerprint,
    get initialized() { return initialized; },
    get suspended() { return suspended; }
  });
})(window);
