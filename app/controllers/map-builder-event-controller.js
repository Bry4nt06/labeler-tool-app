"use strict";

(function installMapBuilderEventController(global) {
  if (global.LabelerMapBuilderEventController?.installed) return;

  const builder = global.LabelerMapBuilderActionController;
  if (!builder?.installed) throw new Error("Map Builder action controller is not loaded.");

  const definitionFields = new Set([
    "mapName",
    "mapHeadCount",
    "mapRadius",
    "mapReferencePitchRadiusMm",
    "mapEncoderCountsPerRev",
    "mapServoGearRatio",
    "mapZeroAngle",
    "mapMaxMoveRatio"
  ]);

  function consume(event, preventDefault = false) {
    if (preventDefault) event.preventDefault();
    event.stopImmediatePropagation();
  }

  document.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !definitionFields.has(target.id)) return;
    builder.saveDefinition("input");
    consume(event);
  }, true);

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (definitionFields.has(target.id)) builder.saveDefinition("change");
    else if (target.id === "builderObjectType") builder.updateObjectType();
    else if (target.id === "mapMachineType") builder.saveDefinition("change");
    else if (target.id === "mapDirection") builder.saveDefinition("change");
    else if (target.id === "mapAutoScaleTableMap") builder.saveDefinition("change");
    else if (target.id === "mapZone") builder.selectZone(target.value);
    else if (target.id === "mapSite") builder.selectSite(target.value);
    else return;

    consume(event);
  }, true);

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.closest("#undoBuilderEdit")) builder.undo();
    else if (target.closest("#redoBuilderEdit")) builder.redo();
    else if (target.closest("#guidedMapSetup")) builder.guidedSetup();
    else if (target.closest("#optimizeColdGlueMap")) builder.optimizeColdGlue();
    else if (target.closest("#newMachineMap")) builder.createFromCurrent();
    else if (target.closest("#saveMachineMap")) builder.saveDefinition("click");
    else if (target.closest("#addMachineType")) builder.addMachineType();
    else if (target.closest("#deleteMachineMap")) builder.deleteActiveMap();
    else if (target.closest("#addBuilderObject")) builder.addObject();
    else if (target.closest("#resetBuilderMap")) builder.resetMap();
    else return;

    consume(event, true);
  }, true);

  global.LabelerMapBuilderEventController = Object.freeze({
    installed: true,
    definitionFields
  });
})(window);
