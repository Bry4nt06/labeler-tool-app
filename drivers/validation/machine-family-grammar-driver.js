(function (global) {
  "use strict";

  const DEFAULT_TOLERANCE = 0.001;

  const FAMILIES = Object.freeze({
    TOPMODUL: "TOPMODUL",
    AUTOCOL: "AUTOCOL",
    MULTIMODUL: "MULTIMODUL",
    TOPMATIC: "TOPMATIC",
    COLD_GLUE: "COLD_GLUE",
    APL: "APL",
    DEFAULT: "DEFAULT"
  });

  const RULE_PROFILES = Object.freeze({
    [FAMILIES.TOPMODUL]: Object.freeze({
      id: FAMILIES.TOPMODUL,
      name: "TopModul correction chain",
      mode: "correction-chain",
      supportedCommands: Object.freeze([3, 7]),
      sequence: "CMD 3 → one or more CMD 7 commands → CMD 3",
      description: "A stopped reference opens the chain, consecutive corrections are allowed, and the next Rest closes the chain."
    }),
    [FAMILIES.APL]: Object.freeze({
      id: FAMILIES.APL,
      name: "APL correction chain",
      mode: "correction-chain",
      supportedCommands: Object.freeze([3, 7]),
      sequence: "CMD 3 → one or more CMD 7 commands → CMD 3",
      description: "APL profiles may use consecutive corrections during a multi-stage wipe before establishing the next reference."
    }),
    [FAMILIES.AUTOCOL]: Object.freeze({
      id: FAMILIES.AUTOCOL,
      name: "Autocol referenced correction",
      mode: "referenced-pair",
      supportedCommands: Object.freeze([3, 7]),
      sequence: "CMD 3 → CMD 7 → CMD 3",
      description: "Each Autocol correction must be separated from the next move by a Rest reference."
    }),
    [FAMILIES.COLD_GLUE]: Object.freeze({
      id: FAMILIES.COLD_GLUE,
      name: "Cold Glue referenced correction",
      mode: "referenced-pair",
      supportedCommands: Object.freeze([3, 7]),
      sequence: "CMD 3 → CMD 7 → CMD 3",
      description: "Each Cold Glue point-to-point turn closes at a stopped reference before another move begins."
    }),
    [FAMILIES.TOPMATIC]: Object.freeze({
      id: FAMILIES.TOPMATIC,
      name: "TopMatic referenced correction",
      mode: "referenced-pair",
      supportedCommands: Object.freeze([3, 7]),
      sequence: "CMD 3 → CMD 7 → CMD 3",
      description: "TopMatic retains the single-correction reference pattern until a machine-specific chain rule is configured."
    }),
    [FAMILIES.MULTIMODUL]: Object.freeze({
      id: FAMILIES.MULTIMODUL,
      name: "MultiModul continuous motion",
      mode: "advanced-motion",
      supportedCommands: Object.freeze([1, 2, 3, 4, 5, 6, 7]),
      sequence: "CMD 1 → CMD 5/CMD 6 → CMD 2 → CMD 3, with isolated CMD 4 or CMD 7 moves",
      description: "Startup, continuous, changeover, end, special, correction, and Rest transitions are validated as a motion state machine."
    }),
    [FAMILIES.DEFAULT]: Object.freeze({
      id: FAMILIES.DEFAULT,
      name: "Default referenced correction",
      mode: "referenced-pair",
      supportedCommands: Object.freeze([3, 7]),
      sequence: "CMD 3 → CMD 7 → CMD 3",
      description: "Unknown machine families use the conservative stopped-reference pattern."
    })
  });

  function number(value, fallback = null) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function normalizedToken(value) {
    return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "");
  }

  function activeRows(rows) {
    return (Array.isArray(rows) ? rows : []).filter((row) => Number(row?.cmd) !== 0);
  }

  function resolveFamily(options = {}) {
    const explicit = normalizedToken(options.machineFamily || options.family);
    if (explicit && RULE_PROFILES[explicit]) return explicit;

    const machineType = normalizedToken(options.machineType || options.map?.machineType || options.map?.name);
    if (machineType.includes("MULTIMODUL")) return FAMILIES.MULTIMODUL;
    if (machineType.includes("TOPMODUL")) return FAMILIES.TOPMODUL;
    if (machineType.includes("AUTOCOL")) return FAMILIES.AUTOCOL;
    if (machineType.includes("TOPMATIC")) return FAMILIES.TOPMATIC;

    const rows = Array.isArray(options.rows) ? options.rows : [];
    if (rows.some((row) => row?.autocolProfile === true || /autocol/i.test(String(row?.profileSource || "")))) {
      return FAMILIES.AUTOCOL;
    }

    const machineProfile = normalizedToken(options.machineProfile);
    if (machineProfile.includes("MULTIMODUL")) return FAMILIES.MULTIMODUL;
    if (machineProfile.includes("AUTOCOL")) return FAMILIES.AUTOCOL;
    if (machineProfile.includes("COLDGLUE")) return FAMILIES.COLD_GLUE;
    if (machineProfile.includes("APL")) return FAMILIES.APL;

    if (String(options.applicationMode || options.map?.applicationMode || "").toLowerCase() === "cold-glue") {
      return FAMILIES.COLD_GLUE;
    }
    if (String(options.applicationMode || options.map?.applicationMode || "").toLowerCase() === "apl") {
      return FAMILIES.APL;
    }
    return FAMILIES.DEFAULT;
  }

  function ruleProfile(options = {}) {
    return RULE_PROFILES[resolveFamily(options)] || RULE_PROFILES[FAMILIES.DEFAULT];
  }

  function segmentMotion(rows, index) {
    const row = rows[index];
    const next = rows[index + 1];
    if (!next) {
      return {
        hasNext: false,
        tableTravel: 0,
        plateTravel: 0,
        speedRatio: 0
      };
    }
    const tableTravel = number(next?.tableAngle, 0) - number(row?.tableAngle, 0);
    const plateTravel = number(next?.plateAngle, 0) - number(row?.plateAngle, 0);
    return {
      hasNext: true,
      tableTravel,
      plateTravel,
      speedRatio: Math.abs(tableTravel) > DEFAULT_TOLERANCE ? Math.abs(plateTravel / tableTravel) : Infinity
    };
  }

  function addIssue(issues, level, code, message, details = {}) {
    issues.push({ level, code, category: details.category || "grammar", message, ...details });
  }

  function terminalRest(row) {
    return Number(row?.cmd) === 3
      && (row?.terminalRest === true
        || /end\s*(?:of\s*)?curve|end curve.*rest|rest.*end curve|hold for coding/i.test(String(row?.action || "")));
  }

  function validateCommon(rows, rule, tolerance, issues) {
    const source = activeRows(rows);
    if (!source.length) {
      addIssue(issues, "bad", "machine-grammar-empty", "No active servo commands are available for machine-family grammar validation.");
      return source;
    }

    source.forEach((row, index) => {
      const hmi = row?.hmi ?? index + 1;
      const command = Number(row?.cmd);
      if (!rule.supportedCommands.includes(command)) {
        addIssue(
          issues,
          "bad",
          "machine-grammar-unsupported-command",
          `${rule.name} does not allow CMD ${row?.cmd} at HMI ${hmi}.`,
          { hmi, command }
        );
      }
      if (index > 0 && number(row?.tableAngle) !== null && number(source[index - 1]?.tableAngle) !== null
        && number(row.tableAngle) <= number(source[index - 1].tableAngle) + tolerance) {
        addIssue(
          issues,
          "bad",
          "machine-grammar-table-order",
          `HMI ${hmi} must have a table angle greater than the preceding command.`,
          { hmi }
        );
      }
    });

    if (Number(source[0]?.cmd) !== 3) {
      addIssue(
        issues,
        "bad",
        "machine-grammar-start-reference",
        `${rule.name} must begin from a CMD 3 stopped reference.`,
        { hmi: source[0]?.hmi }
      );
    }

    const finalRow = source[source.length - 1];
    if (!terminalRest(finalRow)) {
      addIssue(
        issues,
        "bad",
        "machine-grammar-terminal-rest",
        `${rule.name} must finish with CMD 3 Rest at End Curve.`,
        { hmi: finalRow?.hmi }
      );
    }
    return source;
  }

  function validateCorrectionChain(rows, rule, tolerance) {
    const issues = [];
    const source = validateCommon(rows, rule, tolerance, issues);
    let chain = null;
    let lastReferenceIndex = null;
    let chainNumber = 0;

    source.forEach((row, index) => {
      const command = Number(row?.cmd);
      const hmi = row?.hmi ?? index + 1;
      const motion = segmentMotion(source, index);

      if (command === 3) {
        if (motion.hasNext && Math.abs(motion.plateTravel) > tolerance) {
          addIssue(
            issues,
            "bad",
            "machine-grammar-rest-motion",
            `HMI ${hmi} is CMD 3 Rest but changes the bottle plate by ${Math.abs(motion.plateTravel).toFixed(1)}°.`,
            { hmi, category: "motion" }
          );
        }
        chain = null;
        lastReferenceIndex = index;
        return;
      }

      if (command === 7) {
        if (!chain) {
          chainNumber += 1;
          chain = { id: `CC${String(chainNumber).padStart(2, "0")}`, startHmi: hmi };
          if (lastReferenceIndex === null || Number(source[lastReferenceIndex]?.cmd) !== 3) {
            addIssue(
              issues,
              "bad",
              "machine-grammar-chain-start",
              `${rule.name} correction chain ${chain.id} begins at HMI ${hmi} without an earlier CMD 3 reference.`,
              { hmi, chainId: chain.id }
            );
          }
        }
        if (!motion.hasNext || Math.abs(motion.plateTravel) <= tolerance) {
          addIssue(
            issues,
            "bad",
            "machine-grammar-empty-correction",
            `HMI ${hmi} is CMD 7 but produces no bottle-plate movement.`,
            { hmi, chainId: chain.id, category: "motion" }
          );
        }
        return;
      }

      if (chain) {
        addIssue(
          issues,
          "bad",
          "machine-grammar-chain-interrupted",
          `${rule.name} correction chain ${chain.id} is interrupted by CMD ${command} before a CMD 3 reference.`,
          { hmi, chainId: chain.id }
        );
        chain = null;
      }
      lastReferenceIndex = null;
    });

    if (chain) {
      addIssue(
        issues,
        "bad",
        "machine-grammar-chain-end",
        `${rule.name} correction chain ${chain.id} reaches the end of the curve without a closing CMD 3 reference.`,
        { hmi: source[source.length - 1]?.hmi, chainId: chain.id }
      );
    }

    if (!issues.some((issue) => issue.level === "bad")) {
      addIssue(issues, "ok", "machine-grammar-chain-ok", `${rule.name} is valid: ${rule.sequence}.`);
    }
    return issues;
  }

  function validateReferencedPairs(rows, rule, tolerance) {
    const issues = [];
    const source = validateCommon(rows, rule, tolerance, issues);

    source.forEach((row, index) => {
      const command = Number(row?.cmd);
      const hmi = row?.hmi ?? index + 1;
      const previousCommand = index > 0 ? Number(source[index - 1]?.cmd) : null;
      const nextCommand = index + 1 < source.length ? Number(source[index + 1]?.cmd) : null;
      const motion = segmentMotion(source, index);

      if (command === 3) {
        if (motion.hasNext && Math.abs(motion.plateTravel) > tolerance) {
          addIssue(
            issues,
            "bad",
            "machine-grammar-rest-motion",
            `HMI ${hmi} is CMD 3 Rest but changes the bottle plate by ${Math.abs(motion.plateTravel).toFixed(1)}°.`,
            { hmi, category: "motion" }
          );
        }
        return;
      }

      if (command !== 7) return;
      if (previousCommand !== 3) {
        addIssue(
          issues,
          "bad",
          "machine-grammar-pair-start",
          `HMI ${hmi} is CMD 7 without an immediately preceding CMD 3 reference for ${rule.name}.`,
          { hmi }
        );
      }
      if (nextCommand !== 3) {
        addIssue(
          issues,
          "bad",
          "machine-grammar-pair-end",
          `HMI ${hmi} is CMD 7 and must be followed by CMD 3 before another ${rule.name} move.`,
          { hmi }
        );
      }
      if (!motion.hasNext || Math.abs(motion.plateTravel) <= tolerance) {
        addIssue(
          issues,
          "bad",
          "machine-grammar-empty-correction",
          `HMI ${hmi} is CMD 7 but produces no bottle-plate movement.`,
          { hmi, category: "motion" }
        );
      }
    });

    if (!issues.some((issue) => issue.level === "bad")) {
      addIssue(issues, "ok", "machine-grammar-pair-ok", `${rule.name} is valid: ${rule.sequence}.`);
    }
    return issues;
  }

  function validateAdvancedMotion(rows, rule, tolerance) {
    const issues = [];
    const source = validateCommon(rows, rule, tolerance, issues);
    let continuousMotion = false;

    source.forEach((row, index) => {
      const command = Number(row?.cmd);
      const hmi = row?.hmi ?? index + 1;
      const previousCommand = index > 0 ? Number(source[index - 1]?.cmd) : null;
      const nextCommand = index + 1 < source.length ? Number(source[index + 1]?.cmd) : null;
      const motion = segmentMotion(source, index);

      if (command === 3) {
        if (continuousMotion) {
          addIssue(issues, "bad", "machine-grammar-rest-before-end", `HMI ${hmi} enters CMD 3 before CMD 2 ends the continuous-motion sequence.`, { hmi });
        }
        if (motion.hasNext && Math.abs(motion.plateTravel) > tolerance) {
          addIssue(issues, "bad", "machine-grammar-rest-motion", `HMI ${hmi} is CMD 3 Rest but produces bottle movement.`, { hmi, category: "motion" });
        }
        return;
      }

      if (command === 1) {
        if (continuousMotion) addIssue(issues, "bad", "machine-grammar-duplicate-start", `HMI ${hmi} starts motion while a continuous-motion sequence is already active.`, { hmi });
        if (!motion.hasNext || Math.abs(motion.plateTravel) <= tolerance) addIssue(issues, "bad", "machine-grammar-empty-start", `HMI ${hmi} uses CMD 1 Startup but produces no bottle movement.`, { hmi, category: "motion" });
        continuousMotion = true;
        return;
      }

      if (command === 5 || command === 6) {
        if (!continuousMotion) addIssue(issues, "bad", "machine-grammar-continuous-without-start", `HMI ${hmi} uses CMD ${command} without an active CMD 1 Startup sequence.`, { hmi });
        if (!motion.hasNext || Math.abs(motion.plateTravel) <= tolerance) addIssue(issues, "bad", "machine-grammar-empty-continuous", `HMI ${hmi} uses CMD ${command} but produces no bottle movement.`, { hmi, category: "motion" });
        return;
      }

      if (command === 2) {
        if (!continuousMotion) addIssue(issues, "bad", "machine-grammar-end-without-motion", `HMI ${hmi} uses CMD 2 End without active continuous motion.`, { hmi });
        if (nextCommand !== 3) addIssue(issues, "bad", "machine-grammar-end-reference", `HMI ${hmi} CMD 2 End must be followed by CMD 3 Rest.`, { hmi });
        continuousMotion = false;
        return;
      }

      if (command === 4) {
        if (!motion.hasNext || Math.abs(motion.plateTravel) <= tolerance) addIssue(issues, "bad", "machine-grammar-empty-special", `HMI ${hmi} uses CMD 4 Special but produces no calculated movement.`, { hmi, category: "motion" });
        return;
      }

      if (command === 7) {
        if (continuousMotion) addIssue(issues, "bad", "machine-grammar-correction-during-continuous", `HMI ${hmi} uses CMD 7 while continuous motion is active. CMD 2 End must close the sequence first.`, { hmi });
        if (previousCommand !== 3 || nextCommand !== 3) addIssue(issues, "bad", "machine-grammar-advanced-correction-reference", `HMI ${hmi} CMD 7 must be isolated between CMD 3 references for ${rule.name}.`, { hmi });
        if (!motion.hasNext || Math.abs(motion.plateTravel) <= tolerance) addIssue(issues, "bad", "machine-grammar-empty-correction", `HMI ${hmi} is CMD 7 but produces no bottle movement.`, { hmi, category: "motion" });
      }
    });

    if (continuousMotion) {
      addIssue(issues, "bad", "machine-grammar-continuous-open", `${rule.name} reaches End Curve without CMD 2 End and CMD 3 Rest.`);
    }
    if (!issues.some((issue) => issue.level === "bad")) {
      addIssue(issues, "ok", "machine-grammar-advanced-ok", `${rule.name} is valid: ${rule.sequence}.`);
    }
    return issues;
  }

  function annotateCorrectionChains(rows, options = {}) {
    const family = resolveFamily({ ...options, rows });
    const rule = RULE_PROFILES[family] || RULE_PROFILES[FAMILIES.DEFAULT];
    const source = (Array.isArray(rows) ? rows : []).map((row) => ({ ...row }));
    if (rule.mode !== "correction-chain") return { family, rule, rows: source, chains: [] };

    let chainNumber = 0;
    let openChain = null;
    let lastReferenceIndex = null;
    const chains = [];

    source.forEach((row, index) => {
      const command = Number(row?.cmd);
      if (command === 3) {
        if (openChain) {
          row.machineCorrectionChainId = openChain.id;
          row.machineReferenceRole = "end";
          openChain.endIndex = index;
          chains.push({ ...openChain });
          openChain = null;
        }
        lastReferenceIndex = index;
        return;
      }
      if (command !== 7) {
        openChain = null;
        lastReferenceIndex = null;
        return;
      }
      if (!openChain) {
        chainNumber += 1;
        openChain = {
          id: `CC${String(chainNumber).padStart(2, "0")}`,
          startReferenceIndex: lastReferenceIndex,
          moveIndexes: [],
          endIndex: null
        };
        if (lastReferenceIndex !== null) {
          source[lastReferenceIndex].machineCorrectionChainId = openChain.id;
          source[lastReferenceIndex].machineReferenceRole = "start";
        }
      }
      openChain.moveIndexes.push(index);
      row.machineCorrectionChainId = openChain.id;
      row.machineCorrectionChainPosition = openChain.moveIndexes.length === 1 ? "first" : "middle";
    });

    if (openChain) chains.push({ ...openChain });
    chains.forEach((chain) => {
      const lastMoveIndex = chain.moveIndexes.at(-1);
      if (lastMoveIndex !== undefined) {
        source[lastMoveIndex].machineCorrectionChainPosition = chain.moveIndexes.length === 1 ? "single" : "last";
      }
    });

    source.forEach((row) => {
      row.machineGrammarFamily = family;
      row.machineGrammarProfile = rule.id;
    });
    return { family, rule, rows: source, chains };
  }

  function analyze(rows, options = {}) {
    const family = resolveFamily({ ...options, rows });
    const rule = RULE_PROFILES[family] || RULE_PROFILES[FAMILIES.DEFAULT];
    const tolerance = Math.max(0.0001, number(options.tolerance, DEFAULT_TOLERANCE));
    let issues;
    if (rule.mode === "correction-chain") issues = validateCorrectionChain(rows, rule, tolerance);
    else if (rule.mode === "advanced-motion") issues = validateAdvancedMotion(rows, rule, tolerance);
    else issues = validateReferencedPairs(rows, rule, tolerance);

    const summary = issues.reduce((counts, issue) => {
      counts[issue.level] = (counts[issue.level] || 0) + 1;
      return counts;
    }, { bad: 0, warn: 0, ok: 0 });
    return {
      family,
      rule,
      valid: summary.bad === 0,
      status: summary.bad ? "FAIL" : summary.warn ? "REVIEW" : "PASS",
      summary,
      issues
    };
  }

  function validate(rows, options = {}) {
    return analyze(rows, options).issues;
  }

  global.LabelerMachineFamilyGrammarDriver = Object.freeze({
    FAMILIES,
    RULE_PROFILES,
    activeRows,
    resolveFamily,
    ruleProfile,
    segmentMotion,
    terminalRest,
    annotateCorrectionChains,
    analyze,
    validate
  });
})(window);
