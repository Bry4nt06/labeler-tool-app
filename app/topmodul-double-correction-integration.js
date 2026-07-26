"use strict";

(function installTopModulDoubleCorrectionPolicy() {
  const RELEASE_VERSION = "0.8.8";
  const RETRY_MS = 25;
  const LEGACY_PAIR_CODES = new Set([
    "correction-missing-leading-reference",
    "correction-missing-trailing-reference",
    "legacy-start-reference",
    "legacy-grammar-ok",
    "machine-grammar-pair-start",
    "machine-grammar-pair-end"
  ]);
  const LEGACY_PAIR_PATTERNS = [
    /CMD\s*7\s+and\s+must\s+be\s+followed\s+by\s+CMD\s*3\s+before\s+another\s+move/i,
    /CMD\s*7\s+without\s+a\s+preceding\s+CMD\s*3\s+reference/i,
    /Required\s+sequence\s+is\s+3\s*[→>-]+\s*7\s*[→>-]+\s*3/i,
    /without\s+an\s+immediately\s+preceding\s+CMD\s*3\s+reference/i,
    /must\s+be\s+followed\s+by\s+CMD\s*3\s+before\s+another.*move/i
  ];

  let installed = false;
  let validateWrapped = false;

  function activeMap() {
    return typeof activeMachineMap === "function" ? activeMachineMap() : null;
  }

  function context(rows = state.program) {
    const map = activeMap();
    return {
      rows,
      map,
      family: "TOPMODUL",
      machineFamily: "TOPMODUL",
      machineType: map?.machineType || "TopModul",
      machineProfile: state.motionTranslation?.machineProfile
        || state.motionPlan?.translation?.machineProfile
        || rows?.find?.((row) => row?.translatedMachineProfile)?.translatedMachineProfile
        || "DEFAULT",
      applicationMode: state.applicationMode || map?.applicationMode || "apl",
      tolerance: 0.001
    };
  }

  function resolvedFamily(rows = state.program) {
    const map = activeMap();
    const machineType = String(map?.machineType || "").toUpperCase();
    if (machineType.includes("TOPMODUL")) return "TOPMODUL";
    if (machineType.includes("AUTOCOL")) return "AUTOCOL";

    const annotatedFamily = String(
      state.machineFamilyGrammar?.family
      || rows?.find?.((row) => row?.machineGrammarFamily)?.machineGrammarFamily
      || ""
    ).toUpperCase();
    if (annotatedFamily) return annotatedFamily;

    const grammar = window.LabelerMachineFamilyGrammarDriver;
    return String(grammar?.resolveFamily?.({ ...context(rows), family: undefined, machineFamily: undefined }) || "DEFAULT").toUpperCase();
  }

  function isTopModul(rows = state.program) {
    return resolvedFamily(rows) === "TOPMODUL";
  }

  function isLegacyPairMessage(message) {
    const text = String(message || "");
    return LEGACY_PAIR_PATTERNS.some((pattern) => pattern.test(text));
  }

  function summarize(issues) {
    return (Array.isArray(issues) ? issues : []).reduce((summary, issue) => {
      const level = issue?.level || "warn";
      summary[level] = (summary[level] || 0) + 1;
      summary.total += 1;
      return summary;
    }, { bad: 0, warn: 0, ok: 0, total: 0 });
  }

  function categoriesFor(issues) {
    const categories = {};
    (Array.isArray(issues) ? issues : []).forEach((issue) => {
      const category = issue?.category || "general";
      const level = issue?.level || "warn";
      categories[category] ||= { bad: 0, warn: 0, ok: 0, total: 0 };
      categories[category][level] = (categories[category][level] || 0) + 1;
      categories[category].total += 1;
    });
    return categories;
  }

  function dedupeIssues(issues) {
    const seen = new Set();
    return (Array.isArray(issues) ? issues : []).filter((issue) => {
      const key = `${issue?.level}|${issue?.code}|${issue?.hmi ?? ""}|${issue?.eventId ?? ""}|${issue?.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function explicitTopModulGrammar(rows, tolerance = 0.001) {
    const grammar = window.LabelerMachineFamilyGrammarDriver;
    if (!grammar?.analyze) return null;
    return grammar.analyze(rows, {
      ...context(rows),
      family: "TOPMODUL",
      machineFamily: "TOPMODUL",
      machineType: "TopModul",
      tolerance
    });
  }

  function installCommandValidation() {
    const base = window.LabelerServoCommandDriver;
    const grammar = window.LabelerMachineFamilyGrammarDriver;
    if (!base || !grammar?.validate || base.topModulDoubleCorrectionPolicy) return;

    const priorGrammar = typeof base.validateGrammar === "function"
      ? base.validateGrammar.bind(base)
      : () => [];
    const priorReferences = typeof base.validateReferences === "function"
      ? base.validateReferences.bind(base)
      : priorGrammar;

    const validateForMachine = (fallback, rows, tolerance = 0.001) => {
      if (!isTopModul(rows)) return fallback(rows, tolerance);
      return grammar.validate(rows, {
        ...context(rows),
        family: "TOPMODUL",
        machineFamily: "TOPMODUL",
        machineType: "TopModul",
        tolerance
      });
    };

    window.LabelerServoCommandDriver = Object.freeze({
      ...base,
      validateGrammar(rows, tolerance = 0.001) {
        return validateForMachine(priorGrammar, rows, tolerance);
      },
      validateReferences(rows, tolerance = 0.001) {
        return validateForMachine(priorReferences, rows, tolerance);
      },
      topModulDoubleCorrectionPolicy: true
    });
  }

  function installPipelineValidation() {
    const base = window.LabelerServoPipelineValidator;
    if (!base?.analyze || base.topModulDoubleCorrectionPolicy) return;

    window.LabelerServoPipelineValidator = Object.freeze({
      ...base,
      topModulDoubleCorrectionPolicy: true,
      analyze(options = {}) {
        const result = base.analyze(options);
        const rows = Array.isArray(options.rows) ? options.rows : [];
        if (!isTopModul(rows)) return result;

        const grammarResult = explicitTopModulGrammar(rows, options.tolerance ?? 0.001);
        if (!grammarResult) return result;

        // TopModul validates the complete correction chain. Remove only the
        // obsolete immediate 3-7-3 grammar and replace it with the chain result.
        const retained = (result.issues || []).filter((issue) => {
          if (issue?.category === "grammar") return false;
          if (LEGACY_PAIR_CODES.has(issue?.code)) return false;
          return !isLegacyPairMessage(issue?.message);
        });
        const issues = dedupeIssues([...retained, ...grammarResult.issues]);
        const summary = summarize(issues);
        const output = {
          ...result,
          valid: summary.bad === 0,
          status: summary.bad ? "FAIL" : summary.warn ? "REVIEW" : "PASS",
          summary,
          categories: categoriesFor(issues),
          issues,
          machineProfile: "TOPMODUL",
          machineFamily: "TOPMODUL",
          machineGrammarProfile: grammarResult.rule.id,
          machineGrammarName: grammarResult.rule.name,
          machineGrammarSequence: grammarResult.rule.sequence,
          machineGrammarDescription: grammarResult.rule.description,
          topModulDoubleCorrection: true
        };
        state.machineFamilyGrammarValidation = grammarResult;
        state.servoPipelineValidation = output;
        return output;
      }
    });
  }

  function filterValidationNotes(notes) {
    if (!isTopModul(state.program)) return notes;
    return (Array.isArray(notes) ? notes : []).filter((note) => {
      const message = String(note?.[1] || "");
      const code = note?.[2]?.pipelineCode;
      if (LEGACY_PAIR_CODES.has(code)) return false;
      return !isLegacyPairMessage(message);
    });
  }

  function installFinalValidationFilter() {
    if (validateWrapped || typeof validate !== "function") return;
    validateWrapped = true;
    const before = validate;
    validate = function validateWithTopModulDoubleCorrections(...args) {
      return filterValidationNotes(before.apply(this, args));
    };
  }

  function refreshProgramAnnotations() {
    if (!isTopModul(state.program)) return;
    const grammar = window.LabelerMachineFamilyGrammarDriver;
    if (!grammar?.annotateCorrectionChains || !Array.isArray(state.program)) return;
    const annotated = grammar.annotateCorrectionChains(state.program, {
      ...context(state.program),
      family: "TOPMODUL",
      machineFamily: "TOPMODUL",
      machineType: "TopModul"
    });
    state.program = annotated.rows;
    state.machineFamilyGrammar = {
      family: "TOPMODUL",
      rule: annotated.rule,
      chains: annotated.chains,
      chainCount: annotated.chains.length
    };
    if (state.motionPlan) state.motionPlan.rows = state.program;
    if (state.motionTranslation) state.motionTranslation.rows = state.program;
  }

  function install() {
    if (installed) return true;
    if (typeof state === "undefined"
      || typeof validate !== "function"
      || !window.LabelerServoCommandDriver
      || !window.LabelerServoPipelineValidator
      || !window.LabelerMachineFamilyGrammarDriver) return false;

    installed = true;
    installCommandValidation();
    installPipelineValidation();
    installFinalValidationFilter();
    refreshProgramAnnotations();

    const versionMeta = document.querySelector('meta[name="application-version"]');
    if (versionMeta) versionMeta.content = RELEASE_VERSION;
    const versionStatus = document.querySelector("#updateCheckStatus");
    if (versionStatus && /^Version\s+/i.test(versionStatus.textContent || "")) {
      versionStatus.textContent = `Version ${RELEASE_VERSION} • Updates are checked automatically.`;
    }
    return true;
  }

  function waitForDependencies() {
    if (install()) return;
    window.setTimeout(waitForDependencies, RETRY_MS);
  }

  waitForDependencies();
})();
