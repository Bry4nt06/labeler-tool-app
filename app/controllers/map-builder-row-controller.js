"use strict";

(function installMapBuilderRowController(global) {
  if (global.LabelerMapBuilderRowController?.installed) return;

  const booleanFields = new Set([
    "servoAssist",
    "holdBottleAngle",
    "holdCurrentBottleAngle"
  ]);
  const textFields = new Set(["name", "side", "role"]);
  const rerenderFields = new Set([
    "station",
    "holdBottleAngle",
    "holdCurrentBottleAngle"
  ]);
  const deleteObjectSelectors = [
    ".builder-delete",
    ".builder-delete-object",
    ".delete-builder-object",
    ".map-object-delete",
    "[data-builder-delete-object]",
    "[data-delete-builder-object]",
    "[data-delete-map-object]",
    "[data-action='delete-object']",
    "[data-map-action='delete-object']",
    "#deleteBuilderObject",
    "#deleteMapObject"
  ].join(",");
  const deleteStationSelectors = [
    ".builder-delete-station",
    ".delete-builder-station",
    ".map-station-delete",
    "[data-builder-delete-station]",
    "[data-delete-builder-station]",
    "[data-delete-map-station]",
    "[data-action='delete-station']",
    "[data-map-action='delete-station']",
    "#deleteBuilderStation",
    "#deleteMapStation"
  ].join(",");

  function builderContains(node) {
    return Boolean(typeof els !== "undefined" && els.wipeBuilderList?.contains(node));
  }

  function rowContext(target) {
    const row = target?.closest?.(".wipe-builder-row[data-builder-object-id]");
    if (!row || !builderContains(row)) return null;
    return { row, objectId: String(row.dataset.builderObjectId || "") };
  }

  function editableObject(objectId) {
    const editable = typeof editableMachineMap === "function" ? editableMachineMap() : null;
    if (!editable || !Array.isArray(editable.objects)) return null;
    const index = editable.objects.findIndex((entry) => String(entry?.id) === String(objectId));
    if (index < 0) return null;
    const item = normalizeBuilderObject(editable.objects[index], editable.applicationMode, editable.stationCount);
    return { editable, index, item };
  }

  function consume(event, preventDefault = false) {
    if (preventDefault) event.preventDefault();
    event.stopImmediatePropagation();
  }

  function normalizedControlText(control) {
    return String(control?.textContent || control?.getAttribute?.("aria-label") || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function dataValue(node, keys) {
    if (!node?.dataset) return "";
    for (const key of keys) {
      const value = node.dataset[key];
      if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
    }
    return "";
  }

  function objectContextElement(control) {
    return control?.closest?.("[data-builder-object-id],[data-map-object-id],[data-object-id]") || null;
  }

  function objectIdFromControl(control, allowSelected = true) {
    const row = rowContext(control);
    if (row?.objectId) return row.objectId;
    const context = objectContextElement(control);
    const explicit = dataValue(control, [
      "builderObjectId",
      "mapObjectId",
      "objectId",
      "builderDeleteObject",
      "deleteBuilderObject",
      "deleteMapObject"
    ]) || dataValue(context, ["builderObjectId", "mapObjectId", "objectId"]);
    if (explicit) return explicit;
    return allowSelected ? String(state.selectedMapObjectId || "") : "";
  }

  function stationContextElement(control) {
    return control?.closest?.(".configured-station-group[data-station-group],[data-station-number],[data-station]") || null;
  }

  function stationFromControl(control, allowSelected = true) {
    const context = stationContextElement(control);
    const explicit = dataValue(control, [
      "stationGroup",
      "stationNumber",
      "station",
      "builderDeleteStation",
      "deleteBuilderStation",
      "deleteMapStation"
    ]) || dataValue(context, ["stationGroup", "stationNumber", "station"]);
    const parsed = Math.round(num(explicit, NaN));
    if (Number.isFinite(parsed)) return parsed;
    if (!allowSelected) return NaN;
    const selected = editableObject(state.selectedMapObjectId);
    return Math.round(num(selected?.item?.station, NaN));
  }

  function isDeleteObjectControl(control) {
    if (!control || control.id === "deleteMachineMap") return false;
    if (control.matches?.(deleteObjectSelectors)) return true;
    const label = normalizedControlText(control);
    if (label === "delete object" || label === "delete selected object") return true;
    return label === "delete" && Boolean(objectIdFromControl(control, false));
  }

  function isDeleteStationControl(control) {
    if (!control) return false;
    if (control.matches?.(deleteStationSelectors)) return true;
    const label = normalizedControlText(control);
    if (label === "delete station" || label === "remove station") return true;
    return label === "delete" && Number.isFinite(stationFromControl(control, false));
  }

  function recordFieldHistory(target) {
    const context = rowContext(target);
    if (!context || !target.dataset?.builderField) return false;
    if (target.dataset.builderHistoryRecorded === "true") return true;
    const resolved = editableObject(context.objectId);
    if (!resolved) return false;
    recordBuilderHistory(`Edit ${resolved.item.name}`);
    target.dataset.builderHistoryRecorded = "true";
    return true;
  }

  function updateField(target, persist = false) {
    const context = rowContext(target);
    const field = target.dataset?.builderField;
    if (!context || !field) return false;

    const booleanField = booleanFields.has(field);
    const numericField = !booleanField && !textFields.has(field);
    if (numericField && ["", "-", ".", "-."].includes(String(target.value))) return true;

    const resolved = editableObject(context.objectId);
    if (!resolved) return false;
    const { editable, index, item } = resolved;
    item[field] = booleanField
      ? Boolean(target.checked)
      : numericField
        ? num(target.value, item[field])
        : target.value;
    if (field === "angle") item.start = item.end = item.angle;
    editable.objects[index] = normalizeBuilderObject(item, editable.applicationMode, editable.stationCount);

    if (field === "name") {
      const summaryName = context.row.querySelector("summary strong");
      if (summaryName) summaryName.textContent = editable.objects[index].name;
    }

    refreshAfterBuilderEdit({ persist: true });
    if (persist && rerenderFields.has(field)) renderWipeDownBuilder();
    return true;
  }

  function updateStationSection(target) {
    const context = rowContext(target);
    if (!context || !target.matches?.("[data-station-section]")) return false;
    const resolved = editableObject(context.objectId);
    if (!resolved) return false;
    const { editable, item } = resolved;
    editable.stationSections = editable.stationSections && typeof editable.stationSections === "object"
      ? editable.stationSections
      : {};
    const key = String(item.station);
    if (target.value === "auto") delete editable.stationSections[key];
    else editable.stationSections[key] = target.value;
    refreshAfterBuilderEdit({ persist: true });
    renderWipeDownBuilder();
    return true;
  }

  function selectObject(objectId) {
    if (!objectId) return false;
    state.selectedMapObjectId = objectId;
    global.requestAnimationFrame(renderMap);
    return true;
  }

  function mutateObjectRemoval(objectId, historyVerb = "Remove") {
    const resolved = editableObject(objectId);
    if (!resolved) return false;
    recordBuilderHistory(`${historyVerb} ${resolved.item.name}`);
    resolved.editable.objects.splice(resolved.index, 1);
    if (String(state.selectedMapObjectId || "") === String(objectId)) state.selectedMapObjectId = "";
    refreshAfterBuilderEdit({ persist: true });
    renderWipeDownBuilder();
    return true;
  }

  function removeObject(objectId) {
    return mutateObjectRemoval(objectId, "Remove");
  }

  function deleteObject(objectId, requireConfirmation = true) {
    const resolved = editableObject(objectId);
    if (!resolved) {
      global.alert?.("Select a map object before deleting it.");
      return false;
    }
    if (requireConfirmation
      && typeof global.confirm === "function"
      && !global.confirm(`Delete "${resolved.item.name}" from this map?`)) return false;
    return mutateObjectRemoval(objectId, "Delete");
  }

  function deleteStation(sourceStation, requireConfirmation = true) {
    const station = Math.round(num(sourceStation, NaN));
    const editable = typeof editableMachineMap === "function" ? editableMachineMap() : null;
    if (!editable || !Number.isFinite(station) || station < 1) {
      global.alert?.("Select a station before deleting it.");
      return false;
    }

    const entries = editable.objects.filter((raw) => raw.kind !== "coding" && Number(raw.station) === station);
    const activeStations = activeSlotNumbers(editable.enabledStations || []);
    const stationIsActive = activeStations.includes(station);
    if (!entries.length && !stationIsActive) return false;

    const noun = entries.length === 1 ? "object" : "objects";
    if (requireConfirmation
      && typeof global.confirm === "function"
      && !global.confirm(`Delete Station ${station} and its ${entries.length} ${noun}?`)) return false;

    recordBuilderHistory(`Delete Station ${station}`);
    const removedIds = new Set(entries.map((entry) => String(entry.id)));
    editable.objects = editable.objects.filter((raw) => raw.kind === "coding" || Number(raw.station) !== station);
    if (removedIds.has(String(state.selectedMapObjectId || ""))) state.selectedMapObjectId = "";

    editable.stationSections = editable.stationSections && typeof editable.stationSections === "object"
      ? editable.stationSections
      : {};
    delete editable.stationSections[String(station)];

    if (Array.isArray(editable.enabledStations) && stationIsActive && activeStations.length > 1) {
      editable.enabledStations[station - 1] = false;
    }
    if (Array.isArray(editable.enabledStations)) {
      editable.stationCount = Math.max(1, editable.enabledStations.filter(Boolean).length);
    }

    builderExpandedStation = null;
    refreshAfterBuilderEdit({ persist: true });
    renderWipeDownBuilder();
    return true;
  }

  function duplicateObject(objectId) {
    const resolved = editableObject(objectId);
    if (!resolved) return false;
    const { editable, item } = resolved;
    recordBuilderHistory(`Duplicate ${item.name}`);
    editable.objects.push(normalizeBuilderObject({
      ...deepClone(item),
      id: uniqueMapId(editable.applicationMode),
      name: `${item.name} Copy`
    }, editable.applicationMode, editable.stationCount));
    builderExpandedStation = String(item.kind === "coding" ? "coding" : item.station);
    refreshAfterBuilderEdit({ persist: true });
    renderWipeDownBuilder();
    return true;
  }

  function duplicateStation(sourceStation) {
    const station = Math.round(num(sourceStation, NaN));
    const editable = typeof editableMachineMap === "function" ? editableMachineMap() : null;
    if (!editable || !Number.isFinite(station)) return false;

    const targetRaw = global.prompt(`Duplicate Station ${station} to which station number?`, "");
    const targetStation = Math.round(num(targetRaw, NaN));
    if (!Number.isFinite(targetStation)
      || !activeSlotNumbers(editable.enabledStations).includes(targetStation)
      || targetStation === station) return false;

    const entries = editable.objects.filter((raw) => (
      itemApplicationMode(raw) === state.applicationMode
      && raw.kind !== "coding"
      && Number(raw.station) === station
    ));
    if (!entries.length) return false;

    recordBuilderHistory(`Duplicate Station ${station}`);
    const sourceAngle = num(editable.aggregateAngles?.[String(station)], 0);
    const targetAngle = num(editable.aggregateAngles?.[String(targetStation)], sourceAngle);
    const offset = targetAngle - sourceAngle;
    entries.forEach((raw) => {
      const copy = normalizeBuilderObject({
        ...deepClone(raw),
        id: uniqueMapId(editable.applicationMode),
        name: `${raw.name} - Station ${targetStation}`,
        station: targetStation
      }, editable.applicationMode, editable.stationCount);
      if (Number.isFinite(Number(copy.angle))) copy.angle += offset;
      copy.start += offset;
      copy.end += offset;
      editable.objects.push(copy);
    });
    refreshAfterBuilderEdit({ persist: true });
    builderExpandedStation = String(targetStation);
    renderWipeDownBuilder();
    return true;
  }

  document.addEventListener("focus", (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !recordFieldHistory(target)) return;
    consume(event);
  }, true);

  document.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !updateField(target, false)) return;
    consume(event);
  }, true);

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (updateStationSection(target) || updateField(target, true)) consume(event);
  }, true);

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const control = target.closest?.("button,[role='button']") || target;

    if (isDeleteObjectControl(control)) {
      deleteObject(objectIdFromControl(control, true), true);
      consume(event, true);
      return;
    }

    if (isDeleteStationControl(control)) {
      deleteStation(stationFromControl(control, true), true);
      consume(event, true);
      return;
    }

    const removeButton = target.closest(".builder-remove");
    if (removeButton) {
      const context = rowContext(removeButton);
      if (context && removeObject(context.objectId)) consume(event, true);
      return;
    }

    const duplicateButton = target.closest(".builder-duplicate");
    if (duplicateButton) {
      const context = rowContext(duplicateButton);
      if (context && duplicateObject(context.objectId)) consume(event, true);
      return;
    }

    const duplicateStationButton = target.closest(".builder-duplicate-station");
    if (duplicateStationButton && builderContains(duplicateStationButton)) {
      const group = duplicateStationButton.closest(".configured-station-group[data-station-group]");
      if (group && duplicateStation(group.dataset.stationGroup)) consume(event, true);
      return;
    }

    const summary = target.closest("summary");
    const context = summary ? rowContext(summary) : null;
    if (context && selectObject(context.objectId)) consume(event);
  }, true);

  global.LabelerMapBuilderRowController = Object.freeze({
    installed: true,
    rowContext,
    recordFieldHistory,
    updateField,
    updateStationSection,
    selectObject,
    removeObject,
    deleteObject,
    deleteStation,
    duplicateObject,
    duplicateStation,
    objectIdFromControl,
    stationFromControl,
    isDeleteObjectControl,
    isDeleteStationControl
  });
})(window);
