"use strict";

(function installMapBuilderActionController(global) {
  if (global.LabelerMapBuilderActionController?.installed) return;

  const actions = global.LabelerWorkspaceActionService;

  function call(name, ...args) {
    const domainAction = global.LabelerMapBuilderDomainActions?.[name];
    if (typeof domainAction === "function") return domainAction(...args);
    return actions?.call(name, ...args);
  }

  function saveDefinition(eventType = "change") {
    return call("saveMapDefinitionFromControls", { type: eventType });
  }

  function updateObjectType() {
    return call("updateBuilderTypeControls");
  }

  function undo() {
    return call("restoreBuilderHistory", "undo");
  }

  function redo() {
    return call("restoreBuilderHistory", "redo");
  }

  function guidedSetup() {
    return call("runGuidedMapSetup");
  }

  function optimizeColdGlue() {
    return call("optimizeActiveColdGlueMap");
  }

  function createFromCurrent() {
    return call("createMachineMapFromCurrent");
  }

  function selectZone(value) {
    return call("selectMapLibraryZone", value);
  }

  function selectSite(value) {
    return call("selectMapLibrarySite", value);
  }

  function addMachineType() {
    return call("addMachineTypeFromPrompt");
  }

  function deleteActiveMap() {
    return call("deleteActiveMachineMap");
  }

  function addObject() {
    return call("addBuilderObjectFromControls");
  }

  function resetMap() {
    return call("resetActiveBuilderMap");
  }

  global.LabelerMapBuilderActionController = Object.freeze({
    installed: true,
    call,
    saveDefinition,
    updateObjectType,
    undo,
    redo,
    guidedSetup,
    optimizeColdGlue,
    createFromCurrent,
    selectZone,
    selectSite,
    addMachineType,
    deleteActiveMap,
    addObject,
    resetMap
  });
})(window);
