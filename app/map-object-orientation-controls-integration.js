"use strict";

(function installMapObjectOrientationControlsIntegration() {
  const RETRY_MS = 50;
  let installed = false;
  let addSnapshot = null;

  const sectionValue = (value) => ["auto", "neck", "body", "back", "none"].includes(String(value || "auto")) ? String(value || "auto") : "auto";
  const mapNow = () => typeof activeMachineMap === "function" ? activeMachineMap() : null;
  const editMap = () => typeof editableMachineMap === "function" ? editableMachineMap() : mapNow();

  function escapeHtml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function sectionOptions(selected) {
    return [["auto", "Auto from station/map"], ["neck", "Neck label"], ["body", "Body label"], ["back", "Back label"], ["none", "No label orientation"]]
      .map(([value, label]) => `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`).join("");
  }

  function normalizeCodingOrientationOff({ persist = false } = {}) {
    const maps = [...new Set([mapNow(), editMap()].filter(Boolean))];
    let changed = false;
    maps.forEach((map) => {
      (map.objects || []).forEach((item) => {
        if (item?.kind !== "coding" || item.orientBottle === false) return;
        item.orientBottle = false;
        changed = true;
      });
    });
    if (changed && persist && typeof saveCurrentSettings === "function") saveCurrentSettings();
    return changed;
  }

  function controls(item) {
    const section = sectionValue(item.orientationLabelSection);
    const target = item.kind === "coding"
      ? `<label>Orientation target<select data-object-orientation-field="orientationTarget"><option value="code-box"${item.orientationTarget !== "label-center" ? " selected" : ""}>Code box center</option><option value="label-center"${item.orientationTarget === "label-center" ? " selected" : ""}>Label centerline</option></select></label>`
      : "";
    return `<div class="map-object-orientation-fields" data-orientation-object-id="${escapeHtml(item.id)}">
      <label>Target label<select data-object-orientation-field="orientationLabelSection">${sectionOptions(section)}</select><small>The servo profile uses this label instead of a brand- or machine-specific assumption.</small></label>
      ${target}
    </div>`;
  }

  function saveField(itemId, field, control) {
    const map = editMap();
    const item = map?.objects?.find((entry) => String(entry.id) === String(itemId));
    if (!item) return;
    if (typeof recordBuilderHistory === "function") recordBuilderHistory(`Update ${item.name || item.kind} orientation`);
    if (field === "orientationLabelSection") item.orientationLabelSection = sectionValue(control.value);
    if (field === "orientationTarget") item.orientationTarget = control.value === "label-center" ? "label-center" : "code-box";
    if (field === "orientBottle") item.orientBottle = Boolean(control.checked);
    if (item.kind === "coding") item.orientBottle = false;
    item.orientationConfigured = true;
    if (typeof refreshAfterBuilderEdit === "function") refreshAfterBuilderEdit({ persist: true });
    if (typeof renderWipeDownBuilder === "function") renderWipeDownBuilder();
  }

  function decorateEditors() {
    const map = mapNow();
    if (!map) return;
    document.querySelectorAll(".wipe-builder-row[data-builder-object-id]").forEach((row) => {
      const item = map.objects?.find((entry) => String(entry.id) === String(row.dataset.builderObjectId));
      if (!item || !["sensor", "coding"].includes(item.kind)) return;
      if (item.kind === "coding") item.orientBottle = false;
      const grid = row.querySelector(".builder-row-grid");
      if (!grid || grid.querySelector(".map-object-orientation-fields")) return;
      grid.insertAdjacentHTML("beforeend", controls(item));
      grid.querySelectorAll("[data-object-orientation-field]").forEach((control) => {
        control.addEventListener("change", () => saveField(item.id, control.dataset.objectOrientationField, control));
      });
    });
  }

  function addControls() {
    const grid = document.querySelector("#addMapObjectSection .builder-add-grid");
    if (!grid || grid.querySelector("#builderOrientationLabel")) return;
    const button = grid.querySelector("#addBuilderObject");
    const holder = document.createElement("div");
    holder.className = "builder-orientation-create-fields";
    holder.innerHTML = `<label id="builderOrientationLabelWrap">Target label<select id="builderOrientationLabel">${sectionOptions("auto")}</select></label>
      <label id="builderCodingTargetWrap">Orientation target<select id="builderCodingTarget"><option value="code-box">Code box center</option><option value="label-center">Label centerline</option></select></label>`;
    grid.insertBefore(holder, button || null);
    updateCreateVisibility();
  }

  function updateCreateVisibility() {
    const type = document.querySelector("#builderObjectType")?.value;
    const relevant = type === "sensor" || type === "coding";
    const coding = type === "coding";
    const label = document.querySelector("#builderOrientationLabelWrap");
    const target = document.querySelector("#builderCodingTargetWrap");
    if (label) label.hidden = !relevant;
    if (target) target.hidden = !coding;
  }

  function captureAdd(event) {
    if (!event.target.closest?.("#addBuilderObject")) return;
    const map = mapNow();
    addSnapshot = {
      ids: new Set((map?.objects || []).map((item) => String(item.id))),
      type: document.querySelector("#builderObjectType")?.value,
      section: sectionValue(document.querySelector("#builderOrientationLabel")?.value),
      orient: false,
      target: document.querySelector("#builderCodingTarget")?.value === "label-center" ? "label-center" : "code-box"
    };
  }

  function finishAdd(event) {
    if (!event.target.closest?.("#addBuilderObject") || !addSnapshot) return;
    const snapshot = addSnapshot;
    addSnapshot = null;
    if (!["sensor", "coding"].includes(snapshot.type)) return;
    const map = editMap();
    const item = [...(map?.objects || [])].reverse().find((entry) => entry.kind === snapshot.type && !snapshot.ids.has(String(entry.id)));
    if (!item) return;
    item.orientationLabelSection = snapshot.section;
    item.orientationTarget = snapshot.type === "coding" ? snapshot.target : "label-center";
    item.orientBottle = snapshot.type === "sensor" ? Boolean(item.servoAssist) : false;
    item.orientationConfigured = true;
    if (typeof refreshAfterBuilderEdit === "function") refreshAfterBuilderEdit({ persist: true });
    if (typeof renderWipeDownBuilder === "function") renderWipeDownBuilder();
  }

  function installStyles() {
    if (document.querySelector("#mapObjectOrientationControlStyles")) return;
    const style = document.createElement("style");
    style.id = "mapObjectOrientationControlStyles";
    style.textContent = `.map-object-orientation-fields,.builder-orientation-create-fields{display:contents}.map-object-orientation-fields>label,.builder-orientation-create-fields>label{border-left:3px solid var(--blue);padding-left:7px}#builderCodingOrientWrap,.map-object-orientation-fields label:has([data-object-orientation-field="orientBottle"]){display:none!important}`;
    document.head.appendChild(style);
  }

  function install() {
    if (installed) return true;
    if (typeof renderWipeDownBuilder !== "function") return false;
    normalizeCodingOrientationOff({ persist: true });
    const base = renderWipeDownBuilder;
    renderWipeDownBuilder = function renderWipeDownBuilderWithOrientationControls(...args) {
      const changed = normalizeCodingOrientationOff();
      const result = base.apply(this, args);
      addControls();
      decorateEditors();
      updateCreateVisibility();
      if (changed && typeof saveCurrentSettings === "function") saveCurrentSettings();
      return result;
    };
    window.renderWipeDownBuilder = renderWipeDownBuilder;
    document.addEventListener("change", (event) => { if (event.target.closest?.("#builderObjectType")) updateCreateVisibility(); });
    document.addEventListener("click", captureAdd, true);
    document.addEventListener("click", finishAdd, false);
    installStyles();
    installed = true;
    renderWipeDownBuilder();
    try {
      if (typeof applyGeneratedServoProfile === "function") applyGeneratedServoProfile();
      if (typeof render === "function") render();
    } catch (error) {
      console.error("Unable to disable coding orientation.", error);
    }
    return true;
  }

  function wait() { if (!install()) window.setTimeout(wait, RETRY_MS); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait, { once: true });
  else wait();
})();
