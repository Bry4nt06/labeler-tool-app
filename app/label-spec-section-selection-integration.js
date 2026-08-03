"use strict";

(function installLabelSpecDimensionPresence() {
  const RETRY_MS = 50;
  const PRESENT_THRESHOLD_MM = 1;
  let installed = false;
  let renderMapWrapped = false;
  let renderBuilderWrapped = false;

  function selectedSpec() {
    try {
      return typeof selectedLabelSpec === "function" ? selectedLabelSpec() : null;
    } catch {
      return null;
    }
  }

  function dimensionPresent(...values) {
    return values.some((value) => Number(value) > PRESENT_THRESHOLD_MM);
  }

  function dimensionFlags(spec = selectedSpec()) {
    return {
      neck: dimensionPresent(spec?.neckLengthMm, spec?.neckBottomCurveMm),
      body: dimensionPresent(spec?.bodyLengthMm),
      back: dimensionPresent(spec?.backLengthMm)
    };
  }

  function activeFlags() {
    try {
      if (typeof selectedLabelApplicationState === "function") {
        const result = selectedLabelApplicationState();
        return {
          neck: Boolean(result?.neck),
          body: Boolean(result?.body),
          back: Boolean(result?.back)
        };
      }
    } catch { }
    return dimensionFlags();
  }

  function clearLegacySectionFlags() {
    if (!Array.isArray(state?.labelSpecs)) return false;
    let changed = false;
    state.labelSpecs.forEach((spec) => {
      if (!spec || typeof spec !== "object" || !("enabledLabelSections" in spec)) return;
      delete spec.enabledLabelSections;
      changed = true;
    });
    return changed;
  }

  function sectionForObject(item, map) {
    const explicit = String(item?.labelSection || "").toLowerCase();
    if (["neck", "body", "back", "none"].includes(explicit)) return explicit;
    if (item?.kind === "coding") {
      const codingTarget = String(item.orientationLabelSection || "auto").toLowerCase();
      if (["neck", "body", "back", "none"].includes(codingTarget)) return codingTarget;
      return "none";
    }
    const station = Number(item?.station);
    if (!Number.isFinite(station)) return "none";
    try {
      const inferred = typeof inferAplStationSections === "function" ? inferAplStationSections(map)?.[String(station)] : null;
      if (["neck", "body", "back", "none"].includes(inferred)) return inferred;
    } catch { }
    try {
      const fallback = typeof labelSectionForStation === "function" ? labelSectionForStation(station) : null;
      if (["neck", "body", "back", "none"].includes(fallback)) return fallback;
    } catch { }
    return "none";
  }

  function applyMapVisibility() {
    let map = null;
    try { map = typeof activeMachineMap === "function" ? activeMachineMap() : null; } catch { }
    if (!map) return;
    const flags = activeFlags();
    const hardwareKinds = new Set(["pad", "roller", "brush", "brush-channel", "gripper"]);

    document.querySelectorAll("#mapSvg [data-map-object-id]").forEach((node) => {
      const item = map.objects?.find((entry) => String(entry.id) === String(node.dataset.mapObjectId));
      if (!item || !hardwareKinds.has(item.kind)) return;
      const section = sectionForObject(item, map);
      const hidden = ["neck", "body", "back"].includes(section) && !flags[section];
      node.hidden = hidden;
      node.style.display = hidden ? "none" : "";
      node.toggleAttribute("data-label-section-disabled", hidden);
    });
  }

  function applyBuilderVisibility() {
    let map = null;
    try { map = typeof activeMachineMap === "function" ? activeMachineMap() : null; } catch { }
    if (!map) return;
    const flags = activeFlags();
    const hardwareKinds = new Set(["pad", "roller", "brush", "brush-channel", "gripper"]);
    document.querySelectorAll("#wipeBuilderList .wipe-builder-row[data-builder-object-id]").forEach((row) => {
      const item = map.objects?.find((entry) => String(entry.id) === String(row.dataset.builderObjectId));
      if (!item || !hardwareKinds.has(item.kind)) return;
      const section = sectionForObject(item, map);
      row.hidden = ["neck", "body", "back"].includes(section) && !flags[section];
    });
    document.querySelectorAll("#wipeBuilderList .configured-station-group").forEach((group) => {
      const visibleRows = [...group.querySelectorAll(":scope .wipe-builder-row")].some((row) => !row.hidden);
      group.hidden = !visibleRows;
    });
  }

  function installRenderHooks() {
    if (!renderMapWrapped && typeof renderMap === "function") {
      const base = renderMap;
      renderMap = function renderMapWithLabelDimensionPresence(...args) {
        const result = base.apply(this, args);
        applyMapVisibility();
        return result;
      };
      window.renderMap = renderMap;
      renderMapWrapped = true;
    }
    if (!renderBuilderWrapped && typeof renderWipeDownBuilder === "function") {
      const base = renderWipeDownBuilder;
      renderWipeDownBuilder = function renderWipeDownBuilderWithLabelDimensionPresence(...args) {
        const result = base.apply(this, args);
        applyBuilderVisibility();
        return result;
      };
      window.renderWipeDownBuilder = renderWipeDownBuilder;
      renderBuilderWrapped = true;
    }
    return renderMapWrapped && renderBuilderWrapped;
  }

  function install() {
    if (installed) return true;
    if (typeof state === "undefined"
      || typeof selectedLabelApplicationState !== "function"
      || !installRenderHooks()) return false;

    installed = true;
    const migrated = clearLegacySectionFlags();
    if (typeof applyLabelLengthStationRules === "function") applyLabelLengthStationRules();
    if (migrated && typeof saveCurrentSettings === "function") saveCurrentSettings();
    try { if (typeof render === "function") render(); } catch { }
    return true;
  }

  function wait() {
    if (!install()) window.setTimeout(wait, RETRY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait, { once: true });
  else wait();
})();
