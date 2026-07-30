"use strict";

(function installSimulationCollapsibleCore() {
  const STORAGE_KEY = "servoforge-simulation-panel-state-v1";
  const RETRY_MS = 40;
  const definitions = [
    ["runtime", ".simulator-runtime", ".simulator-runtime-head", true],
    ["replay", ".servo-replay-panel", ".servo-replay-head", false],
    ["library", ".servo-profile-library", ".servo-profile-library-head", false]
  ];
  let observer;
  let pending = false;

  function read() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
  }
  function write(key, open) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...read(), [key]: Boolean(open) })); } catch { }
  }
  function setOpen(panel, open, persist = true) {
    if (!panel) return;
    const body = panel.querySelector(":scope > .simulation-collapsible-body");
    const head = panel.querySelector(":scope > .simulation-collapsible-head");
    const caret = head?.querySelector(":scope > .simulation-collapse-caret");
    panel.classList.toggle("is-collapsed", !open);
    panel.dataset.collapsed = String(!open);
    if (body) body.hidden = !open;
    if (head) head.setAttribute("aria-expanded", String(open));
    if (caret) caret.textContent = open ? "▾" : "▸";
    if (persist && panel.dataset.simulationSection) write(panel.dataset.simulationSection, open);
  }
  function decoratePanel(host, [key, panelSelector, headSelector, defaultOpen]) {
    const panel = host.querySelector(panelSelector);
    if (!panel) return;
    if (panel.dataset.simulationCollapsible === "true") {
      setOpen(panel, typeof read()[key] === "boolean" ? read()[key] : defaultOpen, false);
      return;
    }
    const head = panel.querySelector(headSelector);
    if (!head) return;
    panel.dataset.simulationCollapsible = "true";
    panel.dataset.simulationSection = key;
    panel.classList.add("simulation-collapsible-panel");
    head.classList.add("simulation-collapsible-head");
    head.setAttribute("role", "button");
    head.setAttribute("tabindex", "0");
    const caret = document.createElement("span");
    caret.className = "simulation-collapse-caret";
    caret.setAttribute("aria-hidden", "true");
    head.prepend(caret);
    const body = document.createElement("div");
    body.className = "simulation-collapsible-body";
    while (head.nextSibling) body.appendChild(head.nextSibling);
    panel.appendChild(body);
    const toggle = () => setOpen(panel, panel.classList.contains("is-collapsed"));
    head.addEventListener("click", (event) => { if (!event.target.closest("button,input,select,textarea,a,label")) toggle(); });
    head.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggle();
    });
    setOpen(panel, typeof read()[key] === "boolean" ? read()[key] : defaultOpen, false);
  }
  function decorate() {
    pending = false;
    const host = document.querySelector("#simulation");
    if (!host) return;
    let toolbar = host.querySelector(":scope > .simulation-collapse-toolbar");
    if (!toolbar) {
      toolbar = document.createElement("div");
      toolbar.className = "simulation-collapse-toolbar";
      toolbar.innerHTML = '<span>Simulation panels</span><div><button type="button" class="secondary-button" data-simulation-expand-all>Expand All</button><button type="button" class="secondary-button" data-simulation-collapse-all>Collapse All</button></div>';
      toolbar.addEventListener("click", (event) => {
        const open = Boolean(event.target.closest("[data-simulation-expand-all]"));
        if (!open && !event.target.closest("[data-simulation-collapse-all]")) return;
        definitions.forEach(([key, selector]) => {
          const panel = host.querySelector(selector);
          if (panel) setOpen(panel, open);
          else write(key, open);
        });
      });
    }
    if (host.firstElementChild !== toolbar) host.prepend(toolbar);
    definitions.forEach((definition) => decoratePanel(host, definition));
  }
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(decorate);
  }
  function install() {
    const host = document.querySelector("#simulation");
    if (!host) return false;
    if (!document.querySelector("#simulationCollapsibleStyles")) {
      const style = document.createElement("style");
      style.id = "simulationCollapsibleStyles";
      style.textContent = `.simulation-collapse-toolbar{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 7px;padding:5px 7px;border:1px solid var(--line);border-radius:7px;background:var(--panel);font-size:8px;font-weight:700}.simulation-collapse-toolbar>div{display:flex;gap:5px}.simulation-collapse-toolbar button{min-height:24px;padding:3px 7px;font-size:8px}.simulation-collapsible-panel{overflow:hidden}.simulation-collapsible-head{display:grid!important;grid-template-columns:auto minmax(0,1fr) auto;align-items:start!important;gap:7px!important;margin:0!important;padding:0!important;cursor:pointer}.simulation-collapse-caret{display:grid;place-items:center;width:17px;height:17px;border:1px solid var(--line);border-radius:4px;background:var(--input);color:var(--green)}.simulation-collapsible-body{margin-top:7px}.simulation-collapsible-body[hidden]{display:none!important}.simulation-collapsible-panel.is-collapsed{padding-bottom:8px}.simulation-collapsible-panel.is-collapsed .simulation-collapsible-head p{display:none}`;
      document.head.appendChild(style);
    }
    if (!observer) {
      observer = new MutationObserver(schedule);
      observer.observe(host, { childList: true, subtree: true });
    }
    schedule();
    return true;
  }
  (function wait() { if (!install()) setTimeout(wait, RETRY_MS); })();
})();

(function keepLockedMapBuilderAccessible() {
  const PREFS_KEY = "servoforge-developer-preferences-v1";
  const RETRY_MS = 50;
  let pending = false;
  let buttonObserver;
  let drawerObserver;
  function preferences() {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}"); } catch { return {}; }
  }
  function locked() {
    if (typeof activeMachineMap !== "function") return false;
    const id = activeMachineMap()?.id;
    return Boolean(id && (preferences().lockedMapIds || []).map(String).includes(String(id)));
  }
  function hidden() { return (preferences().hiddenPanels || []).map(String).includes("mapBuilder"); }
  function installStyles() {
    if (document.querySelector("#lockedMapBuilderAccessStyles")) return;
    const style = document.createElement("style");
    style.id = "lockedMapBuilderAccessStyles";
    style.textContent = `.map-builder-tab.locked-map-builder-view{border-color:#d79a3c;color:#ffc56b}.locked-builder-notice{margin:0 12px 10px;padding:9px 11px;border:1px solid #d79a3c;border-radius:7px;background:color-mix(in srgb,var(--panel) 84%,#d79a3c 16%);color:#ffc56b;font-size:10px;font-weight:700}.locked-builder-notice[hidden]{display:none!important}`;
    document.head.appendChild(style);
  }
  function applyReadOnly() {
    const drawer = document.querySelector("#applicationSetupDialog");
    if (!drawer) return;
    const isLocked = locked();
    let notice = drawer.querySelector("#lockedBuilderNotice");
    if (!notice) {
      notice = document.createElement("div");
      notice.id = "lockedBuilderNotice";
      notice.className = "locked-builder-notice";
      notice.textContent = "Read-only map: inspect this Map Builder setup, or unlock the map in Settings to make changes.";
      drawer.querySelector(".dialog-head")?.insertAdjacentElement("afterend", notice);
    }
    notice.hidden = !isLocked;
    drawer.querySelectorAll("input,select,textarea,button").forEach((control) => {
      if (["closeApplicationSetup", "mapLibrarySelect", "exportMachineMap", "importMachineMap"].includes(control.id)) {
        control.disabled = false;
        return;
      }
      if (isLocked) {
        if (!control.disabled) control.dataset.lockedBuilderOverlay = "true";
        control.disabled = true;
      } else if (control.dataset.lockedBuilderOverlay === "true") {
        delete control.dataset.lockedBuilderOverlay;
        control.disabled = false;
      }
    });
  }
  function restore() {
    pending = false;
    const button = document.querySelector("#wipeDownBuilderButton");
    if (!button) return;
    if (!hidden()) button.dataset.developerHidden = "false";
    button.disabled = false;
    button.setAttribute("aria-disabled", "false");
    button.textContent = "Map Builder";
    button.title = locked() ? "Open Map Builder in read-only mode. Unlock the map in Settings to edit." : "Open Map Builder";
    button.classList.toggle("locked-map-builder-view", locked());
    applyReadOnly();
  }
  function schedule() { if (!pending) { pending = true; requestAnimationFrame(restore); } }
  function setOpen(open) {
    const drawer = document.querySelector("#applicationSetupDialog");
    state.wipeBuilderOpen = Boolean(open);
    if (drawer) drawer.hidden = !open;
    document.querySelector("#mapRightRail")?.classList.toggle("builder-open", Boolean(open));
    document.querySelector("#labelerMapReference")?.classList.toggle("builder-open", Boolean(open));
    if (open) {
      if (typeof ensurePersistentApplicationMaps === "function") ensurePersistentApplicationMaps();
      if (typeof renderWipeDownBuilder === "function") renderWipeDownBuilder();
      requestAnimationFrame(applyReadOnly);
    }
    if (typeof saveCurrentSettings === "function") saveCurrentSettings();
  }
  function install() {
    const button = document.querySelector("#wipeDownBuilderButton");
    const drawer = document.querySelector("#applicationSetupDialog");
    if (typeof state === "undefined" || !button || !drawer) return false;
    installStyles();
    if (document.documentElement.dataset.lockedBuilderAccessBound !== "true") {
      document.documentElement.dataset.lockedBuilderAccessBound = "true";
      document.addEventListener("click", (event) => {
        const target = event.target.closest?.("#wipeDownBuilderButton");
        if (!target || !locked()) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        setOpen(!(state.wipeBuilderOpen && drawer.hidden === false));
        schedule();
      }, true);
    }
    if (!buttonObserver) {
      buttonObserver = new MutationObserver(schedule);
      buttonObserver.observe(button, { attributes: true, childList: true });
    }
    if (!drawerObserver) {
      drawerObserver = new MutationObserver(() => requestAnimationFrame(applyReadOnly));
      drawerObserver.observe(drawer, { childList: true, subtree: true });
    }
    restore();
    return true;
  }
  (function wait() { if (!install()) setTimeout(wait, RETRY_MS); })();
})();
