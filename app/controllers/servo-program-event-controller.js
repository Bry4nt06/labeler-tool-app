"use strict";

(function installServoProgramEventController(global) {
  if (global.LabelerServoProgramEventController?.installed) return;

  const program = global.LabelerServoProgramController;
  if (!program) throw new Error("Servo Program controller is not loaded.");

  function consume(event) {
    event.stopImmediatePropagation();
  }

  function programContext(target) {
    if (!(target instanceof Element) || typeof els === "undefined" || !els.program?.contains(target)) return null;
    const row = target.closest("tr[data-program-hmi]");
    const hmi = Number(row?.dataset.programHmi);
    const field = target.dataset?.programField;
    if (!Number.isFinite(hmi) || !field) return null;
    return { hmi, field };
  }

  function updateCommittedField(target) {
    const context = programContext(target);
    if (!context || context.field === "action") return false;
    if (context.field === "command") program.updateCommand(context.hmi, target.value);
    else if (context.field === "tableAngle" || context.field === "plateAngle") {
      program.updateOverride(context.hmi, context.field, target.value);
    } else return false;
    return true;
  }

  function updateAction(target) {
    const context = programContext(target);
    if (!context || context.field !== "action") return false;
    program.updateAction(context.hmi, target.value);
    return true;
  }

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !updateCommittedField(target)) return;
    consume(event);
  }, true);

  document.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !updateAction(target)) return;
    consume(event);
  }, true);

  global.LabelerServoProgramEventController = Object.freeze({
    installed: true,
    programContext,
    updateCommittedField,
    updateAction
  });
})(window);
