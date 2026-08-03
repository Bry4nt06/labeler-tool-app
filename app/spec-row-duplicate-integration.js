"use strict";

(function installSpecRowDuplicateIntegration() {
  const RETRY_MS = 50;
  let installed = false;
  let decorationPending = false;
  let bottleObserver = null;
  let labelObserver = null;

  function cloneRecord(value) {
    if (typeof structuredClone === "function") {
      try { return structuredClone(value); } catch { /* fall through */ }
    }
    return JSON.parse(JSON.stringify(value));
  }

  function nextSpecId(items) {
    if (typeof nextId === "function") return nextId(items);
    return (Array.isArray(items) ? items : []).reduce((highest, item) => {
      const id = Number(item?.id);
      return Number.isFinite(id) ? Math.max(highest, id) : highest;
    }, 0) + 1;
  }

  function uniqueCopyName(sourceName, existingNames, fallback) {
    const clean = String(sourceName || fallback || "Specification").trim() || fallback || "Specification";
    const root = clean.replace(/\s+Copy(?:\s+\d+)?$/i, "").trim() || clean;
    const used = new Set((Array.isArray(existingNames) ? existingNames : [])
      .map((name) => String(name || "").trim().toLowerCase())
      .filter(Boolean));

    let candidate = `${root} Copy`;
    let copyNumber = 2;
    while (used.has(candidate.toLowerCase())) {
      candidate = `${root} Copy ${copyNumber}`;
      copyNumber += 1;
    }
    return candidate;
  }

  function rowId(row) {
    const value = Number(row?.querySelector("td")?.textContent?.trim());
    return Number.isFinite(value) ? value : null;
  }

  function duplicateIcon() {
    if (typeof specificationActionIcon === "function") return specificationActionIcon("duplicate");
    return '<svg class="spec-action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="9" y="9" width="10" height="10" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
  }

  function duplicateButton(library, id, label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button small-button spec-icon-button spec-duplicate-button";
    button.dataset.specLibrary = library;
    button.dataset.specId = String(id);
    button.innerHTML = duplicateIcon();
    button.title = `Duplicate ${label}`;
    button.setAttribute("aria-label", `Duplicate ${label}`);
    return button;
  }

  function decorateRows(host, library) {
    if (!host) return;
    host.querySelectorAll("tbody tr").forEach((row) => {
      const id = rowId(row);
      const actionCell = row.lastElementChild;
      if (id === null || !actionCell || actionCell.querySelector(".spec-duplicate-button")) return;

      actionCell.classList.add("spec-row-actions");
      const sourceName = row.querySelector("input")?.value?.trim() || `${library} specification ${id}`;
      const button = duplicateButton(library, id, sourceName);
      const deleteButton = actionCell.querySelector("button.danger");
      actionCell.insertBefore(button, deleteButton || null);
    });
  }

  function scheduleDecoration() {
    if (decorationPending) return;
    decorationPending = true;
    window.requestAnimationFrame(() => {
      decorationPending = false;
      decorateRows(els?.bottleSpecs, "bottle");
      decorateRows(els?.labelSpecs, "label");
    });
  }

  function findSpecRow(host, id) {
    return [...(host?.querySelectorAll("tbody tr") || [])]
      .find((row) => rowId(row) === Number(id)) || null;
  }

  function focusDuplicatedRow(library, id) {
    const host = library === "bottle" ? els?.bottleSpecs : els?.labelSpecs;
    const row = findSpecRow(host, id);
    if (!row) return;
    row.classList.add("spec-duplicate-created");
    row.scrollIntoView({ block: "center", behavior: "smooth" });
    const nameInput = row.querySelector("input");
    if (nameInput) {
      nameInput.focus({ preventScroll: true });
      nameInput.select();
    }
    window.setTimeout(() => row.classList.remove("spec-duplicate-created"), 1800);
  }

  function duplicateBottleSpec(id) {
    const source = state.bottleSpecs.find((spec) => Number(spec.id) === Number(id));
    if (!source) return null;

    const copy = cloneRecord(source);
    copy.id = nextSpecId(state.bottleSpecs);
    copy.bottleType = uniqueCopyName(
      source.bottleType,
      state.bottleSpecs.map((spec) => spec.bottleType),
      `Bottle ${copy.id}`
    );
    state.bottleSpecs.push(copy);
    state.selectedBottle = copy.bottleType;
    return copy;
  }

  function duplicateLabelSpec(id) {
    const source = state.labelSpecs.find((spec) => Number(spec.id) === Number(id));
    if (!source) return null;

    const copy = cloneRecord(source);
    copy.id = nextSpecId(state.labelSpecs);
    copy.applicationMode = typeof normalizeLabelApplicationMode === "function"
      ? normalizeLabelApplicationMode(source.applicationMode)
      : String(source.applicationMode || "apl");
    copy.brand = uniqueCopyName(
      source.brand,
      state.labelSpecs.map((spec) => spec.brand),
      `Label ${copy.id}`
    );
    state.labelSpecs.push(copy);
    if (copy.applicationMode === state.applicationMode) state.selectedBrand = copy.brand;
    return copy;
  }

  function duplicateFromButton(button) {
    const library = button.dataset.specLibrary;
    const id = Number(button.dataset.specId);
    if (!Number.isFinite(id)) return;

    const copy = library === "bottle"
      ? duplicateBottleSpec(id)
      : library === "label"
        ? duplicateLabelSpec(id)
        : null;
    if (!copy) return;

    if (typeof render === "function") render();
    window.requestAnimationFrame(() => {
      scheduleDecoration();
      window.requestAnimationFrame(() => focusDuplicatedRow(library, copy.id));
    });
  }

  function bindHost(host) {
    if (!host || host.dataset.specDuplicateBound === "true") return;
    host.dataset.specDuplicateBound = "true";
    host.addEventListener("click", (event) => {
      const button = event.target.closest(".spec-duplicate-button");
      if (!button || !host.contains(button)) return;
      event.preventDefault();
      event.stopPropagation();
      duplicateFromButton(button);
    });
  }

  function installStyles() {
    if (document.querySelector("#specRowDuplicateStyles")) return;
    const style = document.createElement("style");
    style.id = "specRowDuplicateStyles";
    style.textContent = `
      .spec-row-actions {
        display: flex;
        flex-wrap: nowrap;
        align-items: center;
        justify-content: flex-start;
        gap: 5px;
        min-width: 0;
        white-space: nowrap;
      }
      .spec-row-actions .spec-icon-button {
        display: inline-flex;
        flex: 0 0 32px;
        align-items: center;
        justify-content: center;
        width: 32px;
        min-width: 32px;
        height: 30px;
        min-height: 30px;
        padding: 5px;
      }
      .spec-action-icon {
        width: 16px;
        height: 16px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
        pointer-events: none;
      }
      .spec-duplicate-created {
        outline: 2px solid var(--green);
        outline-offset: -2px;
        background: color-mix(in srgb, var(--green) 12%, transparent);
      }
    `;
    document.head.appendChild(style);
  }

  function install() {
    if (installed) return true;
    if (typeof state === "undefined"
      || typeof els === "undefined"
      || !els.bottleSpecs
      || !els.labelSpecs
      || typeof render !== "function") return false;

    installed = true;
    installStyles();
    bindHost(els.bottleSpecs);
    bindHost(els.labelSpecs);

    bottleObserver = new MutationObserver(scheduleDecoration);
    bottleObserver.observe(els.bottleSpecs, { childList: true, subtree: true });
    labelObserver = new MutationObserver(scheduleDecoration);
    labelObserver.observe(els.labelSpecs, { childList: true, subtree: true });
    scheduleDecoration();
    return true;
  }

  function wait() {
    if (install()) return;
    window.setTimeout(wait, RETRY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait, { once: true });
  else wait();
})();
