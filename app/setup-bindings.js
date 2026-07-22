"use strict";

function bindSetup() {
  setThemePreset(state.themePreset);
  els.themePreset.addEventListener("change", () => {
    setThemePreset(els.themePreset.value);
  });
  for (const key of ["headCount", "radius", "zeroAngle"]) {
    if (!els[key]) continue;
    els[key].value = state[key];
    els[key].addEventListener("change", () => {
      state[key] = num(els[key].value, state[key]);
      syncApplicationMapToLegacyState();
      saveCurrentSettings();
      render();
    });
  }
  const geometryBindings = ["referencePitchRadiusMm", "encoderCountsPerRev", "servoGearRatio"];
  geometryBindings.forEach((key) => {
    if (!els[key]) return;
    els[key].value = state[key];
    els[key].addEventListener("change", () => {
      state[key] = Math.max(0.001, num(els[key].value, state[key]));
      syncApplicationMapToLegacyState();
      saveCurrentSettings();
      render();
    });
  });
  if (els.autoScaleTableMap) {
    els.autoScaleTableMap.checked = Boolean(state.autoScaleTableMap);
    els.autoScaleTableMap.addEventListener("change", () => {
      state.autoScaleTableMap = els.autoScaleTableMap.checked;
      syncApplicationMapToLegacyState();
      saveCurrentSettings();
      render();
    });
  }
  if (els.showQuadrantReferences) {
    els.showQuadrantReferences.checked = Boolean(state.showQuadrantReferences);
    els.showQuadrantReferences.addEventListener("change", () => {
      state.showQuadrantReferences = els.showQuadrantReferences.checked;
      saveCurrentSettings();
      renderMap();
      renderSimulationMap();
    });
  }
  els.previewAngle.value = state.previewAngle;
  els.previewAngle.addEventListener("input", () => {
    state.previewAngle = num(els.previewAngle.value, state.previewAngle);
    state.isPlaying = false;
    renderAnimationFrame();
  });
  if (els.tableAngleJump) {
    els.tableAngleJump.value = fmt(norm(state.previewAngle), 1);
    els.tableAngleJump.addEventListener("focus", () => {
      state.isPlaying = false;
      if (els.playPause) els.playPause.textContent = "Play";
    });
    const applyTableAngleJump = () => {
      const requestedAngle = num(els.tableAngleJump.value, state.previewAngle);
      state.previewAngle = norm(requestedAngle);
      state.isPlaying = false;
      els.tableAngleJump.value = fmt(state.previewAngle, 1);
      els.previewAngle.value = state.previewAngle;
      saveCurrentSettings();
      renderAnimationFrame();
    };
    els.tableAngleJump.addEventListener("change", applyTableAngleJump);
    els.tableAngleJumpForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      applyTableAngleJump();
    });
  }
  if (els.previewBottleAngle) {
    els.previewBottleAngle.value = state.previewBottleAngle !== null && state.previewBottleAngle !== "" && Number.isFinite(Number(state.previewBottleAngle)) ? fmt(state.previewBottleAngle, 1) : "";
    els.previewBottleAngle.addEventListener("change", () => {
      state.previewBottleAngle = els.previewBottleAngle.value === "" ? null : num(els.previewBottleAngle.value, null);
      state.isPlaying = false;
      saveCurrentSettings();
      renderMap();
      renderSimulationMap();
    });
  }
  els.animationSpeed.value = state.animationSpeed;
  if (els.animationStepReadout) els.animationStepReadout.textContent = `${fmt(state.animationSpeed, 1)} deg / sec`;
  if (els.maxMoveRatio) {
    els.maxMoveRatio.value = state.maxMoveRatio;
    els.maxMoveRatio.addEventListener("change", () => {
      state.maxMoveRatio = Math.max(0.1, num(els.maxMoveRatio.value, state.maxMoveRatio));
      syncApplicationMapToLegacyState();
      saveCurrentSettings();
      render();
    });
  }
  els.animationSpeed.addEventListener("input", () => {
    state.animationSpeed = Math.min(50, Math.max(1, num(els.animationSpeed.value, state.animationSpeed)));
    state.animationSpeedUnit = "deg-per-second";
    if (els.animationStepReadout) els.animationStepReadout.textContent = `${fmt(state.animationSpeed, 1)} deg / sec`;
  });
  const depthBindings = {
    spenderDepth: "spender",
    opRollerDepth: "opRoller",
    nonOpRollerDepth: "nonOpRoller",
    wipeInnerDepth: "wipeInner",
    wipeOuterDepth: "wipeOuter"
  };
  Object.entries(depthBindings).forEach(([elementKey, depthKey]) => {
    els[elementKey].value = state.depths[depthKey];
    els[elementKey].addEventListener("change", () => {
      state.depths[depthKey] = num(els[elementKey].value, state.depths[depthKey]);
      syncApplicationMapToLegacyState();
      saveCurrentSettings();
      renderMap();
    });
  });
  const togglePlayback = () => {
    state.isPlaying = !state.isPlaying;
    lastAnimationTime = performance.now();
    els.playPause.textContent = state.isPlaying ? "Pause" : "Play";
    els.playPause.setAttribute("aria-pressed", state.isPlaying ? "true" : "false");
    renderAnimationFrame();
  };
  // Assign the native onclick property so the control remains reliable even if
  // another UI layer is re-rendered or event listeners are rebound.
  els.playPause.onclick = togglePlayback;

  const setBuilderOpen = (open) => {
    state.wipeBuilderOpen = Boolean(open);
    if (els.applicationSetupDialog) els.applicationSetupDialog.hidden = !state.wipeBuilderOpen;
    if (els.mapRightRail) els.mapRightRail.classList.toggle("builder-open", state.wipeBuilderOpen);
    if (els.labelerMapReference) els.labelerMapReference.classList.toggle("builder-open", state.wipeBuilderOpen);
    if (state.wipeBuilderOpen) {
      ensurePersistentApplicationMaps();
      renderWipeDownBuilder();
    }
    saveCurrentSettings();
  };
  els.applicationSetupButton?.addEventListener("click", () => setBuilderOpen(!state.wipeBuilderOpen));
  els.closeApplicationSetup?.addEventListener("click", () => setBuilderOpen(false));
  els.applyApplicationSetup?.addEventListener("click", () => { saveCurrentSettings(); setBuilderOpen(false); render(); });
  if (els.applicationSetupDialog) els.applicationSetupDialog.hidden = !state.wipeBuilderOpen;
  if (els.mapRightRail) els.mapRightRail.classList.toggle("builder-open", state.wipeBuilderOpen);
  if (els.labelerMapReference) els.labelerMapReference.classList.toggle("builder-open", state.wipeBuilderOpen);
  const setLabelerMapOpen = (open) => {
    if (!els.labelerMapReference) return;
    els.labelerMapReference.hidden = !open;
    els.labelerMapButton?.setAttribute("aria-pressed", String(Boolean(open)));
    if (open) renderLabelerMapReference();
  };
  els.labelerMapButton?.addEventListener("click", () => setLabelerMapOpen(els.labelerMapReference?.hidden));
  els.closeLabelerMap?.addEventListener("click", () => setLabelerMapOpen(false));
  const updateMapLockUi = () => {
    const locked = state.mapLocked !== false;
    els.mapLockToggle?.setAttribute("aria-pressed", String(locked));
    if (els.mapLockToggle) els.mapLockToggle.textContent = locked ? "Locked" : "Unlocked";
    els.mapSvg?.classList.toggle("map-is-locked", locked);
  };
  els.mapLockToggle?.addEventListener("click", () => {
    state.mapLocked = state.mapLocked === false;
    updateMapLockUi();
    saveCurrentSettings();
  });
  els.undoMapEdit?.addEventListener("click", () => {
    if (state.builderHistory?.undo?.length) restoreBuilderHistory("undo");
  });
  updateMapLockUi();
  const centerMapView = () => {
    state.mapZoom = 1;
    state.mapPanX = 0;
    state.mapPanY = 0;
  };
  els.resetMapView?.addEventListener("click", () => {
    centerMapView();
    applyMapView();
    saveCurrentSettings();
    renderMap();
  });
  els.mapSvg?.addEventListener("wheel", (event) => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.08 : 0.92;
    state.mapZoom = Math.min(2.5, Math.max(0.65, state.mapZoom * factor));
    applyMapView();
    saveCurrentSettings();
  }, { passive: false });
  if (els.mapSvg) {
    let drag = null;
    const pointerTableAngle = (event) => {
      const point = els.mapSvg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const local = point.matrixTransform(els.mapSvg.getScreenCTM().inverse());
      const raw = norm(Math.atan2(local.y, local.x) * 180 / Math.PI);
      return state.direction === "cw" ? norm(180 + state.zeroAngle - raw) : norm(raw - state.zeroAngle);
    };
    els.mapSvg.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const objectNode = event.target.closest?.("[data-map-object-id]");
      const rotatorNode = event.target.closest?.("[data-map-rotator-handle]");
      if (rotatorNode) {
        drag = { kind: "rotator", pointerId: event.pointerId, moved: false };
        state.isPlaying = false;
        els.mapSvg.setPointerCapture(event.pointerId);
        els.mapSvg.classList.add("is-dragging-rotator");
        event.preventDefault();
        return;
      }
      if (objectNode && state.mapLocked === false) {
        const objectId = objectNode.dataset.mapObjectId;
        const item = editableMachineMap()?.objects?.find((entry) => entry.id === objectId);
        if (!item) return;
        recordBuilderHistory(`Move ${item.name || "map object"}`);
        state.selectedMapObjectId = objectId;
        drag = {
          kind: "object",
          pointerId: event.pointerId,
          objectId,
          startAngle: pointerTableAngle(event),
          original: deepClone(item),
          moved: false
        };
        els.mapSvg.setPointerCapture(event.pointerId);
        els.mapSvg.classList.add("is-dragging-object");
        event.preventDefault();
        return;
      }
      drag = {
        kind: "pan",
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        panX: num(state.mapPanX, 0),
        panY: num(state.mapPanY, 0),
        moved: false
      };
      els.mapSvg.setPointerCapture(event.pointerId);
      els.mapSvg.classList.add("is-panning");
      event.preventDefault();
    });
    els.mapSvg.addEventListener("pointermove", (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (drag.kind === "rotator") {
        state.previewAngle = pointerTableAngle(event);
        drag.moved = true;
        if (els.previewAngle) els.previewAngle.value = state.previewAngle;
        renderAnimationFrame();
        event.preventDefault();
        return;
      }
      if (drag.kind === "object") {
        const map = editableMachineMap();
        const item = map?.objects?.find((entry) => entry.id === drag.objectId);
        if (!item) return;
        const delta = signedAngleDifference(pointerTableAngle(event), drag.startAngle);
        const original = drag.original;
        if (item.kind === "brush-channel") {
          item.outerStart = norm(num(original.outerStart, original.start) + delta);
          item.outerEnd = item.outerStart + (num(original.outerEnd, original.end) - num(original.outerStart, original.start));
          item.innerStart = norm(num(original.innerStart, original.start) + delta);
          item.innerEnd = item.innerStart + (num(original.innerEnd, original.end) - num(original.innerStart, original.start));
        }
        if (Number.isFinite(Number(original.angle))) item.angle = norm(num(original.angle, original.start) + delta);
        item.start = norm(num(original.start, 0) + delta);
        if (item.kind === "sensor") item.end = item.start + 3;
        else if (item.kind === "coding") item.end = item.start + 5;
        else item.end = item.start + (num(original.end, original.start) - num(original.start, 0));
        drag.moved = Math.abs(delta) >= 0.05;
        syncApplicationMapToLegacyState();
        applyGeneratedServoProfile();
        renderMap();
        event.preventDefault();
        return;
      }
      const rect = els.mapSvg.getBoundingClientRect();
      const zoom = Math.min(2.5, Math.max(0.65, num(state.mapZoom, 1)));
      drag.moved = drag.moved || Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) >= 4;
      state.mapPanX = drag.panX - (event.clientX - drag.clientX) * (680 / zoom) / Math.max(1, rect.width);
      state.mapPanY = drag.panY - (event.clientY - drag.clientY) * (630 / zoom) / Math.max(1, rect.height);
      applyMapView();
      event.preventDefault();
    });
    const finishMapPan = (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (els.mapSvg.hasPointerCapture(event.pointerId)) els.mapSvg.releasePointerCapture(event.pointerId);
      const completed = drag;
      drag = null;
      els.mapSvg.classList.remove("is-panning");
      els.mapSvg.classList.remove("is-dragging-object");
      els.mapSvg.classList.remove("is-dragging-rotator");
      if (completed.kind === "rotator") {
        saveCurrentSettings();
      } else if (completed.kind === "object") {
        if (!completed.moved) state.builderHistory.undo.pop();
        refreshAfterBuilderEdit({ persist: true });
        selectMapBuilderObject(completed.objectId, { openBuilder: true, scroll: true });
      } else {
        if (!completed.moved && state.selectedMapObjectId) {
          state.selectedMapObjectId = "";
          renderMap();
          renderWipeDownBuilder();
        }
        saveCurrentSettings();
      }
    };
    els.mapSvg.addEventListener("pointerup", finishMapPan);
    els.mapSvg.addEventListener("pointercancel", finishMapPan);
  }
  if (els.showMoveDistanceOverlay) {
    els.showMoveDistanceOverlay.checked = Boolean(state.showMoveDistanceOverlay);
    els.showMoveDistanceOverlay.addEventListener("change", () => {
      state.showMoveDistanceOverlay = els.showMoveDistanceOverlay.checked;
      renderMap();
      renderSimulationMap();
    });
  }

  if (els.direction) {
    els.direction.value = state.direction;
    els.direction.addEventListener("change", () => {
      state.direction = els.direction.value;
      syncApplicationMapToLegacyState();
      saveCurrentSettings();
      render();
    });
  }
}
