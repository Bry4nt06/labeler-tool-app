(function (global) {
  "use strict";

  const LEGACY_COMMANDS = Object.freeze([3, 7]);
  const ADVANCED_COMMANDS = Object.freeze([1, 2, 4, 5, 6]);

  function numericCommand(value, fallback = 3) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function isTerminalRow(row, index, total) {
    return row?.terminalRest === true
      || index === total - 1
      || /end\s*(?:of\s*)?curve/i.test(String(row?.action || ""));
  }

  function supportedCommand(machineProfile, command) {
    const driver = global.LabelerServoCommandDriver;
    return driver?.profileSupportsMove
      ? driver.profileSupportsMove(machineProfile, command)
      : LEGACY_COMMANDS.includes(Number(command));
  }

  function safeFallbackCommand(row, step) {
    const base = numericCommand(row?.cmd, 3);
    if (LEGACY_COMMANDS.includes(base)) return base;
    return step?.motion?.moving ? 7 : 3;
  }

  function translate(rows, plan, options = {}) {
    const sourceRows = Array.isArray(rows) ? rows : [];
    const steps = Array.isArray(plan?.steps) ? plan.steps : [];
    const machineProfile = String(options.machineProfile || plan?.machineProfile || "DEFAULT").toUpperCase();
    const resolvedProfileId = String(options.profileId || plan?.profileId || "rest-correction");
    const requestedProfileId = String(options.requestedProfileId || plan?.requestedProfileId || resolvedProfileId);
    const legacyMode = resolvedProfileId === "rest-correction";
    const issues = [];

    const translatedRows = sourceRows.map((row, index) => {
      const step = steps[index] || null;
      const baseCommand = numericCommand(row?.cmd, 3);
      const terminal = isTerminalRow(row, index, sourceRows.length);
      let requestedCommand = numericCommand(step?.recommendedCommand, baseCommand);
      let command = legacyMode ? baseCommand : requestedCommand;
      let fallbackUsed = Boolean(step?.fallbackUsed);
      let fallbackReason = String(step?.fallbackReason || "");

      if (terminal) {
        requestedCommand = 3;
        command = 3;
      } else if (!supportedCommand(machineProfile, command)) {
        const fallback = safeFallbackCommand(row, step);
        fallbackUsed = true;
        fallbackReason = `${machineProfile} does not support CMD ${command}; CMD ${fallback} was retained.`;
        command = fallback;
      }

      if (fallbackUsed) {
        issues.push({
          level: "warn",
          code: "translator-fallback",
          hmi: row?.hmi ?? index + 1,
          message: `HMI ${row?.hmi ?? index + 1}: ${fallbackReason || `CMD ${requestedCommand} was replaced by CMD ${command}.`}`
        });
      }

      const definition = global.LabelerServoCommandDriver?.moveDefinition?.(command) || null;
      return {
        ...row,
        baseCmd: baseCommand,
        cmd: command,
        motionEventId: step?.eventId || row?.motionEventId || `EV${String(index + 1).padStart(3, "0")}`,
        motionEventType: step?.eventType || row?.motionEventType || "GENERAL",
        plannerIntent: step?.intent || row?.plannerIntent || (command === 7 ? "ROTATE" : "HOLD"),
        plannerReason: step?.reason || row?.plannerReason || "",
        plannerRequestedCommand: requestedCommand,
        plannerRecommendedCommand: command,
        plannerFallbackUsed: fallbackUsed,
        plannerFallbackReason: fallbackReason,
        appliedMotionProfileId: requestedProfileId,
        resolvedMotionProfileId: resolvedProfileId,
        translatedMachineProfile: machineProfile,
        translatedCommandName: definition?.name || `CMD ${command}`,
        motionProfileApplied: true,
        commandTranslated: command !== baseCommand
      };
    });

    const finalRow = translatedRows[translatedRows.length - 1];
    if (finalRow) {
      finalRow.cmd = 3;
      finalRow.plannerRecommendedCommand = 3;
      finalRow.plannerIntent = "HOLD";
      finalRow.terminalRest = true;
    }

    const changedRows = translatedRows.filter((row) => row.commandTranslated);
    const advancedRows = translatedRows.filter((row) => ADVANCED_COMMANDS.includes(Number(row.cmd)));
    const commandSummary = translatedRows.reduce((summary, row) => {
      const command = String(row.cmd);
      summary[command] = (summary[command] || 0) + 1;
      return summary;
    }, {});

    return {
      requestedProfileId,
      profileId: resolvedProfileId,
      machineProfile,
      legacyMode,
      translated: changedRows.length > 0,
      translatedCount: changedRows.length,
      advancedCommandsApplied: advancedRows.length > 0,
      advancedCount: advancedRows.length,
      fallbackCount: issues.length,
      commandSummary,
      rows: translatedRows,
      plan: {
        ...(plan || {}),
        requestedProfileId,
        profileId: resolvedProfileId,
        machineProfile,
        steps: translatedRows.map((row, index) => ({
          ...(steps[index] || {}),
          index,
          eventId: row.motionEventId,
          eventType: row.motionEventType,
          hmi: row.hmi ?? index + 1,
          tableAngle: Number(row.tableAngle),
          plateAngle: Number(row.plateAngle),
          action: String(row.action || ""),
          baseCommand: row.baseCmd,
          requestedCommand: row.plannerRequestedCommand,
          recommendedCommand: row.cmd,
          recommendedCommandName: row.translatedCommandName,
          intent: row.plannerIntent,
          reason: row.plannerReason,
          fallbackUsed: row.plannerFallbackUsed,
          fallbackReason: row.plannerFallbackReason
        }))
      },
      issues
    };
  }

  function validate(result) {
    const rows = Array.isArray(result?.rows) ? result.rows : [];
    const machineProfile = String(result?.machineProfile || "DEFAULT").toUpperCase();
    const issues = [...(result?.issues || [])];

    rows.forEach((row, index) => {
      const command = numericCommand(row?.cmd, NaN);
      if (!Number.isFinite(command) || !global.LabelerServoCommandDriver?.moveDefinition?.(command)) {
        issues.push({
          level: "bad",
          code: "translator-unknown-command",
          hmi: row?.hmi ?? index + 1,
          message: `HMI ${row?.hmi ?? index + 1} contains unknown CMD ${row?.cmd}.`
        });
        return;
      }
      if (!supportedCommand(machineProfile, command)) {
        issues.push({
          level: "bad",
          code: "translator-unsupported-command",
          hmi: row?.hmi ?? index + 1,
          message: `HMI ${row?.hmi ?? index + 1} uses CMD ${command}, which is not enabled for ${machineProfile}.`
        });
      }
      if (index > 0 && Number(row.tableAngle) <= Number(rows[index - 1].tableAngle)) {
        issues.push({
          level: "bad",
          code: "translator-table-order",
          hmi: row?.hmi ?? index + 1,
          message: `HMI ${row?.hmi ?? index + 1} does not have a strictly increasing table angle.`
        });
      }
    });

    const finalRow = rows[rows.length - 1];
    if (rows.length && Number(finalRow?.cmd) !== 3) {
      issues.push({
        level: "bad",
        code: "translator-terminal-rest",
        hmi: finalRow?.hmi,
        message: "The translated servo profile must end with Rest (CMD 3)."
      });
    }

    if (result?.advancedCommandsApplied) {
      issues.push({
        level: "ok",
        code: "translator-advanced-profile",
        message: `${result.machineProfile} translated ${result.translatedCount} row${result.translatedCount === 1 ? "" : "s"} and applied ${result.advancedCount} advanced motion command${result.advancedCount === 1 ? "" : "s"}.`
      });
    } else {
      issues.push({
        level: "ok",
        code: "translator-legacy-profile",
        message: `${result?.machineProfile || "DEFAULT"} is using the proven Rest / Correction command path.`
      });
    }

    return issues;
  }

  global.LabelerProfileTranslatorDriver = Object.freeze({
    LEGACY_COMMANDS,
    ADVANCED_COMMANDS,
    translate,
    validate
  });
})(window);
