(function (global) {
  "use strict";

  const INTENTS = Object.freeze({
    HOLD: "HOLD",
    ROTATE: "ROTATE",
    START: "START",
    MAINTAIN: "MAINTAIN",
    CHANGE_SPEED: "CHANGE_SPEED",
    SPECIAL: "SPECIAL",
    STOP: "STOP"
  });

  const EVENT_TYPES = Object.freeze({
    STARTUP: "STARTUP",
    APPLICATION: "APPLICATION",
    WIPE: "WIPE",
    CODING: "CODING",
    SENSOR: "SENSOR",
    INSPECTION: "INSPECTION",
    REFERENCE: "REFERENCE",
    EXIT: "EXIT",
    GENERAL: "GENERAL"
  });

  const INTENT_COMMANDS = Object.freeze({
    [INTENTS.HOLD]: 3,
    [INTENTS.ROTATE]: 7,
    [INTENTS.START]: 1,
    [INTENTS.MAINTAIN]: 5,
    [INTENTS.CHANGE_SPEED]: 6,
    [INTENTS.SPECIAL]: 4,
    [INTENTS.STOP]: 2
  });

  function number(value, fallback = null) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function rowMotion(row, nextRow) {
    const start = number(row?.plateAngle);
    const end = number(nextRow?.plateAngle);
    const tableStart = number(row?.tableAngle);
    const tableEnd = number(nextRow?.tableAngle);
    const plateTravel = start !== null && end !== null ? end - start : 0;
    const tableTravel = tableStart !== null && tableEnd !== null ? tableEnd - tableStart : 0;
    return {
      plateTravel,
      tableTravel,
      moving: Math.abs(plateTravel) > 0.001,
      ratio: Math.abs(tableTravel) > 0.001 ? Math.abs(plateTravel / tableTravel) : null
    };
  }

  function eventTypeForRow(row, index, total) {
    const action = String(row?.action || "").toLowerCase();
    if (index === 0 || /startup|start curve|start shape/.test(action)) return EVENT_TYPES.STARTUP;
    if (row?.terminalRest === true || index === total - 1 || /end curve|exit/.test(action)) return EVENT_TYPES.EXIT;
    if (row?.codingHold === true || /cod(?:e|ing)|coder/.test(action)) return EVENT_TYPES.CODING;
    if (row?.sensorId || /sensor/.test(action)) return EVENT_TYPES.SENSOR;
    if (/inspect|vision|camera/.test(action)) return EVENT_TYPES.INSPECTION;
    if (/wipe|brush|roller|pad/.test(action)) return EVENT_TYPES.WIPE;
    if (/apply|application|spender|pallet/.test(action)) return EVENT_TYPES.APPLICATION;
    if (/hold|rest|reference|idle/.test(action)) return EVENT_TYPES.REFERENCE;
    return EVENT_TYPES.GENERAL;
  }

  function baseIntentForRow(rows, index) {
    const row = rows[index];
    const nextRow = rows[index + 1];
    const motion = rowMotion(row, nextRow);
    const action = String(row?.action || "").toLowerCase();
    const preserveCommand = Boolean(row?.activeHold || row?.codingHold || row?.autocolBoundary);

    if (row?.terminalRest === true || /end curve|end of curve/.test(action)) {
      return { intent: INTENTS.HOLD, reason: "Terminal end-curve reference must remain stopped.", motion, preserveCommand: true };
    }
    if (preserveCommand && !motion.moving) {
      return { intent: Number(row?.cmd) === 7 ? INTENTS.ROTATE : INTENTS.HOLD, reason: "This row is an explicit controller boundary or active hold and keeps its generated command.", motion, preserveCommand: true };
    }
    if (!motion.moving) {
      return { intent: INTENTS.HOLD, reason: "No bottle-plate travel occurs before the next event.", motion, preserveCommand: false };
    }
    if (/special|spline|calculated/.test(action) || row?.specialMotion === true) {
      return { intent: INTENTS.SPECIAL, reason: "The event is marked for calculated or spline motion.", motion, preserveCommand: false };
    }

    const previousMotion = index > 0 ? rowMotion(rows[index - 1], row) : { moving: false };
    const followingMotion = rowMotion(nextRow, rows[index + 2]);
    const previousWasMoving = Boolean(previousMotion.moving);
    const nextIsMoving = Boolean(followingMotion.moving);
    const currentSpeed = number(row?.absSpeed, number(row?.speed));
    const nextSpeed = number(nextRow?.absSpeed, number(nextRow?.speed));
    const speedChanged = currentSpeed !== null && nextSpeed !== null && Math.abs(nextSpeed - currentSpeed) > 0.25;

    if (!previousWasMoving && !nextIsMoving) {
      return { intent: INTENTS.ROTATE, reason: "This is an isolated point-to-point bottle turn between stopped events.", motion, preserveCommand: false };
    }
    if (!previousWasMoving && nextIsMoving) {
      return { intent: INTENTS.START, reason: "A continuous bottle-rotation run begins at this event.", motion, preserveCommand: false };
    }
    if (previousWasMoving && !nextIsMoving) {
      return { intent: INTENTS.STOP, reason: "The continuous bottle-rotation run ends at the next event.", motion, preserveCommand: false };
    }
    if (speedChanged) {
      return { intent: INTENTS.CHANGE_SPEED, reason: "Adjacent moving events require a speed transition.", motion, preserveCommand: false };
    }
    return { intent: INTENTS.MAINTAIN, reason: "Bottle rotation continues through adjacent events at a steady speed.", motion, preserveCommand: false };
  }

  function normalizeIntentName(value) {
    const normalized = String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
    const aliases = {
      HOLD: INTENTS.HOLD,
      REST: INTENTS.HOLD,
      REFERENCE: INTENTS.HOLD,
      ROTATE: INTENTS.ROTATE,
      CORRECT: INTENTS.ROTATE,
      CORRECTION: INTENTS.ROTATE,
      START: INTENTS.START,
      STARTUP: INTENTS.START,
      MAINTAIN: INTENTS.MAINTAIN,
      CONTINUOUS: INTENTS.MAINTAIN,
      CHANGE_SPEED: INTENTS.CHANGE_SPEED,
      CHANGEOVER: INTENTS.CHANGE_SPEED,
      SPECIAL: INTENTS.SPECIAL,
      SPLINE: INTENTS.SPECIAL,
      STOP: INTENTS.STOP,
      END: INTENTS.STOP
    };
    return aliases[normalized] || null;
  }

  function effectiveProfileId(profileId, machineProfile) {
    const requested = String(profileId || "automatic").toLowerCase();
    if (requested !== "automatic") return requested;
    return ["AUTOCOL_FUTURE", "MULTIMODUL_FUTURE"].includes(String(machineProfile || "").toUpperCase())
      ? "continuous-motion"
      : "rest-correction";
  }

  function normalizeForProfile(step, profileId, customIntent) {
    if (step.preserveCommand) return step;
    if (profileId === "rest-correction") {
      return step.motion.moving
        ? { ...step, originalIntent: step.intent, intent: INTENTS.ROTATE, reason: `${step.reason} Rest / Correction converts motion to point-to-point Correction.` }
        : { ...step, intent: INTENTS.HOLD };
    }
    if (profileId === "special-spline") {
      return step.motion.moving
        ? { ...step, originalIntent: step.intent, intent: INTENTS.SPECIAL, reason: `${step.reason} Special / Spline requests calculated motion.` }
        : { ...step, intent: INTENTS.HOLD };
    }
    if (profileId.startsWith("custom-") && customIntent) {
      return step.motion.moving
        ? { ...step, originalIntent: step.intent, intent: customIntent, reason: `${step.reason} Custom profile requests ${customIntent.replaceAll("_", " ")}.` }
        : { ...step, intent: INTENTS.HOLD };
    }
    return step;
  }

  function commandForIntent(intent) {
    return INTENT_COMMANDS[intent] || null;
  }

  function profileSupportsCommand(machineProfile, command) {
    const driver = global.LabelerServoCommandDriver;
    if (!driver?.profileSupportsMove) return [3, 7].includes(Number(command));
    return driver.profileSupportsMove(machineProfile, command);
  }

  function fallbackCommand(step, row) {
    if (step.preserveCommand && Number.isFinite(Number(row?.cmd))) return Number(row.cmd);
    return step.motion.moving ? 7 : 3;
  }

  function buildPlan(rows, options = {}) {
    const sourceRows = Array.isArray(rows) ? rows : [];
    const requestedProfileId = options.profileId || "automatic";
    const machineProfile = String(options.machineProfile || "DEFAULT").toUpperCase();
    const profileId = effectiveProfileId(requestedProfileId, machineProfile);
    const customPattern = (Array.isArray(options.customIntents) ? options.customIntents : [])
      .map(normalizeIntentName)
      .filter((intent) => intent && intent !== INTENTS.HOLD);
    let movingOrdinal = 0;

    const steps = sourceRows.map((row, index) => {
      const base = baseIntentForRow(sourceRows, index);
      const customIntent = base.motion.moving && customPattern.length
        ? customPattern[movingOrdinal % customPattern.length]
        : null;
      if (base.motion.moving) movingOrdinal += 1;
      const normalized = normalizeForProfile(base, profileId, customIntent);
      const preserveBaseCommand = profileId === "rest-correction" && [3, 7].includes(Number(row?.cmd));
      const requestedCommand = preserveBaseCommand ? Number(row.cmd) : commandForIntent(normalized.intent);
      const supported = requestedCommand !== null && profileSupportsCommand(machineProfile, requestedCommand);
      const recommendedCommand = preserveBaseCommand
        ? Number(row.cmd)
        : supported
          ? requestedCommand
          : fallbackCommand(normalized, row);
      const commandDefinition = global.LabelerServoCommandDriver?.moveDefinition?.(recommendedCommand) || null;
      return {
        index,
        eventId: String(row?.motionEventId || `EV${String(index + 1).padStart(3, "0")}`),
        eventType: eventTypeForRow(row, index, sourceRows.length),
        hmi: row?.hmi ?? index + 1,
        tableAngle: number(row?.tableAngle),
        plateAngle: number(row?.plateAngle),
        action: String(row?.action || ""),
        baseCommand: number(row?.cmd, 3),
        requestedProfileId,
        profileId,
        machineProfile,
        requestedCommand,
        recommendedCommand,
        recommendedCommandName: commandDefinition?.name || `CMD ${recommendedCommand}`,
        fallbackUsed: !supported && requestedCommand !== null,
        fallbackReason: !supported && requestedCommand !== null
          ? `${machineProfile} does not enable CMD ${requestedCommand}; using CMD ${recommendedCommand}.`
          : "",
        ...normalized
      };
    });

    return {
      requestedProfileId,
      profileId,
      machineProfile,
      createdAt: new Date().toISOString(),
      steps,
      summary: steps.reduce((counts, step) => {
        counts[step.intent] = (counts[step.intent] || 0) + 1;
        return counts;
      }, {}),
      fallbackCount: steps.filter((step) => step.fallbackUsed).length
    };
  }

  function applyPlan(rows, plan) {
    const sourceRows = Array.isArray(rows) ? rows : [];
    const steps = Array.isArray(plan?.steps) ? plan.steps : [];
    const applied = sourceRows.map((row, index) => {
      const step = steps[index];
      if (!step) return { ...row };
      return {
        ...row,
        baseCmd: Number(row.cmd),
        cmd: Number(step.recommendedCommand),
        motionEventId: step.eventId,
        motionEventType: step.eventType,
        plannerIntent: step.intent,
        plannerReason: step.reason,
        plannerRequestedCommand: step.requestedCommand,
        plannerRecommendedCommand: step.recommendedCommand,
        plannerFallbackUsed: step.fallbackUsed,
        plannerFallbackReason: step.fallbackReason,
        appliedMotionProfileId: plan.requestedProfileId,
        resolvedMotionProfileId: plan.profileId,
        motionProfileApplied: true
      };
    });
    const finalRow = applied[applied.length - 1];
    if (finalRow && (finalRow.terminalRest === true || /end curve|end of curve/i.test(String(finalRow.action || "")))) {
      finalRow.cmd = 3;
      finalRow.plannerRecommendedCommand = 3;
      finalRow.plannerIntent = INTENTS.HOLD;
    }
    return applied;
  }

  global.LabelerMotionPlannerDriver = Object.freeze({
    INTENTS,
    EVENT_TYPES,
    INTENT_COMMANDS,
    number,
    rowMotion,
    eventTypeForRow,
    normalizeIntentName,
    effectiveProfileId,
    commandForIntent,
    buildPlan,
    applyPlan
  });
})(window);
