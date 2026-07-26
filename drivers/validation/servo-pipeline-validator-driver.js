(function (global) {
  "use strict";

  const LEVELS = Object.freeze({ BAD: "bad", WARN: "warn", OK: "ok" });
  const LEGACY_COMMANDS = new Set([3, 7]);
  const MOTION_COMMANDS = new Set([1, 2, 4, 5, 6, 7]);

  function number(value, fallback = null) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function addIssue(issues, level, code, category, message, details = {}) {
    issues.push({ level, code, category, message, ...details });
  }

  function commandDefinition(command) {
    return global.LabelerServoCommandDriver?.moveDefinition?.(command) || null;
  }

  function commandSupported(machineProfile, command) {
    const driver = global.LabelerServoCommandDriver;
    return driver?.profileSupportsMove
      ? driver.profileSupportsMove(machineProfile, command)
      : LEGACY_COMMANDS.has(Number(command));
  }

  function terminalRest(row) {
    return Number(row?.cmd) === 3
      && (row?.terminalRest === true || /end\s*(?:of\s*)?curve|end curve.*rest|rest.*end curve/i.test(String(row?.action || "")));
  }

  function segmentMotion(rows, index) {
    const row = rows[index];
    const next = rows[index + 1];
    if (!next) return { tableTravel: 0, plateTravel: 0, speedRatio: 0, hasNext: false };
    const tableTravel = number(next.tableAngle, 0) - number(row.tableAngle, 0);
    const plateTravel = number(next.plateAngle, 0) - number(row.plateAngle, 0);
    return {
      tableTravel,
      plateTravel,
      speedRatio: Math.abs(tableTravel) > 0.0001 ? Math.abs(plateTravel / tableTravel) : Infinity,
      hasNext: true
    };
  }

  function validateRowIdentity(rows, issues, tolerance) {
    let sequenceValid = true;
    let dataValid = true;
    const eventIds = new Set();

    rows.forEach((row, index) => {
      const hmi = number(row?.hmi, index + 1);
      const plc = number(row?.plc, index);
      const tableAngle = number(row?.tableAngle);
      const plateAngle = number(row?.plateAngle);
      const eventId = String(row?.motionEventId || "").trim();

      if (tableAngle === null) {
        dataValid = false;
        addIssue(issues, LEVELS.BAD, "missing-table-angle", "data", `HMI ${hmi} has no valid table angle.`, { hmi });
      }
      if (plateAngle === null && Number(row?.cmd) !== 0) {
        dataValid = false;
        addIssue(issues, LEVELS.BAD, "missing-plate-angle", "data", `HMI ${hmi} has no valid bottle-plate angle.`, { hmi });
      }
      if (index > 0) {
        const previous = rows[index - 1];
        const previousAngle = number(previous?.tableAngle);
        if (tableAngle !== null && previousAngle !== null && tableAngle <= previousAngle + tolerance) {
          sequenceValid = false;
          addIssue(issues, LEVELS.BAD, "table-angle-order", "sequence", `HMI ${hmi} table angle ${tableAngle.toFixed(1)}° must be greater than HMI ${previous?.hmi ?? index} at ${previousAngle.toFixed(1)}°.`, { hmi });
        }
        const previousHmi = number(previous?.hmi, index);
        if (hmi !== previousHmi + 1) {
          addIssue(issues, LEVELS.WARN, "hmi-sequence-gap", "data", `HMI numbering jumps from ${previousHmi} to ${hmi}.`, { hmi });
        }
        const previousPlc = number(previous?.plc, index - 1);
        if (plc !== previousPlc + 1) {
          addIssue(issues, LEVELS.WARN, "plc-sequence-gap", "data", `PLC numbering jumps from ${previousPlc} to ${plc} at HMI ${hmi}.`, { hmi });
        }
      }

      if (eventId) {
        if (eventIds.has(eventId)) {
          dataValid = false;
          addIssue(issues, LEVELS.BAD, "duplicate-event-id", "planner", `${eventId} is assigned to more than one servo row.`, { hmi, eventId });
        }
        eventIds.add(eventId);
      } else if (row?.motionProfileApplied || row?.plannerIntent) {
        addIssue(issues, LEVELS.WARN, "missing-event-id", "planner", `HMI ${hmi} has planner data but no mechanical event ID.`, { hmi });
      }
    });

    if (sequenceValid) addIssue(issues, LEVELS.OK, "table-angle-order-ok", "sequence", "All servo command table angles are unique and strictly increasing.");
    if (dataValid) addIssue(issues, LEVELS.OK, "row-data-ok", "data", "Every active servo row has valid table-angle and bottle-angle data.");
  }

  function validateCommandSupport(rows, issues, machineProfile) {
    let commandsValid = true;
    rows.forEach((row, index) => {
      const hmi = row?.hmi ?? index + 1;
      const command = number(row?.cmd, NaN);
      const definition = commandDefinition(command);
      if (!Number.isFinite(command) || !definition) {
        commandsValid = false;
        addIssue(issues, LEVELS.BAD, "unknown-command", "commands", `HMI ${hmi} uses unknown CMD ${row?.cmd}.`, { hmi });
        return;
      }
      if (!commandSupported(machineProfile, command)) {
        commandsValid = false;
        addIssue(issues, LEVELS.BAD, "unsupported-command", "commands", `HMI ${hmi} uses ${definition.name} (CMD ${command}), which is not enabled for ${machineProfile}.`, { hmi });
      }
      if (row?.plannerFallbackUsed) {
        addIssue(issues, LEVELS.WARN, "command-fallback", "translation", `HMI ${hmi}: ${row.plannerFallbackReason || `the requested command was replaced by CMD ${command}.`}`, { hmi, eventId: row?.motionEventId });
      }
      const requested = number(row?.plannerRecommendedCommand);
      if (requested !== null && requested !== command && !row?.plannerFallbackUsed) {
        commandsValid = false;
        addIssue(issues, LEVELS.BAD, "translation-command-mismatch", "translation", `HMI ${hmi} contains CMD ${command}, but the translator recorded CMD ${requested}.`, { hmi, eventId: row?.motionEventId });
      }
    });
    if (commandsValid) addIssue(issues, LEVELS.OK, "commands-supported", "commands", `Every generated command is registered and supported by ${machineProfile}.`);
  }

  function validateLegacyGrammar(rows, issues, tolerance) {
    let grammarValid = true;
    rows.forEach((row, index) => {
      const command = Number(row?.cmd);
      const hmi = row?.hmi ?? index + 1;
      const previousCommand = index > 0 ? Number(rows[index - 1]?.cmd) : null;
      const nextCommand = index + 1 < rows.length ? Number(rows[index + 1]?.cmd) : null;
      const motion = segmentMotion(rows, index);

      if (!LEGACY_COMMANDS.has(command)) return;
      if (command === 7) {
        if (index > 0 && previousCommand !== 3) {
          grammarValid = false;
          addIssue(issues, LEVELS.BAD, "correction-missing-leading-reference", "grammar", `HMI ${hmi} is CMD 7 without a preceding CMD 3 reference. Required sequence is 3 → 7 → 3.`, { hmi });
        }
        if (motion.hasNext && nextCommand !== 3) {
          grammarValid = false;
          addIssue(issues, LEVELS.BAD, "correction-missing-trailing-reference", "grammar", `HMI ${hmi} is CMD 7 and must be followed by CMD 3 before another move.`, { hmi });
        }
        if (!motion.hasNext || Math.abs(motion.plateTravel) <= tolerance) {
          grammarValid = false;
          addIssue(issues, LEVELS.BAD, "empty-correction", "motion", `HMI ${hmi} is CMD 7 but produces no bottle-plate movement.`, { hmi });
        }
      }

      if (command === 3 && motion.hasNext && Math.abs(motion.plateTravel) > tolerance) {
        grammarValid = false;
        addIssue(issues, LEVELS.BAD, "rest-produces-motion", "motion", `HMI ${hmi} is CMD 3 Rest but changes the bottle plate by ${Math.abs(motion.plateTravel).toFixed(1)}°.`, { hmi });
      }
    });

    if (rows.length && Number(rows[0]?.cmd) !== 3) {
      grammarValid = false;
      addIssue(issues, LEVELS.BAD, "legacy-start-reference", "grammar", "A Rest / Correction profile must begin from a CMD 3 reference.", { hmi: rows[0]?.hmi });
    }
    if (grammarValid) addIssue(issues, LEVELS.OK, "legacy-grammar-ok", "grammar", "Rest / Correction grammar is valid: each CMD 7 is bracketed by CMD 3 references.");
  }

  function validateAdvancedGrammar(rows, issues, tolerance) {
    let moving = false;
    let grammarValid = true;

    rows.forEach((row, index) => {
      const command = Number(row?.cmd);
      const hmi = row?.hmi ?? index + 1;
      const motion = segmentMotion(rows, index);
      const nextCommand = index + 1 < rows.length ? Number(rows[index + 1]?.cmd) : null;

      if (command === 3) {
        if (moving) {
          grammarValid = false;
          addIssue(issues, LEVELS.BAD, "rest-before-end", "grammar", `HMI ${hmi} enters CMD 3 while continuous motion is still active. Insert CMD 2 End first.`, { hmi });
        }
        if (motion.hasNext && Math.abs(motion.plateTravel) > tolerance) {
          grammarValid = false;
          addIssue(issues, LEVELS.BAD, "advanced-rest-motion", "motion", `HMI ${hmi} is CMD 3 Rest but produces bottle movement.`, { hmi });
        }
        return;
      }

      if (command === 7) {
        if (moving) {
          grammarValid = false;
          addIssue(issues, LEVELS.BAD, "correction-during-continuous", "grammar", `HMI ${hmi} uses CMD 7 while continuous motion is active. CMD 2 End must stop the profile first.`, { hmi });
        }
        if (!motion.hasNext || Math.abs(motion.plateTravel) <= tolerance) {
          grammarValid = false;
          addIssue(issues, LEVELS.BAD, "advanced-empty-correction", "motion", `HMI ${hmi} is CMD 7 but produces no bottle movement.`, { hmi });
        }
        return;
      }

      if (command === 1) {
        if (moving) {
          grammarValid = false;
          addIssue(issues, LEVELS.BAD, "startup-already-moving", "grammar", `HMI ${hmi} uses CMD 1 Startup while the bottle plate is already moving.`, { hmi });
        }
        if (!motion.hasNext || Math.abs(motion.plateTravel) <= tolerance) {
          grammarValid = false;
          addIssue(issues, LEVELS.BAD, "empty-startup", "motion", `HMI ${hmi} uses CMD 1 Startup but produces no bottle movement.`, { hmi });
        }
        moving = true;
        return;
      }

      if (command === 5 || command === 6) {
        if (!moving) {
          grammarValid = false;
          addIssue(issues, LEVELS.BAD, command === 5 ? "continuous-without-startup" : "changeover-without-motion", "grammar", `HMI ${hmi} uses CMD ${command} without an active CMD 1 Startup sequence.`, { hmi });
        }
        if (!motion.hasNext || Math.abs(motion.plateTravel) <= tolerance) {
          grammarValid = false;
          addIssue(issues, LEVELS.BAD, "empty-continuous-move", "motion", `HMI ${hmi} uses CMD ${command} but produces no bottle movement.`, { hmi });
        }
        return;
      }

      if (command === 2) {
        if (!moving) {
          grammarValid = false;
          addIssue(issues, LEVELS.BAD, "end-without-motion", "grammar", `HMI ${hmi} uses CMD 2 End without an active continuous-motion sequence.`, { hmi });
        }
        if (nextCommand !== 3) {
          grammarValid = false;
          addIssue(issues, LEVELS.BAD, "end-missing-rest", "grammar", `HMI ${hmi} CMD 2 End must be followed by CMD 3 Rest.`, { hmi });
        }
        moving = false;
        return;
      }

      if (command === 4 && (!motion.hasNext || Math.abs(motion.plateTravel) <= tolerance)) {
        grammarValid = false;
        addIssue(issues, LEVELS.BAD, "empty-special", "motion", `HMI ${hmi} uses CMD 4 Special but produces no calculated bottle movement.`, { hmi });
      }
    });

    if (moving) {
      grammarValid = false;
      addIssue(issues, LEVELS.BAD, "continuous-not-ended", "grammar", "The continuous-motion sequence reaches End Curve without CMD 2 End.");
    }
    if (grammarValid) addIssue(issues, LEVELS.OK, "advanced-grammar-ok", "grammar", "Startup, Continuous, Changeover, End, Rest, Special, and Correction transitions are valid.");
  }

  function validateTerminal(rows, issues) {
    const finalRow = rows[rows.length - 1];
    if (!finalRow || !terminalRest(finalRow)) {
      addIssue(issues, LEVELS.BAD, "terminal-rest-required", "terminal", "The servo profile must finish at End Curve using CMD 3 Rest.", { hmi: finalRow?.hmi });
      return;
    }
    addIssue(issues, LEVELS.OK, "terminal-rest-ok", "terminal", `HMI ${finalRow.hmi} correctly finishes the curve with CMD 3 Rest.`);
  }

  function validateSpeedEnvelope(rows, issues, maxMoveRatio, tolerance) {
    const limit = Math.max(0.1, number(maxMoveRatio, 21));
    let worst = null;
    rows.forEach((row, index) => {
      const motion = segmentMotion(rows, index);
      if (!motion.hasNext || !MOTION_COMMANDS.has(Number(row?.cmd))) return;
      const hmi = row?.hmi ?? index + 1;
      if (motion.tableTravel <= tolerance) {
        addIssue(issues, LEVELS.BAD, "nonpositive-table-travel", "speed", `HMI ${hmi} has ${motion.tableTravel.toFixed(1)}° table travel. Motion commands require positive table distance.`, { hmi });
        return;
      }
      if (!Number.isFinite(motion.speedRatio)) return;
      if (!worst || motion.speedRatio > worst.speedRatio) worst = { hmi, ...motion };
      if (motion.speedRatio >= limit) {
        addIssue(issues, LEVELS.BAD, "speed-limit-exceeded", "speed", `HMI ${hmi} requires ${motion.speedRatio.toFixed(1)}° bottle per 1° table, exceeding the ${limit.toFixed(1)}:1 limit.`, { hmi });
      } else if (motion.speedRatio >= limit * 0.85) {
        addIssue(issues, LEVELS.WARN, "speed-limit-near", "speed", `HMI ${hmi} is near the servo-speed limit at ${motion.speedRatio.toFixed(1)}:1 of ${limit.toFixed(1)}:1.`, { hmi });
      }
    });
    const speedFailures = issues.some((issue) => issue.category === "speed" && issue.level === LEVELS.BAD);
    const speedWarnings = issues.some((issue) => issue.category === "speed" && issue.level === LEVELS.WARN);
    if (!speedFailures && !speedWarnings) {
      addIssue(issues, LEVELS.OK, "speed-envelope-ok", "speed", worst
        ? `Maximum planned turn speed is ${worst.speedRatio.toFixed(1)}:1 at HMI ${worst.hmi}, within the ${limit.toFixed(1)}:1 limit.`
        : "No active bottle-rotation moves require a speed-envelope check.");
    }
  }

  function validatePlannerAlignment(rows, plan, issues, tolerance) {
    const steps = Array.isArray(plan?.steps) ? plan.steps : [];
    if (!steps.length) {
      addIssue(issues, LEVELS.WARN, "planner-plan-missing", "planner", "No mechanical planner steps are attached to the generated servo profile.");
      return;
    }
    let aligned = true;
    if (steps.length !== rows.length) {
      aligned = false;
      addIssue(issues, LEVELS.BAD, "planner-row-count", "planner", `The planner contains ${steps.length} events but the servo program contains ${rows.length} rows.`);
    }
    rows.forEach((row, index) => {
      const step = steps[index];
      if (!step) return;
      const hmi = row?.hmi ?? index + 1;
      if (String(step.eventId || "") !== String(row?.motionEventId || "")) {
        aligned = false;
        addIssue(issues, LEVELS.BAD, "planner-event-mismatch", "planner", `HMI ${hmi} is linked to ${row?.motionEventId || "no event"}, but planner row ${index + 1} is ${step.eventId || "unassigned"}.`, { hmi });
      }
      if (Math.abs(number(step.tableAngle, 0) - number(row?.tableAngle, 0)) > tolerance) {
        aligned = false;
        addIssue(issues, LEVELS.BAD, "planner-angle-mismatch", "planner", `HMI ${hmi} table angle does not match ${step.eventId || "its planner event"}.`, { hmi, eventId: step.eventId });
      }
      if (Number(step.recommendedCommand) !== Number(row?.cmd)) {
        aligned = false;
        addIssue(issues, LEVELS.BAD, "planner-command-mismatch", "planner", `${step.eventId || `HMI ${hmi}`} recommends CMD ${step.recommendedCommand}, but the final row contains CMD ${row?.cmd}.`, { hmi, eventId: step.eventId });
      }
    });
    if (aligned) addIssue(issues, LEVELS.OK, "planner-alignment-ok", "planner", "Mechanical events, planner intents, translated commands, and final servo rows are aligned one-to-one.");
  }

  function summarize(issues) {
    const summary = { bad: 0, warn: 0, ok: 0, total: issues.length };
    const categories = {};
    issues.forEach((issue) => {
      summary[issue.level] = (summary[issue.level] || 0) + 1;
      const category = issue.category || "general";
      categories[category] ||= { bad: 0, warn: 0, ok: 0, total: 0 };
      categories[category][issue.level] += 1;
      categories[category].total += 1;
    });
    return { summary, categories };
  }

  function dedupeIssues(issues) {
    const seen = new Set();
    return issues.filter((issue) => {
      const key = `${issue.level}|${issue.code}|${issue.hmi ?? ""}|${issue.eventId ?? ""}|${issue.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function analyze(options = {}) {
    const rows = Array.isArray(options.rows) ? options.rows : [];
    const issues = [];
    const tolerance = Math.max(0.0001, number(options.tolerance, 0.001));
    const machineProfile = String(options.machineProfile || options.translation?.machineProfile || "DEFAULT").toUpperCase();
    const resolvedProfileId = String(options.profileId || options.translation?.profileId || "rest-correction");

    if (!rows.length) {
      addIssue(issues, LEVELS.BAD, "program-empty", "data", "No generated servo rows are available for validation.");
    } else {
      validateRowIdentity(rows, issues, tolerance);
      validateCommandSupport(rows, issues, machineProfile);
      const legacyMode = resolvedProfileId === "rest-correction" || rows.every((row) => LEGACY_COMMANDS.has(Number(row?.cmd)));
      if (legacyMode) validateLegacyGrammar(rows, issues, tolerance);
      else validateAdvancedGrammar(rows, issues, tolerance);
      validateTerminal(rows, issues);
      validateSpeedEnvelope(rows, issues, options.maxMoveRatio, tolerance);
      validatePlannerAlignment(rows, options.plan, issues, tolerance);
    }

    const uniqueIssues = dedupeIssues(issues);
    const { summary, categories } = summarize(uniqueIssues);
    return {
      createdAt: new Date().toISOString(),
      valid: summary.bad === 0,
      status: summary.bad ? "FAIL" : summary.warn ? "REVIEW" : "PASS",
      machineProfile,
      profileId: resolvedProfileId,
      rowCount: rows.length,
      summary,
      categories,
      issues: uniqueIssues
    };
  }

  global.LabelerServoPipelineValidator = Object.freeze({
    LEVELS,
    analyze,
    segmentMotion,
    terminalRest
  });
})(window);
