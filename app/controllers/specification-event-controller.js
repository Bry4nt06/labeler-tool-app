"use strict";

(function installSpecificationEventController(global) {
  if (global.LabelerSpecificationEventController?.installed) return;

  const specs = global.LabelerSpecsController;
  if (!specs) throw new Error("Specification controller is not loaded.");

  function rowContext(target) {
    const row = target.closest?.("tbody tr[data-spec-index]");
    const index = Number(row?.dataset.specIndex);
    const library = row?.dataset.specLibrary;
    const field = target.dataset?.specField;
    if (!Number.isInteger(index) || !field || !["bottle", "label"].includes(library)) return null;
    return { index, library, field };
  }

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const context = rowContext(target);
    if (!context) return;

    if (context.library === "bottle") {
      specs.updateBottle(context.index, context.field, target.value);
    } else {
      specs.updateLabel(context.index, context.field, target.value);
    }

    event.stopImmediatePropagation();
  }, true);

  global.LabelerSpecificationEventController = Object.freeze({
    installed: true,
    rowContext
  });
})(window);
