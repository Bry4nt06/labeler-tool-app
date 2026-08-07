"use strict";

(function installApplicationReferenceBuildInputIntegration(global) {
  if (global.LabelerApplicationReferenceBuildInputIntegration?.installed) return;

  const sectionById = Object.freeze({
    neckApplicationReference: "neck",
    bodyApplicationReference: "body",
    backApplicationReference: "back"
  });

  function handleChange(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const section = sectionById[target.id];
    if (!section) return;
    const controller = global.LabelerBuildInputsController;
    if (!controller?.updateApplicationReference) return;
    controller.updateApplicationReference(section, target.value);
    event.stopImmediatePropagation();
  }

  document.addEventListener("change", handleChange, true);

  global.LabelerApplicationReferenceBuildInputIntegration = Object.freeze({
    installed: true,
    sectionById,
    handleChange
  });
})(window);
