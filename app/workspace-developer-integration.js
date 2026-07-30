"use strict";

(function installServoForgeWorkspaceControls() {
  const PREFS_KEY = "servoforge-developer-preferences-v1";
  const RETRY_MS = 50;
  const PANELS = [
    ["mapBuilder", "Map Builder", "#wipeDownBuilderButton"],
    ["specs", "Specs", '[data-tab="specs"]'],
    ["buildInputs", "Build Inputs", '[data-tab="buildInputs"]'],
    ["program", "Servo Program", '[data-tab="program"]'],
    ["simulation", "Servo Simulation", '[data-tab="simulation"]'],
    ["diagnostics", "Diagnostics", '[data-tab="diagnostics"]'],
    ["validation", "Validation", ".validation-panel"],
    ["mapOverlays", "Map Overlays", ".map-overlay-control"]
  ];
  let pending = false;

  function readPrefs() {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
      return {
        lockedMapIds: Array.isArray(saved.lockedMapIds) ? [...new Set(saved.lockedMapIds.map(String))] : [],
        hiddenPanels: Array.isArray(saved.hiddenPanels) ? [...new Set(saved.hiddenPanels.map(String))] : []
      };
    } catch { return { lockedMapIds: [], hiddenPanels: [] }; }
  }
  function savePrefs(next) {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  }
  function activeMap() {
    try { return typeof activeMachineMap === "function" ? activeMachineMap() : null; } catch { return null; }
  }
  function activeLocked() {
    const map = activeMap();
    return Boolean(map?.id && readPrefs().lockedMapIds.includes(String(map.id)));
  }
  function html(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function installStyles() {
    if (document.querySelector("#workspaceControlsStyles")) return;
    const style = document.createElement("style");
    style.id = "workspaceControlsStyles";
    style.textContent = `.top-settings-panel{width:min(620px,calc(100vw - 24px))!important;max-width:620px!important;max-height:min(82vh,760px)!important;overflow:auto!important}.workspace-controls-card{margin-top:10px;padding:10px;border:1px solid var(--line);border-radius:9px;background:var(--panel)}.workspace-controls-card h3{margin:0 0 3px;font-size:12px}.workspace-controls-card>p{margin:0 0 9px;color:var(--muted);font-size:9px}.workspace-map-access{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:9px;align-items:end}.workspace-map-access label{min-width:0}.workspace-map-access select{width:100%}.workspace-map-status{display:flex;align-items:center;gap:7px;margin-top:8px;padding:7px;border-top:1px solid var(--line);font-size:9px}.workspace-map-lock-badge{padding:3px 7px;border:1px solid var(--green);border-radius:999px;color:var(--green);font-weight:800}.workspace-map-lock-badge[data-state="locked"]{border-color:#d79a3c;color:#ffc56b}.workspace-panel-section{margin-top:9px;border-top:1px solid var(--line);padding-top:8px}.workspace-panel-section summary{cursor:pointer;font-weight:800;font-size:10px}.workspace-panel-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:7px}.workspace-panel-choice{display:flex;align-items:center;gap:7px;min-width:0;padding:7px;border:1px solid var(--line);border-radius:7px;background:var(--input);font-size:9px}.workspace-panel-choice input{width:16px!important;height:16px!important;min-width:16px!important;margin:0}.map-head{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:7px!important;align-items:start!important}.map-heading{min-width:0;display:flex!important;flex-wrap:wrap!important;gap:5px!important}.map-toolbar{min-width:0;display:flex!important;flex-wrap:wrap!important;justify-content:flex-end!important}.map-toolbar button{min-width:0!important;white-space:normal!important}.locked-map-viewer{grid-column:1/-1;width:100%;min-width:0}.locked-map-viewer select{min-width:0;max-width:100%}@media(max-width:800px){.workspace-panel-grid{grid-template-columns:1fr}.map-head{grid-template-columns:1fr!important}.map-toolbar{justify-content:flex-start!important}}`;
    document.head.appendChild(style);
  }
  function ensureCard() {
    const settings = document.querySelector(".top-settings-panel");
    if (!settings) return null;
    document.querySelector("#developerModeCard")?.remove();
    localStorage.removeItem("servoforge-developer-auth-v1");
    sessionStorage.removeItem("servoforge-developer-session-v1");
    let card = settings.querySelector("#workspaceControlsCard");
    if (!card) {
      card = document.createElement("section");
      card.id = "workspaceControlsCard";
      card.className = "workspace-controls-card";
      card.innerHTML = `<h3>Map Access &amp; Workspace</h3><p>Lock saved maps as read-only and control which workspace panels are visible.</p><div class="workspace-map-access"><label>Selected map<select id="workspaceMapSelect"></select></label><button id="workspaceToggleMapLock" type="button">Lock Selected Map</button></div><div class="workspace-map-status"><span id="workspaceMapLockState" class="workspace-map-lock-badge">Editable</span><span id="workspaceMapLockHelp">Select a map to protect it from changes.</span></div><details class="workspace-panel-section"><summary>Panel visibility</summary><div id="workspacePanelChoices" class="workspace-panel-grid"></div></details><p class="workspace-map-selection-help">Locked maps remain available in Map Builder for inspection, but map, specification, Build Input, and Servo Program editing is disabled until they are unlocked here.</p>`;
      settings.appendChild(card);
    }
    return card;
  }
  function renderCard() {
    const card = ensureCard();
    if (!card || typeof state === "undefined") return;
    const prefs = readPrefs();
    const select = card.querySelector("#workspaceMapSelect");
    const current = select.value || String(state.activeMapId || "");
    const options = (state.mapLibrary || []).map((map) => `<option value="${html(map.id)}"${String(map.id) === current ? " selected" : ""}>${prefs.lockedMapIds.includes(String(map.id)) ? "🔒 " : ""}${html(map.name || "Machine Map")}</option>`).join("");
    if (!select.multiple && select.innerHTML !== options) select.innerHTML = options;
    const selected = String(select.value || state.activeMapId || "");
    const isLocked = prefs.lockedMapIds.includes(selected);
    const button = card.querySelector("#workspaceToggleMapLock");
    if (button) button.textContent = isLocked ? "Unlock Selected Map" : "Lock Selected Map";
    const badge = card.querySelector("#workspaceMapLockState");
    if (badge) { badge.textContent = isLocked ? "Read Only" : "Editable"; badge.dataset.state = isLocked ? "locked" : "editable"; }
    const choices = card.querySelector("#workspacePanelChoices");
    if (choices && !choices.children.length) choices.innerHTML = PANELS.map(([key, label]) => `<label class="workspace-panel-choice"><input type="checkbox" data-workspace-panel="${key}"${prefs.hiddenPanels.includes(key) ? " checked" : ""}><span>Hide ${label}</span></label>`).join("");
  }
  function orderTabs() {
    const tabs = document.querySelector(".tabs");
    const builder = document.querySelector("#wipeDownBuilderButton");
    if (!tabs || !builder) return;
    const ordered = [builder, ...["specs", "buildInputs", "program", "simulation", "diagnostics"].map((id) => tabs.querySelector(`[data-tab="${id}"]`)).filter(Boolean)];
    ordered.forEach((button) => { if (button.parentElement === tabs) tabs.appendChild(button); });
  }
  function applyVisibility() {
    const hidden = new Set(readPrefs().hiddenPanels);
    PANELS.forEach(([key, , selector]) => {
      document.querySelectorAll(selector).forEach((element) => {
        if (key === "mapBuilder") element.dataset.developerHidden = String(hidden.has(key));
        element.hidden = hidden.has(key);
      });
    });
    const tabs = [...document.querySelectorAll(".tabs .tab")].filter((tab) => !tab.hidden);
    if (tabs.length && !tabs.some((tab) => tab.classList.contains("active"))) tabs[0].click();
  }
  function applyReadOnly() {
    const locked = activeLocked();
    const editableSelectors = ["#specs input", "#specs select", "#specs textarea", "#buildInputs input", "#buildInputs select", "#buildInputs textarea", "#program input", "#program select", "#program textarea"];
    editableSelectors.forEach((selector) => document.querySelectorAll(selector).forEach((control) => {
      if (locked) {
        if (!control.disabled) control.dataset.mapLockDisabled = "true";
        control.disabled = true;
      } else if (control.dataset.mapLockDisabled === "true") {
        delete control.dataset.mapLockDisabled;
        control.disabled = false;
      }
    }));
    document.querySelector("#labelerMapReference")?.classList.toggle("read-only-map", locked);
  }
  function apply() {
    pending = false;
    installStyles();
    orderTabs();
    renderCard();
    applyVisibility();
    applyReadOnly();
  }
  function schedule() { if (!pending) { pending = true; requestAnimationFrame(apply); } }
  function bind() {
    if (document.documentElement.dataset.workspaceControlsBound === "true") return;
    document.documentElement.dataset.workspaceControlsBound = "true";
    document.addEventListener("click", (event) => {
      const button = event.target.closest?.("#workspaceToggleMapLock");
      if (!button) return;
      const select = document.querySelector("#workspaceMapSelect");
      const id = String(select?.value || state.activeMapId || "");
      if (!id) return;
      const prefs = readPrefs();
      prefs.lockedMapIds = prefs.lockedMapIds.includes(id) ? prefs.lockedMapIds.filter((item) => item !== id) : [...prefs.lockedMapIds, id];
      savePrefs(prefs);
      if (typeof render === "function") render();
      schedule();
    });
    document.addEventListener("change", (event) => {
      const panel = event.target.closest?.("[data-workspace-panel]");
      if (panel) {
        const prefs = readPrefs();
        const key = panel.dataset.workspacePanel;
        prefs.hiddenPanels = panel.checked ? [...new Set([...prefs.hiddenPanels, key])] : prefs.hiddenPanels.filter((item) => item !== key);
        savePrefs(prefs);
        schedule();
      }
      if (event.target.closest?.("#workspaceMapSelect,#mapLibrarySelect")) schedule();
    });
  }
  function install() {
    if (typeof state === "undefined" || !document.querySelector(".top-settings-panel") || !document.querySelector(".tabs")) return false;
    bind();
    apply();
    return true;
  }
  (function wait() { if (!install()) setTimeout(wait, RETRY_MS); })();
})();
