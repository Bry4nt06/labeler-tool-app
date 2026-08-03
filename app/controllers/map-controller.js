"use strict";

(function installMapController(global) {
  const actions = global.LabelerWorkspaceActionService;
  let drag = null;
  let builderBindingsInstalled = false;

  function setBuilderStatus(message, isError = false) {
    if (!els.builderStatus) return;
    els.builderStatus.textContent = message;
    els.builderStatus.classList.toggle("status-bad", Boolean(isError));
  }

  function ensureActiveBuilderMap() {
    actions.call("ensurePersistentApplicationMaps");
    const machineMap = actions.call("activeMachineMap");
    if (!machineMap) throw new Error("No machine map is available for Map Builder.");
    if (state.activeMapId !== machineMap.id) {
      actions.call("loadMachineMapIntoRuntime", machineMap, false);
    }
    return machineMap;
  }

  function verifyBuilderPopulation(machineMap) {
    const libraryPopulated = Boolean(els.mapLibrarySelect?.options?.length);
    const layoutPopulated = Boolean(
      els.aggregateToggleList?.childElementCount
      || els.stationToggleList?.childElementCount
    );
    const objectCount = Array.isArray(machineMap?.objects) ? machineMap.objects.length : 0;
    const objectsPopulated = objectCount === 0 || Boolean(els.wipeBuilderList?.childElementCount);
    if (!libraryPopulated) throw new Error("Saved-map controls did not populate.");
    if (!layoutPopulated) throw new Error("Aggregate and station controls did not populate.");
    if (!objectsPopulated) throw new Error(`Configured objects did not populate (${objectCount} expected).`);
    return objectCount;
  }

  function populateBuilder(options = {}) {
    const bind = options.bind !== false;
    try {
      const machineMap = ensureActiveBuilderMap();
      actions.call("renderWipeDownBuilder");
      if (bind && !builderBindingsInstalled) {
        if (!els.addBuilderObject) throw new Error("Map Builder controls are unavailable in the page DOM.");
        actions.call("bindWipeDownBuilder");
        builderBindingsInstalled = true;
      }
      const objectCount = verifyBuilderPopulation(machineMap);
      setBuilderStatus(`STAGING 0.9.8 • ${machineMap.name} • ${objectCount} configured object${objectCount === 1 ? "" : "s"}`);
      return true;
    } catch (error) {
      const message = error?.message || String(error || "Unknown Map Builder error");
      console.error("Map Builder population failed", error);
      setBuilderStatus(`Map Builder failed: ${message}`, true);
      if (els.wipeBuilderList && !els.wipeBuilderList.childElementCount) {
        els.wipeBuilderList.innerHTML = `<div class="notice bad"><strong>Map Builder failed to populate.</strong><span>${message}</span></div>`;
      }
      return false;
    }
  }

  function setBuilderOpen(open) {
    actions.execute({
      mutate() {
        state.wipeBuilderOpen = Boolean(open);
        if (els.applicationSetupDialog) els.applicationSetupDialog.hidden = !state.wipeBuilderOpen;
        els.mapRightRail?.classList.toggle("builder-open", state.wipeBuilderOpen);
        els.labelerMapReference?.classList.toggle("builder-open", state.wipeBuilderOpen);
        if (state.wipeBuilderOpen) {
          populateBuilder({ bind: true });
          global.requestAnimationFrame?.(() => populateBuilder({ bind: false }));
        }
      },
      persist: true
    });
  }

  function applyBuilder() {
    actions.call("saveCurrentSettings");
    setBuilderOpen(false);
    actions.render("all");
  }

  function setLabelerMapOpen(open) {
    if (!els.labelerMapReference) return;
    els.labelerMapReference.hidden = !open;
    els.labelerMapButton?.setAttribute("aria-pressed", String(Boolean(open)));
    if (open) actions.render("labeler-map");
  }

  function updateLockUi() {
    const locked = state.mapLocked !== false;
    els.mapLockToggle?.setAttribute("aria-pressed", String(locked));
    if (els.mapLockToggle) els.mapLockToggle.textContent = locked ? "Locked" : "Unlocked";
    els.mapSvg?.classList.toggle("map-is-locked", locked);
  }

  function toggleLock() {
    actions.execute({
      mutate() { state.mapLocked = state.mapLocked === false; updateLockUi(); },
      persist: true
    });
  }

  function resetView() {
    actions.execute({
      mutate() { state.mapZoom = 1; state.mapPanX = 0; state.mapPanY = 0; },
      persist: true,
      render: "map",
      after() { actions.call("applyMapView"); }
    });
  }

  function zoom(deltaY) {
    actions.execute({
      mutate() {
        const factor = deltaY < 0 ? 1.08 : 0.92;
        state.mapZoom = Math.min(2.5, Math.max(0.65, state.mapZoom * factor));
        actions.call("applyMapView");
      },
      persist: true
    });
  }

  function setPreviewAngle(value, persist = false) {
    actions.execute({
      mutate() {
        state.previewAngle = actions.call("norm", actions.number(value, state.previewAngle)) ?? actions.number(value, state.previewAngle);
        state.isPlaying = false;
        if (els.previewAngle) els.previewAngle.value = state.previewAngle;
        if (els.tableAngleJump) els.tableAngleJump.value = actions.call("fmt", state.previewAngle, 1) ?? state.previewAngle;
        if (els.playPause) {
          els.playPause.textContent = "Play";
          els.playPause.setAttribute("aria-pressed", "false");
        }
      },
      persist,
      render: "animation"
    });
  }

  function setPreviewBottleAngle(value) {
    actions.execute({
      mutate() {
        state.previewBottleAngle = value === "" || value === null ? null : actions.number(value, null);
        state.isPlaying = false;
      },
      persist: true,
      render: ["map", "simulation-map"]
    });
  }

  function setDirection(value) {
    actions.execute({
      mutate() { state.direction = value === "cw" ? "cw" : "ccw"; },
      syncMap: true,
      persist: true,
      render: "all"
    });
  }

  function undo() {
    if (state.builderHistory?.undo?.length) actions.call("restoreBuilderHistory", "undo");
  }

  function pointerTableAngle(event) {
    const svg = els.mapSvg;
    if (!svg?.createSVGPoint || !svg.getScreenCTM()) return state.previewAngle;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(svg.getScreenCTM().inverse());
    const normalize = global.norm || ((value) => ((value % 360) + 360) % 360);
    const raw = normalize(Math.atan2(local.y, local.x) * 180 / Math.PI);
    return state.direction === "cw" ? normalize(180 + state.zeroAngle - raw) : normalize(raw - state.zeroAngle);
  }

  function beginPointer(event) {
    const svg = els.mapSvg;
    if (!svg || !svg.contains(event.target) || event.button !== 0) return false;
    const objectNode = event.target.closest?.("[data-map-object-id]");
    const rotatorNode = event.target.closest?.("[data-map-rotator-handle]");
    if (rotatorNode) {
      drag = { kind: "rotator", pointerId: event.pointerId, moved: false };
      state.isPlaying = false;
      svg.setPointerCapture?.(event.pointerId);
      svg.classList.add("is-dragging-rotator");
      return true;
    }
    if (objectNode && state.mapLocked === false) {
      const objectId = objectNode.dataset.mapObjectId;
      const item = actions.call("editableMachineMap")?.objects?.find((entry) => entry.id === objectId);
      if (!item) return false;
      actions.call("recordBuilderHistory", `Move ${item.name || "map object"}`);
      state.selectedMapObjectId = objectId;
      drag = {
        kind: "object",
        pointerId: event.pointerId,
        objectId,
        startAngle: pointerTableAngle(event),
        original: actions.call("deepClone", item) || { ...item },
        moved: false
      };
      svg.setPointerCapture?.(event.pointerId);
      svg.classList.add("is-dragging-object");
      return true;
    }
    drag = {
      kind: "pan",
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      panX: actions.number(state.mapPanX, 0),
      panY: actions.number(state.mapPanY, 0),
      moved: false
    };
    svg.setPointerCapture?.(event.pointerId);
    svg.classList.add("is-panning");
    return true;
  }

  function movePointer(event) {
    const svg = els.mapSvg;
    if (!drag || !svg || event.pointerId !== drag.pointerId) return false;
    if (drag.kind === "rotator") {
      state.previewAngle = pointerTableAngle(event);
      drag.moved = true;
      if (els.previewAngle) els.previewAngle.value = state.previewAngle;
      actions.render("animation");
      return true;
    }
    if (drag.kind === "object") {
      const map = actions.call("editableMachineMap");
      const item = map?.objects?.find((entry) => entry.id === drag.objectId);
      if (!item) return false;
      const difference = global.signedAngleDifference || ((left, right) => left - right);
      const normalize = global.norm || ((value) => ((value % 360) + 360) % 360);
      const delta = difference(pointerTableAngle(event), drag.startAngle);
      const original = drag.original;
      if (item.kind === "brush-channel") {
        item.outerStart = normalize(actions.number(original.outerStart, original.start) + delta);
        item.outerEnd = item.outerStart + (actions.number(original.outerEnd, original.end) - actions.number(original.outerStart, original.start));
        item.innerStart = normalize(actions.number(original.innerStart, original.start) + delta);
        item.innerEnd = item.innerStart + (actions.number(original.innerEnd, original.end) - actions.number(original.innerStart, original.start));
      }
      if (Number.isFinite(Number(original.angle))) item.angle = normalize(actions.number(original.angle, original.start) + delta);
      item.start = normalize(actions.number(original.start, 0) + delta);
      if (item.kind === "sensor") item.end = item.start + 3;
      else if (item.kind === "coding") item.end = item.start + 5;
      else item.end = item.start + (actions.number(original.end, original.start) - actions.number(original.start, 0));
      drag.moved = Math.abs(delta) >= 0.05;
      actions.execute({ syncMap: true, regenerate: true, render: "map" });
      return true;
    }
    const rect = svg.getBoundingClientRect();
    const zoomValue = Math.min(2.5, Math.max(0.65, actions.number(state.mapZoom, 1)));
    drag.moved = drag.moved || Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) >= 4;
    state.mapPanX = drag.panX - (event.clientX - drag.clientX) * (680 / zoomValue) / Math.max(1, rect.width);
    state.mapPanY = drag.panY - (event.clientY - drag.clientY) * (630 / zoomValue) / Math.max(1, rect.height);
    actions.call("applyMapView");
    return true;
  }

  function finishPointer(event) {
    const svg = els.mapSvg;
    if (!drag || !svg || event.pointerId !== drag.pointerId) return false;
    if (svg.hasPointerCapture?.(event.pointerId)) svg.releasePointerCapture(event.pointerId);
    const completed = drag;
    drag = null;
    svg.classList.remove("is-panning", "is-dragging-object", "is-dragging-rotator");
    if (completed.kind === "rotator") {
      actions.call("saveCurrentSettings");
    } else if (completed.kind === "object") {
      if (!completed.moved) state.builderHistory?.undo?.pop();
      actions.call("refreshAfterBuilderEdit", { persist: true });
      actions.call("selectMapBuilderObject", completed.objectId, { openBuilder: true, scroll: true });
    } else {
      if (!completed.moved && state.selectedMapObjectId) {
        state.selectedMapObjectId = "";
        actions.render(["map", "builder"]);
      }
      actions.call("saveCurrentSettings");
    }
    return true;
  }

  global.LabelerMapController = Object.freeze({
    populateBuilder,
    setBuilderOpen,
    applyBuilder,
    setLabelerMapOpen,
    updateLockUi,
    toggleLock,
    resetView,
    zoom,
    setPreviewAngle,
    setPreviewBottleAngle,
    setDirection,
    undo,
    beginPointer,
    movePointer,
    finishPointer
  });
})(window);
