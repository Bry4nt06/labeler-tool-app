"use strict";

let builderSaveTimer = null;

function selectMapBuilderObject(objectId, { openBuilder = true, scroll = true } = {}) {
  state.selectedMapObjectId = String(objectId || "");
  const map = activeMachineMap();
  const item = map?.objects?.find((entry) => entry.id === state.selectedMapObjectId);
  if (item) builderExpandedStation = String(item.kind === "coding" ? "coding" : item.station);
  if (openBuilder && typeof setBuilderOpen === "function") setBuilderOpen(true);
  renderMap();
  renderWipeDownBuilder();
  if (scroll) window.requestAnimationFrame(() => {
    const editor = els.wipeBuilderList?.querySelector(`[data-builder-object-id="${CSS.escape(state.selectedMapObjectId)}"]`);
    if (editor) {
      editor.open = true;
      editor.scrollIntoView({ behavior: "smooth", block: "center" });
      editor.querySelector("input, select")?.focus({ preventScroll: true });
    }
  });
}

function recordBuilderHistory(label = "Map edit") {
  const map = activeMachineMap();
  if (!map) return;
  state.builderHistory = state.builderHistory || { undo: [], redo: [] };
  state.builderHistory.undo.push({ label, map: deepClone(map) });
  if (state.builderHistory.undo.length > 30) state.builderHistory.undo.shift();
  state.builderHistory.redo = [];
}

function restoreBuilderHistory(direction) {
  const source = direction === "undo" ? state.builderHistory?.undo : state.builderHistory?.redo;
  const destination = direction === "undo" ? state.builderHistory?.redo : state.builderHistory?.undo;
  if (!source?.length) return;
  const current = activeMachineMap();
  destination.push({ label: direction === "undo" ? "Redo" : "Undo", map: deepClone(current) });
  const snapshot = source.pop();
  const index = state.mapLibrary.findIndex((map) => map.id === state.activeMapId);
  if (index >= 0) state.mapLibrary[index] = createMachineMap(snapshot.map);
  loadMachineMapIntoRuntime(state.mapLibrary[index], true);
  saveCurrentSettings();
  render();
  renderWipeDownBuilder();
}

function refreshAfterBuilderEdit({ persist = false } = {}) {
  syncApplicationMapToLegacyState();
  applyGeneratedServoProfile();
  renderMap();
  renderProgram();
  renderSimulation();
  renderValidation();
  renderTopControls();
  if (persist) {
    state.builderSaveState = "saving";
    if (els.builderStatus) els.builderStatus.textContent = "Saving…";
    clearTimeout(builderSaveTimer);
    builderSaveTimer = setTimeout(() => {
      saveCurrentSettings();
      state.builderSaveState = "saved";
      if (els.builderStatus) els.builderStatus.textContent = `Saved • ${activeMachineMap()?.name || "Map"}`;
    }, 120);
  }
}

let builderExpandedStation = null;
