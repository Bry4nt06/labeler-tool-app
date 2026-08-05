"use strict";

(function installWorkspacePanelVisibilityGuard(global) {
  if (global.LabelerWorkspacePanelVisibilityGuard?.installed) return;

  const PREFS_KEY = "servoforge-developer-preferences-v1";
  const GUARDED_PANELS = Object.freeze(["simulation", "diagnostics"]);
  const FALLBACK_PANELS = Object.freeze(["specs", "buildInputs", "program"]);
  let applyPending = false;
  let observer = null;

  function readHiddenPanels() {
    try {
      const parsed = JSON.parse(global.localStorage?.getItem(PREFS_KEY) || "{}");
      return new Set(Array.isArray(parsed?.hiddenPanels) ? parsed.hiddenPanels.map(String) : []);
    } catch {
      return new Set();
    }
  }

  function targets(panelId) {
    const tabs = global.document?.querySelector(".tabs");
    return [
      tabs?.querySelector(`[data-tab="${panelId}"]`),
      global.document?.querySelector(`#${panelId}`)
    ].filter(Boolean);
  }

  function setHidden(target, shouldHide) {
    target.dataset.developerHidden = String(shouldHide);
    target.dataset.workspaceVisibilityGuard = shouldHide ? "hidden" : "visible";

    if (shouldHide) {
      target.style.setProperty("display", "none", "important");
      target.setAttribute("aria-hidden", "true");
      return;
    }

    target.style.removeProperty("display");
    target.removeAttribute("aria-hidden");
  }

  function activateFallback(hiddenPanels) {
    const activeHiddenPanel = GUARDED_PANELS.find((panelId) => {
      if (!hiddenPanels.has(panelId)) return false;
      const panel = global.document?.querySelector(`#${panelId}`);
      const tab = global.document?.querySelector(`.tabs [data-tab="${panelId}"]`);
      return panel?.classList?.contains("active")
        || tab?.classList?.contains("active")
        || String(global.state?.activeTab || "") === panelId;
    });
    if (!activeHiddenPanel) return;

    const fallback = FALLBACK_PANELS.find((panelId) => !hiddenPanels.has(panelId));
    if (!fallback) return;
    const fallbackTab = global.document?.querySelector(`.tabs [data-tab="${fallback}"]`);
    if (fallbackTab && typeof fallbackTab.click === "function") fallbackTab.click();
  }

  function apply() {
    applyPending = false;
    const hiddenPanels = readHiddenPanels();
    GUARDED_PANELS.forEach((panelId) => {
      const shouldHide = hiddenPanels.has(panelId);
      targets(panelId).forEach((target) => setHidden(target, shouldHide));
    });
    activateFallback(hiddenPanels);
  }

  function schedule() {
    if (applyPending) return;
    applyPending = true;
    const requestFrame = global.requestAnimationFrame || ((callback) => global.setTimeout(callback, 0));
    requestFrame(apply);
  }

  function observeWorkspace() {
    if (observer || !global.MutationObserver || !global.document?.body) return;
    observer = new global.MutationObserver((records) => {
      if (records.some((record) =>
        record.type === "childList"
        || (record.type === "attributes" && record.attributeName === "class")
      )) schedule();
    });
    observer.observe(global.document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  function installListeners() {
    global.document?.addEventListener("change", (event) => {
      if (event.target?.closest?.("[data-developer-panel]")) global.setTimeout(schedule, 0);
    }, true);
    global.document?.addEventListener("click", (event) => {
      if (event.target?.closest?.(".tabs [data-tab],[data-open-diagnostics],[data-open-simulation]")) {
        global.setTimeout(schedule, 0);
      }
    }, true);
    global.addEventListener?.("storage", (event) => {
      if (event.key === PREFS_KEY) schedule();
    });
  }

  global.LabelerWorkspacePanelVisibilityGuard = Object.freeze({
    installed: true,
    PREFS_KEY,
    GUARDED_PANELS,
    readHiddenPanels,
    targets,
    setHidden,
    apply,
    schedule
  });

  function start() {
    observeWorkspace();
    installListeners();
    apply();
    global.setTimeout(schedule, 250);
    global.setTimeout(schedule, 1000);
    global.setTimeout(schedule, 2000);
  }

  if (global.document?.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", start, { once: true });
  } else start();
})(typeof window !== "undefined" ? window : globalThis);
