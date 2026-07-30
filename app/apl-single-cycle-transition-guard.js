"use strict";

(function installAplSingleCycleTransitionGuard() {
  const RETRY_MS = 50;
  const FULL_CYCLE = 360;
  const EPSILON = 0.001;
  let installed = false;

  function collapseArtificialTableCycles(rows) {
    if (!Array.isArray(rows) || rows.length < 2) return rows;

    let previous = Number(rows[0]?.tableAngle);
    let removedCycles = 0;
    const normalized = rows.map((row, index) => {
      const raw = Number(row?.tableAngle);
      if (!Number.isFinite(raw)) return { ...row };
      if (index === 0 || !Number.isFinite(previous)) {
        previous = raw;
        return { ...row };
      }

      let tableAngle = raw;
      let rowCycles = 0;
      while (tableAngle - previous >= FULL_CYCLE - EPSILON) {
        tableAngle -= FULL_CYCLE;
        rowCycles += 1;
      }

      // Only remove complete artificial laps. A remaining reverse/non-monotonic
      // transition is real map geometry and must stay visible to validation.
      if (tableAngle < previous - EPSILON) {
        previous = raw;
        return { ...row };
      }

      previous = tableAngle;
      removedCycles += rowCycles;
      return rowCycles
        ? { ...row, tableAngle, removedTableCycles: rowCycles, tableCycleCorrected: true }
        : { ...row };
    });

    if (removedCycles && typeof state !== "undefined" && state.motionPlan?.mapDriven) {
      state.motionPlan.rows = normalized;
      state.motionPlan.issues = Array.isArray(state.motionPlan.issues) ? state.motionPlan.issues : [];
      const alreadyReported = state.motionPlan.issues.some((issue) => issue?.code === "apl-artificial-table-cycle-collapsed");
      if (!alreadyReported) {
        state.motionPlan.issues.push({
          level: "ok",
          code: "apl-artificial-table-cycle-collapsed",
          message: `Removed ${removedCycles} artificial full-table cycle${removedCycles === 1 ? "" : "s"} created while sequencing overlapping inside/outside wipe-down pads. The servo program now continues to the next aggregate in the same 0–360° curve.`
        });
      }
    }

    return normalized.map((row, index) => ({ ...row, hmi: index + 1, plc: index }));
  }

  function wrapGenerator() {
    const original = window.generatedAplMapDrivenProfile;
    if (typeof original !== "function" || original.aplSingleCycleTransitionGuardWrapped) return false;

    const wrapped = function generatedAplMapDrivenProfileSingleCycleGuard(machineMap, ...args) {
      return collapseArtificialTableCycles(original.call(this, machineMap, ...args));
    };
    wrapped.aplSingleCycleTransitionGuardWrapped = true;
    wrapped.originalGenerator = original;
    window.generatedAplMapDrivenProfile = wrapped;
    try { generatedAplMapDrivenProfile = wrapped; } catch { /* global binding may be read-only */ }
    return true;
  }

  function install() {
    if (installed) return true;
    if (typeof state === "undefined" || typeof window.generatedAplMapDrivenProfile !== "function") return false;
    if (!wrapGenerator()) return false;
    installed = true;
    return true;
  }

  function wait() {
    if (install()) return;
    window.setTimeout(wait, RETRY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait, { once: true });
  else wait();
})();
