"use strict";

(function installSetupEventControllerIntegration(global) {
  if (global.LabelerSetupEventControllers?.installed) return;

  const settings = global.LabelerSettingsController;
  const map = global.LabelerMapController;
  const specs = global.LabelerSpecsController;
  const build = global.LabelerBuildInputsController;
  const tabs = global.LabelerTabsController;
  const transfer = global.LabelerTransferController;
  const simulation = global.LabelerSimulationController;
  const program = global.LabelerServoProgramController;
  const simulationEditor = global.LabelerSimulationEditorController;
  const stations = global.LabelerStationTableController;
  const application = global.LabelerApplicationController;
  if (![settings, map, specs, build, tabs, transfer, simulation, program, simulationEditor, stations, application].every(Boolean)) {
    throw new Error("Setup event controllers are not fully loaded.");
  }

  const simpleBuildFields = new Set([
    "neckSpenderPlateDeg",
    "neckOverWipeDeg",
    "bodyOverWipeDeg",
    "backOverWipeDeg",
    "plateStartPositionDeg",
    "neckOffsetMm",
    "bodyOffsetMm",
    "backOffsetMm",
    "backInspectionOffsetMm"
  ]);
  const calculatedBuildFields = new Set([
    "programNeckCurveMm",
    "programBodyLengthMm",
    "programBackLengthMm",
    "programNeckCircMm",
    "programBodyCircMm",
    "programNeckLabelDeg",
    "programBodyLabelDeg",
    "programBackLabelDeg",
    "programNeckContactDeg",
    "programBodyContactDeg",
    "programBackContactDeg",
    "programCenterLineFrontDeg",
    "programCenterLineBackDeg",
    "programCodeBoxCenterDeg",
    "programHeadPitchDeg",
    "programTableMapScale",
    "programEncoderCountsPlateRev",
    "programMaxMoveRatio"
  ]);
  const depthKeys = Object.freeze({
    spenderDepth: "spender",
    opRollerDepth: "opRoller",
    nonOpRollerDepth: "nonOpRoller",
    wipeInnerDepth: "wipeInner",
    wipeOuterDepth: "wipeOuter"
  });

  let pendingBottleRenderTimer = 0;

  function consume(event, preventDefault = false) {
    if (preventDefault) event.preventDefault();
    event.stopImmediatePropagation();
  }

  function scheduleBottleSelectionRender() {
    const enqueue = () => {
      if (pendingBottleRenderTimer && typeof global.clearTimeout === "function") {
        global.clearTimeout(pendingBottleRenderTimer);
      }
      pendingBottleRenderTimer = global.setTimeout(() => {
        pendingBottleRenderTimer = 0;
        global.LabelerWorkspaceActionService?.render?.("all");
      }, 0);
    };

    if (typeof global.requestAnimationFrame === "function") global.requestAnimationFrame(enqueue);
    else enqueue();
  }

  function rowIndex(target, container) {
    const row = target.closest?.("tbody tr");
    if (!row || !container?.contains(row)) return -1;
    return Array.from(row.parentElement?.children || []).indexOf(row);
  }

  function handleSimulationChange(target) {
    if (!els.simulation?.contains(target)) return false;
    if (target.id === "servoProfileLibrarySelect") {
      simulationEditor.selectProfile(target.value);
      return true;
    }
    const row = target.closest?.("tr[data-simulation-source-index]");
    const sourceIndex = Number(row?.dataset.simulationSourceIndex);
    const field = target.dataset?.simulationField;
    if (!Number.isInteger(sourceIndex) || !field || field === "action") return false;
    if (field === "command") simulationEditor.updateCommand(sourceIndex, target.value);
    else if (field === "tableAngle") simulationEditor.updateTableAngle(sourceIndex, target.value);
    else if (field === "plateAngle") simulationEditor.updatePlateAngle(sourceIndex, target.value);
    else return false;
    return true;
  }

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (handleSimulationChange(target)) { consume(event); return; }

    if (target === els.themePreset) settings.setTheme(target.value);
    else if (target === els.workspaceView) settings.setWorkspaceView(target.value);
    else if (target === els.headCount) settings.setMapSetting("headCount", LabelerWorkspaceActionService.number(target.value, state.headCount));
    else if (target === els.radius) settings.setMapSetting("radius", LabelerWorkspaceActionService.number(target.value, state.radius));
    else if (target === els.zeroAngle) settings.setMapSetting("zeroAngle", LabelerWorkspaceActionService.number(target.value, state.zeroAngle));
    else if (target === els.referencePitchRadiusMm) settings.setGeometry("referencePitchRadiusMm", target.value);
    else if (target === els.encoderCountsPerRev) settings.setGeometry("encoderCountsPerRev", target.value);
    else if (target === els.servoGearRatio) settings.setGeometry("servoGearRatio", target.value);
    else if (target === els.autoScaleTableMap) settings.setMapSetting("autoScaleTableMap", target.checked);
    else if (target === els.showQuadrantReferences) settings.setQuadrantReferences(target.checked);
    else if (target === els.tableAngleJump) map.setPreviewAngle(target.value, true);
    else if (target === els.previewBottleAngle) map.setPreviewBottleAngle(target.value);
    else if (target === els.maxMoveRatio) settings.setMapSetting("maxMoveRatio", Math.max(0.1, LabelerWorkspaceActionService.number(target.value, state.maxMoveRatio)));
    else if (depthKeys[target.id]) settings.commitDepth(depthKeys[target.id], LabelerWorkspaceActionService.number(target.value, state.depths[depthKeys[target.id]]));
    else if (target === els.showMoveDistanceOverlay) settings.setMovementOverlay("distance", target.checked);
    else if (target === els.showAllProgramMovesOverlay) settings.setMovementOverlay("all", target.checked);
    else if (target === els.direction) map.setDirection(target.value);
    else if (target === els.tablePitchRadiusMm || target === els.padClearanceMm) settings.setAssemblyGeometry(els.tablePitchRadiusMm?.value, els.padClearanceMm?.value);
    else if (target === els.importSettings) transfer.importSettings(target.files?.[0]);
    else if (target === els.importFaultConfig) transfer.importFaultConfig(target.files?.[0]);
    else if (target === els.applicationMode) application.setMode(target.value);
    else if (target === els.mapLibrarySelect) application.selectMachineMap(target.value);
    else if (target.id === "zoneSelect") build.selectZone(target.value);
    else if (target.id === "siteSelect") build.selectSite(target.value);
    else if (target.id === "brandSelect") build.selectBrand(target.value);
    else if (target.id === "bottleSelect") {
      const accepted = build.selectBottle(target.value, { render: null });
      if (accepted === false) target.value = state.selectedBottle;
      else scheduleBottleSelectionRender();
    }
    else if (simpleBuildFields.has(target.id)) build.updateField(target.id, target.value);
    else if (target.id === "neckApplication") build.updateNeckApplication(target.value);
    else if (calculatedBuildFields.has(target.id)) build.updateCalculatedField(target.id, target.value);
    else return;

    consume(event);
  }, true);

  document.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.dataset?.simulationField === "action" && els.simulation?.contains(target)) {
      const sourceIndex = Number(target.closest?.("tr[data-simulation-source-index]")?.dataset.simulationSourceIndex);
      if (Number.isInteger(sourceIndex)) simulationEditor.updateAction(sourceIndex, target.value);
      else return;
    }
    else if (target === els.previewAngle) map.setPreviewAngle(target.value, false);
    else if (target === els.animationSpeed) simulation.setSpeed(target.value);
    else return;
    consume(event);
  }, true);

  document.addEventListener("focusin", (event) => {
    if (event.target !== els.tableAngleJump) return;
    simulation.pause();
    consume(event);
  }, true);

  document.addEventListener("submit", (event) => {
    if (event.target !== els.tableAngleJumpForm) return;
    map.setPreviewAngle(els.tableAngleJump?.value, true);
    consume(event, true);
  }, true);

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const validationNotice = target.closest("[data-validation-object-id]");
    if (validationNotice) {
      LabelerWorkspaceActionService.call("selectMapBuilderObject", validationNotice.dataset.validationObjectId);
      consume(event);
      return;
    }
    const bottleDelete = target.closest("#bottleSpecs tbody .danger");
    if (bottleDelete) {
      specs.deleteBottle(rowIndex(bottleDelete, els.bottleSpecs));
      consume(event);
      return;
    }
    const labelDelete = target.closest("#labelSpecs tbody .danger");
    if (labelDelete) {
      specs.deleteLabel(rowIndex(labelDelete, els.labelSpecs));
      consume(event);
      return;
    }
    const simulationDelete = target.closest(".simulation-delete-line");
    if (simulationDelete) {
      const sourceIndex = Number(simulationDelete.closest?.("tr[data-simulation-source-index]")?.dataset.simulationSourceIndex);
      simulationEditor.deleteLine(sourceIndex);
      consume(event);
      return;
    }
    if (target.closest(".simulation-add-line")) {
      simulationEditor.addLineBeforeEnd();
      consume(event);
      return;
    }
    const tab = target.closest(".tab");
    if (tab) {
      tabs.activate(tab.dataset.tab, tab);
      consume(event);
      return;
    }
    const insertButton = target.closest(".simulation-insert-pair");
    if (insertButton) {
      simulation.insertPair(Number(insertButton.dataset.simulationLineIndex));
      consume(event);
      return;
    }

    if (target.closest("#addBottleSpec")) specs.addBottle();
    else if (target.closest("#addLabelSpec")) specs.addLabel();
    else if (target.closest("#saveServoProfile")) simulationEditor.saveProfile(
      els.simulation?.querySelector("#servoProfileName")?.value,
      els.simulation?.querySelector("#servoProfileDescription")?.value
    );
    else if (target.closest("#loadServoProfile")) simulationEditor.loadProfile(els.simulation?.querySelector("#servoProfileLibrarySelect")?.value);
    else if (target.closest("#deleteServoProfile")) simulationEditor.deleteProfile(els.simulation?.querySelector("#servoProfileLibrarySelect")?.value);
    else if (target === els.playPause) simulation.togglePlayback();
    else if (target === els.applicationSetupButton) map.setBuilderOpen(!state.wipeBuilderOpen);
    else if (target === els.closeApplicationSetup) map.setBuilderOpen(false);
    else if (target === els.applyApplicationSetup) map.applyBuilder();
    else if (target === els.labelerMapButton) map.setLabelerMapOpen(els.labelerMapReference?.hidden);
    else if (target === els.closeLabelerMap) map.setLabelerMapOpen(false);
    else if (target === els.mapLockToggle) map.toggleLock();
    else if (target === els.undoMapEdit) map.undo();
    else if (target === els.resetMapView) map.resetView();
    else if (target === els.toggleAggregateSpacing) {
      settings.setAggregateSpacing(!state.showAggregateSpacingOverlay);
      target.setAttribute("aria-pressed", String(state.showAggregateSpacingOverlay));
    }
    else if (target.closest("#exportJson")) transfer.exportJson();
    else if (target === els.exportSettings) transfer.exportSettings();
    else if (target.closest("#exportCsv")) transfer.exportCsv();
    else if (target === els.saveSettings) transfer.saveSettings();
    else if (target === els.checkForUpdates) transfer.checkForUpdates();
    else if (target === els.exportMachineMap) transfer.exportMachineMap();
    else if (target === els.loadGeneratedTurns) simulation.loadGeneratedTurns();
    else if (target === els.clearCustomTurns) simulation.clearCustomTurns();
    else return;

    consume(event);
  }, true);

  document.addEventListener("wheel", (event) => {
    if (!els.mapSvg?.contains(event.target)) return;
    map.zoom(event.deltaY);
    consume(event, true);
  }, { capture: true, passive: false });

  document.addEventListener("pointerdown", (event) => {
    if (!map.beginPointer(event)) return;
    consume(event, true);
  }, true);
  document.addEventListener("pointermove", (event) => {
    if (!map.movePointer(event)) return;
    consume(event, true);
  }, true);
  document.addEventListener("pointerup", (event) => {
    if (!map.finishPointer(event)) return;
    consume(event);
  }, true);
  document.addEventListener("pointercancel", (event) => {
    if (!map.finishPointer(event)) return;
    consume(event);
  }, true);

  global.LabelerSetupEventControllers = Object.freeze({
    installed: true,
    settings,
    map,
    specs,
    buildInputs: build,
    tabs,
    transfer,
    simulation,
    servoProgram: program,
    simulationEditor,
    stationTable: stations,
    application
  });
})(window);
