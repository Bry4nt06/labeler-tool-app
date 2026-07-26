"use strict";

(function installMachineTerminalPolicy() {
  const RELEASE_VERSION = "0.8.7";
  const RETRY_MS = 25;
  const EPSILON = 0.001;
  let installed = false;
  let generationWrapped = false;

  function activeMap() {
    return typeof activeMachineMap === "function" ? activeMachineMap() : null;
  }

  function machineContext(rows = state.program) {
    const map = activeMap();
    return {
      rows,
      map,
      machineType: map?.machineType || map?.name || "",
      machineProfile: state.motionTranslation?.machineProfile
        || state.motionPlan?.translation?.machineProfile
        || rows?.find?.((row) => row?.translatedMachineProfile)?.translatedMachineProfile
        || "",
      applicationMode: state.applicationMode || map?.applicationMode || ""
    };
  }

  function machineFamily(rows = state.program) {
    const grammar = window.LabelerMachineFamilyGrammarDriver;
    if (grammar?.resolveFamily) return grammar.resolveFamily(machineContext(rows));
    const machine = String(machineContext(rows).machineType || "").toUpperCase();
    if (machine.includes("AUTOCOL")) return "AUTOCOL";
    if (machine.includes("TOPMODUL")) return "TOPMODUL";
    return "DEFAULT";
  }

  function isCodingHold(row) {
    return row?.codingHold === true || /hold\s+for\s+coding/i.test(String(row?.action || ""));
  }

  function isAutocolEndCurve(row) {
    return row?.autocolBoundary === "end-curve"
      || (/end\s*(?:of\s*)?curve/i.test(String(row?.action || "")) && row?.autocolProfile === true);
  }

  function numeric(value, fallback = null) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function restCommandName() {
    return window.LabelerServoCommandDriver?.moveDefinition?.(3)?.name || "Rest";
  }

  function topModulTerminalRows(rows) {
    const source = Array.isArray(rows) ? rows.map((row) => ({ ...row })) : [];
    if (!source.length) return source;

    let codingIndex = -1;
    for (let index = source.length - 1; index >= 0; index -= 1) {
      if (isCodingHold(source[index])) {
        codingIndex = index;
        break;
      }
    }

    if (codingIndex >= 0) {
      // A TopModul curve ends at the stopped coding reference. The prior
      // implementation converted this row to CMD 7 and appended a separate
      // End Curve row, producing a zero-motion Correction fault.
      source.splice(codingIndex + 1);
      const coding = source[codingIndex];
      const codingReady = numeric(coding?.codingReadyTableAngle);
      if (codingReady !== null) {
        coding.tableAngle = codingReady;
        coding.generatedTableAngle = codingReady;
      }
      coding.cmd = 3;
      coding.baseCmd = 3;
      coding.action = "Hold for Coding";
      coding.codingHold = true;
      coding.terminalRest = true;
      coding.activeHold = false;
      coding.motionSource = "terminal-coding-rest";
      coding.plannerIntent = "HOLD";
      coding.plannerRequestedCommand = 3;
      coding.plannerRecommendedCommand = 3;
      coding.translatedCommandName = restCommandName();
      coding.commandTranslated = false;
      coding.plannerFallbackUsed = false;
      coding.plannerFallbackReason = "";
    } else {
      const finalRow = source[source.length - 1];
      finalRow.cmd = 3;
      finalRow.baseCmd = 3;
      finalRow.terminalRest = true;
      finalRow.activeHold = false;
      finalRow.plannerIntent = "HOLD";
      finalRow.plannerRequestedCommand = 3;
      finalRow.plannerRecommendedCommand = 3;
      finalRow.translatedCommandName = restCommandName();
      finalRow.commandTranslated = false;
    }

    return source.map((row, index) => ({
      ...row,
      hmi: index + 1,
      plc: index
    }));
  }

  function syncPlan(plan, rows) {
    if (!plan || !Array.isArray(plan.steps)) return;
    const oldSteps = plan.steps;
    plan.steps = rows.map((row, index) => ({
      ...(oldSteps[index] || {}),
      index,
      eventId: row.motionEventId || oldSteps[index]?.eventId || `EV${String(index + 1).padStart(3, "0")}`,
      mechanicalEventId: row.motionEventId || oldSteps[index]?.mechanicalEventId || oldSteps[index]?.eventId || `EV${String(index + 1).padStart(3, "0")}`,
      hmi: row.hmi,
      plc: row.plc,
      tableAngle: numeric(row.tableAngle, 0),
      plateAngle: numeric(row.plateAngle, 0),
      action: String(row.action || ""),
      baseCommand: numeric(row.baseCmd, numeric(row.cmd, 3)),
      requestedCommand: numeric(row.plannerRequestedCommand, numeric(row.cmd, 3)),
      recommendedCommand: numeric(row.cmd, 3),
      recommendedCommandName: row.translatedCommandName || `CMD ${row.cmd}`,
      intent: row.plannerIntent || (Number(row.cmd) === 7 ? "ROTATE" : "HOLD"),
      terminal: row.terminalRest === true
    }));
    if (Array.isArray(plan.events)) plan.events = plan.events.slice(0, rows.length);
  }

  function syncProgramState(rows) {
    state.program = rows;
    if (state.motionPlan) {
      state.motionPlan.rows = rows;
      syncPlan(state.motionPlan.planner, rows);
      if (state.motionPlan.termination) {
        const finalRow = rows[rows.length - 1];
        state.motionPlan.termination = {
          ...state.motionPlan.termination,
          hmi: finalRow?.hmi,
          tableAngle: finalRow?.tableAngle,
          command: "Rest"
        };
      }
    }
    if (state.motionTranslation) {
      state.motionTranslation.rows = rows;
      syncPlan(state.motionTranslation.plan, rows);
      state.motionTranslation.commandSummary = rows.reduce((summary, row) => {
        const key = String(row.cmd);
        summary[key] = (summary[key] || 0) + 1;
        return summary;
      }, {});
      state.motionTranslation.advancedCount = rows.filter((row) => [1, 2, 4, 5, 6].includes(Number(row.cmd))).length;
      state.motionTranslation.advancedCommandsApplied = state.motionTranslation.advancedCount > 0;
    }
    syncPlan(state.plannerPreview, rows);

    if (state.tableAngleSequence?.adjustedRows) {
      state.tableAngleSequence.adjustedRows = state.tableAngleSequence.adjustedRows.filter((hmi) => Number(hmi) <= rows.length);
      state.tableAngleSequence.adjustedCount = state.tableAngleSequence.adjustedRows.length;
    }
  }

  function reannotateGrammar() {
    const grammar = window.LabelerMachineFamilyGrammarDriver;
    if (!grammar?.annotateCorrectionChains || !Array.isArray(state.program)) return;
    const annotated = grammar.annotateCorrectionChains(state.program, machineContext(state.program));
    state.program = annotated.rows;
    state.machineFamilyGrammar = {
      family: annotated.family,
      rule: annotated.rule,
      chains: annotated.chains,
      chainCount: annotated.chains.length
    };
    if (state.motionPlan) state.motionPlan.rows = state.program;
    if (state.motionTranslation) state.motionTranslation.rows = state.program;
    syncPlan(state.motionPlan?.planner, state.program);
    syncPlan(state.motionTranslation?.plan, state.program);
    syncPlan(state.plannerPreview, state.program);
  }

  function applyTerminalPolicy() {
    if (!Array.isArray(state.program) || !state.program.length) return;
    const family = machineFamily(state.program);
    if (family === "TOPMODUL") {
      syncProgramState(topModulTerminalRows(state.program));
      reannotateGrammar();
    }
    state.machineTerminalPolicy = {
      family,
      mode: family === "AUTOCOL" ? "END_CURVE" : "FINAL_REST",
      finalHmi: state.program.at(-1)?.hmi,
      finalCommand: state.program.at(-1)?.cmd,
      finalAction: state.program.at(-1)?.action
    };
  }

  function summarize(issues) {
    return issues.reduce((summary, issue) => {
      const level = issue?.level || "warn";
      summary[level] = (summary[level] || 0) + 1;
      summary.total += 1;
      return summary;
    }, { bad: 0, warn: 0, ok: 0, total: 0 });
  }

  function installTerminalValidation() {
    const base = window.LabelerServoPipelineValidator;
    if (!base?.analyze || base.machineTerminalPolicyValidation) return;

    window.LabelerServoPipelineValidator = Object.freeze({
      ...base,
      machineTerminalPolicyValidation: true,
      analyze(options = {}) {
        const result = base.analyze(options);
        const rows = Array.isArray(options.rows) ? options.rows : [];
        const family = machineFamily(rows);
        const finalRow = rows.at(-1);
        const issues = [...(result.issues || [])];

        if (family === "TOPMODUL") {
          if (!finalRow || Number(finalRow.cmd) !== 3 || finalRow.terminalRest !== true) {
            issues.push({
              level: "bad",
              code: "topmodul-terminal-rest",
              category: "terminal",
              hmi: finalRow?.hmi,
              message: "TopModul must finish on a CMD 3 Rest reference."
            });
          } else if (isAutocolEndCurve(finalRow)) {
            issues.push({
              level: "bad",
              code: "topmodul-autocol-end-curve",
              category: "terminal",
              hmi: finalRow.hmi,
              message: "TopModul must terminate at its final Rest reference, not an Autocol End of curve boundary."
            });
          } else {
            issues.push({
              level: "ok",
              code: "topmodul-terminal-rest-ok",
              category: "terminal",
              hmi: finalRow.hmi,
              message: `TopModul correctly finishes at HMI ${finalRow.hmi} with CMD 3 Rest.`
            });
          }
        } else if (family === "AUTOCOL") {
          const validEnd = finalRow
            && Number(finalRow.cmd) === 3
            && isAutocolEndCurve(finalRow)
            && Math.abs(numeric(finalRow.tableAngle, 359) - 359) <= 0.5;
          if (!validEnd) {
            issues.push({
              level: "bad",
              code: "autocol-end-curve-required",
              category: "terminal",
              hmi: finalRow?.hmi,
              message: "Autocol must finish with its dedicated CMD 3 End of curve boundary at 359°."
            });
          } else {
            issues.push({
              level: "ok",
              code: "autocol-end-curve-ok",
              category: "terminal",
              hmi: finalRow.hmi,
              message: `Autocol correctly finishes at HMI ${finalRow.hmi} with End of curve.`
            });
          }
        }

        const deduped = [];
        const seen = new Set();
        issues.forEach((issue) => {
          const key = `${issue.level}|${issue.code}|${issue.hmi ?? ""}|${issue.message}`;
          if (seen.has(key)) return;
          seen.add(key);
          deduped.push(issue);
        });
        const summary = summarize(deduped);
        const categories = {};
        deduped.forEach((issue) => {
          const category = issue.category || "general";
          categories[category] ||= { bad: 0, warn: 0, ok: 0, total: 0 };
          const level = issue.level || "warn";
          categories[category][level] = (categories[category][level] || 0) + 1;
          categories[category].total += 1;
        });
        const output = {
          ...result,
          valid: summary.bad === 0,
          status: summary.bad ? "FAIL" : summary.warn ? "REVIEW" : "PASS",
          summary,
          categories,
          issues: deduped,
          terminalPolicy: family === "AUTOCOL" ? "END_CURVE" : "FINAL_REST"
        };
        state.machineTerminalPolicyValidation = output;
        return output;
      }
    });
  }

  function installGenerationHook() {
    if (generationWrapped || typeof applyGeneratedServoProfile !== "function") return;
    generationWrapped = true;
    const before = applyGeneratedServoProfile;
    applyGeneratedServoProfile = function applyGeneratedServoProfileWithTerminalPolicy(...args) {
      const output = before.apply(this, args);
      applyTerminalPolicy();
      return output;
    };
  }

  function install() {
    if (installed) return true;
    if (typeof state === "undefined"
      || typeof applyGeneratedServoProfile !== "function"
      || !window.LabelerMachineFamilyGrammarDriver
      || !window.LabelerServoPipelineValidator) return false;

    installed = true;
    installTerminalValidation();
    installGenerationHook();

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
