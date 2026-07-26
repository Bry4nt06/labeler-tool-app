(function (global) {
  "use strict";

  const EPSILON = 0.001;

  const MOVE_TYPES = Object.freeze({
    STARTUP: 1,
    END: 2,
    REST: 3,
    SPECIAL: 4,
    CONTINUOUS: 5,
    CHANGEOVER: 6,
    CORRECTION: 7
  });

  const MOVE_LIBRARY = Object.freeze({
    [MOVE_TYPES.STARTUP]: Object.freeze({
      code: MOVE_TYPES.STARTUP,
      key: "STARTUP",
      name: "Startup",
      description: "Accelerates the bottle plate from standstill to a constant rotational speed.",
      startsStopped: true,
      endsStopped: false,
      speedMode: "accelerating-to-constant",
      currentGeneratorDefault: false,
      futureImplementation: true
    }),
    [MOVE_TYPES.END]: Object.freeze({
      code: MOVE_TYPES.END,
      key: "END",
      name: "End",
      description: "Decelerates the bottle plate from its current constant rotational speed to standstill.",
      startsStopped: false,
      endsStopped: true,
      speedMode: "decelerating-to-zero",
      currentGeneratorDefault: false,
      futureImplementation: true
    }),
    [MOVE_TYPES.REST]: Object.freeze({
      code: MOVE_TYPES.REST,
      key: "REST",
      name: "Rest",
      description: "Keeps the bottle plate stationary for the entire stage.",
      startsStopped: true,
      endsStopped: true,
      speedMode: "zero",
      currentGeneratorDefault: true,
      futureImplementation: false
    }),
    [MOVE_TYPES.SPECIAL]: Object.freeze({
      code: MOVE_TYPES.SPECIAL,
      key: "SPECIAL",
      name: "Special",
      description: "Uses an accurately calculated rotation profile relative to table angle, typically for uniform label unwinding on complex container geometry.",
      startsStopped: null,
      endsStopped: null,
      speedMode: "calculated-spline",
      currentGeneratorDefault: false,
      futureImplementation: true
    }),
    [MOVE_TYPES.CONTINUOUS]: Object.freeze({
      code: MOVE_TYPES.CONTINUOUS,
      key: "CONTINUOUS",
      name: "Continuous",
      description: "Maintains a constant rotational speed throughout the stage, with startup and stopping handled by adjacent commands.",
      startsStopped: false,
      endsStopped: false,
      speedMode: "constant",
      currentGeneratorDefault: false,
      futureImplementation: true
    }),
    [MOVE_TYPES.CHANGEOVER]: Object.freeze({
      code: MOVE_TYPES.CHANGEOVER,
      key: "CHANGEOVER",
      name: "Changeover",
      description: "Transitions an already rotating bottle plate from one constant speed to another.",
      startsStopped: false,
      endsStopped: false,
      speedMode: "speed-transition",
      currentGeneratorDefault: false,
      futureImplementation: true
    }),
    [MOVE_TYPES.CORRECTION]: Object.freeze({
      code: MOVE_TYPES.CORRECTION,
      key: "CORRECTION",
      name: "Correction",
      description: "Turns the bottle between two stopped positions with acceleration and deceleration inside the stage.",
      startsStopped: true,
      endsStopped: true,
      speedMode: "point-to-point",
      currentGeneratorDefault: true,
      futureImplementation: false
    })
  });

  const MACHINE_MOVE_PROFILES = Object.freeze({
    DEFAULT: Object.freeze({
      name: "Default 3/7 Profile",
      supportedMoves: Object.freeze([MOVE_TYPES.REST, MOVE_TYPES.CORRECTION]),
      generatedMoves: Object.freeze([MOVE_TYPES.REST, MOVE_TYPES.CORRECTION])
    }),
    COLD_GLUE: Object.freeze({
      name: "Cold Glue",
      supportedMoves: Object.freeze([MOVE_TYPES.REST, MOVE_TYPES.CORRECTION]),
      generatedMoves: Object.freeze([MOVE_TYPES.REST, MOVE_TYPES.CORRECTION])
    }),
    APL: Object.freeze({
      name: "APL",
      supportedMoves: Object.freeze([MOVE_TYPES.REST, MOVE_TYPES.CORRECTION]),
      generatedMoves: Object.freeze([MOVE_TYPES.REST, MOVE_TYPES.CORRECTION])
    }),
    AUTOCOL_FUTURE: Object.freeze({
      name: "Autocol Future Motion",
      supportedMoves: Object.freeze([1, 2, 3, 4, 5, 6, 7]),
      generatedMoves: Object.freeze([MOVE_TYPES.REST, MOVE_TYPES.CORRECTION])
    }),
    MULTIMODUL_FUTURE: Object.freeze({
      name: "MultiModul Future Motion",
      supportedMoves: Object.freeze([1, 2, 3, 4, 5, 6, 7]),
      generatedMoves: Object.freeze([MOVE_TYPES.REST, MOVE_TYPES.CORRECTION])
    })
  });

  function moveDefinition(codeOrKey) {
    if (typeof codeOrKey === "string" && Object.hasOwn(MOVE_TYPES, codeOrKey.toUpperCase())) {
      return MOVE_LIBRARY[MOVE_TYPES[codeOrKey.toUpperCase()]] || null;
    }
    return MOVE_LIBRARY[Number(codeOrKey)] || null;
  }

  function listMoveDefinitions() {
    return Object.values(MOVE_LIBRARY);
  }

  function profileDefinition(profileName = "DEFAULT") {
    return MACHINE_MOVE_PROFILES[String(profileName || "DEFAULT").toUpperCase()] || MACHINE_MOVE_PROFILES.DEFAULT;
  }

  function profileSupportsMove(profileName, codeOrKey) {
    const move = moveDefinition(codeOrKey);
    return Boolean(move && profileDefinition(profileName).supportedMoves.includes(move.code));
  }

  function commandForIntent(intent, profileName = "DEFAULT") {
    const normalized = String(intent || "").trim().toUpperCase();
    const intentMap = {
      HOLD: MOVE_TYPES.REST,
      REST: MOVE_TYPES.REST,
      REFERENCE: MOVE_TYPES.REST,
      ROTATE: MOVE_TYPES.CORRECTION,
      CORRECT: MOVE_TYPES.CORRECTION,
      CORRECTION: MOVE_TYPES.CORRECTION,
      START: MOVE_TYPES.STARTUP,
      STARTUP: MOVE_TYPES.STARTUP,
      STOP: MOVE_TYPES.END,
      END: MOVE_TYPES.END,
      SPECIAL: MOVE_TYPES.SPECIAL,
      CONTINUOUS: MOVE_TYPES.CONTINUOUS,
      CHANGE_SPEED: MOVE_TYPES.CHANGEOVER,
      CHANGEOVER: MOVE_TYPES.CHANGEOVER
    };
    const requested = intentMap[normalized];
    if (!requested) return null;
    return profileSupportsMove(profileName, requested) ? requested : null;
  }

  function finalize(rows) {
    // Current production generation intentionally remains the proven 3/7
    // sequence. The complete move library is available for future planners,
    // machine profiles and validators without changing generated output today.
    return rows.map((row) => ({
      ...row,
      cmd: Number(row.cmd) === MOVE_TYPES.CORRECTION ? MOVE_TYPES.CORRECTION : MOVE_TYPES.REST
    }));
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
      cmd: MOVE_TYPES.REST,
      tableAngle: endTableAngle,
      plateAngle: Number(previous.plateAngle),
      action: "End Curve - Rest",
      motionSource: "terminal-end-curve-rest",
      terminalRest: true,
      pairProfile: null,
      pairStation: null,
      relativePlateAngle: 0
    };

    if (Number(previous.cmd) === MOVE_TYPES.REST) {
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

      if (cmd === MOVE_TYPES.CORRECTION) {
        motionStarted = true;
        if (row.autocolProfile === true && nextCmd === MOVE_TYPES.CORRECTION) {
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
            message: `HMI ${row.hmi} is CMD ${MOVE_TYPES.CORRECTION} but produces no bottle-plate travel.`
          });
        }
        return;
      }

      if (cmd !== MOVE_TYPES.REST) {
        const knownMove = moveDefinition(cmd);
        issues.push({
          level: "bad",
          code: "unsupported-generated-command",
          hmi: row.hmi,
          message: knownMove
            ? `HMI ${row.hmi} uses ${knownMove.name} (CMD ${knownMove.code}). It is registered in the motion library for future implementation, but this generator currently supports only Rest (3) and Correction (7).`
            : `HMI ${row.hmi} uses unknown CMD ${row.cmd}.`
        });
        return;
      }

      if (!motionStarted) return;

      const isTerminalRest = !next && (row.terminalRest === true || /rest.*end curve|end curve.*rest/i.test(String(row.action || "")));
      if (isTerminalRest) return;
      const isAutocolMotionEnd = row.autocolProfile === true
        && row.autocolBoundary === "motion-end-rest"
        && next?.autocolBoundary === "end-curve";
      if (isAutocolMotionEnd) return;
      if (next && nextCmd !== MOVE_TYPES.CORRECTION) {
        issues.push({
          level: "bad",
          code: "reference-not-followed-by-move",
          hmi: row.hmi,
          message: `HMI ${row.hmi} is CMD ${MOVE_TYPES.REST} after motion began, but the next command is not CMD ${MOVE_TYPES.CORRECTION}. Required sequence is ...7 → 3 → 7; only CMD 7 may repeat.`
        });
      }
    });

    const finalRow = rows[rows.length - 1];
    if (rows.length && !(Number(finalRow?.cmd) === MOVE_TYPES.REST && (finalRow?.terminalRest === true || /rest.*end curve|end curve.*rest|end of curve/i.test(String(finalRow?.action || ""))))) {
      issues.push({
        level: "bad",
        code: "missing-terminal-rest",
        hmi: finalRow?.hmi,
        message: `The servo curve must finish at an End Curve setpoint using Rest (CMD ${MOVE_TYPES.REST}).`
      });
    }

    return issues;
  }

  function validateReferences(rows, tolerance = EPSILON) {
    return validateGrammar(rows, tolerance);
  }

  global.LabelerServoCommandDriver = Object.freeze({
    MOVE_TYPES,
    MOVE_LIBRARY,
    MACHINE_MOVE_PROFILES,
    moveDefinition,
    listMoveDefinitions,
    profileDefinition,
    profileSupportsMove,
    commandForIntent,
    finalize,
    terminateAtEndCurve,
    validateGrammar,
    validateReferences
  });
})(window);
