"use strict";

(function installMapObjectBuilderSelection() {
  const RETRY_MS = 50;
  const REVEAL_RETRIES = 8;
  const NATIVE_CLICK_SUPPRESSION_MS = 450;
  let installed = false;
  let wrappedNativeSelector = false;
  let mapPointer = null;
  let suppressedSelection = { objectId: "", until: 0 };

  function activeMap() {
    try {
      return typeof activeMachineMap === "function" ? activeMachineMap() : null;
    } catch {
      return null;
    }
  }

  function objectFromId(objectId) {
    return activeMap()?.objects?.find((item) => String(item.id) === String(objectId)) || null;
  }

  function builderIsOpen() {
    const drawer = document.querySelector("#applicationSetupDialog");
    return Boolean(drawer && drawer.hidden === false && state.wipeBuilderOpen !== false);
  }

  function openBuilderWithoutToggle() {
    if (builderIsOpen()) return false;
    state.wipeBuilderOpen = true;
    const drawer = document.querySelector("#applicationSetupDialog");
    const rightRail = document.querySelector("#mapRightRail");
    const reference = document.querySelector("#labelerMapReference");
    if (drawer) drawer.hidden = false;
    rightRail?.classList.add("builder-open");
    reference?.classList.add("builder-open");
    try { if (typeof ensurePersistentApplicationMaps === "function") ensurePersistentApplicationMaps(); } catch { }
    try { if (typeof renderWipeDownBuilder === "function") renderWipeDownBuilder(); } catch { }
    return true;
  }

  function updateMapSelectionClasses(objectId) {
    document.querySelectorAll("#mapSvg [data-map-object-id]").forEach((node) => {
      const selected = String(node.dataset.mapObjectId) === String(objectId);
      node.classList.toggle("selected-map-object", selected);
      node.classList.toggle("map-object", true);
    });
  }

  function selectWithoutOpening(objectId) {
    if (!objectFromId(objectId)) return false;
    state.selectedMapObjectId = String(objectId);
    updateMapSelectionClasses(objectId);
    return true;
  }

  function setExpandedStation(item) {
    try {
      if (typeof builderExpandedStation !== "undefined") {
        builderExpandedStation = String(item.kind === "coding" ? "coding" : item.station);
      }
    } catch {
      // The editor can still be located by object ID.
    }
  }

  function focusObjectEditor(objectId, attempt = 0, allowRender = true) {
    const list = document.querySelector("#wipeBuilderList");
    const configuredSection = document.querySelector("#configuredMapObjectsSection");
    if (configuredSection) configuredSection.open = true;

    const selector = `[data-builder-object-id="${CSS.escape(String(objectId))}"]`;
    const editor = list?.querySelector(selector) || null;
    if (!editor) {
      if (allowRender && attempt === 0) {
        try { if (typeof renderWipeDownBuilder === "function") renderWipeDownBuilder(); } catch { }
      }
      if (attempt < REVEAL_RETRIES) {
        window.requestAnimationFrame(() => focusObjectEditor(objectId, attempt + 1, false));
      }
      return;
    }

    list.querySelectorAll(".wipe-builder-row.selected-builder-object").forEach((row) => {
      if (row !== editor) row.classList.remove("selected-builder-object");
    });
    list.querySelectorAll('.wipe-builder-row[open]').forEach((row) => {
      if (row !== editor) row.open = false;
    });

    const stationGroup = editor.closest(".configured-station-group");
    if (stationGroup) stationGroup.open = true;
    editor.open = true;
    editor.classList.add("selected-builder-object");

    const scrollContainer = document.querySelector("#applicationSetupDialog .builder-scroll-content");
    if (scrollContainer) {
      const containerRect = scrollContainer.getBoundingClientRect();
      const editorRect = editor.getBoundingClientRect();
      const targetTop = scrollContainer.scrollTop
        + editorRect.top
        - containerRect.top
        - Math.max(12, (containerRect.height - Math.min(editorRect.height, containerRect.height)) / 3);
      scrollContainer.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
    } else {
      editor.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function selectAndDrillToObject(objectId, { openBuilder = true, scroll = true } = {}) {
    const item = objectFromId(objectId);
    if (!item) return false;

    const wasOpen = builderIsOpen();
    state.selectedMapObjectId = String(objectId);
    setExpandedStation(item);
    updateMapSelectionClasses(objectId);

    if (openBuilder) openBuilderWithoutToggle();

    if (openBuilder && builderIsOpen()) {
      focusObjectEditor(objectId, 0, !wasOpen);
    } else if (scroll) {
      focusObjectEditor(objectId, 0, false);
    }

    return true;
  }

  function nativeMapSelectionIsSuppressed(objectId) {
    const id = String(objectId || "");
    if (mapPointer?.objectId === id) return true;
    return suppressedSelection.objectId === id && performance.now() <= suppressedSelection.until;
  }

  function wrapNativeSelector() {
    if (wrappedNativeSelector || typeof selectMapBuilderObject !== "function") return false;
    selectMapBuilderObject = function selectMapBuilderObjectOnDoubleClick(objectId, options = {}) {
      if (nativeMapSelectionIsSuppressed(objectId)) return selectWithoutOpening(objectId);
      return selectAndDrillToObject(objectId, {
        openBuilder: options.openBuilder !== false,
        scroll: options.scroll !== false
      });
    };
    selectMapBuilderObject.doubleClickMapSelection = true;
    wrappedNativeSelector = true;
    return true;
  }

  function mapObjectNode(event) {
    return event.target?.closest?.("#mapSvg [data-map-object-id]") || null;
  }

  function suppressOutsideAutoCloseForThisPointer() {
    const drawer = document.querySelector("#applicationSetupDialog");
    const closeButton = document.querySelector("#closeApplicationSetup");
    if (!drawer || drawer.hidden || !closeButton || closeButton.dataset.mapSelectionSuppressed === "true") return;

    const originalClick = closeButton.click;
    const suppressedClick = function suppressedMapSelectionClose() {};
    closeButton.dataset.mapSelectionSuppressed = "true";
    closeButton.click = suppressedClick;

    window.setTimeout(() => {
      if (closeButton.click === suppressedClick) closeButton.click = originalClick;
      delete closeButton.dataset.mapSelectionSuppressed;
    }, 0);
  }

  function beginMapPointer(event) {
    if (event.button !== 0) return;
    const node = mapObjectNode(event);
    if (!node) return;
    const objectId = String(node.dataset.mapObjectId || "");
    if (!objectId || !objectFromId(objectId)) return;

    suppressOutsideAutoCloseForThisPointer();
    mapPointer = { pointerId: event.pointerId, objectId };
    suppressedSelection = { objectId, until: Number.POSITIVE_INFINITY };
    selectWithoutOpening(objectId);
  }

  function finishMapPointer(event) {
    if (!mapPointer || event.pointerId !== mapPointer.pointerId) return;
    const objectId = mapPointer.objectId;
    mapPointer = null;
    suppressedSelection = { objectId, until: performance.now() + NATIVE_CLICK_SUPPRESSION_MS };
  }

  function cancelMapPointer(event) {
    if (!mapPointer || event.pointerId !== mapPointer.pointerId) return;
    const objectId = mapPointer.objectId;
    mapPointer = null;
    suppressedSelection = { objectId, until: performance.now() + NATIVE_CLICK_SUPPRESSION_MS };
  }

  function openOnDoubleClick(event) {
    if (event.button !== 0) return;
    const node = mapObjectNode(event);
    if (!node) return;
    const objectId = String(node.dataset.mapObjectId || "");
    if (!objectId || !objectFromId(objectId)) return;
    event.preventDefault();
    suppressOutsideAutoCloseForThisPointer();
    suppressedSelection = { objectId, until: performance.now() + NATIVE_CLICK_SUPPRESSION_MS };
    selectAndDrillToObject(objectId, { openBuilder: true, scroll: true });
  }

  function installStyles() {
    if (document.querySelector("#mapObjectBuilderSelectionStyles")) return;
    const style = document.createElement("style");
    style.id = "mapObjectBuilderSelectionStyles";
    style.textContent = `
      #mapSvg [data-map-object-id]{cursor:grab}
      #mapSvg [data-map-object-id]:active{cursor:grabbing}
      #mapSvg.map-is-locked [data-map-object-id]{cursor:pointer}
      #applicationSetupDialog .wipe-builder-row.selected-builder-object{
        border-color:var(--green);
        box-shadow:inset 0 0 0 1px var(--green);
      }
    `;
    document.head.appendChild(style);
  }

  function install() {
    if (installed) return true;
    if (typeof state === "undefined" || !document.querySelector("#mapSvg")) return false;
    if (!wrapNativeSelector()) return false;

    installed = true;
    installStyles();
    document.addEventListener("pointerdown", beginMapPointer, true);
    document.addEventListener("pointerup", finishMapPointer, true);
    document.addEventListener("pointercancel", cancelMapPointer, true);
    document.addEventListener("dblclick", openOnDoubleClick, true);
    return true;
  }

  function wait() {
    if (install()) return;
    window.setTimeout(wait, RETRY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait, { once: true });
  else wait();
})();