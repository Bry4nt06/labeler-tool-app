"use strict";

(function installAplContinuousMotionIntegration() {
  const RETRY_MS = 50;
  const APL_CONTINUOUS_COMMANDS = Object.freeze([1, 2, 3, 5, 6, 7]);
  const APL_CONTINUOUS_RULE = Object.freeze({
    id: "TOPMODUL_APL_CONTINUOUS",
    name: "TopModul APL continuous motion",
    mode: "advanced-motion",
    supportedCommands: APL_CONTINUOUS_COMMANDS,
    sequence: "CMD 3 reference → CMD 1 Startup → CMD 5/CMD 6 continuous motion → CMD 2 End → CMD 3 Rest, with isolated CMD 7 corrections",
    description: "APL may execute either the proven CMD 3/CMD 7 correction-chain profile or a continuous Startup/Continuous/Changeover/End motion sequence."
  });
  const REPLACED_GRAMMAR_CODES = new Set([
    "correction-missing-leading-reference",
    "correction-missing-trailing-reference",
    "legacy-start-reference",
    "legacy-grammar-ok",
    "rest-produces-motion",
    "empty-correction",
    "advanced-rest-motion",
    "advanced-empty-correction",
    "correction-during-continuous",
    "startup-already-moving",
    "empty-startup",
    "continuous-without-startup",
    "changeover-without-motion",
    "empty-continuous-move",
    "end-without-motion",
    "end-missing-rest",
    "continuous-not-ended",
    "advanced-grammar-ok",
    "empty-special",
    "rest-before-end"
  ]);
  let installed = false;
  let refreshPending = false;

  function activeMapSafe() {
    try {
      return typeof activeMachineMap === "function" ? activeMachineMap() : null;
    } catch {
      return null;
    }
  }

  function isAplContext(options = {}) {
    const map = options.map || activeMapSafe();
    const identity = `${options.machineType || ""} ${map?.machineType || ""} ${map?.name || ""}`.toUpperCase();
    const application = String(options.applicationMode || map?.applicationMode || state?.applicationMode || "").toLowerCase();
    if (application === "cold-glue") return false;
    return application === "apl"
      || identity.includes("TOPMODUL")
      || (identity.includes("APL") && !identity.includes("COLD"));
  }

  function usesContinuousCommands(rows) {
    return (Array.isArray(rows) ? rows : []).some((row) => [1, 2, 5, 6].includes(Number(row?.cmd)));
  }

  function continuousSelected() {
    return String(state?.selectedMotionProfileId || state?.defaultMotionProfileId || "") === "continuous-motion";
  }

  function grammarContext(rows, options = {}) {
    const map = options.map || activeMapSafe();
    return {
      ...options,
      rows,
      map,
      machineType: options.machineType || map?.machineType || map?.name || "",
      machineProfile: options.machineProfile
        || state?.motionTranslation?.machineProfile
        || state?.motionPlan?.translation?.machineProfile
        || rows?.find?.((row) => row?.translatedMachineProfile)?.translatedMachineProfile
        || "APL",
      applicationMode: options.applicationMode || state?.applicationMode || map?.applicationMode || "apl",
      tolerance: options.tolerance ?? 0.001
    };
  }

  function installAplCommandCapability() {
    const base = window.LabelerServoCommandDriver;
    if (!base || base.aplContinuousMotionEnabled) return;

    const aplProfile = Object.freeze({
      name: "APL Continuous Motion",
      supportedMoves: APL_CONTINUOUS_COMMANDS,
      generatedMoves: APL_CONTINUOUS_COMMANDS
    });
    const profiles = Object.freeze({
      ...(base.MACHINE_MOVE_PROFILES || {}),
      APL: aplProfile
    });

    function profileDefinition(profileName = "DEFAULT") {
      const key = String(profileName || "DEFAULT").toUpperCase();
      return key === "APL" ? aplProfile : base.profileDefinition(key);
    }

    function profileSupportsMove(profileName, codeOrKey) {
      const key = String(profileName || "DEFAULT").toUpperCase();
      const move = base.moveDefinition?.(codeOrKey);
      if (key === "APL") return Boolean(move && APL_CONTINUOUS_COMMANDS.includes(Number(move.code)));
      return base.profileSupportsMove(profileName, codeOrKey);
    }

    function commandForIntent(intent, profileName = "DEFAULT") {
      const intentMap = {
        HOLD: 3,
        REST: 3,
        REFERENCE: 3,
        ROTATE: 7,
        CORRECT: 7,
        CORRECTION: 7,
        START: 1,
        STARTUP: 1,
        STOP: 2,
        END: 2,
        CONTINUOUS: 5,
        MAINTAIN: 5,
        CHANGE_SPEED: 6,
        CHANGEOVER: 6,
        SPECIAL: 4
      };
      const requested = intentMap[String(intent || "").trim().toUpperCase().replace(/[\s-]+/g, "_")];
      if (!requested) return null;
      return profileSupportsMove(profileName, requested) ? requested : null;
    }

    function finalize(rows) {
      const source = Array.isArray(rows) ? rows : [];
      if (isAplContext() && continuousSelected() && source.some((row) => APL_CONTINUOUS_COMMANDS.includes(Number(row?.cmd)))) {
        return source.map((row) => ({
          ...row,
          cmd: APL_CONTINUOUS_COMMANDS.includes(Number(row?.cmd)) ? Number(row.cmd) : 3
        }));
      }
      return base.finalize(rows);
    }

    window.LabelerServoCommandDriver = Object.freeze({
      ...base,
      MACHINE_MOVE_PROFILES: profiles,
      profileDefinition,
      profileSupportsMove,
      commandForIntent,
      finalize,
      aplContinuousMotionEnabled: true
    });
  }

  function installAplGrammar() {
    const base = window.LabelerMachineFamilyGrammarDriver;
    if (!base || base.aplContinuousMotionEnabled) return;

    function shouldUseContinuous(rows, options = {}) {
      return isAplContext(options) && (usesContinuousCommands(rows) || continuousSelected());
    }

    function ruleProfile(options = {}) {
      const rows = options.rows || state?.program || [];
      return shouldUseContinuous(rows, options) ? APL_CONTINUOUS_RULE : base.ruleProfile(options);
    }

    function analyze(rows, options = {}) {
      if (!shouldUseContinuous(rows, options)) return base.analyze(rows, options);
      const result = base.analyze(rows, {
        ...options,
        rows,
        machineFamily: "MULTIMODUL",
        machineType: "MULTIMODUL",
        machineProfile: "MULTIMODUL_FUTURE",
        applicationMode: "apl"
      });
      const originalFamily = base.resolveFamily({ ...options, rows });
      const issues = (result.issues || []).map((issue) => ({
        ...issue,
        message: String(issue.message || "")
          .replaceAll("MultiModul continuous motion", APL_CONTINUOUS_RULE.name)
          .replaceAll("MULTIMODUL", "APL")
      }));
      const summary = issues.reduce((counts, issue) => {
        const level = issue?.level || "warn";
        counts[level] = (counts[level] || 0) + 1;
        return counts;
      }, { bad: 0, warn: 0, ok: 0 });
      return {
        ...result,
        family: originalFamily,
        rule: APL_CONTINUOUS_RULE,
        valid: summary.bad === 0,
        status: summary.bad ? "FAIL" : summary.warn ? "REVIEW" : "PASS",
        summary,
        issues
      };
    }

    function validate(rows, options = {}) {
      return analyze(rows, options).issues;
    }

    function annotateCorrectionChains(rows, options = {}) {
      if (!shouldUseContinuous(rows, options)) return base.annotateCorrectionChains(rows, options);
      const family = base.resolveFamily({ ...options, rows });
      return {
        family,
        rule: APL_CONTINUOUS_RULE,
        chains: [],
        rows: (Array.isArray(rows) ? rows : []).map((row) => ({
          ...row,
          machineGrammarFamily: family,
          machineGrammarProfile: APL_CONTINUOUS_RULE.id,
          machineContinuousMotion: [1, 2, 5, 6].includes(Number(row?.cmd))
        }))
      };
    }

    window.LabelerMachineFamilyGrammarDriver = Object.freeze({
      ...base,
      RULE_PROFILES: Object.freeze({
        ...(base.RULE_PROFILES || {}),
        [APL_CONTINUOUS_RULE.id]: APL_CONTINUOUS_RULE
      }),
      ruleProfile,
      annotateCorrectionChains,
      analyze,
      validate,
      aplContinuousMotionEnabled: true
    });
  }

  function summarizeIssues(issues) {
    return (Array.isArray(issues) ? issues : []).reduce((summary, issue) => {
      const level = issue?.level || "warn";
      summary[level] = (summary[level] || 0) + 1;
      summary.total += 1;
      return summary;
    }, { bad: 0, warn: 0, ok: 0, total: 0 });
  }

  function installDynamicValidation() {
    const commandBase = window.LabelerServoCommandDriver;
    const pipelineBase = window.LabelerServoPipelineValidator;
    const grammar = window.LabelerMachineFamilyGrammarDriver;
    if (!commandBase || !pipelineBase?.analyze || !grammar?.analyze) return;

    const validateMachineGrammar = (rows, tolerance = 0.001) => grammar.validate(rows, grammarContext(rows, { tolerance }));
    window.LabelerServoCommandDriver = Object.freeze({
      ...commandBase,
      validateGrammar: validateMachineGrammar,
      validateReferences: validateMachineGrammar,
      aplContinuousMotionEnabled: true,
      aplContinuousDynamicValidation: true
    });

    if (pipelineBase.aplContinuousDynamicValidation) return;
    window.LabelerServoPipelineValidator = Object.freeze({
      ...pipelineBase,
      aplContinuousDynamicValidation: true,
      analyze(options = {}) {
        const baseResult = pipelineBase.analyze(options);
        const rows = options.rows || state?.program || [];
        const grammarResult = grammar.analyze(rows, grammarContext(rows, options));
        const retained = (baseResult.issues || []).filter((issue) => {
          const code = String(issue?.code || "");
          if (issue?.category === "grammar") return false;
          if (code.startsWith("machine-grammar-")) return false;
          return !REPLACED_GRAMMAR_CODES.has(code);
        });
        const seen = new Set();
        const issues = [...retained, ...(grammarResult.issues || [])].filter((issue) => {
          const key = `${issue?.level}|${issue?.code}|${issue?.hmi ?? ""}|${issue?.message}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        const summary = summarizeIssues(issues);
        const categories = {};
        issues.forEach((issue) => {
          const category = issue?.category || "general";
          categories[category] ||= { bad: 0, warn: 0, ok: 0, total: 0 };
          const level = issue?.level || "warn";
          categories[category][level] = (categories[category][level] || 0) + 1;
          categories[category].total += 1;
        });
        const result = {
          ...baseResult,
          valid: summary.bad === 0,
          status: summary.bad ? "FAIL" : summary.warn ? "REVIEW" : "PASS",
          summary,
          categories,
          issues,
          machineFamily: grammarResult.family,
          machineGrammarProfile: grammarResult.rule.id,
          machineGrammarName: grammarResult.rule.name,
          machineGrammarSequence: grammarResult.rule.sequence,
          machineGrammarDescription: grammarResult.rule.description
        };
        if (typeof state !== "undefined") state.machineFamilyGrammarValidation = grammarResult;
        return result;
      }
    });
  }

  function updateManagerCopy() {
    const select = document.querySelector("#motionProfileSelect");
    if (!select || !isAplContext()) return;
    const continuous = [...select.options].find((option) => option.value === "continuous-motion");
    if (continuous) {
      continuous.disabled = false;
      if (continuous.textContent !== "Continuous Motion") continuous.textContent = "Continuous Motion";
    }
    const heading = select.closest(".servo-motion-workbench")?.querySelector(".servo-motion-head p");
    const copy = "APL supports Rest / Correction and Continuous Motion. Selecting a profile rebuilds the servo program from the active map and applies that profile's command sequence.";
    if (heading && heading.textContent !== copy) heading.textContent = copy;
  }

  function scheduleRefresh() {
    if (refreshPending) return;
    refreshPending = true;
    window.requestAnimationFrame(() => {
      refreshPending = false;
      updateManagerCopy();
    });
  }

  function installUiRefresh() {
    const observer = new MutationObserver(scheduleRefresh);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener("change", (event) => {
      if (event.target?.id !== "motionProfileSelect") return;
      window.setTimeout(() => {
        installAplCommandCapability();
        installAplGrammar();
        installDynamicValidation();
        updateManagerCopy();
      }, 0);
    });
    scheduleRefresh();
  }

  function install() {
    if (installed) return true;
    if (typeof state === "undefined"
      || !window.LabelerServoCommandDriver
      || !window.LabelerMotionPlannerDriver
      || !window.LabelerMachineFamilyGrammarDriver
      || !window.LabelerServoPipelineValidator) return false;

    installed = true;
    installAplCommandCapability();
    installAplGrammar();
    installDynamicValidation();
    installUiRefresh();

    try {
      if (typeof applyGeneratedServoProfile === "function") applyGeneratedServoProfile();
      if (typeof render === "function") render();
    } catch (error) {
      console.error("Unable to initialize native APL continuous motion.", error);
    }
    return true;
  }

  function wait() {
    if (!install()) window.setTimeout(wait, RETRY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait, { once: true });
  else wait();
})();
