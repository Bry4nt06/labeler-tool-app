"use strict";

(function installSimulationCollapsiblePanels() {
  const STORAGE_KEY = "servoforge-simulation-panel-state-v1";
  const RETRY_MS = 25;
  const DEFINITIONS = Object.freeze([
    {
      key: "runtime",
      panelSelector: ".simulator-runtime",
      headSelector: ".simulator-runtime-head",
      defaultOpen: true
    },
    {
      key: "replay",
      panelSelector: ".servo-replay-panel",
      headSelector: ".servo-replay-head",
      defaultOpen: false
    },
    {
      key: "library",
      panelSelector: ".servo-profile-library",
      headSelector: ".servo-profile-library-head",
      defaultOpen: false
    }
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
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Collapsing still works for the current page when storage is unavailable.
    }
  }

  function sectionIsOpen(key, fallback) {
    const saved = readState();
    return typeof saved[key] === "boolean" ? saved[key] : fallback;
  }

  function persistSectionState(key, open) {
    writeState({ ...readState(), [key]: Boolean(open) });
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
    if (persist && key) persistSectionState(key, resolved);
  }

  function toggleSection(panel) {
    setSectionOpen(panel, panel.classList.contains("is-collapsed"));
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

    head.addEventListener("click", (event) => {
      if (event.target.closest("button,input,select,textarea,a,label")) return;
      toggleSection(panel);
    });
    head.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggleSection(panel);
    });
  }

  function decoratePanel(host, definition) {
    const panel = host.querySelector(definition.panelSelector);
    if (!panel) return;

    if (panel.dataset.simulationCollapsible === "true") {
      const savedOpen = sectionIsOpen(definition.key, definition.defaultOpen);
      setSectionOpen(panel, savedOpen, false);
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
      else persistSectionState(definition.key, open);
    });
  }

  function ensureToolbar(host) {
    let toolbar = host.querySelector(":scope > .simulation-collapse-toolbar");
    if (!toolbar) {
      toolbar = document.createElement("div");
      toolbar.className = "simulation-collapse-toolbar";
      toolbar.innerHTML = `
        <span>Simulation panels</span>
        <div>
          <button type="button" class="secondary-button" data-simulation-expand-all>Expand All</button>
          <button type="button" class="secondary-button" data-simulation-collapse-all>Collapse All</button>
        </div>`;
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
    style.textContent = `
      .simulation-collapse-toolbar{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 7px;padding:5px 7px;border:1px solid var(--line);border-radius:7px;background:var(--panel);font-size:8px;font-weight:700}
      .simulation-collapse-toolbar>div{display:flex;gap:5px}.simulation-collapse-toolbar button{min-height:24px;padding:3px 7px;font-size:8px}
      .simulation-collapsible-panel{overflow:hidden;transition:border-color .15s ease}
      .simulation-collapsible-head{position:relative;display:grid!important;grid-template-columns:auto minmax(0,1fr) auto;align-items:start!important;gap:7px!important;margin:0!important;padding:0!important;cursor:pointer;user-select:none;outline:none}
      .simulation-collapsible-head:focus-visible{box-shadow:0 0 0 2px var(--green);border-radius:5px}
      .simulation-collapse-caret{display:grid;place-items:center;width:17px;height:17px;margin-top:1px;border:1px solid var(--line);border-radius:4px;background:var(--input);color:var(--green);font-size:10px;line-height:1}
      .simulation-collapsible-body{margin-top:7px}
      .simulation-collapsible-body[hidden]{display:none!important}
      .simulation-collapsible-panel.is-collapsed{padding-bottom:8px}
      .simulation-collapsible-panel.is-collapsed .simulation-collapsible-head p{display:none}
      .simulation-collapsible-panel.is-collapsed .simulator-runtime-badge,
      .simulation-collapsible-panel.is-collapsed .servo-replay-badge,
      .simulation-collapsible-panel.is-collapsed .servo-profile-library-head>span{align-self:center}
      @media(max-width:620px){.simulation-collapse-toolbar{align-items:flex-start}.simulation-collapse-toolbar>div{flex-wrap:wrap;justify-content:flex-end}.simulation-collapsible-head{grid-template-columns:auto minmax(0,1fr)}.simulation-collapsible-head>.simulator-runtime-badge,.simulation-collapsible-head>.servo-replay-badge,.simulation-collapsible-head>.servo-profile-library-head>span{grid-column:2;justify-self:start}}
    `;
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", waitForSimulation, { once: true });
  } else {
    waitForSimulation();
  }
})();
