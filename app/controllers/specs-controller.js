"use strict";

(function installSpecsController(global) {
  const actions = global.LabelerWorkspaceActionService;
  const bottleNumericFields = new Set(["diameterTargetMm", "radiusReductionMm"]);
  const labelNumericFields = new Set([
    "bodyLengthMm",
    "backLengthMm",
    "neckHeightMm",
    "neckLengthMm",
    "neckBottomCurveMm",
    "neckBottomCircumferenceMm",
    "codeBoxCenterMm"
  ]);
  const labelPresenceFields = new Set([
    "bodyLengthMm",
    "backLengthMm",
    "neckLengthMm",
    "neckBottomCurveMm"
  ]);

  function commit(mutate) {
    return actions.execute({ mutate, persist: true, render: "all" });
  }

  function numericInput(value, fallback = null) {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    return actions.number(value, fallback ?? 0);
  }

  function addBottle() {
    return commit(() => {
      const id = actions.call("nextId", state.bottleSpecs) ?? state.bottleSpecs.length + 1;
      const bottleType = `New Bottle ${id}`;
      state.bottleSpecs.push({
        id,
        bottleType,
        diameterTargetMm: null,
        radiusReductionMm: null
      });
      state.selectedBottle = bottleType;
    });
  }

  function updateBottle(index, key, value) {
    const spec = state.bottleSpecs[index];
    if (!spec) return;
    return commit(() => {
      if (key === "bottleType") {
        const oldBottleType = spec.bottleType;
        const newBottleType = String(value || "").trim() || oldBottleType;
        spec.bottleType = newBottleType;
        if (state.selectedBottle === oldBottleType) state.selectedBottle = newBottleType;
        state.labelSpecs.forEach((label) => {
          if (label.bottleType === oldBottleType) label.bottleType = newBottleType;
        });
        return;
      }
      if (bottleNumericFields.has(key)) spec[key] = numericInput(value, spec[key]);
    });
  }

  function deleteBottle(index) {
    const spec = state.bottleSpecs[index];
    if (!spec || !global.confirm(`Delete bottle spec "${spec.bottleType}"?`)) return;
    return commit(() => {
      const deletedBottleType = spec.bottleType;
      state.bottleSpecs.splice(index, 1);
      const replacement = state.bottleSpecs[0]?.bottleType ?? "";
      if (state.selectedBottle === deletedBottleType) state.selectedBottle = replacement;
      state.labelSpecs.forEach((label) => {
        if (label.bottleType === deletedBottleType) label.bottleType = replacement;
      });
    });
  }

  function addLabel() {
    return actions.execute({
      mutate() {
        const id = actions.call("nextId", state.labelSpecs) ?? state.labelSpecs.length + 1;
        const brand = `New Label ${id}`;
        state.labelSpecs.push({
          id,
          applicationMode: actions.call("normalizeLabelApplicationMode", state.applicationMode) || state.applicationMode,
          brand,
          specNumber: "",
          bottleType: state.selectedBottle,
          bodyLengthMm: null,
          backLengthMm: null,
          neckHeightMm: null,
          neckLengthMm: null,
          neckBottomCurveMm: null,
          neckBottomCircumferenceMm: null,
          codeBoxCenterMm: null
        });
        state.selectedBrand = brand;
        actions.call("applyLabelLengthStationRules");
      },
      regenerate: true,
      persist: true,
      render: "all"
    });
  }

  function updateLabel(index, key, value) {
    const spec = state.labelSpecs[index];
    if (!spec) return;
    const selectedBeforeUpdate = state.selectedBrand === spec.brand;
    const affectsSelectedProgram = selectedBeforeUpdate
      && (labelNumericFields.has(key) || key === "applicationMode");

    return actions.execute({
      mutate() {
        if (key === "applicationMode") {
          spec.applicationMode = actions.call("normalizeLabelApplicationMode", value) || value;
          actions.call("ensureSelectedBrandForApplication");
          actions.call("applyLabelLengthStationRules");
          return;
        }
        const oldBrand = spec.brand;
        if (labelNumericFields.has(key)) spec[key] = numericInput(value, spec[key]);
        else if (key === "brand" || key === "specNumber") spec[key] = String(value ?? "");
        else return;
        if (key === "brand" && state.selectedBrand === oldBrand) state.selectedBrand = spec.brand;
        if (selectedBeforeUpdate && labelPresenceFields.has(key)) actions.call("applyLabelLengthStationRules");
      },
      regenerate: affectsSelectedProgram,
      persist: true,
      render: "all"
    });
  }

  function deleteLabel(index) {
    const spec = state.labelSpecs[index];
    if (!spec || !global.confirm(`Delete label spec "${spec.brand}"?`)) return;
    return actions.execute({
      mutate() {
        state.labelSpecs.splice(index, 1);
        actions.call("ensureSelectedBrandForApplication");
        actions.call("applyLabelLengthStationRules");
      },
      regenerate: true,
      persist: true,
      render: "all"
    });
  }

  global.LabelerSpecsController = Object.freeze({
    addBottle,
    updateBottle,
    deleteBottle,
    addLabel,
    updateLabel,
    deleteLabel
  });
})(window);
