(function (global) {
  "use strict";

  const EPSILON = 0.001;

  function number(value, fallback = null) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function text(value, fallback = "") {
    const result = String(value ?? "").trim();
    return result || fallback;
  }

  function normalizeAngle(value) {
    const numeric = number(value, 0);
    const normalized = numeric % 360;
    return normalized < 0 ? normalized + 360 : normalized;
  }

  function list(value) {
    if (Array.isArray(value)) return value.filter((entry) => entry !== null && entry !== undefined && String(entry).trim() !== "");
    if (value === null || value === undefined || value === "") return [];
    return [value];
  }

  function unique(values) {
    return [...new Set(values.map((value) => String(value)).filter(Boolean))];
  }

  function stepForRow(plan, row, index) {
    const steps = Array.isArray(plan?.steps) ? plan.steps : [];
    const eventId = text(row?.motionEventId || row?.mechanicalEventId);
    if (eventId) {
      const matching = steps.find((step) => text(step?.eventId || step?.mechanicalEventId) === eventId);
      if (matching) return matching;
    }
    return steps[index] || null;
  }

  function commandDefinition(command, commandDriver) {
    return commandDriver?.moveDefinition?.(command) || null;
  }

  function buildFrames(rows, options = {}) {
    const source = Array.isArray(rows) ? rows : [];
    const commandDriver = options.commandDriver || global.LabelerServoCommandDriver;
    const plan = options.plan || null;
    let cumulativeNet = 0;
    let cumulativeAbsolute = 0;

    return source.map((row, index) => {
      const next = source[index + 1] || null;
      const previous = source[index - 1] || null;
      const step = stepForRow(plan, row, index);
      const command = number(row?.cmd, 3);
      const tableStart = number(row?.tableAngle, 0);
      const tableEnd = next ? number(next?.tableAngle, tableStart) : tableStart;
      const plateStart = number(row?.plateAngle, 0);
      const plateEnd = next ? number(next?.plateAngle, plateStart) : plateStart;
      const tableTravel = number(row?.tableTravel, tableEnd - tableStart);
      const plateTravel = number(row?.plateTravel, plateEnd - plateStart);
      const definition = commandDefinition(command, commandDriver);
      const eventId = text(
        row?.motionEventId
        || row?.mechanicalEventId
        || step?.eventId
        || step?.mechanicalEventId,
        `EV${String(index + 1).padStart(3, "0")}`
      );
      const processId = text(row?.processId || step?.processId, eventId);
      const chainId = text(
        row?.machineCorrectionChainId
        || row?.correctionChainId
        || step?.correctionChainId
      );
      const eventType = text(row?.motionEventType || step?.eventType, "GENERAL").toUpperCase();
      const aggregate = number(row?.aggregate, number(row?.station, number(step?.aggregate, number(step?.station))));
      const objectIds = unique([
        ...list(row?.objectIds),
        ...list(step?.objectIds)
      ]);
      const objectNames = unique([
        ...list(row?.objectNames),
        ...list(step?.objectNames)
      ]);
      const reason = text(
        row?.plannerReason
        || step?.reason
        || row?.translationReason
        || row?.action,
        "Generated from the active mechanical program."
      );
      const cumulativeNetBefore = cumulativeNet;
      const cumulativeAbsoluteBefore = cumulativeAbsolute;
      cumulativeNet += plateTravel;
      cumulativeAbsolute += Math.abs(plateTravel);
      const previousCommand = number(previous?.cmd);
      const referenceRole = text(row?.machineReferenceRole || row?.referenceRole || step?.referenceRole);
      const terminal = Boolean(row?.terminalRest)
        || /end\s*(?:of\s*)?curve|end curve.*rest|hold for coding/i.test(text(row?.action));
      const pauseReference = command === 3
        && (referenceRole === "end" || previousCommand === 7 || terminal);

      return {
        index,
        hmi: row?.hmi ?? index + 1,
        plc: row?.plc ?? index,
        command,
        commandName: text(definition?.name, `CMD ${command}`),
        commandDescription: text(definition?.description),
        action: text(row?.action, "Servo move"),
        eventId,
        processId,
        eventType,
        aggregate,
        section: text(row?.section || step?.section),
        stage: text(row?.stage || step?.stage),
        chainId,
        chainPosition: text(row?.machineCorrectionChainPosition || row?.correctionChainPosition || step?.correctionChainPosition),
        referenceRole,
        plannerIntent: text(row?.plannerIntent || step?.intent, command === 7 ? "ROTATE" : "HOLD"),
        reason,
        objectIds,
        objectNames,
        tableStart,
        tableEnd,
        tableTravel,
        plateStart,
        plateEnd,
        plateTravel,
        speedRatio: Math.abs(tableTravel) > EPSILON ? Math.abs(plateTravel / tableTravel) : 0,
        cumulativeNetBefore,
        cumulativeNetAfter: cumulativeNet,
        cumulativeAbsoluteBefore,
        cumulativeAbsoluteAfter: cumulativeAbsolute,
        isReference: command === 3,
        pauseReference,
        terminal,
        row,
        step
      };
    });
  }

  function frameProgress(frame, tableAngle) {
    if (!frame) return 0;
    const start = number(frame.tableStart, 0);
    const end = number(frame.tableEnd, start);
    if (end <= start + EPSILON) return 0;
    let current = number(tableAngle, start);
    const normalizedCurrent = normalizeAngle(current);
    const normalizedStart = normalizeAngle(start);
    current = normalizedCurrent;
    if (normalizeAngle(end) < normalizedStart && current < normalizedStart) current += 360;
    const unwrappedStart = normalizedStart;
    let unwrappedEnd = normalizeAngle(end);
    if (unwrappedEnd <= unwrappedStart + EPSILON) unwrappedEnd += 360;
    return Math.max(0, Math.min(1, (current - unwrappedStart) / (unwrappedEnd - unwrappedStart)));
  }

  function indexAtAngle(frames, tableAngle, preferredHmi = null) {
    if (!Array.isArray(frames) || !frames.length) return -1;
    if (preferredHmi !== null && preferredHmi !== undefined) {
      const preferred = frames.findIndex((frame) => Number(frame.hmi) === Number(preferredHmi));
      if (preferred >= 0) {
        const frame = frames[preferred];
        const progress = frameProgress(frame, tableAngle);
        if (progress > 0 || Math.abs(normalizeAngle(frame.tableStart) - normalizeAngle(tableAngle)) <= 0.05) return preferred;
      }
    }

    const angle = normalizeAngle(tableAngle);
    let selected = 0;
    frames.forEach((frame, index) => {
      if (normalizeAngle(frame.tableStart) <= angle + EPSILON) selected = index;
    });
    return selected;
  }

  function snapshot(frames, tableAngle, preferredHmi = null) {
    const index = indexAtAngle(frames, tableAngle, preferredHmi);
    const frame = index >= 0 ? frames[index] : null;
    const progress = frameProgress(frame, tableAngle);
    return {
      index,
      frame,
      progress,
      cumulativeNet: frame ? frame.cumulativeNetBefore + frame.plateTravel * progress : 0,
      cumulativeAbsolute: frame ? frame.cumulativeAbsoluteBefore + Math.abs(frame.plateTravel) * progress : 0,
      bottleAngle: frame ? frame.plateStart + frame.plateTravel * progress : 0
    };
  }

  function nextIndex(frames, currentIndex, direction = 1, mode = "hmi") {
    if (!Array.isArray(frames) || !frames.length) return -1;
    const step = direction < 0 ? -1 : 1;
    const start = Math.max(0, Math.min(frames.length - 1, Number.isInteger(currentIndex) ? currentIndex : 0));
    if (mode === "event") {
      const currentEvent = frames[start]?.eventId;
      let index = start + step;
      while (index >= 0 && index < frames.length && frames[index]?.eventId === currentEvent) index += step;
      return Math.max(0, Math.min(frames.length - 1, index));
    }
    if (mode === "process") {
      const currentProcess = frames[start]?.processId;
      let index = start + step;
      while (index >= 0 && index < frames.length && frames[index]?.processId === currentProcess) index += step;
      return Math.max(0, Math.min(frames.length - 1, index));
    }
    return Math.max(0, Math.min(frames.length - 1, start + step));
  }

  function eventOptions(frames) {
    const seen = new Set();
    return (Array.isArray(frames) ? frames : []).filter((frame) => {
      if (seen.has(frame.eventId)) return false;
      seen.add(frame.eventId);
      return true;
    }).map((frame) => ({
      eventId: frame.eventId,
      processId: frame.processId,
      hmi: frame.hmi,
      label: `${frame.eventId} • HMI ${frame.hmi} • ${frame.action}`
    }));
  }

  function programKey(frame, index) {
    const eventId = text(frame?.eventId);
    return eventId && !/^EV\d+$/.test(eventId) ? `event:${eventId}` : `index:${index}`;
  }

  function comparePrograms(generatedRows, customRows, options = {}) {
    const generated = buildFrames(generatedRows, options);
    const custom = Array.isArray(customRows) ? buildFrames(customRows, options) : [];
    if (!custom.length) {
      return {
        available: false,
        matches: true,
        generatedCount: generated.length,
        customCount: 0,
        mismatchCount: 0,
        mismatches: []
      };
    }

    const customByKey = new Map(custom.map((frame, index) => [programKey(frame, index), frame]));
    const mismatches = [];
    generated.forEach((frame, index) => {
      const key = programKey(frame, index);
      const candidate = customByKey.get(key) || custom[index] || null;
      if (!candidate) {
        mismatches.push({ type: "missing-custom-row", hmi: frame.hmi, eventId: frame.eventId, message: `${frame.eventId} is missing from the custom simulation.` });
        return;
      }
      if (Number(frame.command) !== Number(candidate.command)) {
        mismatches.push({ type: "command", hmi: frame.hmi, eventId: frame.eventId, message: `${frame.eventId} uses CMD ${frame.command} in generation and CMD ${candidate.command} in custom simulation.` });
      }
      if (Math.abs(frame.tableStart - candidate.tableStart) > 0.1) {
        mismatches.push({ type: "table-angle", hmi: frame.hmi, eventId: frame.eventId, message: `${frame.eventId} table angle differs by ${Math.abs(frame.tableStart - candidate.tableStart).toFixed(1)}°.` });
      }
      if (Math.abs(frame.plateStart - candidate.plateStart) > 0.1) {
        mismatches.push({ type: "plate-angle", hmi: frame.hmi, eventId: frame.eventId, message: `${frame.eventId} bottle angle differs by ${Math.abs(frame.plateStart - candidate.plateStart).toFixed(1)}°.` });
      }
    });

    if (custom.length > generated.length) {
      custom.slice(generated.length).forEach((frame) => {
        mismatches.push({ type: "extra-custom-row", hmi: frame.hmi, eventId: frame.eventId, message: `${frame.eventId} exists only in the custom simulation.` });
      });
    }

    return {
      available: true,
      matches: mismatches.length === 0,
      generatedCount: generated.length,
      customCount: custom.length,
      mismatchCount: mismatches.length,
      mismatches
    };
  }

  function mapObjectList(options = {}) {
    const sources = [options.objects, options.map?.objects, options.aplObjects, options.coldGlueObjects];
    const objects = [];
    const seen = new Set();
    sources.forEach((source) => {
      if (!Array.isArray(source)) return;
      source.forEach((item, index) => {
        if (!item || typeof item !== "object") return;
        const id = text(item.id, `${item.kind || item.type || "object"}-${index}`);
        if (seen.has(id)) return;
        seen.add(id);
        objects.push({ ...item, id });
      });
    });
    return objects;
  }

  function detectMapMismatches(frames, options = {}) {
    const objects = mapObjectList(options);
    const objectIds = new Set(objects.map((item) => String(item.id)));
    const enabledStations = new Set(list(options.enabledStations).map(Number).filter(Number.isFinite));
    const mismatches = [];
    const seen = new Set();

    (Array.isArray(frames) ? frames : []).forEach((frame) => {
      frame.objectIds.forEach((id) => {
        if (objectIds.has(String(id))) return;
        const key = `missing-object|${frame.eventId}|${id}`;
        if (seen.has(key)) return;
        seen.add(key);
        mismatches.push({
          level: "bad",
          type: "missing-object",
          hmi: frame.hmi,
          eventId: frame.eventId,
          objectId: id,
          message: `${frame.eventId} references map object ${id}, but that object is not present on the active map.`
        });
      });

      if (enabledStations.size && Number.isFinite(frame.aggregate)
        && !enabledStations.has(Number(frame.aggregate))
        && !["STARTUP", "REFERENCE", "EXIT", "GENERAL"].includes(frame.eventType)) {
        const key = `disabled-station|${frame.eventId}|${frame.aggregate}`;
        if (seen.has(key)) return;
        seen.add(key);
        mismatches.push({
          level: "bad",
          type: "disabled-station",
          hmi: frame.hmi,
          eventId: frame.eventId,
          station: frame.aggregate,
          message: `${frame.eventId} belongs to Aggregate ${frame.aggregate}, but that station is disabled on the active map.`
        });
      }
    });

    return {
      valid: mismatches.every((item) => item.level !== "bad"),
      mismatchCount: mismatches.length,
      mismatches
    };
  }

  function mismatchesForFrame(mapResult, frame) {
    if (!frame) return [];
    return (mapResult?.mismatches || []).filter((item) => Number(item.hmi) === Number(frame.hmi) || item.eventId === frame.eventId);
  }

  function explainFrame(frame) {
    if (!frame) return "No active servo command.";
    const parts = [];
    parts.push(`${frame.eventId} executes ${frame.commandName} (CMD ${frame.command}) for ${frame.action}.`);
    if (frame.reason) parts.push(frame.reason);
    if (frame.chainId) {
      const position = frame.chainPosition ? ` (${frame.chainPosition})` : "";
      parts.push(`It belongs to correction chain ${frame.chainId}${position}; the chain remains referenced by its surrounding CMD 3 rows.`);
    }
    if (Math.abs(frame.plateTravel) > EPSILON) {
      parts.push(`The move rotates the bottle ${Math.abs(frame.plateTravel).toFixed(1)}° over ${Math.abs(frame.tableTravel).toFixed(1)}° of table travel.`);
    } else {
      parts.push("The bottle angle is held through this table interval.");
    }
    if (frame.commandDescription) parts.push(frame.commandDescription);
    return parts.join(" ");
  }

  global.LabelerServoReplayDriver = Object.freeze({
    EPSILON,
    number,
    normalizeAngle,
    buildFrames,
    frameProgress,
    indexAtAngle,
    snapshot,
    nextIndex,
    eventOptions,
    comparePrograms,
    detectMapMismatches,
    mismatchesForFrame,
    explainFrame
  });
})(window);
