"use strict";

(function installMachineFamilyGrammarIntegration() {
  const RELEASE_VERSION = "0.8.5";
  const RETRY_MS = 25;
  const REPLACED_PIPELINE_CODES = new Set([
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
  let generationWrapped = false;
  let validationRenderWrapped = false;

  function activeMap() {
    return typeof activeMachineMap === "function" ? activeMachineMap() : null;
  }

  function grammarContext(rows = state.program) {
    const map = activeMap();
    return {
      rows,
      map,
      machineType: map?.machineType || map?.name || "",
      machineProfile: state.motionTranslation?.machineProfile
        || state.motionPlan?.translation?.machineProfile
        || rows?.find?.((row) => row?.translatedMachineProfile)?.translatedMachineProfile
        || "",
      applicationMode: state.applicationMode || map?.applicationMode || "",
      tolerance: 0.001
    };
  }

  function summarizeIssues(issues) {
    return (Array.isArray(issues) ? issues : []).reduce((summary, issue) => {
      const level = issue?.level || "warn";
      summary[level] = (summary[level] || 0) + 1;
      summary.total += 1;
      return summary;
    }, { bad: 0, warn: 0, ok: 0, total: 0 });
  }

  function annotatePlanSteps(rows) {
    const plans = [
      state.motionPlan?.planner,
      state.motionTranslation?.plan,
      state.plannerPreview
    ].filter((plan) => Array.isArray(plan?.steps));

    plans.forEach((plan) => {
      plan.machineFamily = state.machineFamilyGrammar?.family || null;
      plan.machineGrammarProfile = state.machineFamilyGrammar?.rule?.id || null;
      plan.machineGrammarSequence = state.machineFamilyGrammar?.rule?.sequence || null;
      plan.steps.forEach((step, index) => {
        const row = rows[index];
        if (!row) return;
        step.machineFamily = row.machineGrammarFamily || null;
        step.machineGrammarProfile = row.machineGrammarProfile || null;
        step.correctionChainId = row.machineCorrectionChainId || step.correctionChainId || null;
        step.correctionChainPosition = row.machineCorrectionChainPosition || step.correctionChainPosition || null;
        step.referenceRole = row.machineReferenceRole || step.referenceRole || null;
      });
    });
  }

  function annotateCurrentProgram() {
    const driver = window.LabelerMachineFamilyGrammarDriver;
    if (!driver?.annotateCorrectionChains || !Array.isArray(state.program)) return null;

    const annotated = driver.annotateCorrectionChains(state.program, grammarContext(state.program));
    state.program = annotated.rows;
    state.machineFamilyGrammar = {
      family: annotated.family,
      rule: annotated.rule,
      chains: annotated.chains,
      chainCount: annotated.chains.length
    };

    if (Array.isArray(state.motionTranslation?.rows)) state.motionTranslation.rows = state.program;
    annotatePlanSteps(state.program);
    return annotated;
  }

  function installCommandDriverValidation() {
    const grammar = window.LabelerMachineFamilyGrammarDriver;
    const base = window.LabelerServoCommandDriver;
    if (!grammar?.validate || !base || base.machineFamilyGrammarValidation) return;

    const validateMachineGrammar = (rows, tolerance = 0.001) => grammar.validate(rows, {
      ...grammarContext(rows),
      tolerance
    });

    window.LabelerServoCommandDriver = Object.freeze({
      ...base,
      validateGrammar: validateMachineGrammar,
      validateReferences: validateMachineGrammar,
      machineFamilyGrammarValidation: true
    });
  }

  function installPipelineValidation() {
    const grammar = window.LabelerMachineFamilyGrammarDriver;
    const base = window.LabelerServoPipelineValidator;
    if (!grammar?.analyze || !base?.analyze || base.machineFamilyGrammarValidation) return;

    window.LabelerServoPipelineValidator = Object.freeze({
      ...base,
      machineFamilyGrammarValidation: true,
      analyze(options = {}) {
        const baseResult = base.analyze(options);
        const grammarResult = grammar.analyze(options.rows, {
          ...grammarContext(options.rows),
          machineProfile: options.machineProfile || grammarContext(options.rows).machineProfile,
          tolerance: options.tolerance ?? 0.001
        });

        const retained = (baseResult.issues || []).filter((issue) => {
          if (issue?.category === "grammar") return false;
          return !REPLACED_PIPELINE_CODES.has(issue?.code);
        });
        const seen = new Set();
        const issues = [...retained, ...grammarResult.issues].filter((issue) => {
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
        state.machineFamilyGrammarValidation = grammarResult;
        return result;
      }
    });
  }

  function installGenerationHook() {
    if (generationWrapped || typeof applyGeneratedServoProfile !== "function") return;
    generationWrapped = true;
    const before = applyGeneratedServoProfile;
    applyGeneratedServoProfile = function applyGeneratedServoProfileWithMachineGrammar(...args) {
      const output = before.apply(this, args);
      annotateCurrentProgram();
      return output;
    };
  }

  function installStyles() {
    if (document.querySelector("#machineFamilyGrammarStyles")) return;
    const style = document.createElement("style");
    style.id = "machineFamilyGrammarStyles";
    style.textContent = `
      .machine-grammar-summary { grid-column:1/-1;display:grid;gap:3px;padding:7px 8px;border:1px solid var(--line);border-radius:7px;background:var(--panel-hi);font-size:9px;line-height:1.25; }
      .machine-grammar-summary strong { color:var(--green);font-size:10px; }
      .machine-grammar-summary[data-status="REVIEW"] strong { color:#ffc56b; }
      .machine-grammar-summary[data-status="FAIL"] strong { color:#ff8181; }
      .machine-grammar-summary span { color:var(--muted);overflow-wrap:anywhere; }
      .machine-grammar-chain { display:inline-flex;margin-left:4px;padding:1px 4px;border:1px solid var(--line);border-radius:999px;color:#ffc56b;font-size:7px;vertical-align:middle; }
    `;
    document.head.appendChild(style);
  }

  function runGrammarValidation() {
    const driver = window.LabelerMachineFamilyGrammarDriver;
    if (!driver?.analyze) return null;
    const result = driver.analyze(state.program, grammarContext(state.program));
    state.machineFamilyGrammarValidation = result;
    return result;
  }

  function renderGrammarSummary() {
    const result = runGrammarValidation();
    const host = els?.validationDetails;
    if (!result || !host) return;

    host.querySelector(".machine-grammar-summary")?.remove();
    const summary = document.createElement("div");
    summary.className = "machine-grammar-summary";
    summary.dataset.status = result.status;
    summary.innerHTML = `
      <strong>${result.family} Grammar ${result.status}</strong>
      <span>${result.rule.name}: ${result.rule.sequence}</span>
      <span>${result.summary.bad} faults • ${result.summary.warn} warnings • ${state.machineFamilyGrammar?.chainCount || 0} correction chains</span>`;
    host.appendChild(summary);
  }

  function decorateTimeline() {
    const rows = Array.isArray(state.program) ? state.program : [];
    document.querySelectorAll(".mechanical-event").forEach((card, index) => {
      const row = rows[index];
      if (!row) return;
      card.dataset.machineFamily = row.machineGrammarFamily || "";
      card.dataset.correctionChain = row.machineCorrectionChainId || "";
      const strong = card.querySelector("strong");
      if (strong && row.machineCorrectionChainId && !strong.querySelector(".machine-grammar-chain")) {
        strong.insertAdjacentHTML("beforeend", `<span class="machine-grammar-chain">${row.machineCorrectionChainId}</span>`);
      }
    });
  }

  function installValidationRenderHook() {
    if (validationRenderWrapped || typeof renderValidation !== "function") return;
    validationRenderWrapped = true;
    const before = renderValidation;
    renderValidation = function renderValidationWithMachineGrammar(...args) {
      const output = before.apply(this, args);
      renderGrammarSummary();
      return output;
    };
  }

  function installTimelineHook() {
    if (typeof enhanceProgramWithMotionPlanner !== "function" || enhanceProgramWithMotionPlanner.machineFamilyGrammar) return;
    const before = enhanceProgramWithMotionPlanner;
    enhanceProgramWithMotionPlanner = function enhanceProgramWithMachineGrammar(...args) {
      const output = before.apply(this, args);
      decorateTimeline();
      return output;
    };
    enhanceProgramWithMotionPlanner.machineFamilyGrammar = true;
  }

  function install() {
    if (installed) return true;
    if (typeof state === "undefined"
      || !window.LabelerMachineFamilyGrammarDriver
      || !window.LabelerServoCommandDriver
      || !window.LabelerServoPipelineValidator
      || typeof applyGeneratedServoProfile !== "function") return false;

    installed = true;
    installStyles();
    installCommandDriverValidation();
    installPipelineValidation();
    installGenerationHook();
    installValidationRenderHook();
    installTimelineHook();
    annotateCurrentProgram();

    const versionMeta = document.querySelector('meta[name="application-version"]');
    if (versionMeta) versionMeta.content = RELEASE_VERSION;
    return true;
  }

  function waitForDependencies() {
    if (install()) return;
    window.setTimeout(waitForDependencies, RETRY_MS);
  }

  waitForDependencies();
})();
