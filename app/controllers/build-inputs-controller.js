"use strict";

(function installBuildInputsController(global) {
  const actions = global.LabelerWorkspaceActionService;

  function hasOption(options, key) {
    return Object.prototype.hasOwnProperty.call(options, key);
  }

  function commit(mutate, options = {}) {
    return actions.execute({
      mutate,
      syncMap: Boolean(options.syncMap),
      regenerate: Boolean(options.regenerate),
      persist: options.persist !== false,
      render: hasOption(options, "render") ? options.render : "all"
    });
  }

  function selectedContext() {
    const label = actions.call("selectedLabelSpec") || state.labelSpecs.find((row) => row.brand === state.selectedBrand);
    const bottle = state.bottleSpecs.find((row) => row.bottleType === state.selectedBottle);
    const bodyCirc = actions.call("bodyCircumference", bottle) ?? 0;
    const neckCirc = actions.number(label?.neckBottomCircumferenceMm, 0);
    const neckLabelDeg = actions.call("degFromMm", label?.neckBottomCurveMm, neckCirc) ?? 0;
    return { label, bottle, bodyCirc, neckCirc, neckLabelDeg };
  }

  function bottleKey(value) {
    return String(value ?? "").trim().toLowerCase();
  }

  function selectedLabel() {
    return actions.call("selectedLabelSpec")
      || state.labelSpecs.find((row) => String(row?.brand ?? "") === String(state.selectedBrand ?? ""))
      || null;
  }

  function selectZone(value) {
    commit(() => {
      state.selectedZone = value;
      actions.call("ensureSelectedZoneAndSite");
    });
  }

  function selectSite(value) {
    commit(() => { state.selectedSite = value; }, { render: null });
  }

  function selectBrand(value) {
    commit(() => {
      state.selectedBrand = value;
      actions.call("ensureBottleReferenceForLabel", actions.call("selectedLabelSpec"));
      actions.call("applyLabelLengthStationRules");
    }, { regenerate: true });
  }

  function selectBottle(value, options = {}) {
    const requestedBottleType = bottleKey(value);
    const selected = state.bottleSpecs.find((row) => bottleKey(row?.bottleType) === requestedBottleType);
    if (!selected) return false;

    const commitOptions = { regenerate: true };
    if (hasOption(options, "render")) commitOptions.render = options.render;

    return commit(() => {
      state.selectedBottle = selected.bottleType;
      const label = selectedLabel();
      if (label) label.bottleType = selected.bottleType;
    }, commitOptions);
  }

  function updateField(key, value) {
    commit(() => { state.buildInputs[key] = actions.number(value, state.buildInputs[key]); });
  }

  function updateNeckApplication(value) {
    commit(() => { state.buildInputs.neckApplication = value; });
  }

  function updateCalculatedField(id, rawValue) {
    const value = actions.number(rawValue, 0);
    const context = selectedContext();
    commit(() => {
      const { label, bottle, bodyCirc, neckCirc, neckLabelDeg } = context;
      switch (id) {
        case "programNeckCurveMm":
          if (label) label.neckBottomCurveMm = Math.max(0, value);
          break;
        case "programBodyLengthMm":
          if (label) label.bodyLengthMm = Math.max(0, value);
          break;
        case "programBackLengthMm":
          if (label) label.backLengthMm = Math.max(0, value);
          break;
        case "programNeckCircMm":
          if (label) label.neckBottomCircumferenceMm = Math.max(0.001, value);
          break;
        case "programBodyCircMm":
          if (bottle) bottle.diameterTargetMm = Math.max(0.001, value) / Math.PI + 2 * actions.number(bottle.radiusReductionMm, 0);
          break;
        case "programNeckLabelDeg":
          if (label) label.neckBottomCurveMm = Math.max(0, value) / 360 * Math.max(0.001, neckCirc);
          break;
        case "programBodyLabelDeg":
          if (label) label.bodyLengthMm = Math.max(0, value) / 360 * Math.max(0.001, bodyCirc);
          break;
        case "programBackLabelDeg":
          if (label) label.backLengthMm = Math.max(0, value) / 360 * Math.max(0.001, bodyCirc);
          break;
        case "programNeckContactDeg":
          state.buildInputs.neckContactMm = Math.max(0, value) / 360 * Math.max(0.001, neckCirc);
          break;
        case "programBodyContactDeg":
          state.buildInputs.bodyContactMm = Math.max(0, value) / 360 * Math.max(0.001, bodyCirc);
          break;
        case "programBackContactDeg":
          state.buildInputs.backContactMm = Math.max(0, value) / 360 * Math.max(0.001, bodyCirc);
          break;
        case "programCenterLineFrontDeg":
          if (state.buildInputs.neckApplication === "Leading Edge") state.buildInputs.plateStartPositionDeg = value - neckLabelDeg / 2;
          else state.buildInputs.neckSpenderPlateDeg = value - state.buildInputs.plateStartPositionDeg + 90;
          break;
        case "programCenterLineBackDeg": {
          const front = value - 180;
          if (state.buildInputs.neckApplication === "Leading Edge") state.buildInputs.plateStartPositionDeg = front - neckLabelDeg / 2;
          else state.buildInputs.neckSpenderPlateDeg = front - state.buildInputs.plateStartPositionDeg + 90;
          break;
        }
        case "programCodeBoxCenterDeg":
          if (label) label.codeBoxCenterMm = Math.max(0, value) / 360 * Math.max(0.001, bodyCirc);
          break;
        case "programHeadPitchDeg":
          state.headCount = Math.max(1, Math.min(120, Math.round(360 / Math.max(0.1, value))));
          break;
        case "programTableMapScale":
          state.autoScaleTableMap = true;
          state.referencePitchRadiusMm = Math.max(0.001, value) * state.tablePitchRadiusMm;
          break;
        case "programEncoderCountsPlateRev":
          state.encoderCountsPerRev = Math.max(1, value) / Math.max(0.001, state.servoGearRatio);
          break;
        case "programMaxMoveRatio":
          state.maxMoveRatio = Math.max(0.1, value);
          break;
        default:
          return;
      }
    }, { syncMap: true });
  }

  global.LabelerBuildInputsController = Object.freeze({
    selectZone,
    selectSite,
    selectBrand,
    selectBottle,
    updateField,
    updateNeckApplication,
    updateCalculatedField
  });
})(window);
