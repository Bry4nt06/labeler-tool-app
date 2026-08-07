"use strict";

(function installMapBuilderLayoutController(global) {
  if (global.LabelerMapBuilderLayoutController?.installed) return;

  function consume(event) {
    event.stopImmediatePropagation();
  }

  function aggregateAngleControl(target) {
    if (!target?.matches?.("[data-aggregate-angle]")) return false;
    return Boolean(typeof els !== "undefined" && els.aggregateAngleEditor?.contains(target));
  }

  function spenderPlateAngleControl(target) {
    if (!target?.matches?.("[data-spender-plate-angle]")) return false;
    return Boolean(typeof els !== "undefined" && els.aggregateAngleEditor?.contains(target));
  }

  function machineSlotControl(target) {
    if (!target?.matches?.("[data-machine-slot][data-slot-number]")) return false;
    if (typeof els === "undefined") return false;
    return Boolean(els.aggregateToggleList?.contains(target) || els.stationToggleList?.contains(target));
  }

  function updateAggregateAngle(control) {
    if (!aggregateAngleControl(control)) return false;
    if (["", "-", ".", "-."].includes(String(control.value))) return true;

    const aggregate = String(control.dataset.aggregateAngle || "");
    const editable = typeof editableMachineMap === "function" ? editableMachineMap() : null;
    if (!aggregate || !editable) return false;

    editable.aggregateAngles = normalizeAggregateAngles(
      editable.aggregateAngles,
      editable.applicationMode,
      editable.objects
    );
    editable.aggregateAngles[aggregate] = num(
      control.value,
      editable.aggregateAngles[aggregate]
    );
    editable.stationAngles = normalizeStationAngles(editable.stationAngles);
    editable.stationAngles[aggregate] = editable.aggregateAngles[aggregate];
    refreshAfterBuilderEdit({ persist: true });
    return true;
  }

  function updateSpenderPlateAngle(control) {
    if (!spenderPlateAngleControl(control)) return false;
    if (["", "-", ".", "-."].includes(String(control.value))) return true;
    const aggregate = String(control.dataset.spenderPlateAngle || "");
    const editable = typeof editableMachineMap === "function" ? editableMachineMap() : null;
    if (!aggregate || !editable) return false;
    editable.spenderPlateAngles = normalizeSpenderPlateAngles(editable.spenderPlateAngles);
    editable.spenderPlateAngles[aggregate] = Math.max(0, Math.min(180, num(control.value, editable.spenderPlateAngles[aggregate])));
    refreshAfterBuilderEdit({ persist: true });
    return true;
  }

  function updateMachineSlot(control) {
    if (!machineSlotControl(control)) return false;

    const editable = typeof editableMachineMap === "function" ? editableMachineMap() : null;
    const slotType = control.dataset.machineSlot;
    const slotNumber = Math.round(num(control.dataset.slotNumber, NaN));
    if (!editable
      || !["aggregate", "station"].includes(slotType)
      || !Number.isFinite(slotNumber)
      || slotNumber < 1) return false;

    editable.enabledAggregates = normalizeEnabledSlots(
      editable.enabledAggregates,
      editable.aggregateCount
    );
    editable.enabledStations = normalizeEnabledSlots(
      editable.enabledStations,
      editable.stationCount
    );

    const slots = slotType === "aggregate"
      ? editable.enabledAggregates
      : editable.enabledStations;
    const slotIndex = slotNumber - 1;
    if (slotIndex >= slots.length) return false;

    if (!control.checked && slots.filter(Boolean).length === 1) {
      control.checked = true;
      global.alert?.(`At least one ${slotType} must remain active.`);
      return true;
    }

    slots[slotIndex] = Boolean(control.checked);
    editable.aggregateCount = editable.enabledAggregates.filter(Boolean).length;
    editable.stationCount = editable.enabledStations.filter(Boolean).length;
    ensureAplObjectsForNewStations(editable);
    loadMachineMapIntoRuntime(editable, true);
    saveCurrentSettings();
    renderWipeDownBuilder();
    return true;
  }

  document.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (updateAggregateAngle(target) || updateSpenderPlateAngle(target)) consume(event);
  }, true);

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (updateMachineSlot(target) || updateAggregateAngle(target) || updateSpenderPlateAngle(target)) consume(event);
  }, true);

  global.LabelerMapBuilderLayoutController = Object.freeze({
    installed: true,
    aggregateAngleControl,
    spenderPlateAngleControl,
    machineSlotControl,
    updateAggregateAngle,
    updateSpenderPlateAngle,
    updateMachineSlot
  });
})(window);
