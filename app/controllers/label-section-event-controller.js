"use strict";

(function installLabelSectionEventController(global) {
  if (global.LabelerLabelSectionEventController?.installed) return;

  const PRESENT_THRESHOLD_MM = 1;

  function dimensionPresent(...values) {
    return values.some((value) => Number(value) > PRESENT_THRESHOLD_MM);
  }

  function sectionState(spec) {
    return Object.freeze({
      neck: dimensionPresent(spec?.neckLengthMm, spec?.neckBottomCurveMm),
      body: dimensionPresent(spec?.bodyLengthMm),
      back: dimensionPresent(spec?.backLengthMm)
    });
  }

  global.LabelerLabelSectionEventController = Object.freeze({
    installed: true,
    compatibilityOnly: true,
    thresholdMm: PRESENT_THRESHOLD_MM,
    sectionState
  });
})(window);
