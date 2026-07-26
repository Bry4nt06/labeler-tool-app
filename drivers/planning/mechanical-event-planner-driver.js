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

  function slug(value, fallback = "GENERAL") {
    const normalized = String(value || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return normalized || fallback;
  }

  function normalizeObjects(options = {}) {
    const sources = [
      options.objects,
      options.map?.objects,
      options.aplObjects,
      options.coldGlueObjects
    ];
    const seen = new Set();
    const objects = [];
    sources.forEach((source) => {
      if (!Array.isArray(source)) return;
      source.forEach((item, index) => {
        if (!item || typeof item !== "object") return;
        const key = String(item.id || `${item.kind || item.type || "object"}-${item.station || 0}-${item.start ?? item.angle ?? index}-${item.end ?? index}`);
        if (seen.has(key)) return;
        seen.add(key);
        objects.push({ ...item, id: item.id || key });
      });
    });
    return objects;
  }

  function aggregateForAction(action, row) {
    const explicit = number(row?.aggregate, number(row?.station));
    if (explicit !== null) return Math.max(1, Math.round(explicit));
    const match = String(action || "").match(/(?:agg(?:regate)?|station)\s*[-#:]?\s*(\d+)/i);
    return match ? Math.max(1, Number(match[1])) : null;
  }

  function sectionForAction(action, aggregate) {
    const text = String(action || "").toLowerCase();
    if (/neck/.test(text)) return "neck";
    if (/body/.test(text)) return "body";
    if (/back/.test(text)) return "back";
    if ([1, 2].includes(Number(aggregate))) return "neck";
    if ([3, 4].includes(Number(aggregate))) return "body";
    if ([5, 6].includes(Number(aggregate))) return "back";
    return "general";
  }

  function eventTypeForAction(action, row, index, total) {
    const text = String(action || "").toLowerCase();
    if (index === 0 || /zero line|startup|start curve|start shape/.test(text)) return EVENT_TYPES.STARTUP;
    if (row?.terminalRest === true || index === total - 1 || /end\s*(?:of\s*)?curve|exit/.test(text)) return EVENT_TYPES.EXIT;
    if (row?.codingHold === true || /cod(?:e|ing)|coder/.test(text)) return EVENT_TYPES.CODING;
    if (row?.sensorId || /sensor/.test(text)) return EVENT_TYPES.SENSOR;
    if (/inspect|vision|camera/.test(text)) return EVENT_TYPES.INSPECTION;
    if (/wipe|brush|roller|pad/.test(text)) return EVENT_TYPES.WIPE;
    if (/apply|application|spender|pallet/.test(text)) return EVENT_TYPES.APPLICATION;
    if (/hold|rest|reference|idle/.test(text)) return EVENT_TYPES.REFERENCE;
    return EVENT_TYPES.GENERAL;
  }

  function stageForAction(action, type) {
    const text = String(action || "").toLowerCase();
    const wipeTurn = text.match(/wipe\s*turn\s*(\d+)/i);
    if (wipeTurn) return `TURN-${wipeTurn[1]}`;
    if (/wipe.*hold|hold.*wipe/.test(text)) return "WIPE-HOLD";
    if (/turn.*application/.test(text)) return "APPLICATION-ORIENT";
    if (/hold.*application|application.*hold/.test(text)) return "APPLICATION-HOLD";
    if (/turn.*cod|orient.*cod/.test(text)) return "CODING-ORIENT";
    if (/hold.*cod/.test(text)) return "CODING-HOLD";
    if (/reference/.test(text)) return "REFERENCE";
    if (/zero line/.test(text)) return "ZERO";
    if (type === EVENT_TYPES.EXIT) return "END-CURVE";
    return slug(type, "EVENT");
  }

  function objectKindMatches(type, item) {
    const kind = String(item?.kind || item?.type || "").toLowerCase();
    const name = String(item?.name || "").toLowerCase();
    const text = `${kind} ${name}`;
    if (type === EVENT_TYPES.APPLICATION) return /spender|applicator|pallet|aggregate|gripper/.test(text);
    if (type === EVENT_TYPES.WIPE) return /pad|roller|brush|wipe/.test(text);
    if (type === EVENT_TYPES.CODING) return /cod/.test(text);
    if (type === EVENT_TYPES.SENSOR) return /sensor/.test(text);
    if (type === EVENT_TYPES.INSPECTION) return /inspect|vision|camera/.test(text);
    return false;
  }

  function objectAngles(item) {
    const candidates = [
      item?.angle,
      item?.start,
      item?.outerStart,
      item?.innerStart,
      item?.spenderAngle
    ].map((value) => number(value)).filter((value) => value !== null);
    const endCandidates = [
      item?.end,
      item?.outerEnd,
      item?.innerEnd
    ].map((value) => number(value)).filter((value) => value !== null);
    return {
      start: candidates.length ? Math.min(...candidates) : null,
      end: endCandidates.length ? Math.max(...endCandidates) : candidates[0] ?? null
    };
  }

  function matchingObjects(objects, type, aggregate, tableAngle) {
    return objects
      .filter((item) => {
        const station = number(item?.station, number(item?.aggregate));
        if (aggregate !== null && station !== null && Number(station) !== Number(aggregate)) return false;
        return objectKindMatches(type, item);
      })
      .map((item) => ({ item, angles: objectAngles(item) }))
      .sort((a, b) => {
        const aDistance = a.angles.start === null || tableAngle === null ? Infinity : Math.abs(a.angles.start - tableAngle);
        const bDistance = b.angles.start === null || tableAngle === null ? Infinity : Math.abs(b.angles.start - tableAngle);
        return aDistance - bDistance;
      })
      .slice(0, 4)
      .map(({ item }) => item);
  }

  function segmentMotion(rows, index) {
    const row = rows[index];
    const next = rows[index + 1];
    const tableStart = number(row?.tableAngle);
    const tableEnd = number(next?.tableAngle);
    const plateStart = number(row?.plateAngle);
    const plateEnd = number(next?.plateAngle);
    const tableTravel = tableStart !== null && tableEnd !== null ? tableEnd - tableStart : 0;
    const plateTravel = plateStart !== null && plateEnd !== null ? plateEnd - plateStart : 0;
    return {
      tableStart,
      tableEnd,
      plateStart,
      plateEnd,
      tableTravel,
      plateTravel,
      moving: Boolean(next && Math.abs(plateTravel) > 0.001),
      ratio: Math.abs(tableTravel) > 0.001 ? Math.abs(plateTravel / tableTravel) : null
    };
  }

  function correctionChainAssignments(rows) {
    const assignments = rows.map(() => ({ chainId: null, chainPosition: null, referenceRole: null }));
    let chainNumber = 0;
    let openChain = null;
    let lastRestIndex = null;

    rows.forEach((row, index) => {
      const command = Number(row?.cmd);
      if (command === 3) {
        if (openChain) {
          assignments[index] = { ...assignments[index], chainId: openChain.id, referenceRole: "end" };
          openChain = null;
        }
        lastRestIndex = index;
        return;
      }
      if (command !== 7) {
        openChain = null;
        lastRestIndex = null;
        return;
      }
      if (!openChain) {
        chainNumber += 1;
        const id = `CC${String(chainNumber).padStart(2, "0")}`;
        openChain = { id, indexes: [] };
        if (lastRestIndex !== null) {
          assignments[lastRestIndex] = { ...assignments[lastRestIndex], chainId: id, referenceRole: "start" };
        }
      }
      openChain.indexes.push(index);
      assignments[index] = {
        ...assignments[index],
        chainId: openChain.id,
        chainPosition: openChain.indexes.length === 1 ? "first" : "middle"
      };
    });

    const chains = new Map();
    assignments.forEach((assignment, index) => {
      if (!assignment.chainId || Number(rows[index]?.cmd) !== 7) return;
      if (!chains.has(assignment.chainId)) chains.set(assignment.chainId, []);
      chains.get(assignment.chainId).push(index);
    });
    chains.forEach((indexes) => {
      if (!indexes.length) return;
      assignments[indexes.at(-1)].chainPosition = indexes.length === 1 ? "single" : "last";
    });
    return assignments;
  }

  function buildTimeline(rows, options = {}) {
    const sourceRows = Array.isArray(rows) ? rows : [];
    const objects = normalizeObjects(options);
    const chains = correctionChainAssignments(sourceRows);
    const eventCounts = new Map();

    const events = sourceRows.map((row, index) => {
      const action = String(row?.action || "Mechanical event");
      const aggregate = aggregateForAction(action, row);
      const section = sectionForAction(action, aggregate);
      const type = eventTypeForAction(action, row, index, sourceRows.length);
      const stage = stageForAction(action, type);
      const motion = segmentMotion(sourceRows, index);
      const processId = aggregate !== null
        ? `PROC-A${aggregate}-${slug(section)}`
        : `PROC-${slug(type)}`;
      const eventBase = aggregate !== null
        ? `ME-A${aggregate}-${slug(section)}-${slug(stage)}`
        : `ME-${slug(type)}-${slug(stage)}`;
      const occurrence = (eventCounts.get(eventBase) || 0) + 1;
      eventCounts.set(eventBase, occurrence);
      const eventId = occurrence === 1 ? eventBase : `${eventBase}-${occurrence}`;
      const matches = matchingObjects(objects, type, aggregate, motion.tableStart);
      const chain = chains[index] || {};
      const requiredIntent = Number(row?.cmd) === 7 || motion.moving ? INTENTS.ROTATE : INTENTS.HOLD;

      return {
        index,
        eventId,
        processId,
        type,
        stage,
        aggregate,
        station: aggregate,
        section,
        action,
        hmi: row?.hmi ?? index + 1,
        plc: row?.plc ?? index,
        baseCommand: number(row?.cmd, 3),
        requiredIntent,
        tableStart: motion.tableStart,
        tableEnd: motion.tableEnd,
        plateStart: motion.plateStart,
        plateTarget: motion.plateEnd,
        tableTravel: motion.tableTravel,
        plateTravel: motion.plateTravel,
        moving: motion.moving,
        speedRatio: motion.ratio,
        objectIds: matches.map((item) => String(item.id)),
        objectNames: matches.map((item) => String(item.name || item.kind || item.type || item.id)),
        correctionChainId: chain.chainId || null,
        correctionChainPosition: chain.chainPosition || null,
        referenceRole: chain.referenceRole || null,
        terminal: row?.terminalRest === true || type === EVENT_TYPES.EXIT
      };
    });

    const processMap = new Map();
    events.forEach((event) => {
      if (!processMap.has(event.processId)) {
        processMap.set(event.processId, {
          processId: event.processId,
          aggregate: event.aggregate,
          section: event.section,
          eventIds: [],
          startTableAngle: event.tableStart,
          endTableAngle: event.tableEnd,
          objectIds: new Set()
        });
      }
      const process = processMap.get(event.processId);
      process.eventIds.push(event.eventId);
      if (event.tableStart !== null && (process.startTableAngle === null || event.tableStart < process.startTableAngle)) process.startTableAngle = event.tableStart;
      if (event.tableEnd !== null && (process.endTableAngle === null || event.tableEnd > process.endTableAngle)) process.endTableAngle = event.tableEnd;
      event.objectIds.forEach((id) => process.objectIds.add(id));
    });

    const processes = [...processMap.values()].map((process) => ({
      ...process,
      objectIds: [...process.objectIds]
    }));

    return {
      source: "mechanical-events",
      machineType: String(options.machineType || options.map?.machineType || "TopModul"),
      applicationMode: String(options.applicationMode || "apl"),
      events,
      processes,
      summary: events.reduce((counts, event) => {
        counts[event.type] = (counts[event.type] || 0) + 1;
        return counts;
      }, {})
    };
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

  function supported(machineProfile, command) {
    const driver = global.LabelerServoCommandDriver;
    return driver?.profileSupportsMove ? driver.profileSupportsMove(machineProfile, command) : [3, 7].includes(Number(command));
  }

  function continuousIntent(events, index) {
    const event = events[index];
    if (!event?.moving) return INTENTS.HOLD;
    if (/special|spline|calculated/i.test(event.action)) return INTENTS.SPECIAL;
    const previousMoving = Boolean(events[index - 1]?.moving);
    const nextMoving = Boolean(events[index + 1]?.moving);
    const nextRatio = number(events[index + 1]?.speedRatio);
    const ratioChanged = event.speedRatio !== null && nextRatio !== null && Math.abs(event.speedRatio - nextRatio) > 0.25;
    if (!previousMoving && nextMoving) return INTENTS.START;
    if (previousMoving && !nextMoving) return INTENTS.STOP;
    if (previousMoving && nextMoving && ratioChanged) return INTENTS.CHANGE_SPEED;
    if (previousMoving && nextMoving) return INTENTS.MAINTAIN;
    return INTENTS.ROTATE;
  }

  function buildPlan(rows, options = {}) {
    const sourceRows = Array.isArray(rows) ? rows : [];
    const timeline = buildTimeline(sourceRows, options);
    const requestedProfileId = options.profileId || "automatic";
    const machineProfile = String(options.machineProfile || "DEFAULT").toUpperCase();
    const profileId = effectiveProfileId(requestedProfileId, machineProfile);
    const customPattern = (Array.isArray(options.customIntents) ? options.customIntents : [])
      .map(normalizeIntentName)
      .filter((intent) => intent && intent !== INTENTS.HOLD);
    let movingOrdinal = 0;

    const steps = timeline.events.map((event, index) => {
      let intent = event.requiredIntent;
      let reason = `${event.type} mechanical event ${event.eventId} requires ${event.moving ? "bottle rotation" : "a held reference"}.`;
      const preserveCommand = profileId === "rest-correction" && [3, 7].includes(Number(event.baseCommand));

      if (event.terminal) {
        intent = INTENTS.HOLD;
        reason = "The mechanical timeline ends at a stopped CMD 3 reference.";
      } else if (profileId === "special-spline" && event.moving) {
        intent = INTENTS.SPECIAL;
        reason = `${event.eventId} is translated as calculated spline motion.`;
      } else if (profileId === "continuous-motion") {
        intent = continuousIntent(timeline.events, index);
        reason = `${event.eventId} is classified from adjacent mechanical events as ${intent.replaceAll("_", " ")}.`;
      } else if (profileId.startsWith("custom-") && event.moving && customPattern.length) {
        intent = customPattern[movingOrdinal % customPattern.length];
        reason = `${event.eventId} uses the custom ${intent.replaceAll("_", " ")} intent.`;
      } else if (profileId === "rest-correction") {
        intent = event.moving || Number(event.baseCommand) === 7 ? INTENTS.ROTATE : INTENTS.HOLD;
        reason = event.correctionChainId
          ? `${event.eventId} belongs to TopModul correction chain ${event.correctionChainId}.`
          : reason;
      }
      if (event.moving) movingOrdinal += 1;

      const requestedCommand = preserveCommand ? Number(event.baseCommand) : INTENT_COMMANDS[intent] || null;
      const commandSupported = requestedCommand !== null && supported(machineProfile, requestedCommand);
      const recommendedCommand = commandSupported
        ? requestedCommand
        : event.moving ? 7 : 3;
      const definition = global.LabelerServoCommandDriver?.moveDefinition?.(recommendedCommand) || null;

      return {
        index,
        eventId: event.eventId,
        mechanicalEventId: event.eventId,
        eventType: event.type,
        processId: event.processId,
        aggregate: event.aggregate,
        station: event.station,
        section: event.section,
        stage: event.stage,
        objectIds: event.objectIds,
        objectNames: event.objectNames,
        correctionChainId: event.correctionChainId,
        correctionChainPosition: event.correctionChainPosition,
        referenceRole: event.referenceRole,
        hmi: event.hmi,
        tableAngle: event.tableStart,
        plateAngle: event.plateStart,
        tableEnd: event.tableEnd,
        plateTarget: event.plateTarget,
        action: event.action,
        baseCommand: event.baseCommand,
        requestedProfileId,
        profileId,
        machineProfile,
        intent,
        reason,
        motion: {
          tableTravel: event.tableTravel,
          plateTravel: event.plateTravel,
          moving: event.moving,
          ratio: event.speedRatio
        },
        preserveCommand,
        requestedCommand,
        recommendedCommand,
        recommendedCommandName: definition?.name || `CMD ${recommendedCommand}`,
        fallbackUsed: !commandSupported && requestedCommand !== null,
        fallbackReason: !commandSupported && requestedCommand !== null
          ? `${machineProfile} does not enable CMD ${requestedCommand}; using CMD ${recommendedCommand}.`
          : ""
      };
    });

    return {
      source: "mechanical-events",
      timelineSource: "mechanical-events",
      requestedProfileId,
      profileId,
      machineProfile,
      machineType: timeline.machineType,
      applicationMode: timeline.applicationMode,
      createdAt: new Date().toISOString(),
      events: timeline.events,
      processes: timeline.processes,
      steps,
      summary: steps.reduce((counts, step) => {
        counts[step.intent] = (counts[step.intent] || 0) + 1;
        return counts;
      }, {}),
      eventSummary: timeline.summary,
      fallbackCount: steps.filter((step) => step.fallbackUsed).length
    };
  }

  global.LabelerMechanicalEventPlannerDriver = Object.freeze({
    INTENTS,
    EVENT_TYPES,
    INTENT_COMMANDS,
    buildTimeline,
    buildPlan,
    segmentMotion,
    correctionChainAssignments,
    normalizeIntentName,
    effectiveProfileId
  });
})(window);
