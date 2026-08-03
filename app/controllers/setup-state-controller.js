"use strict";

(function installSetupStateController(global) {
  const map = global.LabelerMapController;

  function setValue(element, value) {
    if (!element) return;
    element.value = value == null ? "" : String(value);
  }

  function setChecked(element, value) {
    if (element) element.checked = Boolean(value);
  }

  function initialize() {
    if (!map) throw new Error("Map controller must load before setup state initialization.");

    if (typeof bindZoneSiteDeveloperMenu === "function") bindZoneSiteDeveloperMenu();
    if (typeof setThemePreset === "function") setThemePreset(state.themePreset);
    if (typeof setWorkspaceView === "function") setWorkspaceView(state.workspaceView);

    setValue(els.themePreset, state.themePreset);
    setValue(els.workspaceView, state.workspaceView);
    setValue(els.headCount, state.headCount);
    setValue(els.radius, state.radius);
    setValue(els.zeroAngle, state.zeroAngle);
    setValue(els.referencePitchRadiusMm, state.referencePitchRadiusMm);
    setValue(els.encoderCountsPerRev, state.encoderCountsPerRev);
    setValue(els.servoGearRatio, state.servoGearRatio);
    setValue(els.previewAngle, state.previewAngle);
    setValue(els.tableAngleJump, typeof fmt === "function" ? fmt(typeof norm === "function" ? norm(state.previewAngle) : state.previewAngle, 1) : state.previewAngle);
    setValue(els.previewBottleAngle, state.previewBottleAngle !== null && state.previewBottleAngle !== "" && Number.isFinite(Number(state.previewBottleAngle))
      ? (typeof fmt === "function" ? fmt(state.previewBottleAngle, 1) : state.previewBottleAngle)
      : "");
    setValue(els.animationSpeed, state.animationSpeed);
    setValue(els.maxMoveRatio, state.maxMoveRatio);
    setValue(els.spenderDepth, state.depths?.spender);
    setValue(els.opRollerDepth, state.depths?.opRoller);
    setValue(els.nonOpRollerDepth, state.depths?.nonOpRoller);
    setValue(els.wipeInnerDepth, state.depths?.wipeInner);
    setValue(els.wipeOuterDepth, state.depths?.wipeOuter);
    setValue(els.direction, state.direction);
    setValue(els.tablePitchRadiusMm, state.tablePitchRadiusMm);
    setValue(els.padClearanceMm, state.padClearanceMm);

    setChecked(els.autoScaleTableMap, state.autoScaleTableMap);
    setChecked(els.showQuadrantReferences, state.showQuadrantReferences);
    setChecked(els.showMoveDistanceOverlay, state.showMoveDistanceOverlay);
    setChecked(els.showAllProgramMovesOverlay, state.showAllProgramMovesOverlay);

    if (els.animationStepReadout) {
      els.animationStepReadout.textContent = `${typeof fmt === "function" ? fmt(state.animationSpeed, 1) : state.animationSpeed} deg / sec`;
    }
    els.toggleAggregateSpacing?.setAttribute("aria-pressed", String(Boolean(state.showAggregateSpacingOverlay)));

    if (els.applicationSetupDialog) els.applicationSetupDialog.hidden = !state.wipeBuilderOpen;
    els.mapRightRail?.classList.toggle("builder-open", Boolean(state.wipeBuilderOpen));
    els.labelerMapReference?.classList.toggle("builder-open", Boolean(state.wipeBuilderOpen));
    els.labelerMapButton?.setAttribute("aria-pressed", String(Boolean(els.labelerMapReference && !els.labelerMapReference.hidden)));

    map.updateLockUi();
  }

  global.LabelerSetupStateController = Object.freeze({ initialize });
})(window);
