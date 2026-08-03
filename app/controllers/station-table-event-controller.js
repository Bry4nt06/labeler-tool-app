"use strict";

(function installStationTableEventController(global) {
  if (global.LabelerStationTableEventController?.installed) return;

  const stations = global.LabelerStationTableController;
  if (!stations) throw new Error("Station table controller is not loaded.");

  function consume(event) {
    event.stopImmediatePropagation();
  }

  function stationContext(target) {
    if (!(target instanceof Element) || typeof els === "undefined" || !els.stations?.contains(target)) return null;
    const row = target.closest("tr[data-station-row-index]");
    const index = Number(row?.dataset.stationRowIndex);
    const field = target.dataset?.stationField;
    if (!Number.isInteger(index) || !field) return null;
    return { index, field };
  }

  function updateField(target) {
    const context = stationContext(target);
    if (!context) return false;
    if (context.field === "name") stations.updateName(context.index, target.value);
    else if (context.field === "angle") stations.updateAngle(context.index, target.value);
    else return false;
    return true;
  }

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !updateField(target)) return;
    consume(event);
  }, true);

  global.LabelerStationTableEventController = Object.freeze({
    installed: true,
    stationContext,
    updateField
  });
})(window);
