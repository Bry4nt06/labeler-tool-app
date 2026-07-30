"use strict";

(function installColdGlueLabelGeometryFallback() {
  const RETRY_MS = 50;
  const LAST_BRAND_KEY = "servoforge-last-label-brand-v1";
  let installed = false;

  function normalizeMode(value) {
    const normalized = String(value ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
    return normalized === "cold-glue" || normalized === "coldglue" ? "cold-glue" : "apl";
  }

  function allLabels() {
    return Array.isArray(state?.labelSpecs) ? state.labelSpecs.filter((spec) => spec && typeof spec === "object") : [];
  }

  function exactLabels(mode = state?.applicationMode) {
    const normalized = normalizeMode(mode);
    return allLabels().filter((spec) => normalizeMode(spec?.applicationMode) === normalized);
  }

  function rememberedBrand() {
    try {
      return localStorage.getItem(LAST_BRAND_KEY) || "";
    } catch {
      return "";
    }
  }

  function rememberBrand(value) {
    const brand = String(value || "").trim();
    if (!brand) return;
    try { localStorage.setItem(LAST_BRAND_KEY, brand); } catch { /* storage is optional */ }
  }

  function fallbackActive(mode = state?.applicationMode) {
    return normalizeMode(mode) === "cold-glue" && exactLabels(mode).length === 0 && allLabels().length > 0;
  }

  function chooseFallbackLabel() {
    const labels = allLabels();
    if (!labels.length) return null;
    const activeMap = typeof activeMachineMap === "function" ? activeMachineMap() : null;
    const preferredBrands = [
      state?.selectedBrand,
      rememberedBrand(),
      activeMap?.selectedBrand,
      activeMap?.defaultBrand,
      activeMap?.brand
    ].map((value) => String(value || "").trim()).filter(Boolean);
    for (const brand of preferredBrands) {
      const match = labels.find((spec) => String(spec?.brand || "") === brand);
      if (match) return match;
    }
    const bottleMatch = labels.find((spec) => String(spec?.bottleType || "") === String(state?.selectedBottle || ""));
    return bottleMatch || labels[0] || null;
  }

  function installApplicationFallback() {
    const originalList = window.labelSpecsForApplication;
    const originalEnsure = window.ensureSelectedBrandForApplication;
    if (typeof originalList !== "function" || typeof originalEnsure !== "function") return false;
    if (originalList.coldGlueGeometryFallbackWrapped) return true;

    const listWrapped = function labelSpecsForApplicationWithColdGlueFallback(mode = state.applicationMode) {
      const exact = originalList.call(this, mode);
      if (Array.isArray(exact) && exact.length) return exact;
      return normalizeMode(mode) === "cold-glue" ? allLabels() : exact;
    };
    listWrapped.coldGlueGeometryFallbackWrapped = true;
    listWrapped.originalFunction = originalList;

    const ensureWrapped = function ensureSelectedBrandForApplicationWithColdGlueFallback(...args) {
      const available = listWrapped(state.applicationMode);
      let selected = available.find((spec) => String(spec?.brand || "") === String(state.selectedBrand || "")) || null;
      if (!selected && fallbackActive()) selected = chooseFallbackLabel();
      if (selected) {
        state.selectedBrand = selected.brand || "";
        rememberBrand(state.selectedBrand);
        if (typeof ensureBottleReferenceForLabel === "function") ensureBottleReferenceForLabel(selected);
        return selected;
      }
      return originalEnsure.apply(this, args);
    };
    ensureWrapped.coldGlueGeometryFallbackWrapped = true;
    ensureWrapped.originalFunction = originalEnsure;

    window.labelSpecsForApplication = listWrapped;
    window.ensureSelectedBrandForApplication = ensureWrapped;
    try { labelSpecsForApplication = listWrapped; } catch { /* global binding may be read-only */ }
    try { ensureSelectedBrandForApplication = ensureWrapped; } catch { /* global binding may be read-only */ }
    return true;
  }

  function installCenterTackGeometry() {
    const original = window.sectionWipePlan;
    if (typeof original !== "function") return false;
    if (original.coldGlueCenterTackFallbackWrapped) return true;

    const wrapped = function sectionWipePlanWithColdGlueCenterTack(section, ...args) {
      if (normalizeMode(state?.applicationMode) !== "cold-glue" || section !== "neck") {
        return original.call(this, section, ...args);
      }
      const prior = state.buildInputs?.neckApplication;
      if (state.buildInputs) state.buildInputs.neckApplication = "Center";
      try {
        return original.call(this, section, ...args);
      } finally {
        if (state.buildInputs) state.buildInputs.neckApplication = prior;
      }
    };
    wrapped.coldGlueCenterTackFallbackWrapped = true;
    wrapped.originalFunction = original;
    window.sectionWipePlan = wrapped;
    try { sectionWipePlan = wrapped; } catch { /* global binding may be read-only */ }
    return true;
  }

  function decorateFallbackNotice() {
    if (!fallbackActive()) return;
    document.querySelectorAll("#buildInputs .application-filter-note").forEach((node, index) => {
      const text = index === 0
        ? "Using shared label geometry because no dedicated Cold Glue label specs are assigned."
        : "Cold Glue uses center-line application and map-defined brush channels.";
      if (node.textContent !== text) node.textContent = text;
    });
    const tableNote = document.querySelector("#labelSpecs .table-tool-note");
    if (tableNote) tableNote.textContent = "Label dimensions may be shared by APL and Cold Glue maps. A dedicated Cold Glue assignment takes priority when one exists.";
  }

  function installRenderNotice() {
    const original = window.renderBuildInputs;
    if (typeof original !== "function") return false;
    if (original.coldGlueFallbackNoticeWrapped) return true;
    const wrapped = function renderBuildInputsWithColdGlueFallbackNotice(...args) {
      const result = original.apply(this, args);
      decorateFallbackNotice();
      return result;
    };
    wrapped.coldGlueFallbackNoticeWrapped = true;
    wrapped.originalFunction = original;
    window.renderBuildInputs = wrapped;
    try { renderBuildInputs = wrapped; } catch { /* global binding may be read-only */ }
    return true;
  }

  function bindBrandMemory() {
    if (document.documentElement.dataset.coldGlueBrandMemoryBound === "true") return;
    document.documentElement.dataset.coldGlueBrandMemoryBound = "true";
    document.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      if (target.id === "brandSelect") rememberBrand(target.value);
    }, true);
  }

  function install() {
    if (installed) return true;
    if (typeof state === "undefined" || typeof render !== "function") return false;
    if (!installApplicationFallback() || !installCenterTackGeometry() || !installRenderNotice()) return false;
    installed = true;
    bindBrandMemory();
    const before = String(state.selectedBrand || "");
    ensureSelectedBrandForApplication();
    decorateFallbackNotice();
    if (String(state.selectedBrand || "") !== before || !before) {
      if (typeof saveCurrentSettings === "function") saveCurrentSettings();
      window.requestAnimationFrame(() => render());
    }
    return true;
  }

  function wait() {
    if (install()) return;
    window.setTimeout(wait, RETRY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait, { once: true });
  else wait();
})();