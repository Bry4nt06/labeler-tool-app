"use strict";

(function installColdGlueParameterEditor() {
  const RETRY_MS = 50;
  const VALID_SECTIONS = new Set(["auto", "neck", "body", "back", "none"]);
  const VALID_WIPE_SIDES = new Set(["left", "right", "none"]);
  const VALID_WIPE_ORDERS = new Set(["left-right", "right-left"]);
  let observer = null;
  let decoratePending = false;
  let migratedMapId = "";

  function finite(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function html(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function activeMap() {
    try {
      return typeof editableMachineMap === "function"
        ? editableMachineMap()
        : typeof activeMachineMap === "function"
          ? activeMachineMap()
          : null;
    } catch {
      return null;
    }
  }

  function defaultAlignmentLead(map) {
    const heads = Math.max(1, finite(map?.headCount, finite(state?.headCount, 60)));
    return Math.max(0.5, 360 / heads);
  }

  function normalizeObject(item, map) {
    if (!item || item.application !== "cold-glue") return false;
    let changed = false;
    const setDefault = (key, value) => {
      if (item[key] !== undefined && item[key] !== null && item[key] !== "") return;
      item[key] = value;
      changed = true;
    };

    if (!VALID_SECTIONS.has(String(item.labelSection || ""))) {
      item.labelSection = "auto";
      changed = true;
    }

    if (item.kind === "gripper") {
      setDefault("applicationPlateAngleDeg", 0);
      setDefault("alignmentLeadTableDeg", defaultAlignmentLead(map));
      setDefault("neckOverWipeMm", 5);
      setDefault("neckPressTableDeg", 1.5);
      if (!VALID_WIPE_ORDERS.has(String(item.neckWipeOrder || ""))) {
        item.neckWipeOrder = "left-right";
        changed = true;
      }
    } else if (item.kind === "brush") {
      const defaultSide = item.side === "inner" ? "right" : "left";
      if (!VALID_WIPE_SIDES.has(String(item.neckWipeSide || ""))) {
        item.neckWipeSide = defaultSide;
        changed = true;
      }
      if (typeof item.pressLooseSide !== "boolean") {
        item.pressLooseSide = true;
        changed = true;
      }
    } else if (item.kind === "brush-channel") {
      if (!VALID_WIPE_SIDES.has(String(item.outerNeckWipeSide || ""))) {
        item.outerNeckWipeSide = "left";
        changed = true;
      }
      if (!VALID_WIPE_SIDES.has(String(item.innerNeckWipeSide || ""))) {
        item.innerNeckWipeSide = "right";
        changed = true;
      }
      if (typeof item.pressLooseSides !== "boolean") {
        item.pressLooseSides = true;
        changed = true;
      }
    }
    return changed;
  }

  function migrateActiveMap() {
    const map = activeMap();
    if (!map || map.applicationMode !== "cold-glue" || !Array.isArray(map.objects)) return false;
    let changed = false;
    map.objects.forEach((item) => { changed = normalizeObject(item, map) || changed; });
    if (changed) {
      try { if (typeof syncApplicationMapToLegacyState === "function") syncApplicationMapToLegacyState(); } catch { }
      try { if (typeof saveCurrentSettings === "function") saveCurrentSettings(); } catch { }
    }
    migratedMapId = String(map.id || "active-cold-glue-map");
    return changed;
  }

  function sectionOptions(selected) {
    return [
      ["auto", "Auto from station program"],
      ["neck", "Neck label"],
      ["body", "Body label"],
      ["back", "Back label"],
      ["none", "No label process"]
    ].map(([value, label]) => `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`).join("");
  }

  function wipeSideOptions(selected) {
    return [
      ["left", "Left neck-label wing"],
      ["right", "Right neck-label wing"],
      ["none", "No neck-label wiping"]
    ].map(([value, label]) => `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`).join("");
  }

  function parameterMarkup(item) {
    const common = `<label>Label use<select data-cold-glue-param="labelSection">${sectionOptions(String(item.labelSection || "auto"))}</select><small>Defines which label geometry this object belongs to.</small></label>`;
    if (item.kind === "gripper") {
      return `${common}
        <label>Bottle angle on gripper centerline<input data-cold-glue-param="applicationPlateAngleDeg" type="number" step="0.1" value="${html(finite(item.applicationPlateAngleDeg, 0))}"><small>0° keeps the bottle reference aligned with the gripper centerline.</small></label>
        <label>Finish alignment before gripper (table deg)<input data-cold-glue-param="alignmentLeadTableDeg" type="number" min="0" step="0.1" value="${html(finite(item.alignmentLeadTableDeg, 6))}"><small>The bottle reaches centerline this far before the gripper point, then holds through application.</small></label>
        <label>Neck wipe order<select data-cold-glue-param="neckWipeOrder"><option value="left-right"${item.neckWipeOrder !== "right-left" ? " selected" : ""}>Left side, then right side</option><option value="right-left"${item.neckWipeOrder === "right-left" ? " selected" : ""}>Right side, then left side</option></select></label>
        <label>Neck over-wipe (mm)<input data-cold-glue-param="neckOverWipeMm" type="number" min="0" step="0.1" value="${html(finite(item.neckOverWipeMm, 5))}"><small>Added beyond each neck-label edge.</small></label>
        <label>Both-sides press distance (table deg)<input data-cold-glue-param="neckPressTableDeg" type="number" min="0.1" step="0.1" value="${html(finite(item.neckPressTableDeg, 1.5))}"><small>Initial overlap used to push both loose label wings down before rotation begins.</small></label>`;
    }
    if (item.kind === "brush") {
      return `${common}
        <label>Neck-label wipe side<select data-cold-glue-param="neckWipeSide">${wipeSideOptions(String(item.neckWipeSide || (item.side === "inner" ? "right" : "left")))}</select><small>This is the label wing the brush wipes; it is separate from inside/outside machine position.</small></label>
        <label class="inline-check cold-glue-param-check"><input data-cold-glue-param="pressLooseSide" type="checkbox"${item.pressLooseSide !== false ? " checked" : ""}> Use this brush during the initial both-sides press</label>`;
    }
    if (item.kind === "brush-channel") {
      return `${common}
        <label>Outside brush wipes<select data-cold-glue-param="outerNeckWipeSide">${wipeSideOptions(String(item.outerNeckWipeSide || "left"))}</select></label>
        <label>Inside brush wipes<select data-cold-glue-param="innerNeckWipeSide">${wipeSideOptions(String(item.innerNeckWipeSide || "right"))}</select></label>
        <label class="inline-check cold-glue-param-check"><input data-cold-glue-param="pressLooseSides" type="checkbox"${item.pressLooseSides !== false ? " checked" : ""}> Use the channel overlap to press both loose label wings down</label>`;
    }
    return common;
  }

  function decorateRows() {
    decoratePending = false;
    const map = activeMap();
    const list = document.querySelector("#wipeBuilderList");
    if (!map || map.applicationMode !== "cold-glue" || !list) return;
    if (migratedMapId !== String(map.id || "active-cold-glue-map")) migrateActiveMap();

    list.querySelectorAll(".wipe-builder-row[data-builder-object-id]").forEach((row) => {
      const item = map.objects?.find((entry) => String(entry.id) === String(row.dataset.builderObjectId));
      if (!item || item.application !== "cold-glue") return;
      const editor = row.querySelector(".builder-object-editor");
      if (!editor) return;
      let section = editor.querySelector(":scope > .cold-glue-process-parameters");
      const signature = JSON.stringify({
        kind: item.kind,
        labelSection: item.labelSection,
        applicationPlateAngleDeg: item.applicationPlateAngleDeg,
        alignmentLeadTableDeg: item.alignmentLeadTableDeg,
        neckOverWipeMm: item.neckOverWipeMm,
        neckPressTableDeg: item.neckPressTableDeg,
        neckWipeOrder: item.neckWipeOrder,
        neckWipeSide: item.neckWipeSide,
        pressLooseSide: item.pressLooseSide,
        outerNeckWipeSide: item.outerNeckWipeSide,
        innerNeckWipeSide: item.innerNeckWipeSide,
        pressLooseSides: item.pressLooseSides
      });
      if (!section) {
        section = document.createElement("fieldset");
        section.className = "cold-glue-process-parameters";
        editor.prepend(section);
      }
      if (section.dataset.signature !== signature) {
        section.dataset.signature = signature;
        section.innerHTML = `<legend>Cold Glue process parameters</legend><div class="cold-glue-parameter-grid">${parameterMarkup(item)}</div>`;
      }
    });
  }

  function scheduleDecorate() {
    if (decoratePending) return;
    decoratePending = true;
    window.requestAnimationFrame(decorateRows);
  }

  function refreshMotion() {
    try { if (typeof syncApplicationMapToLegacyState === "function") syncApplicationMapToLegacyState(); } catch { }
    try { if (typeof applyGeneratedServoProfile === "function") applyGeneratedServoProfile(); } catch { }
    try { if (typeof saveCurrentSettings === "function") saveCurrentSettings(); } catch { }
    try { if (typeof renderMap === "function") renderMap(); } catch { }
    try { if (typeof renderProgram === "function") renderProgram(); } catch { }
    try { if (typeof renderSimulation === "function") renderSimulation(); } catch { }
    try { if (typeof renderValidation === "function") renderValidation(); } catch { }
    try { if (typeof renderTopControls === "function") renderTopControls(); } catch { }
  }

  function bindControls() {
    if (document.documentElement.dataset.coldGlueParameterEditorBound === "true") return;
    document.documentElement.dataset.coldGlueParameterEditorBound = "true";
    const apply = (event, persist) => {
      const control = event.target.closest?.("[data-cold-glue-param]");
      if (!control) return;
      const row = control.closest(".wipe-builder-row[data-builder-object-id]");
      const map = activeMap();
      const item = map?.objects?.find((entry) => String(entry.id) === String(row?.dataset.builderObjectId));
      if (!item) return;
      const field = control.dataset.coldGlueParam;
      const booleanField = control.type === "checkbox";
      const numericField = control.type === "number";
      item[field] = booleanField ? control.checked : numericField ? finite(control.value, item[field]) : control.value;
      normalizeObject(item, map);
      refreshMotion();
      if (persist) {
        migratedMapId = String(map.id || "active-cold-glue-map");
        scheduleDecorate();
      }
    };
    document.addEventListener("input", (event) => apply(event, false));
    document.addEventListener("change", (event) => apply(event, true));
  }

  function installStyles() {
    if (document.querySelector("#coldGlueParameterEditorStyles")) return;
    const style = document.createElement("style");
    style.id = "coldGlueParameterEditorStyles";
    style.textContent = `.cold-glue-process-parameters{margin:0 0 9px;padding:8px;border:1px solid color-mix(in srgb,var(--green) 42%,var(--line));border-radius:7px;background:color-mix(in srgb,var(--panel) 88%,var(--green) 12%)}.cold-glue-process-parameters legend{padding:0 5px;color:var(--green);font-size:9px;font-weight:800}.cold-glue-parameter-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.cold-glue-parameter-grid label{min-width:0}.cold-glue-parameter-grid small{display:block;margin-top:3px;color:var(--muted);font-size:8px;line-height:1.3}.cold-glue-param-check{align-self:end;min-height:34px;padding:7px;border:1px solid var(--line);border-radius:6px;background:var(--input)}@media(max-width:800px){.cold-glue-parameter-grid{grid-template-columns:1fr}}`;
    document.head.appendChild(style);
  }

  function install() {
    const list = document.querySelector("#wipeBuilderList");
    if (typeof state === "undefined" || !list) return false;
    installStyles();
    bindControls();
    migrateActiveMap();
    if (!observer) {
      observer = new MutationObserver(scheduleDecorate);
      observer.observe(list, { childList: true, subtree: true });
    }
    scheduleDecorate();
    return true;
  }

  function wait() {
    if (install()) return;
    window.setTimeout(wait, RETRY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait, { once: true });
  else wait();
})();
