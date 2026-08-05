"use strict";

(function installDefaultBottleSpecRetirement(global) {
  if (global.LabelerDefaultBottleSpecRetirement?.installed) return;

  const RETIRED_DEFAULTS = Object.freeze([
    Object.freeze({ id: 1, bottleType: "LNNR - 7 Oz", diameterTargetMm: 53.57, radiusReductionMm: 0.25 }),
    Object.freeze({ id: 4, bottleType: "S1NR - 11.2OZ", diameterTargetMm: 60, radiusReductionMm: 0.3 }),
    Object.freeze({ id: 5, bottleType: "HLNR - 12Oz", diameterTargetMm: 61.52, radiusReductionMm: 0.312 })
  ]);
  const RETRY_MS = 50;
  const key = (value) => String(value ?? "").trim().toLowerCase();
  const close = (left, right) => Math.abs(Number(left) - Number(right)) < 0.000001;

  function matchingRetiredDefault(spec) {
    return RETIRED_DEFAULTS.find((retired) =>
      key(retired.bottleType) === key(spec?.bottleType)
      && close(retired.diameterTargetMm, spec?.diameterTargetMm)
      && close(retired.radiusReductionMm, spec?.radiusReductionMm)
    ) || null;
  }

  function shouldRetire(spec) {
    const retired = RETIRED_DEFAULTS.find((entry) => key(entry.bottleType) === key(spec?.bottleType));
    if (!retired) return false;
    return Boolean(spec?.companyDefaultSpecVersion) || Boolean(matchingRetiredDefault(spec));
  }

  function prune(items) {
    const source = Array.isArray(items) ? items : [];
    const kept = source.filter((spec) => !shouldRetire(spec));
    return {
      items: kept,
      removed: source.length - kept.length,
      removedBottleTypes: source.filter(shouldRetire).map((spec) => spec.bottleType)
    };
  }

  function apply({ persist = false, render = false } = {}) {
    if (typeof state === "undefined") return { changed: false, removed: 0 };
    const result = prune(state.bottleSpecs);
    if (!result.removed) return { ...result, changed: false };

    state.bottleSpecs = result.items;
    if (!state.bottleSpecs.some((spec) => key(spec?.bottleType) === key(state.selectedBottle))) {
      state.selectedBottle = state.bottleSpecs[0]?.bottleType || "";
    }
    if (persist && typeof global.saveCurrentSettings === "function") global.saveCurrentSettings();
    if (render && typeof global.render === "function") global.render();
    return { ...result, changed: true, selectedBottle: state.selectedBottle };
  }

  function wrapCompanyDefaults() {
    const service = global.LabelerCompanyDefaultsService;
    if (!service?.reconcile) return false;
    if (service.defaultBottleSpecRetirementV1) return true;

    const baseReconcile = service.reconcile.bind(service);
    global.LabelerCompanyDefaultsService = Object.freeze({
      ...service,
      async reconcile(...args) {
        const result = await baseReconcile(...args);
        const retirement = apply({ persist: true, render: true });
        return {
          ...result,
          changed: Boolean(result?.changed || retirement.changed),
          bottles: {
            ...(result?.bottles || {}),
            removed: Number(result?.bottles?.removed || 0) + retirement.removed,
            total: Array.isArray(state?.bottleSpecs) ? state.bottleSpecs.length : 0
          },
          retiredDefaultBottleTypes: retirement.removedBottleTypes || []
        };
      },
      defaultBottleSpecRetirementV1: true
    });
    return true;
  }

  function install() {
    if (typeof state === "undefined") return false;
    apply({ persist: false, render: false });
    if (!wrapCompanyDefaults()) return false;
    global.LabelerDefaultBottleSpecRetirement = Object.freeze({
      installed: true,
      RETIRED_DEFAULTS,
      matchingRetiredDefault,
      shouldRetire,
      prune,
      apply
    });
    return true;
  }

  function wait() {
    if (!install()) global.setTimeout(wait, RETRY_MS);
  }

  wait();
})(typeof window !== "undefined" ? window : globalThis);
