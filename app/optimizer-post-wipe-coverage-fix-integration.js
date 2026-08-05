"use strict";

(function installPostWipeCoveragePolicy(global) {
  if (global.LabelerPostWipeCoveragePolicy?.version >= 3) return;

  const RETRY_MS = 50;
  const text = (value) => String(value ?? "").trim();

  function rowForDiagnostic(rows, diagnostic) {
    const source = Array.isArray(rows) ? rows : [];
    return source.find((row) => diagnostic?.eventId && String(row?.motionEventId || row?.mechanicalEventId || "") === String(diagnostic.eventId))
      || source.find((row) => Number(row?.hmi) === Number(diagnostic?.hmi))
      || null;
  }

  function isWipeHoldCoverageDiagnostic(diagnostic, rows) {
    if (diagnostic?.code !== "optimizer-wipe-contact") return false;
    const row = rowForDiagnostic(rows, diagnostic);
    const action = text(row?.action);
    const message = text(diagnostic?.message);
    return /\bwipe\s+hold\b/i.test(action)
      || /^wipe\s+hold\b/i.test(message);
  }

  function filterDiagnostics(result, rows, options, driver) {
    const sourceRows = Array.isArray(result?.sourceRows) ? result.sourceRows : rows;
    const diagnostics = (Array.isArray(result?.diagnostics) ? result.diagnostics : [])
      .filter((diagnostic) => !isWipeHoldCoverageDiagnostic(diagnostic, sourceRows));
    result.diagnostics = diagnostics;
    if (typeof driver?.calculateMetrics === "function") {
      result.currentMetrics = driver.calculateMetrics(sourceRows || [], options, diagnostics);
    }
    result.status = diagnostics.some((item) => item.level === "bad")
      ? "ACTION"
      : diagnostics.some((item) => item.level === "warn")
        ? "REVIEW"
        : "HEALTHY";
    return result;
  }

  function install() {
    const driver = global.LabelerProgramOptimizerDriver;
    if (!driver?.analyze) return false;
    if (driver.postWipeCoveragePolicyV3) return true;

    const baseAnalyze = driver.analyze.bind(driver);
    global.LabelerProgramOptimizerDriver = Object.freeze({
      ...driver,
      analyze(rows, options = {}) {
        return filterDiagnostics(baseAnalyze(rows, options), rows, options, driver);
      },
      postWipeCoveragePolicyV3: true
    });
    global.LabelerPostWipeCoveragePolicy = Object.freeze({
      installed: true,
      version: 3,
      rowForDiagnostic,
      isWipeHoldCoverageDiagnostic,
      filterDiagnostics
    });

    try {
      if (typeof state !== "undefined" && state.programOptimization) {
        state.programOptimization.lastSignature = "";
        state.programOptimization.result = null;
      }
      global.setTimeout(() => {
        if (typeof renderProgram === "function") renderProgram();
        if (typeof renderValidation === "function") renderValidation();
      }, 0);
    } catch {
      // The next render will use the corrected optimizer result.
    }
    return true;
  }

  function wait() {
    if (!install()) global.setTimeout(wait, RETRY_MS);
  }

  wait();
})(typeof window !== "undefined" ? window : globalThis);
