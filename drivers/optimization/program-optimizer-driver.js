(function (global) {
  "use strict";

  const EPSILON = 0.001;
  const DEFAULT_SAFETY_FACTOR = 0.8;
  const DEFAULT_MIN_WINDOW_DEG = 1.5;

  function number(value, fallback = null) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function text(value, fallback = "") {
    const resolved = String(value ?? "").trim();
    return resolved || fallback;
  }

  function cloneRows(rows) {
    return (Array.isArray(rows) ? rows : []).map((row) => ({ ...row }));
  }

  function normalizedAction(value) {
    return text(value)
      .toLowerCase()
      .replace(/agg(?:regate)?\s*[-#:]?\s*\d+/g, "aggregate")
      .replace(/station\s*[-#:]?\s*\d+/g, "station")
      .replace(/\s+/g, " ")
      .trim();
  }

  function aggregateFor(row) {
    const explicit = number(row?.aggregate, number(row?.station));
    if (explicit !== null) return Math.max(1, Math.round(explicit));
    const match = text(row?.action).match(/(?:agg(?:regate)?|station)\s*[-#:]?\s*(\d+)/i);
    return match ? Math.max(1, Number(match[1])) : null;
  }

  function commandMoves(command) {
    return [1, 2, 4, 5, 6, 7].includes(Number(command));
  }

  function buildFrames(rows, options = {}) {
    const source = Array.isArray(rows) ? rows : [];
    const replay = global.LabelerServoReplayDriver;
    if (replay?.buildFrames) {
      return replay.buildFrames(source, {
        plan: options.plan || null,
        commandDriver: options.commandDriver || global.LabelerServoCommandDriver
      });
    }

    return source.map((row, index) => {
      const next = source[index + 1] || null;
      const tableStart = number(row?.tableAngle, 0);
      const tableEnd = next ? number(next?.tableAngle, tableStart) : tableStart;
      const plateStart = number(row?.plateAngle, 0);
      const plateEnd = next ? number(next?.plateAngle, plateStart) : plateStart;
      const tableTravel = tableEnd - tableStart;
      const plateTravel = commandMoves(row?.cmd) ? plateEnd - plateStart : 0;
      return {
        index,
        hmi: row?.hmi ?? index + 1,
        plc: row?.plc ?? index,
        command: number(row?.cmd, 3),
        action: text(row?.action, "Servo move"),
        eventId: text(row?.motionEventId || row?.mechanicalEventId, `EV${String(index + 1).padStart(3, "0")}`),
        processId: text(row?.processId),
        aggregate: aggregateFor(row),
        section: text(row?.section),
        chainId: text(row?.machineCorrectionChainId || row?.correctionChainId),
        objectIds: Array.isArray(row?.objectIds) ? row.objectIds.map(String) : [],
        tableStart,
        tableEnd,
        tableTravel,
        plateStart,
        plateEnd,
        plateTravel,
        speedRatio: Math.abs(tableTravel) > EPSILON ? Math.abs(plateTravel / tableTravel) : 0,
        terminal: row?.terminalRest === true,
        row
      };
    });
  }

  function objectRange(item) {
    const start = number(item?.angle, number(item?.start));
    if (start === null) return null;
    let end = number(item?.end);
    if (end === null) end = start + Math.max(0, number(item?.wipeSpanDeg, 0));
    if (end < start) end += 360;
    return { start, end: Math.max(start, end) };
  }

  function mapObjects(options = {}) {
    const sources = [options.objects, options.map?.objects, options.aplObjects, options.coldGlueObjects];
    const result = [];
    const seen = new Set();
    sources.forEach((source) => {
      if (!Array.isArray(source)) return;
      source.forEach((item, index) => {
        if (!item || typeof item !== "object") return;
        const id = text(item.id, `${item.kind || item.type || "object"}-${index}`);
        if (seen.has(id)) return;
        seen.add(id);
        result.push({ ...item, id });
      });
    });
    return result;
  }

  function wipeObject(item) {
    return /pad|roller|brush|wipe/i.test(`${item?.kind || ""} ${item?.type || ""} ${item?.name || ""}`);
  }

  function matchingObjects(frame, objects) {
    const explicit = new Set((frame?.objectIds || []).map(String));
    const byId = explicit.size ? objects.filter((item) => explicit.has(String(item.id))) : [];
    if (byId.length) return byId;
    if (!Number.isFinite(frame?.aggregate)) return [];
    return objects.filter((item) => Number(item?.station ?? item?.aggregate) === Number(frame.aggregate) && wipeObject(item));
  }

  function overlap(startA, endA, startB, endB) {
    return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
  }

  function protectedReference(row) {
    const action = text(row?.action);
    return row?.terminalRest === true
      || row?.codingHold === true
      || row?.autocolBoundary
      || row?.machineReferenceRole
      || /zero|application|coding|sensor|inspection|end\s*(?:of\s*)?curve|hold\s+for|wipe\s+hold/i.test(action);
  }

  function genericReference(row) {
    return /^(?:rest|reference|idle|hold)$/i.test(text(row?.action));
  }

  function diagnostic(level, code, category, frame, message, recommendation, extra = {}) {
    return {
      level,
      code,
      category,
      hmi: frame?.hmi,
      eventId: frame?.eventId,
      message,
      recommendation,
      ...extra
    };
  }

  function correctionChains(frames) {
    const chains = [];
    let current = [];
    const flush = () => {
      if (current.length) chains.push(current);
      current = [];
    };
    frames.forEach((frame) => {
      if (Number(frame.command) === 7) {
        if (!current.length) current = [frame];
        else {
          const sameNamedChain = frame.chainId && current[0].chainId && frame.chainId === current[0].chainId;
          const adjacent = frame.index === current.at(-1).index + 1;
          if (sameNamedChain || adjacent) current.push(frame);
          else {
            flush();
            current = [frame];
          }
        }
      } else {
        flush();
      }
    });
    flush();
    return chains;
  }

  function safeContactEnvelope(chain, objects) {
    const matches = [];
    chain.forEach((frame) => matchingObjects(frame, objects).forEach((item) => matches.push(item)));
    const ranges = matches.map(objectRange).filter(Boolean);
    if (!ranges.length) return null;
    return {
      start: Math.min(...ranges.map((range) => range.start)),
      end: Math.max(...ranges.map((range) => range.end)),
      objectIds: [...new Set(matches.map((item) => String(item.id)))],
      objectNames: [...new Set(matches.map((item) => text(item.name || item.kind || item.id)))]
    };
  }

  function analyze(rows, options = {}) {
    const source = cloneRows(rows);
    const frames = buildFrames(source, options);
    const objects = mapObjects(options);
    const maxRatio = Math.max(0.1, number(options.maxMoveRatio, 21));
    const safetyFactor = Math.min(0.95, Math.max(0.5, number(options.safetyFactor, DEFAULT_SAFETY_FACTOR)));
    const targetRatio = maxRatio * safetyFactor;
    const minWindow = Math.max(0.5, number(options.minMotionWindowDeg, DEFAULT_MIN_WINDOW_DEG));
    const diagnostics = [];
    const candidateChanges = [];
    const candidateRows = cloneRows(source);
    const removeIndexes = new Set();

    frames.forEach((frame) => {
      if (!commandMoves(frame.command) || Math.abs(frame.plateTravel) <= EPSILON) return;
      const requiredSafeSpan = Math.abs(frame.plateTravel) / targetRatio;
      if (frame.speedRatio >= maxRatio) {
        diagnostics.push(diagnostic(
          "bad",
          "optimizer-speed-limit",
          "speed",
          frame,
          `HMI ${frame.hmi} requires ${frame.speedRatio.toFixed(1)}° bottle per 1° table, above the ${maxRatio.toFixed(1)}:1 limit.`,
          `Provide at least ${requiredSafeSpan.toFixed(1)}° of table travel or reduce the commanded bottle rotation.`,
          { currentRatio: frame.speedRatio, requiredSafeSpan }
        ));
      } else if (frame.speedRatio >= targetRatio) {
        diagnostics.push(diagnostic(
          "warn",
          "optimizer-speed-margin",
          "speed",
          frame,
          `HMI ${frame.hmi} runs at ${frame.speedRatio.toFixed(1)}:1, leaving less than a ${(100 - safetyFactor * 100).toFixed(0)}% planning margin.`,
          `Increase the move window toward ${requiredSafeSpan.toFixed(1)}° of table travel.`,
          { currentRatio: frame.speedRatio, requiredSafeSpan }
        ));
      }

      if (frame.tableTravel < minWindow && frame.speedRatio >= targetRatio * 0.6) {
        diagnostics.push(diagnostic(
          "warn",
          "optimizer-short-window",
          "timing",
          frame,
          `HMI ${frame.hmi} has only ${frame.tableTravel.toFixed(1)}° of table travel for an active correction.`,
          `Move the start earlier or the next setpoint later while keeping the motion inside its mechanical contact window.`,
          { tableTravel: frame.tableTravel }
        ));
      }
    });

    for (let index = 0; index < source.length - 1; index += 1) {
      const row = source[index];
      const next = source[index + 1];
      if (Number(row?.cmd) !== 3 || Number(next?.cmd) !== 3) continue;
      if (Math.abs(number(row?.plateAngle, 0) - number(next?.plateAngle, 0)) > EPSILON) continue;
      if (protectedReference(row) || protectedReference(next)) continue;
      const sameAction = normalizedAction(row?.action) === normalizedAction(next?.action);
      if (!sameAction && !(genericReference(row) && genericReference(next))) continue;
      removeIndexes.add(index);
      const frame = frames[index];
      diagnostics.push(diagnostic(
        "info",
        "optimizer-redundant-reference",
        "structure",
        frame,
        `HMI ${row.hmi ?? index + 1} and HMI ${next.hmi ?? index + 2} are duplicate stopped references at the same bottle angle.`,
        `The earlier generic reference can be removed without changing the motion path.`,
        { candidateSafe: true, removeIndex: index }
      ));
    }

    const seenActions = new Map();
    frames.forEach((frame) => {
      const action = normalizedAction(frame.action);
      if (!action || /rest|reference|hold/i.test(action)) return;
      const key = `${frame.aggregate ?? ""}|${frame.command}|${action}`;
      if (seenActions.has(key)) {
        const previous = seenActions.get(key);
        if (Math.abs(frame.tableStart - previous.tableStart) <= 2) {
          diagnostics.push(diagnostic(
            "warn",
            "optimizer-duplicate-action",
            "structure",
            frame,
            `${frame.action} appears twice within ${Math.abs(frame.tableStart - previous.tableStart).toFixed(1)}° of table travel.`,
            `Confirm that both commands represent separate physical events rather than duplicated generation.`,
            { previousHmi: previous.hmi }
          ));
        }
      } else {
        seenActions.set(key, frame);
      }
    });

    frames.filter((frame) => /wipe|brush|pad|roller/i.test(frame.action) && commandMoves(frame.command)).forEach((frame) => {
      const matches = matchingObjects(frame, objects);
      if (!matches.length) {
        diagnostics.push(diagnostic(
          "warn",
          "optimizer-wipe-object-missing",
          "coverage",
          frame,
          `${frame.action} has no matching pad, roller, or brush on the active map.`,
          `Assign the mechanical event to an active Map Builder object or add the missing wipe-down object.`
        ));
        return;
      }
      const frameStart = frame.tableStart;
      const frameEnd = frame.tableEnd;
      const covered = matches.reduce((sum, item) => {
        const range = objectRange(item);
        return range ? sum + overlap(frameStart, frameEnd, range.start, range.end) : sum;
      }, 0);
      const span = Math.max(EPSILON, frameEnd - frameStart);
      const coverage = Math.min(1, covered / span);
      if (coverage < 0.75) {
        const names = matches.map((item) => text(item.name || item.id)).join(", ");
        diagnostics.push(diagnostic(
          coverage <= 0.05 ? "bad" : "warn",
          "optimizer-wipe-contact",
          "coverage",
          frame,
          `${frame.action} overlaps its mapped wipe-down surface for only ${(coverage * 100).toFixed(0)}% of the command window.`,
          `Reposition or extend ${names || "the wipe-down object"} so the entire CMD window occurs under physical contact.`,
          { coveragePercent: coverage * 100, objectIds: matches.map((item) => String(item.id)) }
        ));
      }
    });

    correctionChains(frames).filter((chain) => chain.length >= 2).forEach((chain) => {
      const first = chain[0];
      const last = chain.at(-1);
      const closing = frames[last.index + 1];
      if (!closing) return;
      const sameAggregate = chain.every((frame) => frame.aggregate === first.aggregate);
      const sameProcess = chain.every((frame) => !first.processId || frame.processId === first.processId);
      if (!sameAggregate || !sameProcess) return;

      const totalSpan = closing.tableStart - first.tableStart;
      const rotations = chain.map((frame) => Math.abs(frame.plateTravel));
      const totalRotation = rotations.reduce((sum, value) => sum + value, 0);
      if (totalSpan <= chain.length * 0.5 || totalRotation <= EPSILON) return;

      const currentWorst = Math.max(...chain.map((frame) => frame.speedRatio));
      const idealRatio = totalRotation / totalSpan;
      if (currentWorst < targetRatio * 0.75 || idealRatio >= currentWorst * 0.95) return;

      const envelope = safeContactEnvelope(chain, objects);
      const proposedBoundaries = [];
      let cumulative = 0;
      for (let move = 0; move < chain.length - 1; move += 1) {
        cumulative += rotations[move];
        proposedBoundaries.push(first.tableStart + totalSpan * cumulative / totalRotation);
      }
      const safeEnvelope = envelope
        && proposedBoundaries.every((angle) => angle >= envelope.start - EPSILON && angle <= envelope.end + EPSILON);

      diagnostics.push(diagnostic(
        "info",
        "optimizer-chain-rebalance",
        "path",
        first,
        `${first.chainId || `HMI ${first.hmi}`} has an uneven correction split: worst stage ${currentWorst.toFixed(1)}:1 versus ${idealRatio.toFixed(1)}:1 if table distance is distributed by rotation.`,
        safeEnvelope
          ? `Rebalance the intermediate setpoints inside ${envelope.objectNames.join(", ")} to improve servo margin without changing the chain endpoints.`
          : `Review the pad/roller split and distribute more table distance to the faster stage; no automatic change is proposed without a shared contact envelope.`,
        { chainId: first.chainId, currentWorst, idealRatio, proposedBoundaries, candidateSafe: Boolean(safeEnvelope) }
      ));

      if (!safeEnvelope) return;
      proposedBoundaries.forEach((angle, boundaryIndex) => {
        const rowIndex = chain[boundaryIndex + 1].index;
        const before = number(candidateRows[rowIndex]?.tableAngle, angle);
        const rounded = Math.round(angle * 10) / 10;
        if (Math.abs(before - rounded) <= 0.05) return;
        candidateRows[rowIndex].tableAngle = rounded;
        candidateRows[rowIndex].generatedTableAngle = rounded;
        candidateRows[rowIndex].tableAngleOverride = null;
        candidateChanges.push({
          type: "rebalance-chain",
          hmi: candidateRows[rowIndex].hmi ?? rowIndex + 1,
          chainId: first.chainId,
          field: "tableAngle",
          before,
          after: rounded,
          message: `Move HMI ${candidateRows[rowIndex].hmi ?? rowIndex + 1} from ${before.toFixed(1)}° to ${rounded.toFixed(1)}° table to rebalance ${first.chainId || "the correction chain"}.`
        });
      });
    });

    const filteredCandidate = candidateRows.filter((row, index) => {
      if (!removeIndexes.has(index)) return true;
      candidateChanges.push({
        type: "remove-reference",
        hmi: row.hmi ?? index + 1,
        message: `Remove redundant generic CMD 3 reference at HMI ${row.hmi ?? index + 1}.`
      });
      return false;
    }).map((row, index) => ({ ...row, hmi: index + 1, plc: index }));

    const currentMetrics = calculateMetrics(source, options, diagnostics);
    const previewDiagnostics = [];
    const previewMetrics = calculateMetrics(filteredCandidate, options, previewDiagnostics);
    const comparison = compareMetrics(currentMetrics, previewMetrics);

    diagnostics.sort((a, b) => {
      const weight = { bad: 0, warn: 1, info: 2, ok: 3 };
      return (weight[a.level] ?? 9) - (weight[b.level] ?? 9) || number(a.hmi, 9999) - number(b.hmi, 9999);
    });

    return {
      createdAt: new Date().toISOString(),
      sourceRows: source,
      frames,
      diagnostics,
      currentMetrics,
      candidateRows: filteredCandidate,
      candidateChanges,
      previewMetrics,
      comparison,
      hasCandidate: candidateChanges.length > 0,
      status: diagnostics.some((item) => item.level === "bad")
        ? "ACTION"
        : diagnostics.some((item) => item.level === "warn")
          ? "REVIEW"
          : "HEALTHY"
    };
  }

  function calculateMetrics(rows, options = {}, diagnostics = null) {
    const frames = buildFrames(rows, options);
    const maxRatio = Math.max(0.1, number(options.maxMoveRatio, 21));
    const motion = frames.filter((frame) => commandMoves(frame.command) && Math.abs(frame.plateTravel) > EPSILON);
    const maxSpeedFrame = motion.reduce((best, frame) => !best || frame.speedRatio > best.speedRatio ? frame : best, null);
    const minWindowFrame = motion.reduce((best, frame) => !best || frame.tableTravel < best.tableTravel ? frame : best, null);
    const issueSource = Array.isArray(diagnostics) ? diagnostics : [];
    return {
      rowCount: rows.length,
      motionCount: motion.length,
      correctionCount: frames.filter((frame) => Number(frame.command) === 7).length,
      restCount: frames.filter((frame) => Number(frame.command) === 3).length,
      maxSpeed: maxSpeedFrame?.speedRatio || 0,
      maxSpeedHmi: maxSpeedFrame?.hmi || null,
      minimumMotionWindow: minWindowFrame?.tableTravel || 0,
      minimumWindowHmi: minWindowFrame?.hmi || null,
      totalBottleRotation: motion.reduce((sum, frame) => sum + Math.abs(frame.plateTravel), 0),
      speedFaults: motion.filter((frame) => frame.speedRatio >= maxRatio).length,
      nearLimitMoves: motion.filter((frame) => frame.speedRatio >= maxRatio * DEFAULT_SAFETY_FACTOR && frame.speedRatio < maxRatio).length,
      coverageIssues: issueSource.filter((item) => item.category === "coverage" && ["bad", "warn"].includes(item.level)).length,
      structureIssues: issueSource.filter((item) => item.category === "structure" && ["bad", "warn"].includes(item.level)).length
    };
  }

  function compareMetrics(before, after) {
    return {
      rowsRemoved: before.rowCount - after.rowCount,
      maxSpeedChange: after.maxSpeed - before.maxSpeed,
      speedFaultChange: after.speedFaults - before.speedFaults,
      nearLimitChange: after.nearLimitMoves - before.nearLimitMoves,
      minimumWindowChange: after.minimumMotionWindow - before.minimumMotionWindow,
      totalRotationChange: after.totalBottleRotation - before.totalBottleRotation,
      improved: after.speedFaults < before.speedFaults
        || after.nearLimitMoves < before.nearLimitMoves
        || after.maxSpeed < before.maxSpeed - 0.05
        || after.rowCount < before.rowCount
    };
  }

  global.LabelerProgramOptimizerDriver = Object.freeze({
    EPSILON,
    DEFAULT_SAFETY_FACTOR,
    DEFAULT_MIN_WINDOW_DEG,
    buildFrames,
    mapObjects,
    objectRange,
    matchingObjects,
    correctionChains,
    calculateMetrics,
    compareMetrics,
    analyze
  });
})(window);
