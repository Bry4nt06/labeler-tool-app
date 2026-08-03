"use strict";

(function installMapBuilderPopupController(global) {
  if (global.LabelerMapBuilderPopupController?.installed) return;

  function control(id) {
    return document.querySelector(`#${id}`) || null;
  }

  function elements() {
    return {
      button: control("wipeDownBuilderButton"),
      dialog: control("applicationSetupDialog"),
      close: control("closeApplicationSetup"),
      apply: control("applyApplicationSetup"),
      rightRail: control("mapRightRail"),
      labelerMapReference: control("labelerMapReference"),
      list: control("wipeBuilderList"),
      status: control("builderStatus")
    };
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setVisibility(open) {
    const ui = elements();
    const visible = Boolean(open);
    state.wipeBuilderOpen = visible;
    if (ui.dialog) ui.dialog.hidden = !visible;
    ui.rightRail?.classList.toggle("builder-open", visible);
    ui.labelerMapReference?.classList.toggle("builder-open", visible);
    ui.button?.setAttribute("aria-expanded", String(visible));
    ui.button?.setAttribute("aria-pressed", String(visible));
    document.body?.classList.toggle("map-builder-popup-open", visible);
    return ui;
  }

  function showFailure(error) {
    const ui = elements();
    const message = error?.message || String(error || "Unknown Map Builder error");
    console.error("Map Builder popup failed to initialize", error);
    if (ui.list) {
      ui.list.innerHTML = `<div class="notice bad"><strong>Map Builder could not load.</strong><span>${escapeHtml(message)}</span></div>`;
    }
    if (ui.status) ui.status.textContent = `Map Builder error • ${message}`;
  }

  function ensureRendered() {
    const ui = elements();
    try {
      if (typeof ensurePersistentApplicationMaps !== "function") {
        throw new Error("Map library service is unavailable.");
      }
      ensurePersistentApplicationMaps();
      const activeMap = typeof activeMachineMap === "function"
        ? activeMachineMap()
        : state.mapLibrary?.find((map) => map.id === state.activeMapId) || state.mapLibrary?.[0];
      if (!activeMap) throw new Error("No machine map is available to edit.");
      if (typeof renderWipeDownBuilder !== "function") {
        throw new Error("Map Builder renderer is unavailable.");
      }

      renderWipeDownBuilder();
      if (ui.list && !ui.list.children.length) {
        ui.list.innerHTML = '<div class="notice"><strong>No configured map objects.</strong><span>Use Add Object to begin building this machine map.</span></div>';
      }
      if (ui.status) ui.status.textContent = "Changes are applied live.";
      return true;
    } catch (error) {
      showFailure(error);
      return false;
    }
  }

  function open() {
    const ui = setVisibility(true);
    ensureRendered();
    global.requestAnimationFrame?.(() => {
      ensureRendered();
      ui.dialog?.focus?.({ preventScroll: true });
    });
    if (typeof saveCurrentSettings === "function") saveCurrentSettings();
  }

  function close() {
    setVisibility(false);
    if (typeof saveCurrentSettings === "function") saveCurrentSettings();
  }

  function toggle() {
    if (state.wipeBuilderOpen && !elements().dialog?.hidden) close();
    else open();
  }

  function apply() {
    if (typeof saveCurrentSettings === "function") saveCurrentSettings();
    close();
    if (typeof render === "function") render();
  }

  function ownedControl(target, id) {
    return target?.closest?.(`#${id}`) || null;
  }

  // Register before the general setup-event boundary. This popup has a
  // dedicated lifecycle because it must become visible before its dynamic
  // controls are rendered and measured.
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (ownedControl(target, "wipeDownBuilderButton")) toggle();
    else if (ownedControl(target, "closeApplicationSetup")) close();
    else if (ownedControl(target, "applyApplicationSetup")) apply();
    else return;

    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  global.LabelerMapBuilderPopupController = Object.freeze({
    installed: true,
    open,
    close,
    toggle,
    apply,
    ensureRendered
  });
})(window);
