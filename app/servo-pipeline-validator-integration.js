"use strict";

(function installServoPipelineValidation() {
  const VALIDATOR_RELEASE_VERSION = "0.8.9";
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

  function activeValidationPlan() {
    return state.motionTranslation?.plan
      || state.motionPlan?.planner
      || state.plannerPreview
      || null;
  }

  function activeMap() {
    return typeof activeMachineMap === "function" ? activeMachineMap() : null;
  }

  function activeValidationRows() {
    return Array.isArray(state.program) ? state.program : [];
  }

  function activeValidationMachineProfile() {
    const map = activeMap();
    const machineType = String(map?.machineType || "").toUpperCase();
    if (machineType.includes("TOPMODUL")) return "TOPMODUL";
    if (machineType.includes("AUTOCOL")) return "AUTOCOL_FUTURE";
    if (machineType.includes("MULTIMODUL")) return "MULTIMODUL_FUTURE";
    return String(
      state.motionTranslation?.machineProfile
      || state.motionPlan?.translation?.machineProfile
      || state.program?.find((row) => row?.translatedMachineProfile)?.translatedMachineProfile
      || (state.applicationMode === "cold-glue" ? "COLD_GLUE" : "APL")
    ).toUpperCase();
  }

  function activeValidationProfileId() {
    return String(
      state.motionTranslation?.profileId
      || state.motionPlan?.translation?.profileId
      || state.selectedMotionProfileId
      || state.defaultMotionProfileId
      || "rest-correction"
    );
  }

  function validationContext(rows = activeValidationRows()) {
    const map = activeMap();
    return {
      rows,
      map,
      machineType: map?.machineType || map?.name || "",
      applicationMode: state.applicationMode || map?.applicationMode || "",
      plan: activeValidationPlan(),
      translation: state.motionTranslation || state.motionPlan?.translation || null,
      machineProfile: activeValidationMachineProfile(),
      profileId: activeValidationProfileId(),
      maxMoveRatio: state.maxMoveRatio,
      tolerance: 0.001
    };
  }

  function resolveMachineFamily(context) {
    const grammar = window.LabelerMachineFamilyGrammarDriver;
    if (grammar?.resolveFamily) return String(grammar.resolveFamily(context) || "DEFAULT").toUpperCase();
    const machineType = String(context?.machineType || "").toUpperCase();
    if (machineType.includes("TOPMODUL")) return "TOPMODUL";
    if (machineType.includes("AUTOCOL")) return "AUTOCOL";
    return "DEFAULT";
  }

  function isLegacyPairMessage(message) {
    const text = String(message || "");
    return LEGACY_PAIR_PATTERNS.some((pattern) => pattern.test(text));
  }

  function summarizeIssues(issues) {
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

  function applyAuthoritativeMachineGrammar(result, context) {
    const grammar = window.LabelerMachineFamilyGrammarDriver;
    if (!result || !grammar?.analyze) return result;

    const family = resolveMachineFamily(context);
    const grammarResult = grammar.analyze(context.rows, {
      ...context,
      family,
      machineFamily: family
    });

    // The machine-family grammar is authoritative. The original pipeline
    // validator still contains the conservative one-CMD-7-at-a-time grammar;
    // remove that grammar layer and retain all data, speed, motion, planner,
    // translation, and terminal checks.
    const retained = (result.issues || []).filter((issue) => {
      if (issue?.category === "grammar") return false;
      if (family === "TOPMODUL" && LEGACY_PAIR_CODES.has(issue?.code)) return false;
      if (family === "TOPMODUL" && isLegacyPairMessage(issue?.message)) return false;
      return true;
    });
    const issues = dedupeIssues([...retained, ...(grammarResult.issues || [])]);
    const summary = summarizeIssues(issues);

    return {
      ...result,
      valid: summary.bad === 0,
      status: summary.bad ? "FAIL" : summary.warn ? "REVIEW" : "PASS",
      summary,
      categories: categoriesFor(issues),
      issues,
      machineFamily: grammarResult.family,
      machineGrammarProfile: grammarResult.rule?.id,
      machineGrammarName: grammarResult.rule?.name,
      machineGrammarSequence: grammarResult.rule?.sequence,
      machineGrammarDescription: grammarResult.rule?.description,
      machineProfile: family === "TOPMODUL" ? "TOPMODUL" : result.machineProfile,
      authoritativeMachineGrammar: true
    };
  }

  function runServoPipelineValidation() {
    const validator = window.LabelerServoPipelineValidator;
    if (!validator?.analyze) return null;
    const context = validationContext();
    const baseResult = validator.analyze(context);
    const result = applyAuthoritativeMachineGrammar(baseResult, context);
    state.servoPipelineValidation = result;
    if (result?.machineFamily) state.machineFamilyGrammarValidation = {
      family: result.machineFamily,
      rule: {
        id: result.machineGrammarProfile,
        name: result.machineGrammarName,
        sequence: result.machineGrammarSequence,
        description: result.machineGrammarDescription
      },
      status: result.status,
      summary: result.summary,
      issues: result.issues.filter((issue) => issue.category === "grammar")
    };
    return result;
  }

  function installValidatorStyles() {
    if (document.querySelector("#servoPipelineValidatorStyles")) return;
    const style = document.createElement("style");
    style.id = "servoPipelineValidatorStyles";
    style.textContent = `
      .pipeline-validation-summary { grid-column:1/-1;display:grid;grid-template-columns:auto repeat(3,minmax(52px,auto));gap:5px;align-items:center;padding:7px 8px;border:1px solid var(--line);border-radius:7px;background:var(--panel-hi); }
      .pipeline-validation-summary strong { font-size:10px; }
      .pipeline-validation-summary span { padding:3px 5px;border-radius:5px;background:var(--input);font-size:8px;text-align:center;white-space:nowrap; }
      .pipeline-validation-summary[data-status="PASS"] strong { color:var(--green); }
      .pipeline-validation-summary[data-status="REVIEW"] strong { color:#ffc56b; }
      .pipeline-validation-summary[data-status="FAIL"] strong { color:#ff8181; }
      .pipeline-validation-banner { margin-bottom:6px;padding:6px 8px;border:1px solid var(--line);border-radius:7px;background:var(--panel-hi);font-size:9px;line-height:1.25; }
      .pipeline-validation-banner strong { color:var(--green); }
      .pipeline-validation-banner[data-status="REVIEW"] strong { color:#ffc56b; }
      .pipeline-validation-banner[data-status="FAIL"] strong { color:#ff8181; }
    `;
    document.head.appendChild(style);
  }

  function renderPipelineSummary() {
    const result = runServoPipelineValidation();
    if (!result || !els?.validationDetails || !els?.validationList) return;

    els.validationDetails.querySelector(".pipeline-validation-summary")?.remove();
    const summary = document.createElement("div");
    summary.className = "pipeline-validation-summary";
    summary.dataset.status = result.status;
    summary.innerHTML = `
      <strong>Servo Pipeline ${result.status}</strong>
      <span>${result.summary.bad} faults</span>
      <span>${result.summary.warn} warnings</span>
      <span>${result.rowCount} CMD rows</span>`;
    els.validationDetails.appendChild(summary);

    els.validationList.querySelector(".pipeline-validation-banner")?.remove();
    const banner = document.createElement("div");
    banner.className = "pipeline-validation-banner";
    banner.dataset.status = result.status;
    const grammarLabel = result.machineGrammarName
      ? `${result.machineFamily} • ${result.machineGrammarName}`
      : `${result.machineProfile} • ${result.profileId}`;
    banner.innerHTML = `<strong>${grammarLabel}</strong> — mechanical events, translated commands, machine-family references, speed envelope, terminal policy, and table-angle order validated.`;
    els.validationList.prepend(banner);
  }

  function pipelineIssueNotes(result) {
    if (!result) return [];
    return result.issues
      .filter((issue) => issue.level !== "ok")
      .map((issue) => [issue.level, `[${String(issue.category || "validator").toUpperCase()}] ${issue.message}`, {
        pipelineCode: issue.code,
        hmi: issue.hmi,
        eventId: issue.eventId
      }]);
  }

  function filterObsoleteTopModulNotes(notes) {
    const family = resolveMachineFamily(validationContext());
    if (family !== "TOPMODUL") return Array.isArray(notes) ? notes : [];
    return (Array.isArray(notes) ? notes : []).filter((note) => {
      const message = String(note?.[1] || "");
      const code = note?.[2]?.pipelineCode;
      if (LEGACY_PAIR_CODES.has(code)) return false;
      return !isLegacyPairMessage(message);
    });
  }

  function installHooks() {
    if (installed || typeof validate !== "function" || typeof renderValidation !== "function") return false;
    installed = true;
    installValidatorStyles();

    const validateBeforePipeline = validate;
    validate = function validateWithServoPipeline(...args) {
      const notes = filterObsoleteTopModulNotes(validateBeforePipeline.apply(this, args));
      const result = runServoPipelineValidation();
      const existing = new Set(notes.map((note) => String(note?.[1] || "")));
      pipelineIssueNotes(result).forEach((note) => {
        if (!existing.has(note[1])) notes.push(note);
      });
      return notes;
    };

    const renderValidationBeforePipeline = renderValidation;
    renderValidation = function renderValidationWithPipeline(...args) {
      const output = renderValidationBeforePipeline.apply(this, args);
      renderPipelineSummary();
      return output;
    };

    const versionMeta = document.querySelector('meta[name="application-version"]');
    if (versionMeta) versionMeta.content = VALIDATOR_RELEASE_VERSION;
    const versionStatus = document.querySelector("#updateCheckStatus");
    if (versionStatus && /^Version\s+/i.test(versionStatus.textContent || "")) {
      versionStatus.textContent = `Version ${VALIDATOR_RELEASE_VERSION} • Updates are checked automatically.`;
    }

    if (typeof render === "function") render();
    return true;
  }

  function waitForApplication() {
    if (installHooks()) return;
    window.setTimeout(waitForApplication, 25);
  }

  if (document.readyState === "complete") waitForApplication();
  else window.addEventListener("load", waitForApplication, { once: true });
})();
