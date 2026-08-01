"use strict";

(function installLabelSpecSectionSelection() {
  const RETRY_MS = 50;
  let installed = false;
  let renderLabelSpecsWrapped = false;
  let renderMapWrapped = false;
  let renderBuilderWrapped = false;

  function selectedSpec() {
    try {
      return typeof selectedLabelSpec === "function" ? selectedLabelSpec() : null;
    } catch {
      return null;
    }
  }

  function inferredDefaults(spec) {
    const neck = Math.max(Number(spec?.neckLengthMm) || 0, Number(spec?.neckBottomCurveMm) || 0) > 0;
    const body = (Number(spec?.bodyLengthMm) || 0) > 0;
    const back = (Number(spec?.backLengthMm) || 0) > 0;
    const blank = !neck && !body && !back;
    return {
      neck: blank || neck,
      body: blank || body,
      back: blank || back
    };
  }

  function ensureFlags(spec) {
    if (!spec || typeof spec !== "object") return { neck: true, body: true, back: true };
    const defaults = inferredDefaults(spec);
    const source = spec.enabledLabelSections && typeof spec.enabledLabelSections === "object"
      ? spec.enabledLabelSections
      : {};
    spec.enabledLabelSections = {
      neck: source.neck === undefined ? defaults.neck : Boolean(source.neck),
      body: source.body === undefined ? defaults.body : Boolean(source.body),
      back: source.back === undefined ? defaults.back : Boolean(source.back)
    };
    return spec.enabledLabelSections;
  }

  function activeFlags() {
    return ensureFlags(selectedSpec());
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

  function sectionLabelText(section) {
    return section === "neck" ? "Neck" : section === "body" ? "Body" : "Back";
  }

  function saveSelection(spec, section, checked, checkbox) {
    const flags = ensureFlags(spec);
    const next = { ...flags, [section]: Boolean(checked) };
    if (!next.neck && !next.body && !next.back) {
      checkbox.checked = true;
      window.alert("At least one label section must remain selected.");
      return;
    }
    spec.enabledLabelSections = next;
    try { if (typeof saveCurrentSettings === "function") saveCurrentSettings(); } catch { }
    try { if (typeof render === "function") render(); } catch { }
  }

  function decorateSpecRows() {
    const table = document.querySelector("#labelSpecs table");
    if (!table || typeof state === "undefined") return;
    const note = document.querySelector("#labelSpecs .table-tool-note");
    if (note && !/section checkboxes/i.test(note.textContent || "")) {
      note.textContent = `${note.textContent} Section checkboxes control which saved map stations remain active for this label.`;
    }

    table.querySelectorAll("tbody tr").forEach((row) => {
      if (row.querySelector(".label-section-checkboxes")) return;
      const id = String(row.children[0]?.textContent || "").trim();
      const spec = state.labelSpecs?.find((entry) => String(entry.id) === id);
      const brandCell = row.children[1];
      if (!spec || !brandCell) return;
      const flags = ensureFlags(spec);
      const holder = document.createElement("div");
      holder.className = "label-section-checkboxes";
      holder.setAttribute("aria-label", `Active label sections for ${spec.brand || "label"}`);
      holder.innerHTML = ["neck", "body", "back"].map((section) => `
        <label><input type="checkbox" data-label-section="${section}"${flags[section] ? " checked" : ""}>${sectionLabelText(section)}</label>`).join("");
      holder.querySelectorAll("[data-label-section]").forEach((checkbox) => {
        checkbox.addEventListener("change", () => saveSelection(spec, checkbox.dataset.labelSection, checkbox.checked, checkbox));
      });
      brandCell.appendChild(holder);
    });
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

  function installStyles() {
    if (document.querySelector("#labelSpecSectionSelectionStyles")) return;
    const style = document.createElement("style");
    style.id = "labelSpecSectionSelectionStyles";
    style.textContent = `
      .label-section-checkboxes{display:flex;flex-wrap:wrap;gap:3px 7px;margin-top:4px;padding-top:4px;border-top:1px solid var(--line)}
      .label-section-checkboxes label{display:inline-flex;align-items:center;gap:3px;color:var(--muted);font-size:9px;white-space:nowrap}
      .label-section-checkboxes input{width:auto;min-width:0;margin:0}
    `;
    document.head.appendChild(style);
  }

  function installApplicationFilter() {
    if (typeof selectedLabelApplicationState !== "function" || selectedLabelApplicationState.labelSpecSections) return false;
    const base = selectedLabelApplicationState;
    selectedLabelApplicationState = function selectedLabelApplicationStateWithSectionSelection(...args) {
      const result = base.apply(this, args);
      const flags = activeFlags();
      return {
        ...result,
        neck: Boolean(result?.neck && flags.neck),
        body: Boolean(result?.body && flags.body),
        back: Boolean(result?.back && flags.back)
      };
    };
    selectedLabelApplicationState.labelSpecSections = true;
    window.selectedLabelApplicationState = selectedLabelApplicationState;
    return true;
  }

  function installRenderHooks() {
    if (!renderLabelSpecsWrapped && typeof renderLabelSpecs === "function") {
      const base = renderLabelSpecs;
      renderLabelSpecs = function renderLabelSpecsWithSectionSelection(...args) {
        if (Array.isArray(state?.labelSpecs)) state.labelSpecs.forEach(ensureFlags);
        const result = base.apply(this, args);
        decorateSpecRows();
        return result;
      };
      window.renderLabelSpecs = renderLabelSpecs;
      renderLabelSpecsWrapped = true;
    }
    if (!renderMapWrapped && typeof renderMap === "function") {
      const base = renderMap;
      renderMap = function renderMapWithLabelSectionSelection(...args) {
        const result = base.apply(this, args);
        applyMapVisibility();
        return result;
      };
      window.renderMap = renderMap;
      renderMapWrapped = true;
    }
    if (!renderBuilderWrapped && typeof renderWipeDownBuilder === "function") {
      const base = renderWipeDownBuilder;
      renderWipeDownBuilder = function renderWipeDownBuilderWithLabelSectionSelection(...args) {
        const result = base.apply(this, args);
        applyBuilderVisibility();
        return result;
      };
      window.renderWipeDownBuilder = renderWipeDownBuilder;
      renderBuilderWrapped = true;
    }
    return renderLabelSpecsWrapped && renderMapWrapped && renderBuilderWrapped;
  }

  function install() {
    if (installed) return true;
    if (typeof state === "undefined" || !installApplicationFilter() || !installRenderHooks()) return false;
    installed = true;
    installStyles();
    if (Array.isArray(state.labelSpecs)) state.labelSpecs.forEach(ensureFlags);
    try { if (typeof render === "function") render(); } catch { }
    return true;
  }

  function wait() {
    if (!install()) window.setTimeout(wait, RETRY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait, { once: true });
  else wait();
})();
