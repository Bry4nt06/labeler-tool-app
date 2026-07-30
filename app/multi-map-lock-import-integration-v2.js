"use strict";

(function installMultiMapLockAndImportV2() {
  const PREFS_KEY = "servoforge-developer-preferences-v1";
  const RETRY_MS = 50;
  let installed = false;
  let optionObserver = null;
  let refreshPending = false;

  function prefs() {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
      return {
        lockedMapIds: Array.isArray(saved?.lockedMapIds) ? [...new Set(saved.lockedMapIds.map(String))] : [],
        hiddenPanels: Array.isArray(saved?.hiddenPanels) ? [...new Set(saved.hiddenPanels.map(String))] : []
      };
    } catch {
      return { lockedMapIds: [], hiddenPanels: [] };
    }
  }

  function savePrefs(next) {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  }

  function html(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function chosenIds(select) {
    return select ? [...select.selectedOptions].map((option) => String(option.value || "")).filter(Boolean) : [];
  }

  function setLeadingText(label, value) {
    const node = label ? [...label.childNodes].find((item) => item.nodeType === Node.TEXT_NODE) : null;
    if (node && node.textContent.trim() !== value) node.textContent = `${value} `;
  }

  function styles() {
    if (document.querySelector("#multiMapLockImportV2Styles")) return;
    const style = document.createElement("style");
    style.id = "multiMapLockImportV2Styles";
    style.textContent = `#workspaceControlsCard .workspace-map-access{grid-template-columns:minmax(0,1fr) 180px!important;align-items:stretch!important}#workspaceMapSelect[multiple]{width:100%;height:auto!important;min-height:154px;padding:4px}#workspaceMapSelect option{padding:5px 7px}.workspace-map-actions{display:grid;gap:7px;align-content:end}.workspace-map-actions button{width:100%;min-width:0;min-height:38px;height:auto!important;white-space:normal!important}.workspace-map-selection-help{display:block;margin-top:2px;color:var(--muted);font-size:9px;line-height:1.35}.map-library-actions .map-import-action,.top-settings-panel .settings-map-import-action{display:inline-flex;align-items:center;justify-content:center;min-height:34px}.top-settings-panel .settings-map-import-action{width:100%;box-sizing:border-box}@media(max-width:800px){#workspaceControlsCard .workspace-map-access{grid-template-columns:1fr!important}}`;
    document.head.appendChild(style);
  }

  function renderSettingsOptions() {
    const card = document.querySelector("#workspaceControlsCard");
    const select = card?.querySelector("#workspaceMapSelect");
    if (!select || typeof state === "undefined") return;
    const prior = chosenIds(select);
    const desired = new Set(prior.length ? prior : state.activeMapId ? [String(state.activeMapId)] : []);
    const locked = new Set(prefs().lockedMapIds);
    const markup = (state.mapLibrary || []).map((map) => {
      const id = String(map.id);
      return `<option value="${html(id)}"${desired.has(id) ? " selected" : ""}>${locked.has(id) ? "🔒 " : ""}${html(map.name || "Machine Map")}</option>`;
    }).join("");
    if (select.innerHTML !== markup) select.innerHTML = markup;
  }

  function renderBuilderOptions() {
    const select = document.querySelector("#mapLibrarySelect");
    if (!select || typeof state === "undefined") return;
    const locked = new Set(prefs().lockedMapIds);
    [...select.options].forEach((option) => {
      const map = (state.mapLibrary || []).find((entry) => String(entry.id) === String(option.value));
      if (!map) return;
      const label = `${locked.has(String(map.id)) ? "🔒 " : ""}${map.name || "Machine Map"}`;
      if (option.textContent !== label) option.textContent = label;
    });
  }

  function renderSummary() {
    const card = document.querySelector("#workspaceControlsCard");
    const select = card?.querySelector("#workspaceMapSelect");
    if (!select) return;
    const chosen = chosenIds(select);
    const locked = new Set(prefs().lockedMapIds);
    const chosenLocked = chosen.filter((id) => locked.has(id)).length;
    const lockButton = card.querySelector("#workspaceLockSelectedMaps");
    const unlockButton = card.querySelector("#workspaceUnlockSelectedMaps");
    const badge = card.querySelector("#workspaceMapLockState");
    const help = card.querySelector("#workspaceMapLockHelp");
    if (lockButton) lockButton.disabled = !chosen.length || chosenLocked === chosen.length;
    if (unlockButton) unlockButton.disabled = chosenLocked === 0;
    const badgeText = `${locked.size} Locked`;
    if (badge && badge.textContent !== badgeText) badge.textContent = badgeText;
    if (badge) badge.dataset.state = locked.size ? "locked" : "editable";
    const helpText = chosen.length ? `${chosen.length} selected • ${chosenLocked} already locked. Unlock a locked map here before changing it.` : "Select one or more maps, then choose Lock Selected or Unlock Selected.";
    if (help && help.textContent !== helpText) help.textContent = helpText;
  }

  function enhance() {
    refreshPending = false;
    const card = document.querySelector("#workspaceControlsCard");
    const select = card?.querySelector("#workspaceMapSelect");
    if (!card || !select) return;
    select.multiple = true;
    select.size = Math.min(8, Math.max(5, (state.mapLibrary || []).length || 5));
    setLeadingText(select.closest("label"), "Maps to lock or unlock");
    if (!card.querySelector("#workspaceMapSelectionHelp")) {
      const helper = document.createElement("small");
      helper.id = "workspaceMapSelectionHelp";
      helper.className = "workspace-map-selection-help";
      helper.textContent = "Hold Ctrl on Windows or Command on Mac to select multiple maps.";
      select.insertAdjacentElement("afterend", helper);
    }
    let actions = card.querySelector(".workspace-map-actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "workspace-map-actions";
      actions.innerHTML = '<button id="workspaceLockSelectedMaps" type="button">Lock Selected</button><button id="workspaceUnlockSelectedMaps" type="button" class="secondary-button">Unlock Selected</button>';
      const old = card.querySelector("#workspaceToggleMapLock");
      if (old) old.replaceWith(actions);
      else card.querySelector(".workspace-map-access")?.appendChild(actions);
    }
    renderSettingsOptions();
    renderSummary();
    renderBuilderOptions();
    ensureMapImport();
    ensureSettingsMapImport();
    if (!optionObserver) {
      optionObserver = new MutationObserver(schedule);
      optionObserver.observe(select, { childList: true });
    }
  }

  function schedule() {
    if (refreshPending) return;
    refreshPending = true;
    window.requestAnimationFrame(enhance);
  }

  function changeLocks(lock) {
    const selected = chosenIds(document.querySelector("#workspaceMapSelect"));
    if (!selected.length) return;
    const next = prefs();
    const selectedSet = new Set(selected);
    next.lockedMapIds = lock ? [...new Set([...next.lockedMapIds, ...selected])] : next.lockedMapIds.filter((id) => !selectedSet.has(String(id)));
    savePrefs(next);
    if (typeof render === "function") render();
    schedule();
  }

  function bindLockControls() {
    if (document.documentElement.dataset.multiMapLockV2Bound === "true") return;
    document.documentElement.dataset.multiMapLockV2Bound = "true";
    document.addEventListener("click", (event) => {
      if (event.target.closest?.("#workspaceLockSelectedMaps")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        changeLocks(true);
      } else if (event.target.closest?.("#workspaceUnlockSelectedMaps")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        changeLocks(false);
      }
    }, true);
    document.addEventListener("change", (event) => {
      if (event.target.closest?.("#workspaceMapSelect")) window.requestAnimationFrame(renderSummary);
      if (event.target.closest?.("#mapLibrarySelect")) window.setTimeout(() => { renderBuilderOptions(); if (typeof render === "function") render(); }, 0);
    }, true);
  }

  function mapRecords(data) {
    if (!data || typeof data !== "object") return [];
    if (data.format === "servoforge-machine-map" && data.map && typeof data.map === "object") return [data.map];
    if (data.format === "labeler-tool-portable-settings" && Array.isArray(data.settings?.mapLibrary)) return data.settings.mapLibrary;
    if (Array.isArray(data.mapLibrary)) return data.mapLibrary;
    if (Array.isArray(data.settings?.mapLibrary)) return data.settings.mapLibrary;
    if (data.map && typeof data.map === "object") return [data.map];
    if (Array.isArray(data.objects) && (data.machineType || data.applicationMode || data.schemaVersion)) return [data];
    return [];
  }

  function importMaps(data) {
    const records = mapRecords(data);
    if (!records.length) throw new Error("This JSON file does not contain a ServoForge machine map or map library.");
    if (!Array.isArray(state.mapLibrary)) state.mapLibrary = [];
    const imported = [];
    records.forEach((source, index) => {
      const map = createMachineMap({ ...deepClone(source), id: uniqueMapId("machine-map"), name: uniqueMapName(String(source?.name || `Imported Map ${index + 1}`)), isTemplate: false });
      state.mapLibrary.push(map);
      imported.push(map);
    });
    if (typeof clearServoSimulationForSelectedMap === "function") clearServoSimulationForSelectedMap();
    loadMachineMapIntoRuntime(imported[0], true);
    if (typeof saveCurrentSettings === "function") saveCurrentSettings();
    if (typeof render === "function") render();
    if (typeof renderWipeDownBuilder === "function") renderWipeDownBuilder();
    schedule();
    return imported;
  }

  async function readJsonFile(file) {
    if (!file) throw new Error("Select a JSON file first.");
    try {
      return JSON.parse(await file.text());
    } catch (error) {
      throw new Error(`The selected file is not valid JSON: ${error.message}`);
    }
  }

  async function importMapFile(file, input) {
    try {
      const imported = importMaps(await readJsonFile(file));
      window.alert(`${imported.length} map${imported.length === 1 ? "" : "s"} imported successfully. The imported map is now selected in Map Builder.`);
    } catch (error) {
      window.alert(`Unable to import map: ${error.message}`);
    } finally {
      if (input) input.value = "";
    }
  }

  function ensureMapImport() {
    const exportButton = document.querySelector("#exportMachineMap");
    if (!exportButton) return;
    let input = document.querySelector("#importMachineMap");
    if (!input) {
      const action = document.createElement("label");
      action.className = "file-action map-import-action";
      action.innerHTML = 'Import Map JSON<input id="importMachineMap" type="file" accept="application/json,.json">';
      exportButton.insertAdjacentElement("afterend", action);
      input = action.querySelector("input");
    }
    if (input && input.dataset.mapImportBound !== "true") {
      input.dataset.mapImportBound = "true";
      input.addEventListener("change", () => importMapFile(input.files?.[0], input));
    }
  }

  function ensureSettingsMapImport() {
    const settingsInput = document.querySelector("#importSettings");
    const settingsLabel = settingsInput?.closest("label");
    if (!settingsLabel) return;
    let input = document.querySelector("#importMachineMapSettings");
    if (!input) {
      const action = document.createElement("label");
      action.className = "file-action settings-map-import-action";
      action.innerHTML = 'Import Map JSON<input id="importMachineMapSettings" type="file" accept="application/json,.json">';
      settingsLabel.insertAdjacentElement("afterend", action);
      input = action.querySelector("input");
    }
    if (input && input.dataset.mapImportBound !== "true") {
      input.dataset.mapImportBound = "true";
      input.addEventListener("change", () => importMapFile(input.files?.[0], input));
    }
  }

  function bindSettingsImportRouter() {
    if (document.documentElement.dataset.settingsImportRouterV2Bound === "true") return;
    document.documentElement.dataset.settingsImportRouterV2Bound = "true";
    document.addEventListener("change", async (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.id !== "importSettings") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const file = input.files?.[0];
      if (!file) return;
      try {
        const data = await readJsonFile(file);
        if (data?.format === "labeler-tool-portable-settings" && Number(data?.version) === 1) {
          if (typeof importPortableSettingsFile !== "function") throw new Error("The portable settings importer is unavailable.");
          importPortableSettingsFile(file);
          return;
        }
        const records = mapRecords(data);
        if (!records.length) throw new Error("This is neither a Labeler Tool portable settings backup nor a ServoForge map export.");
        const imported = importMaps(data);
        window.alert(`${imported.length} map${imported.length === 1 ? "" : "s"} recognized and imported. The imported map is now selected in Map Builder.`);
      } catch (error) {
        window.alert(`Unable to import settings or map: ${error.message}`);
      } finally {
        input.value = "";
      }
    }, true);
  }

  function bindFaultImport() {
    const input = document.querySelector("#importFaultConfig");
    if (!input || input.dataset.formatAwareV2 === "true") return;
    input.dataset.formatAwareV2 = "true";
    setLeadingText(input.closest("label"), "Import Fault Limits");
    input.addEventListener("change", async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const file = input.files?.[0];
      if (!file) return;
      try {
        const data = await readJsonFile(file);
        const maps = mapRecords(data);
        if (maps.length) {
          const imported = importMaps(data);
          window.alert(`${imported.length} map${imported.length === 1 ? "" : "s"} recognized and imported through Map Builder.`);
        } else {
          applyFaultConfig(data);
          if (typeof saveCurrentSettings === "function") saveCurrentSettings();
          window.alert(`Fault configuration loaded. Plate/table fault ratio: ${fmt(state.maxMoveRatio, 1)}:1`);
        }
      } catch (error) {
        window.alert(`Unable to load JSON configuration: ${error.message}`);
      } finally { input.value = ""; }
    }, true);
  }

  function install() {
    if (installed) return true;
    if (typeof state === "undefined" || !document.querySelector("#workspaceControlsCard")) return false;
    installed = true;
    styles();
    bindLockControls();
    bindSettingsImportRouter();
    ensureMapImport();
    ensureSettingsMapImport();
    bindFaultImport();
    enhance();
    window.setTimeout(() => { ensureMapImport(); ensureSettingsMapImport(); bindFaultImport(); schedule(); }, 500);
    return true;
  }

  function wait() {
    if (install()) return;
    window.setTimeout(wait, RETRY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait, { once: true });
  else wait();
})();