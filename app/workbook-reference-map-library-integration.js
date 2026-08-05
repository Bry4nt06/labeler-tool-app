"use strict";

(function installWorkbookExactWindowCompatibility(global) {
  const RETRY_MS = 50;

  function install() {
    if (typeof global.normalizeBuilderObject !== "function") return false;
    if (global.normalizeBuilderObject.workbookReferenceWindowSupport) return true;

    const base = global.normalizeBuilderObject;
    const patched = function normalizeBuilderObjectWithWorkbookWindows(item, ...args) {
      const normalized = base.call(this, item, ...args);
      if (item?.workbookExactWindow === true && ["sensor", "coding"].includes(normalized.kind)) {
        const start = Number(item.start ?? item.angle);
        const end = Number(item.end);
        if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
          normalized.start = start;
          normalized.end = end;
          if (normalized.kind === "sensor") normalized.angle = Number(item.angle ?? start);
          normalized.workbookExactWindow = true;
        }
      }
      return normalized;
    };

    patched.workbookReferenceWindowSupport = true;
    patched.addsDefaultMap = false;
    global.normalizeBuilderObject = patched;
    global.LabelerWorkbookReferenceMapLibraryIntegration = Object.freeze({
      installed: true,
      addsDefaultMap: false,
      purpose: "Preserve explicit sensor and coding windows without injecting a map."
    });
    return true;
  }

  function wait() {
    if (!install()) global.setTimeout(wait, RETRY_MS);
  }

  if (global.document?.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", wait, { once: true });
  } else wait();
})(typeof window !== "undefined" ? window : globalThis);
