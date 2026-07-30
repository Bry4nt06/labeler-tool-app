"use strict";

(function installWorkspaceControls() {
  const RETRY_MS = 50;
  const PREFS_KEY = "servoforge-developer-preferences-v1";
  const LEGACY_AUTH_KEY = "servoforge-developer-auth-v1";
  const LEGACY_SESSION_KEY = "servoforge-developer-session-v1";
  const PANEL_DEFINITIONS = Object.freeze([
    ["mapBuilder", "Map Builder"],
    ["specs", "Specs"],
    ["buildInputs", "Build Inputs"],
    ["program", "Servo Program"],
    ["simulation", "Servo Simulation"],
    ["diagnostics", "Diagnostics"],
    ["preview", "Preview & Animation"],
    ["validation", "Validation"],
    ["overlays", "Map Overlays"]
  ]);

  let installed = false;
  let applyPending = false;

  function readJson(storage, key, fallback) {
    try {
      const parsed = JSON.parse(storage.getItem(key) || "null");
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  function preferences() {
    const saved = readJson(localStorage, PREFS_KEY, {});
    return {
      lockedMapIds: Array.isArray(saved.lockedMapIds)
        ? [...new Set(saved.lockedMapIds.map(String))]
        : [],
      hiddenPanels: Array.isArray(saved.hiddenPanels)
        ? [...new Set(saved.hiddenPanels.map(String))]
        : []
    };
  }

  function savePreferences(next) {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  }

  function clearLegacyLogin() {
    localStorage.removeItem(LEGACY_AUTH_KEY);
    sessionStorage.removeItem(LEGACY_SESSION_KEY);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function activeMap() {
    return typeof activeMachineMap === "function" ? activeMachineMap() : null;
  }

  function mapIsLocked(map = activeMap()) {
    return Boolean(map?.id && preferences().lockedMapIds.includes(String(map.id)));
  }

  function installStyles() {
    document.querySelector("#workspaceDeveloperStyles")?.remove();
    document.querySelector("#workspaceControlsStyles")?.remove();

    const style = document.createElement("style");
    style.id = "workspaceControlsStyles";
    style.textContent = `
      .map-toolbar #wipeDownBuilderButton{display:none}

      .top-settings-panel{
        width:min(620px,calc(100vw - 24px))!important;
        max-height:min(82vh,760px);
        overflow:auto;
        overflow-x:hidden;
        align-content:start;
      }

      .workspace-controls-card{
        grid-column:1/-1;
        display:grid;
        gap:11px;
        min-width:0;
        margin-top:4px;
        padding:13px;
        border:1px solid var(--line);
        border-radius:10px;
        background:var(--panel-hi);
      }

      .workspace-controls-head strong,
      .workspace-controls-head small{display:block}

      .workspace-controls-head small,
      .workspace-controls-note{
        margin-top:3px;
        color:var(--muted);
        font-size:10px;
        line-height:1.4;
      }

      .workspace-map-access{
        display:grid;
        grid-template-columns:minmax(0,1fr) auto;
        gap:10px;
        align-items:end;
        min-width:0;
        padding:11px;
        border:1px solid var(--line);
        border-radius:8px;
        background:var(--panel);
      }

      .workspace-map-access label{
        display:grid;
        gap:5px;
        min-width:0;
        color:var(--muted);
        font-size:10px;
      }

      .workspace-map-access select{
        width:100%;
        min-width:0;
        height:38px;
      }

      .workspace-map-access button{
        min-width:158px;
        height:38px;
        white-space:nowrap;
      }

      .workspace-lock-summary{
        display:grid;
        grid-template-columns:auto minmax(0,1fr);
        gap:8px;
        align-items:center;
        min-width:0;
      }

      .workspace-lock-state{
        padding:4px 8px;
        border:1px solid var(--green);
        border-radius:999px;
        color:var(--green);
        font-size:9px;
        font-weight:800;
        white-space:nowrap;
      }

      .workspace-lock-state[data-state="locked"]{
        border-color:#d79a3c;
        color:#ffc56b;
      }

      .workspace-panel-visibility{
        min-width:0;
        padding-top:10px;
        border-top:1px solid var(--line);
      }

      .workspace-panel-visibility>summary{
        cursor:pointer;
        font-weight:700;
        list-style:none;
      }

      .workspace-panel-visibility>summary::-webkit-details-marker{display:none}
      .workspace-panel-visibility>summary::after{content:"+";float:right;color:var(--green)}
      .workspace-panel-visibility[open]>summary::after{content:"−"}

      .workspace-panel-toggles{
        display:grid;
        grid-template-columns:repeat(3,minmax(0,1fr));
        gap:6px;
        min-width:0;
        margin-top:9px;
      }

      .workspace-panel-toggle{
        display:grid!important;
        grid-template-columns:16px minmax(0,1fr)!important;
        align-items:center;
        justify-content:start;
        gap:7px;
        min-width:0;
        min-height:34px;
        margin:0!important;
        padding:6px 8px;
        overflow:hidden;
        border:1px solid var(--line);
        border-radius:7px;
        background:var(--input);
        font-size:9px;
        line-height:1.2;
      }

      .workspace-panel-toggle input{
        width:16px!important;
        height:16px!important;
        min-width:16px!important;
        max-width:16px!important;
        margin:0!important;
        padding:0!important;
      }

      .workspace-panel-toggle span{
        display:block;
        min-width:0;
        overflow-wrap:anywhere;
      }

      .locked-map-viewer{
        grid-area:locked;
        display:grid;
        grid-template-columns:minmax(0,1fr) auto;
        align-items:end;
        gap:8px;
        width:100%;
        min-width:0;
        margin:0;
        padding-top:8px;
        border-top:1px solid var(--line);
      }

      .locked-map-viewer label{
        display:grid;
        gap:4px;
        min-width:0;
        color:var(--muted);
        font-size:9px;
      }

      .locked-map-viewer select{
        width:100%;
        min-width:0;
        max-width:none;
        height:34px;
      }

      .locked-map-badge,
      .map-read-only-indicator{
        max-width:100%;
        padding:4px 8px;
        border:1px solid #d79a3c;
        border-radius:999px;
        color:#ffc56b;
        font-size:9px;
        font-weight:800;
        line-height:1.2;
        white-space:normal;
        overflow-wrap:anywhere;
      }

      .map-read-only-indicator{margin-left:0}

      .map-builder-tab[disabled]{
        opacity:.72;
        cursor:not-allowed;
        border-color:#d79a3c;
        color:#ffc56b;
        background:color-mix(in srgb,var(--panel) 82%,#d79a3c 18%);
      }

      .read-only-surface input:disabled,
      .read-only-surface select:disabled,
      .read-only-surface textarea:disabled,
      .read-only-surface button:disabled{
        cursor:not-allowed;
        opacity:.62;
      }

      #mapLockToggle[data-developer-readonly="true"]{
        border-color:#d79a3c;
        color:#ffc56b;
        cursor:not-allowed;
      }

      [data-developer-hidden="true"]{display:none!important}

      .map-area{min-width:0}

      .map-head{
        display:grid!important;
        grid-template-columns:minmax(0,1fr) auto;
        grid-template-areas:"heading toolbar" "locked locked";
        align-items:center;
        gap:8px 12px;
        min-width:0;
      }

      .map-heading{
        grid-area:heading;
        display:flex;
        align-items:baseline;
        flex-wrap:wrap;
        min-width:0;
        gap:7px 9px;
      }

      .map-heading h2{margin:0;flex:0 0 auto}

      .active-map-name{
        max-width:100%!important;
        min-width:0;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .map-toolbar{
        grid-area:toolbar;
        display:flex;
        flex-wrap:wrap;
        justify-content:flex-end;
        gap:6px;
        min-width:0;
        max-width:100%;
      }

      .map-toolbar button{
        flex:0 1 auto;
        max-width:100%;
        white-space:normal;
        line-height:1.15;
      }

      @media(max-width:800px){
        .top-settings-panel{
          width:min(520px,calc(100vw - 20px))!important;
          grid-template-columns:1fr;
        }

        .top-settings-panel>*{grid-column:1/-1!important}
        .workspace-map-access{grid-template-columns:1fr}
        .workspace-map-access button{width:100%;min-width:0}
        .workspace-panel-toggles{grid-template-columns:repeat(2,minmax(0,1fr))}

        .map-head{
          grid-template-columns:1fr;
          grid-template-areas:"heading" "toolbar" "locked";
          align-items:stretch;
        }

        .map-toolbar{justify-content:flex-start}
        .map-toolbar button{flex:1 1 120px}
      }

      @media(max-width:480px){
        .workspace-panel-toggles{grid-template-columns:1fr}
        .locked-map-viewer{grid-template-columns:1fr;align-items:stretch}
        .locked-map-badge{justify-self:start}
        .map-toolbar button{flex-basis:100%}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureWorkspaceCard() {
    const panel = document.querySelector(".top-settings-panel");
    if (!panel) return null;

    document.querySelector("#developerModeCard")?.remove();

    let card = panel.querySelector("#workspaceControlsCard");
    if (card) return card;

    card = document.createElement("section");
    card.id = "workspaceControlsCard";
    card.className = "workspace-controls-card";
    card.innerHTML = `
      <div class="workspace-controls-head">
        <div>
          <strong>Map Access & Workspace</strong>
          <small>Lock saved maps as read-only and control which workspace panels are visible.</small>
        </div>
      </div>
      <div class="workspace-map-access">
        <label>Selected map<select id="workspaceMapSelect"></select></label>
        <button id="workspaceToggleMapLock" type="button">Lock Selected Map</button>
      </div>
      <div class="workspace-lock-summary">
        <span id="workspaceMapLockState" class="workspace-lock-state" data-state="editable">Editable</span>
        <small id="workspaceMapLockHelp" class="workspace-controls-note">The selected map can be edited normally.</small>
      </div>
      <details class="workspace-panel-visibility">
        <summary>Panel visibility</summary>
        <div id="workspacePanelToggles" class="workspace-panel-toggles"></div>
      </details>
      <small class="workspace-controls-note">
        Locked maps load in read-only mode. Map Builder stays visible but is disabled, and map,
        specification, Build Input, and Servo Program editing are disabled.
      </small>`;

    const feedback = panel.querySelector("#giveFeedback");
    if (feedback) feedback.insertAdjacentElement("beforebegin", card);
    else panel.appendChild(card);

    return card;
  }

  function mapOptions(selectedId) {
    const lockedIds = new Set(preferences().lockedMapIds);
    return (state.mapLibrary || []).map((map) => {
      const selected = String(map.id) === String(selectedId) ? " selected" : "";
      const lock = lockedIds.has(String(map.id)) ? "🔒 " : "";
      return `<option value="${escapeHtml(map.id)}"${selected}>${lock}${escapeHtml(map.name || "Machine Map")}</option>`;
    }).join("");
  }

  function updateSelectedMapStatus(card) {
    const mapSelect = card.querySelector("#workspaceMapSelect");
    const selectedId = String(mapSelect?.value || state.activeMapId || "");
    const selectedLocked = preferences().lockedMapIds.includes(selectedId);

    const action = card.querySelector("#workspaceToggleMapLock");
    const badge = card.querySelector("#workspaceMapLockState");
    const help = card.querySelector("#workspaceMapLockHelp");

    if (action) action.textContent = selectedLocked ? "Unlock Selected Map" : "Lock Selected Map";
    if (badge) {
      badge.textContent = selectedLocked ? "Read Only" : "Editable";
      badge.dataset.state = selectedLocked ? "locked" : "editable";
    }
    if (help) {
      help.textContent = selectedLocked
        ? "The selected map is protected from changes until it is unlocked here."
        : "The selected map can be edited normally.";
    }
  }

  function renderWorkspaceCard() {
    const card = ensureWorkspaceCard();
    if (!card) return;

    const mapSelect = card.querySelector("#workspaceMapSelect");
    const selectedId = mapSelect?.value || state.activeMapId;
    mapSelect.innerHTML = mapOptions(selectedId);

    if (![...mapSelect.options].some((option) => option.value === String(selectedId))) {
      mapSelect.value = String(state.activeMapId || "");
    }

    updateSelectedMapStatus(card);

    const hiddenPanels = new Set(preferences().hiddenPanels);
    card.querySelector("#workspacePanelToggles").innerHTML = PANEL_DEFINITIONS.map(([id, label]) => {
      const checked = hiddenPanels.has(id) ? " checked" : "";
      return `
        <label class="workspace-panel-toggle">
          <input type="checkbox" data-developer-panel="${id}"${checked}>
          <span>Hide ${escapeHtml(label)}</span>
        </label>`;
    }).join("");
  }

  function ensureLockedMapViewer() {
    const mapHead = document.querySelector(".map-head");
    if (!mapHead) return null;

    let viewer = mapHead.querySelector("#lockedMapViewer");
    if (viewer) return viewer;

    viewer = document.createElement("div");
    viewer.id = "lockedMapViewer";
    viewer.className = "locked-map-viewer";
    viewer.innerHTML = `
      <label>Locked Maps<select id="lockedMapViewerSelect"></select></label>
      <span class="locked-map-badge">Read Only</span>`;

    mapHead.appendChild(viewer);

    viewer.querySelector("select")?.addEventListener("change", (event) => {
      const selectedId = String(event.currentTarget.value || "");
      const map = (state.mapLibrary || []).find((entry) => String(entry.id) === selectedId);
      if (!map || !preferences().lockedMapIds.includes(String(map.id))) return;

      loadMachineMapIntoRuntime(map, true);
      if (typeof saveCurrentSettings === "function") saveCurrentSettings();
      scheduleApply();
    });

    return viewer;
  }

  function renderLockedMapViewer() {
    const viewer = ensureLockedMapViewer();
    if (!viewer) return;

    const lockedIds = new Set(preferences().lockedMapIds);
    const maps = (state.mapLibrary || []).filter((map) => lockedIds.has(String(map.id)));
    viewer.hidden = maps.length === 0;

    const select = viewer.querySelector("select");
    if (!select) return;

    select.innerHTML = maps.map((map) =>
      `<option value="${escapeHtml(map.id)}">${escapeHtml(map.name || "Machine Map")}</option>`
    ).join("");

    if (maps.some((map) => String(map.id) === String(state.activeMapId))) {
      select.value = String(state.activeMapId);
    }
  }

  function orderTabs() {
    const tabs = document.querySelector(".tabs");
    const builder = document.querySelector("#wipeDownBuilderButton");
    if (!tabs || !builder) return;

    builder.classList.remove("compact-builder-button", "secondary-button", "compact-map-button");
    builder.classList.add("tab", "map-builder-tab");
    builder.removeAttribute("data-tab");

    const ordered = [
      builder,
      ...["specs", "buildInputs", "program", "simulation", "diagnostics"]
        .map((id) => tabs.querySelector(`[data-tab="${id}"]`))
        .filter(Boolean)
    ];

    const current = [...tabs.children].filter((child) => ordered.includes(child));
    const correct = ordered.length === current.length
      && ordered.every((button, index) => current[index] === button);

    if (!correct) {
      const fragment = document.createDocumentFragment();
      ordered.forEach((button) => fragment.appendChild(button));
      tabs.insertBefore(fragment, tabs.querySelector(".simulation-actions-spacer"));
    }
  }

  function closeBuilder() {
    const drawer = document.querySelector("#applicationSetupDialog");
    if (drawer?.hidden === false) document.querySelector("#closeApplicationSetup")?.click();
  }

  function panelTargets(id) {
    const tabs = document.querySelector(".tabs");
    const targets = {
      mapBuilder: [
        document.querySelector("#wipeDownBuilderButton"),
        document.querySelector("#applicationSetupDialog")
      ],
      specs: [tabs?.querySelector('[data-tab="specs"]'), document.querySelector("#specs")],
      buildInputs: [tabs?.querySelector('[data-tab="buildInputs"]'), document.querySelector("#buildInputs")],
      program: [tabs?.querySelector('[data-tab="program"]'), document.querySelector("#program")],
      simulation: [tabs?.querySelector('[data-tab="simulation"]'), document.querySelector("#simulation")],
      diagnostics: [tabs?.querySelector('[data-tab="diagnostics"]'), document.querySelector("#diagnostics")],
      preview: [document.querySelector(".preview-panel")],
      validation: [document.querySelector(".validation")],
      overlays: [document.querySelector(".map-overlay-control")]
    };

    return (targets[id] || []).filter(Boolean);
  }

  function applyPanelVisibility() {
    const hidden = new Set(preferences().hiddenPanels);

    PANEL_DEFINITIONS.forEach(([id]) => {
      const shouldHide = hidden.has(id);
      panelTargets(id).forEach((target) => {
        target.dataset.developerHidden = String(shouldHide);
      });
      if (id === "mapBuilder" && shouldHide) closeBuilder();
    });

    if (hidden.has(String(state.activeTab))) {
      const fallback = ["specs", "buildInputs", "program", "simulation", "diagnostics"]
        .find((id) => !hidden.has(id));
      if (fallback) document.querySelector(`.tabs .tab[data-tab="${fallback}"]`)?.click();
    }
  }

  function setControlReadOnly(control, locked) {
    const supported = control instanceof HTMLInputElement
      || control instanceof HTMLSelectElement
      || control instanceof HTMLTextAreaElement
      || control instanceof HTMLButtonElement;

    if (!supported || control.matches("[data-open-diagnostics],[data-open-simulation]")) return;

    if (locked) {
      if (!control.hasAttribute("data-developer-was-disabled")) {
        control.dataset.developerWasDisabled = String(control.disabled);
      }
      control.disabled = true;
    } else if (control.hasAttribute("data-developer-was-disabled")) {
      control.disabled = control.dataset.developerWasDisabled === "true";
      delete control.dataset.developerWasDisabled;
    }
  }

  function applyReadOnlyState() {
    const locked = mapIsLocked();

    if (locked) {
      state.mapLocked = true;
      closeBuilder();
    }

    const builderTab = document.querySelector("#wipeDownBuilderButton");
    if (builderTab) {
      builderTab.disabled = locked;
      builderTab.setAttribute("aria-disabled", String(locked));
      builderTab.textContent = locked ? "Map Builder 🔒" : "Map Builder";
      builderTab.title = locked
        ? "Unlock the selected map to use Map Builder."
        : "Open Map Builder";
    }

    const mapLock = document.querySelector("#mapLockToggle");
    if (mapLock) {
      mapLock.dataset.developerReadonly = String(locked);
      mapLock.disabled = locked;

      if (locked) {
        mapLock.setAttribute("aria-pressed", "true");
        mapLock.textContent = "Read Only";
      } else if (mapLock.textContent === "Read Only") {
        mapLock.textContent = state.mapLocked === false ? "Unlocked" : "Locked";
      }
    }

    const controls = [
      document.querySelector("#undoMapEdit"),
      ...["#specs", "#buildInputs", "#program", "#applicationSetupDialog"].flatMap((selector) => {
        const surface = document.querySelector(selector);
        if (!surface) return [];
        surface.classList.toggle("read-only-surface", locked);
        return [...surface.querySelectorAll("input,select,textarea,button")];
      })
    ].filter(Boolean);

    controls.forEach((control) => setControlReadOnly(control, locked));

    const activeName = document.querySelector("#activeMapName");
    let indicator = document.querySelector("#mapReadOnlyIndicator");

    if (locked && activeName && !indicator) {
      indicator = document.createElement("span");
      indicator.id = "mapReadOnlyIndicator";
      indicator.className = "map-read-only-indicator";
      indicator.textContent = "READ ONLY";
      activeName.insertAdjacentElement("afterend", indicator);
    }

    if (indicator) indicator.hidden = !locked;
  }

  function syncTabState() {
    const drawerOpen = document.querySelector("#applicationSetupDialog")?.hidden === false;
    const builder = document.querySelector("#wipeDownBuilderButton");

    builder?.classList.toggle("active", drawerOpen);

    if (drawerOpen) {
      document.querySelectorAll('.tabs .tab[data-tab]')
        .forEach((tab) => tab.classList.remove("active"));
    }
  }

  function applyWorkspaceState() {
    applyPending = false;
    orderTabs();
    renderLockedMapViewer();
    applyPanelVisibility();
    applyReadOnlyState();
    renderWorkspaceCard();
    bindDynamicControls();
    syncTabState();
  }

  function scheduleApply() {
    if (applyPending) return;
    applyPending = true;
    window.requestAnimationFrame(applyWorkspaceState);
  }

  function installOutsideClickClosing() {
    if (document.documentElement.dataset.workspaceAutoCloseBound === "true") return;
    document.documentElement.dataset.workspaceAutoCloseBound = "true";

    document.addEventListener("pointerdown", (event) => {
      const target = event.target;

      const settings = document.querySelector(".top-settings-menu");
      if (settings?.open && !settings.contains(target)) settings.open = false;

      const drawer = document.querySelector("#applicationSetupDialog");
      const builder = document.querySelector("#wipeDownBuilderButton");
      if (drawer?.hidden === false && !drawer.contains(target) && !builder?.contains(target)) {
        closeBuilder();
      }

      const reference = document.querySelector("#labelerMapReference");
      const referenceButton = document.querySelector("#labelerMapButton");
      if (
        reference?.hidden === false
        && !reference.contains(target)
        && !referenceButton?.contains(target)
      ) {
        document.querySelector("#closeLabelerMap")?.click();
      }

      const wipePanel = document.querySelector("#wipeDownDataPanel");
      const wipeButton = document.querySelector("#showWipeDownData");
      if (
        wipePanel?.hidden === false
        && !wipePanel.contains(target)
        && !wipeButton?.contains(target)
      ) {
        document.querySelector("#closeWipeDownData")?.click();
      }

      document
        .querySelectorAll(".builder-scroll-content details[open],.top-settings-panel details[open]")
        .forEach((details) => {
          if (!details.contains(target)) details.open = false;
        });
    }, true);
  }

  function bindWorkspaceCard() {
    const card = ensureWorkspaceCard();
    if (!card || card.dataset.workspaceBound === "true") return;
    card.dataset.workspaceBound = "true";

    card.addEventListener("change", (event) => {
      const mapSelect = event.target.closest("#workspaceMapSelect");
      if (mapSelect) {
        updateSelectedMapStatus(card);
        return;
      }

      const panelToggle = event.target.closest("[data-developer-panel]");
      if (!panelToggle) return;

      const next = preferences();
      const panelId = String(panelToggle.dataset.developerPanel || "");

      next.hiddenPanels = panelToggle.checked
        ? [...new Set([...next.hiddenPanels, panelId])]
        : next.hiddenPanels.filter((id) => id !== panelId);

      savePreferences(next);
      scheduleApply();
    });

    card.querySelector("#workspaceToggleMapLock")?.addEventListener("click", () => {
      const selectedId = String(card.querySelector("#workspaceMapSelect")?.value || "");
      if (!selectedId) return;

      const next = preferences();
      next.lockedMapIds = next.lockedMapIds.includes(selectedId)
        ? next.lockedMapIds.filter((id) => id !== selectedId)
        : [...next.lockedMapIds, selectedId];

      savePreferences(next);
      scheduleApply();
    });
  }

  function bindDynamicControls() {
    bindWorkspaceCard();

    const builder = document.querySelector("#wipeDownBuilderButton");
    if (builder && builder.dataset.workspaceBound !== "true") {
      builder.dataset.workspaceBound = "true";
      builder.addEventListener("click", () => {
        window.setTimeout(() => {
          if (mapIsLocked()) closeBuilder();
          syncTabState();
        }, 0);
      });
    }

    document.querySelectorAll('.tabs .tab[data-tab]').forEach((tab) => {
      if (tab.dataset.workspaceBound === "true") return;
      tab.dataset.workspaceBound = "true";
      tab.addEventListener("click", () => {
        closeBuilder();
        window.setTimeout(syncTabState, 0);
      });
    });
  }

  function wrapFunction(name) {
    const original = window[name];
    if (typeof original !== "function" || original.workspaceDeveloperWrapped) return;

    const wrapped = function workspaceControlsWrappedFunction(...args) {
      const result = original.apply(this, args);
      scheduleApply();
      return result;
    };

    wrapped.workspaceDeveloperWrapped = true;
    window[name] = wrapped;

    try {
      globalThis[name] = wrapped;
    } catch {
      // Global binding may be read-only in some browser contexts.
    }
  }

  function install() {
    if (installed) return true;

    if (
      typeof state === "undefined"
      || typeof activeMachineMap !== "function"
      || !document.querySelector(".tabs")
    ) {
      return false;
    }

    installed = true;
    clearLegacyLogin();
    installStyles();
    installOutsideClickClosing();

    [
      "loadMachineMapIntoRuntime",
      "render",
      "renderSpecs",
      "renderBuildInputs",
      "renderProgram"
    ].forEach(wrapFunction);

    applyWorkspaceState();
    window.setTimeout(scheduleApply, 250);
    window.setTimeout(scheduleApply, 1000);
    return true;
  }

  function waitForApplication() {
    if (install()) return;
    window.setTimeout(waitForApplication, RETRY_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", waitForApplication, { once: true });
  } else {
    waitForApplication();
  }
})();
