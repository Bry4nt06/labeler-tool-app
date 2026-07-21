(function (global) {
  "use strict";

  const EPSILON = 0.001;

  function finalize(rows) {
    // Commands are intentional profile instructions, not inferred from angle
    // differences. Preserve the mechanical solver's 3/7 sequence exactly.
    return rows.map((row) => ({ ...row, cmd: Number(row.cmd) === 7 ? 7 : 3 }));
  }

  function terminateAtEndCurve(rows, options = {}) {
    if (!Array.isArray(rows) || !rows.length) return [];
    const requestedIndex = Number(options.lastRowIndex);
    const lastRowIndex = Number.isFinite(requestedIndex)
      ? Math.max(0, Math.min(rows.length - 1, Math.trunc(requestedIndex)))
      : rows.length - 1;
    const activeRows = rows.slice(0, lastRowIndex + 1).map((row) => ({ ...row }));
    const previous = activeRows[activeRows.length - 1];
    const nextOriginal = rows[lastRowIndex + 1];
    const requestedTableAngle = Number(options.endTableAngle);
    const endTableAngle = Number.isFinite(requestedTableAngle)
      ? requestedTableAngle
      : Number.isFinite(Number(nextOriginal?.tableAngle))
        ? Number(nextOriginal.tableAngle)
        : Number(previous.tableAngle) + 0.5;

    const restRow = {
      ...previous,
      cmd: 3,
      tableAngle: endTableAngle,
      plateAngle: Number(previous.plateAngle),
      action: "End Curve - Rest",
      motionSource: "terminal-end-curve-rest",
      terminalRest: true,
      pairProfile: null,
      pairStation: null,
      relativePlateAngle: 0
    };

    // A normal profile already finishes the active section on a CMD 3 hold.
    // Promote that hold to the required End Curve Rest instead of producing
    // an illegal pair of consecutive reference/rest commands.
    if (Number(previous.cmd) === 3) {
      activeRows[activeRows.length - 1] = restRow;
    } else {
      activeRows.push({
        ...restRow,
        hmi: Number(previous.hmi) + 1,
        plc: Number(previous.plc) + 1
      });
    }
    return activeRows;
  }

  function validateGrammar(rows, tolerance = EPSILON) {
    const issues = [];
    let motionStarted = false;

    rows.forEach((row, index) => {
      const cmd = Number(row.cmd);
      const next = rows[index + 1];
      const nextCmd = next ? Number(next.cmd) : null;
      const travel = next && Number.isFinite(Number(row.plateAngle)) && Number.isFinite(Number(next.plateAngle))
        ? Number(next.plateAngle) - Number(row.plateAngle)
        : 0;

      if (cmd === 7) {
        motionStarted = true;
        if (row.autocolProfile === true && nextCmd === 7) {
          issues.push({
            level: "bad",
            code: "autocol-consecutive-corrections",
            hmi: row.hmi,
            message: `HMI ${row.hmi} is an Autocol Correction followed by another Correction. Every Autocol motion must alternate Rest → Correction → Rest.`
          });
        }
        if (Math.abs(travel) <= tolerance && row.activeHold !== true && !String(row.motionSource || "").includes("inactive")) {
          issues.push({
            level: "warn",
            code: "empty-move",
            hmi: row.hmi,
            message: `HMI ${row.hmi} is CMD 7 but produces no bottle-plate travel.`
          });
        }
        return;
      }

      if (cmd !== 3) {
        issues.push({
          level: "bad",
          code: "invalid-command",
          hmi: row.hmi,
          message: `HMI ${row.hmi} uses unsupported CMD ${row.cmd}; only CMD 3 and CMD 7 are valid in the generated motion profile.`
        });
        return;
      }

      if (!motionStarted) return; // Multiple leading 3 commands are allowed.

      // The curve must end on one explicit Rest command. This terminal CMD 3
      // intentionally has no following move and is the only legal trailing 3.
      const isTerminalRest = !next && (row.terminalRest === true || /rest.*end curve|end curve.*rest/i.test(String(row.action || "")));
      if (isTerminalRest) return;
      const isAutocolMotionEnd = row.autocolProfile === true
        && row.autocolBoundary === "motion-end-rest"
        && next?.autocolBoundary === "end-curve";
      if (isAutocolMotionEnd) return;
      // After motion begins, a 3 is a reference/hold between moves and must be
      // followed by a 7. A 7 may be followed by another 7.
      if (next && nextCmd !== 7) {
        issues.push({
          level: "bad",
          code: "reference-not-followed-by-move",
          hmi: row.hmi,
          message: `HMI ${row.hmi} is CMD 3 after motion began, but the next command is not CMD 7. Required sequence is ...7 → 3 → 7; only CMD 7 may repeat.`
        });
      }
    });

    const finalRow = rows[rows.length - 1];
    if (rows.length && !(Number(finalRow?.cmd) === 3 && (finalRow?.terminalRest === true || /rest.*end curve|end curve.*rest|end of curve/i.test(String(finalRow?.action || ""))))) {
      issues.push({
        level: "bad",
        code: "missing-terminal-rest",
        hmi: finalRow?.hmi,
        message: "The servo curve must finish at an End Curve setpoint using a Rest command (CMD 3)."
      });
    }

    return issues;
  }

  // Backward-compatible name used by app.js.
  function validateReferences(rows, tolerance = EPSILON) {
    return validateGrammar(rows, tolerance);
  }

  global.LabelerServoCommandDriver = { finalize, terminateAtEndCurve, validateGrammar, validateReferences };
})(window);
