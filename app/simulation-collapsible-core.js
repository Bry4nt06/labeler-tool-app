"use strict";

(function installSimulationCollapsiblePanels() {
  const STORAGE_KEY = "servoforge-simulation-panel-state-v1";
  const RETRY_MS = 25;
  const DEFINITIONS = Object.freeze([
    { key: "runtime", panelSelector: ".simulator-runtime", headSelector: ".simulator-runtime-head", defaultOpen: true },
    { key: "replay", panelSelector: ".servo-replay-panel", headSelector: ".servo-replay-head", defaultOpen: false },
    { key: "library", panelSelector: ".servo-profile-library", headSelector: ".servo-profile-library-head", defaultOpen: false }
  ]);

  let observer = null;
  let decorationPending = false;

  function readState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return saved && typeof saved === "object" ? saved : {};
    } catch {
      return {};
    }
  }

  function writeState(next) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { }
  }

  function sectionIsOpen(key, fallback) {
    const saved = readState();
    return typeof saved[key] === "boolean" ? saved[key] : fallback;
  }

  function setSectionOpen(panel, open, persist = true) {
    if (!panel) return;
    const key = panel.dataset.simulationSection;
    const body = panel.querySelector(":scope > .simulation-collapsible-body");
    const head = panel.querySelector(":scope > .simulation-collapsible-head");
    const caret = head?.querySelector(":scope > .simulation-collapse-caret");
    const resolved = Boolean(open);
    panel.classList.toggle("is-collapsed", !resolved);
    panel.dataset.collapsed = String(!resolved);
    if (body) body.hidden = !resolved;
    if (head) head.setAttribute("aria-expanded", String(resolved));
    if (caret) caret.textContent = resolved ? "▾" : "▸";
    if (persist && key) writeState({ ...readState(), [key]: resolved });
  }

  function bindHead(panel, head) {
    if (!head || head.dataset.simulationCollapseBound === "true") return;
    head.dataset.simulationCollapseBound = "true";
    head.classList.add("simulation-collapsible-head");
    head.setAttribute("role", "button");
    head.setAttribute("tabindex", "0");
    head.setAttribute("aria-controls", `${panel.dataset.simulationSection}-simulation-panel-body`);
    if (!head.querySelector(":scope > .simulation-collapse-caret")) {
      const caret = document.createElement("span");
      caret.className = "simulation-collapse-caret";
      caret.setAttribute("aria-hidden", "true");
      head.prepend(caret);
    }
    const toggle = () => setSectionOpen(panel, panel.classList.contains("is-collapsed"));
    head.addEventListener("click", (event) => {
      if (event.target.closest("button,input,select,textarea,a,label")) return;
      toggle();
    });
    head.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggle();
    });
  }

  function decoratePanel(host, definition) {
    const panel = host.querySelector(definition.panelSelector);
    if (!panel) return;
    if (panel.dataset.simulationCollapsible === "true") {
      setSectionOpen(panel, sectionIsOpen(definition.key, definition.defaultOpen), false);
      return;
    }
    const head = panel.querySelector(definition.headSelector);
    if (!head) return;
    panel.dataset.simulationCollapsible = "true";
    panel.dataset.simulationSection = definition.key;
    panel.classList.add("simulation-collapsible-panel");
    const body = document.createElement("div");
    body.className = "simulation-collapsible-body";
    body.id = `${definition.key}-simulation-panel-body`;
    while (head.nextSibling) body.appendChild(head.nextSibling);
    panel.appendChild(body);
    bindHead(panel, head);
    setSectionOpen(panel, sectionIsOpen(definition.key, definition.defaultOpen), false);
  }

  function setAllSections(host, open) {
    DEFINITIONS.forEach((definition) => {
      const panel = host.querySelector(definition.panelSelector);
      if (panel) setSectionOpen(panel, open);
      else writeState({ ...readState(), [definition.key]: Boolean(open) });
    });
  }

  function ensureToolbar(host) {
    let toolbar = host.querySelector(":scope > .simulation-collapse-toolbar");
    if (!toolbar) {
      toolbar = document.createElement("div");
      toolbar.className = "simulation-collapse-toolbar";
      toolbar.innerHTML = `<span>Simulation panels</span><div><button type="button" class="secondary-button" data-simulation-expand-all>Expand All</button><button type="button" class="secondary-button" data-simulation-collapse-all>Collapse All</button></div>`;
      toolbar.addEventListener("click", (event) => {
        if (event.target.closest("[data-simulation-expand-all]")) setAllSections(host, true);
        if (event.target.closest("[data-simulation-collapse-all]")) setAllSections(host, false);
      });
    }
    if (host.firstElementChild !== toolbar) host.prepend(toolbar);
  }

  function decorate() {
    decorationPending = false;
    const host = document.querySelector("#simulation");
    if (!host) return;
    ensureToolbar(host);
    DEFINITIONS.forEach((definition) => decoratePanel(host, definition));
  }

  function scheduleDecoration() {
    if (decorationPending) return;
    decorationPending = true;
    window.requestAnimationFrame(decorate);
  }

  function installStyles() {
    if (document.querySelector("#simulationCollapsibleStyles")) return;
    const style = document.createElement("style");
    style.id = "simulationCollapsibleStyles";
    style.textContent = `.simulation-collapse-toolbar{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 7px;padding:5px 7px;border:1px solid var(--line);border-radius:7px;background:var(--panel);font-size:8px;font-weight:700}.simulation-collapse-toolbar>div{display:flex;gap:5px}.simulation-collapse-toolbar button{min-height:24px;padding:3px 7px;font-size:8px}.simulation-collapsible-panel{overflow:hidden;transition:border-color .15s ease}.simulation-collapsible-head{position:relative;display:grid!important;grid-template-columns:auto minmax(0,1fr) auto;align-items:start!important;gap:7px!important;margin:0!important;padding:0!important;cursor:pointer;user-select:none;outline:none}.simulation-collapsible-head:focus-visible{box-shadow:0 0 0 2px var(--green);border-radius:5px}.simulation-collapse-caret{display:grid;place-items:center;width:17px;height:17px;margin-top:1px;border:1px solid var(--line);border-radius:4px;background:var(--input);color:var(--green);font-size:10px;line-height:1}.simulation-collapsible-body{margin-top:7px}.simulation-collapsible-body[hidden]{display:none!important}.simulation-collapsible-panel.is-collapsed{padding-bottom:8px}.simulation-collapsible-panel.is-collapsed .simulation-collapsible-head p{display:none}`;
    document.head.appendChild(style);
  }

  function install() {
    const host = document.querySelector("#simulation");
    if (!host) return false;
    installStyles();
    if (!observer) {
      observer = new MutationObserver(scheduleDecoration);
      observer.observe(host, { childList: true, subtree: true });
    }
    scheduleDecoration();
    return true;
  }

  function waitForSimulation() {
    if (install()) return;
    window.setTimeout(waitForSimulation, RETRY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", waitForSimulation, { once: true });
  else waitForSimulation();
})();

(function stabilizeWorkspaceTabInsertion() {
  if (Node.prototype.insertBefore.workspaceTabStabilityGuard) return;
  const originalInsertBefore = Node.prototype.insertBefore;
  function requestedOrderIsAlreadyApplied(tabs) {
    if (!(tabs instanceof Element) || !tabs.matches(".tabs")) return false;
    const builder = tabs.querySelector("#wipeDownBuilderButton");
    if (!builder) return false;
    const desired = [builder, ...["specs", "buildInputs", "program", "simulation", "diagnostics"].map((id) => tabs.querySelector(`[data-tab="${id}"]`)).filter(Boolean)];
    const current = [...tabs.children].filter((child) => desired.includes(child));
    return desired.length === current.length && desired.every((button, index) => current[index] === button);
  }
  const guardedInsertBefore = function guardedWorkspaceInsertBefore(newNode, referenceNode) {
    const tabMove = this instanceof Element && this.matches(".tabs") && newNode instanceof Element && newNode.classList.contains("tab") && referenceNode?.classList?.contains("simulation-actions-spacer");
    if (tabMove && requestedOrderIsAlreadyApplied(this)) return newNode;
    return originalInsertBefore.call(this, newNode, referenceNode);
  };
  guardedInsertBefore.workspaceTabStabilityGuard = true;
  Node.prototype.insertBefore = guardedInsertBefore;
})();

(function keepLockedMapBuilderAccessible() {
  const PREFS_KEY = "servoforge-developer-preferences-v1";
  const RETRY_MS = 50;
  let applyPending = false;
  let buttonObserver = null;
  let drawerObserver = null;

  function preferences() {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
      return saved && typeof saved === "object" ? saved : {};
    } catch { return {}; }
  }

  function activeMapLocked() {
    if (typeof activeMachineMap !== "function") return false;
    const map = activeMachineMap();
    const lockedIds = Array.isArray(preferences().lockedMapIds) ? preferences().lockedMapIds.map(String) : [];
    return Boolean(map?.id && lockedIds.includes(String(map.id)));
  }

  function panelManuallyHidden() {
    const hiddenPanels = Array.isArray(preferences().hiddenPanels) ? preferences().hiddenPanels.map(String) : [];
    return hiddenPanels.includes("mapBuilder");
  }

  function installStyles() {
    if (document.querySelector("#lockedMapBuilderAccessStyles")) return;
    const style = document.createElement("style");
    style.id = "lockedMapBuilderAccessStyles";
    style.textContent = `.map-builder-tab.locked-map-builder-view{border-color:#d79a3c;color:#ffc56b}.locked-builder-notice{margin:0 12px 10px;padding:9px 11px;border:1px solid #d79a3c;border-radius:7px;background:color-mix(in srgb,var(--panel) 84%,#d79a3c 16%);color:#ffc56b;font-size:10px;font-weight:700;line-height:1.35}.locked-builder-notice[hidden]{display:none!important}`;
    document.head.appendChild(style);
  }

  function applyDrawerReadOnly() {
    const drawer = document.querySelector("#applicationSetupDialog");
    if (!drawer) return;
    const locked = activeMapLocked();
    drawer.classList.toggle("read-only-surface", locked);
    let notice = drawer.querySelector("#lockedBuilderNotice");
    if (!notice) {
      notice = document.createElement("div");
      notice.id = "lockedBuilderNotice";
      notice.className = "locked-builder-notice";
      notice.textContent = "Read-only map: you can inspect this Map Builder setup, but changes are disabled until the map is unlocked in Settings.";
      drawer.querySelector(".dialog-head")?.insertAdjacentElement("afterend", notice);
    }
    notice.hidden = !locked;
    drawer.querySelectorAll("input,select,textarea,button").forEach((control) => {
      if (["closeApplicationSetup", "mapLibrarySelect", "exportMachineMap"].includes(control.id)) {
        control.disabled = false;
        return;
      }
      if (locked) {
        if (!control.disabled) {
          control.disabled = true;
          control.dataset.lockedBuilderOverlay = "true";
        }
      } else {
        if (control.hasAttribute("data-locked-builder-overlay")) delete control.dataset.lockedBuilderOverlay;
        if (control.hasAttribute("data-locked-builder-was-disabled")) delete control.dataset.lockedBuilderWasDisabled;
        if (!control.hasAttribute("data-developer-was-disabled")) control.disabled = false;
      }
    });
  }

  function restoreBuilderAccess() {
    applyPending = false;
    const button = document.querySelector("#wipeDownBuilderButton");
    if (!button) return;
    const locked = activeMapLocked();
    const hidden = panelManuallyHidden();
    if (!hidden) button.dataset.developerHidden = "false";
    button.disabled = false;
    button.setAttribute("aria-disabled", "false");
    button.textContent = "Map Builder";
    button.title = locked ? "Open Map Builder in read-only mode. Unlock the map in Settings to make changes." : "Open Map Builder";
    button.classList.toggle("locked-map-builder-view", locked);
    applyDrawerReadOnly();
  }

  function scheduleRestore() {
    if (applyPending) return;
    applyPending = true;
    window.requestAnimationFrame(restoreBuilderAccess);
  }

  function setBuilderOpen(open) {
    const resolved = Boolean(open);
    const drawer = document.querySelector("#applicationSetupDialog");
    state.wipeBuilderOpen = resolved;
    if (drawer) drawer.hidden = !resolved;
    document.querySelector("#mapRightRail")?.classList.toggle("builder-open", resolved);
    document.querySelector("#labelerMapReference")?.classList.toggle("builder-open", resolved);
    if (resolved) {
      if (typeof ensurePersistentApplicationMaps === "function") ensurePersistentApplicationMaps();
      if (typeof renderWipeDownBuilder === "function") renderWipeDownBuilder();
      window.requestAnimationFrame(applyDrawerReadOnly);
    }
    if (typeof saveCurrentSettings === "function") saveCurrentSettings();
  }

  function bindLockedBuilderClick() {
    if (document.documentElement.dataset.lockedBuilderAccessBound === "true") return;
    document.documentElement.dataset.lockedBuilderAccessBound = "true";
    document.addEventListener("click", (event) => {
      const button = event.target.closest?.("#wipeDownBuilderButton");
      if (!button || !activeMapLocked()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const drawer = document.querySelector("#applicationSetupDialog");
      setBuilderOpen(!(state.wipeBuilderOpen && drawer?.hidden === false));
      scheduleRestore();
    }, true);
  }

  function installObservers() {
    const button = document.querySelector("#wipeDownBuilderButton");
    const drawer = document.querySelector("#applicationSetupDialog");
    if (button && !buttonObserver) {
      buttonObserver = new MutationObserver(scheduleRestore);
      buttonObserver.observe(button, { attributes: true, attributeFilter: ["disabled", "aria-disabled", "title", "data-developer-hidden"], childList: true });
    }
    if (drawer && !drawerObserver) {
      drawerObserver = new MutationObserver(() => window.requestAnimationFrame(applyDrawerReadOnly));
      drawerObserver.observe(drawer, { childList: true, subtree: true });
    }
  }

  function install() {
    if (typeof state === "undefined" || typeof activeMachineMap !== "function") return false;
    if (!document.querySelector("#wipeDownBuilderButton") || !document.querySelector("#applicationSetupDialog")) return false;
    installStyles();
    bindLockedBuilderClick();
    installObservers();
    restoreBuilderAccess();
    window.setTimeout(scheduleRestore, 250);
    window.setTimeout(scheduleRestore, 1000);
    return true;
  }

  function waitForApplication() {
    if (install()) return;
    window.setTimeout(waitForApplication, RETRY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", waitForApplication, { once: true });
  else waitForApplication();
})();
