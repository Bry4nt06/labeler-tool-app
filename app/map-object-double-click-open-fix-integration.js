"use strict";

(function installReliableMapObjectDoubleClickOpen() {
  const RETRY_MS = 50;
  const DOUBLE_PRESS_MS = 520;
  const MOVE_THRESHOLD_PX = 8;
  let installed = false;
  let pointer = null;
  let lastPress = { objectId: "", at: 0 };

  function activeMapSafe() {
    try {
      return typeof activeMachineMap === "function" ? activeMachineMap() : null;
    } catch {
      return null;
    }
  }

  function mapObjectNode(event) {
    return event.target?.closest?.("#mapSvg [data-map-object-id]") || null;
  }

  function objectById(objectId) {
    return activeMapSafe()?.objects?.find((item) => String(item.id) === String(objectId)) || null;
  }

  function openObjectEditor(objectId) {
    const item = objectById(objectId);
    if (!item || typeof state === "undefined") return false;

    state.selectedMapObjectId = String(objectId);
    state.wipeBuilderOpen = true;
    try {
      if (typeof builderExpandedStation !== "undefined") {
        builderExpandedStation = String(item.kind === "coding" ? "coding" : item.station);
      }
    } catch {
      // The editor can still be located by its object ID.
    }

    const dialog = document.querySelector("#applicationSetupDialog");
    const rail = document.querySelector("#mapRightRail");
    const reference = document.querySelector("#labelerMapReference");
    if (dialog) dialog.hidden = false;
    rail?.classList.add("builder-open");
    reference?.classList.add("builder-open");

    try { if (typeof renderMap === "function") renderMap(); } catch { }
    try { if (typeof renderWipeDownBuilder === "function") renderWipeDownBuilder(); } catch { }
    try { if (typeof saveCurrentSettings === "function") saveCurrentSettings(); } catch { }

    const reveal = (attempt = 0) => {
      const selector = `[data-builder-object-id="${CSS.escape(String(objectId))}"]`;
      const editor = document.querySelector(`#wipeBuilderList ${selector}`);
      if (!editor) {
        if (attempt < 10) window.requestAnimationFrame(() => reveal(attempt + 1));
        return;
      }

      const configured = document.querySelector("#configuredMapObjectsSection");
      if (configured) configured.open = true;
      const group = editor.closest(".configured-station-group");
      if (group) group.open = true;
      document.querySelectorAll("#wipeBuilderList .wipe-builder-row.selected-builder-object").forEach((row) => {
        if (row !== editor) row.classList.remove("selected-builder-object");
      });
      editor.open = true;
      editor.classList.add("selected-builder-object");

      const scrollSurface = document.querySelector("#applicationSetupDialog .builder-scroll-content");
      if (scrollSurface) {
        const surfaceRect = scrollSurface.getBoundingClientRect();
        const editorRect = editor.getBoundingClientRect();
        const top = scrollSurface.scrollTop + editorRect.top - surfaceRect.top - 24;
        scrollSurface.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      } else {
        editor.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    };
    window.requestAnimationFrame(() => reveal());
    return true;
  }

  function begin(event) {
    if (event.button !== 0) return;
    const node = mapObjectNode(event);
    if (!node) return;
    const objectId = String(node.dataset.mapObjectId || "");
    if (!objectId || !objectById(objectId)) return;
    pointer = {
      pointerId: event.pointerId,
      objectId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false
    };
  }

  function move(event) {
    if (!pointer || event.pointerId !== pointer.pointerId) return;
    if (Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) >= MOVE_THRESHOLD_PX) {
      pointer.moved = true;
    }
  }

  function finish(event) {
    if (!pointer || event.pointerId !== pointer.pointerId) return;
    const completed = pointer;
    pointer = null;
    if (completed.moved) {
      lastPress = { objectId: "", at: 0 };
      return;
    }

    const now = performance.now();
    const isDoublePress = lastPress.objectId === completed.objectId && now - lastPress.at <= DOUBLE_PRESS_MS;
    if (!isDoublePress) {
      lastPress = { objectId: completed.objectId, at: now };
      return;
    }

    lastPress = { objectId: "", at: 0 };
    event.preventDefault();
    window.setTimeout(() => openObjectEditor(completed.objectId), 0);
  }

  function cancel(event) {
    if (pointer && event.pointerId === pointer.pointerId) pointer = null;
  }

  function nativeDoubleClick(event) {
    if (event.button !== 0) return;
    const node = mapObjectNode(event);
    if (!node) return;
    const objectId = String(node.dataset.mapObjectId || "");
    if (!objectId || !objectById(objectId)) return;
    event.preventDefault();
    window.setTimeout(() => openObjectEditor(objectId), 0);
  }

  function install() {
    if (installed) return true;
    if (typeof state === "undefined" || !document.querySelector("#mapSvg")) return false;
    installed = true;
    document.addEventListener("pointerdown", begin, true);
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", finish, true);
    document.addEventListener("pointercancel", cancel, true);
    document.addEventListener("dblclick", nativeDoubleClick, true);
    return true;
  }

  function wait() {
    if (!install()) window.setTimeout(wait, RETRY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait, { once: true });
  else wait();
})();
