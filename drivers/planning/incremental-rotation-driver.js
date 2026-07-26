(function (global) {
  "use strict";

  const PROFILE_ID = "incremental-rotations";
  const EPSILON = 0.001;
  const MAX_EQUIVALENT_ROTATION_DEG = 720;
  const DEFAULT_SAFETY_FACTOR = 0.9;
  const DEFAULT_MAX_STAGE_ROTATION_DEG = 120;
  const DEFAULT_MIN_TABLE_STEP_DEG = 0.5;
  const DEFAULT_CODING_ARRIVAL_MARGIN_DEG = 1;

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

  function hasOverride(row, field) {
    const value = row?.[`${field}Override`];
    return value !== null && value !== undefined && String(value).trim() !== "" && Number.isFinite(Number(value));
  }

  function normalizeAngle(value) {
    const numeric = number(value, 0) % 360;
    return numeric < 0 ? numeric + 360 : numeric;
  }

  function equivalentOrientation(left, right, tolerance = 0.05) {
    const delta = ((number(left, 0) - number(right, 0) + 540) % 360) - 180;
    return Math.abs(delta) <= tolerance;
  }

  function aggregateFromAction(action, row = null) {
    const explicit = number(row?.aggregate, number(row?.station));
    if (explicit !== null) return Math.max(1, Math.round(explicit));
    const match = text(action).match(/(?:agg(?:regate)?|station)\s*[-#:]?\s*(\d+)/i);
    return match ? Math.max(1, Number(match[1])) : null;
  }

  function sectionFromAction(action, aggregate = null) {
    const value = text(action).toLowerCase();
    if (/neck/.test(value)) return "neck";
    if (/body/.test(value)) return "body";
    if (/back/.test(value)) return "back";
    if ([1, 2].includes(Number(aggregate))) return "neck";
    if ([3, 4].includes(Number(aggregate))) return "body";
    if ([5, 6].includes(Number(aggregate))) return "back";
    return "general";
  }

  function pairedAggregate(aggregate) {
    const value = Number(aggregate);
    if (!Number.isFinite(value)) return null;
    return value % 2 === 0 ? value - 1 : value + 1;
  }

  function activeSlotNumbers(value, fallbackCount = 6) {
    const source = Array.isArray(value) ? value : [];
    const count = Math.max(1, Math.min(6, Math.round(number(fallbackCount, 6))));
    return Array.from({ length: 6 }, (_, index) => source[index] === undefined ? index < count : Boolean(source[index]))
      .map((enabled, index) => enabled ? index + 1 : null)
      .filter(Boolean);
  }

  function normalizeObjects(options = {}) {
    const sources = [options.objects, options.map?.objects, options.aplObjects, options.coldGlueObjects];
    const objects = [];
    const seen = new Set();
    sources.forEach((source) => {
      if (!Array.isArray(source)) return;
      source.forEach((item, index) => {
        if (!item || typeof item !== "object") return;
        const id = text(item.id, `${item.kind || item.type || "object"}-${item.station || 0}-${index}`);
        if (seen.has(id)) return;
        seen.add(id);
        objects.push({ ...item, id });
      });
    });
    return objects;
  }

  function isInsideWipeObject(item) {
    const kind = text(item?.kind || item?.type).toLowerCase();
    const name = text(item?.name).toLowerCase();
    const side = text(item?.side).toLowerCase();
    const hasInnerChannel = number(item?.innerStart) !== null || number(item?.innerEnd) !== null;
    const wipeKind = /pad|roller|brush|wipe/.test(`${kind} ${name}`);
    return wipeKind && (side === "inner" || /inside|inner/.test(name) || hasInnerChannel);
  }

  function objectRange(item) {
    const start = number(item?.innerStart, number(item?.start, number(item?.angle)));
    if (start === null) return null;
    let end = number(item?.innerEnd, number(item?.end));
    if (end === null) end = start + Math.max(0.1, number(item?.wipeSpanDeg, 10));
    while (end < start) end += 360;
    return { start, end };
  }

  function innerWipeSupport(objects, aggregate) {
    return objects.filter((item) => Number(item?.station ?? item?.aggregate) === Number(aggregate) && isInsideWipeObject(item));
  }

  function machineFamily(options = {}) {
    const machine = text(options.machineType || options.map?.machineType || options.map?.name).toUpperCase();
    if (machine.includes("TOPMODUL")) return "TOPMODUL";
    if (machine.includes("AUTOCOL")) return "AUTOCOL";
    if (machine.includes("MULTIMODUL")) return "MULTIMODUL";
    const grammar = global.LabelerMachineFamilyGrammarDriver;
    return text(grammar?.resolveFamily?.(options), "DEFAULT").toUpperCase();
  }

  function isOrientationAction(action) {
    const value = text(action).toLowerCase();
    if (/wipe\s*turn|brush|roller|pad/.test(value)) return false;
    return /(turn|orient|transition).*(application|coding|coder|sensor|inspection)|(application|coding|coder|sensor|inspection).*(turn|orient|transition)/.test(value);
  }

  function isWipeAction(action) {
    return /wipe|brush|roller|pad/i.test(text(action));
  }

  function convertibleReference(row) {
    if (Number(row?.cmd) !== 3 || row?.terminalRest || row?.codingHold || row?.autocolBoundary) return false;
    if (hasOverride(row, "tableAngle") || hasOverride(row, "plateAngle")) return false;
    return /wipe\s*(?:hold|complete|reference)|idle|generic\s*reference|rest\s*after\s*wipe/i.test(text(row?.action));
  }

  function protectedReference(row) {
    const action = text(row?.action);
    return Boolean(
      row?.terminalRest
      || row?.codingHold
      || row?.autocolBoundary
      || row?.sensorTarget
      || row?.inspectionTarget
      || hasOverride(row, "tableAngle")
      || hasOverride(row, "plateAngle")
      || /zero\s*line|hold\s+for\s+.*application|hold\s+for\s+.*coding|sensor|inspection|end\s*(?:of\s*)?curve/i.test(action)
    );
  }

  function segmentDelta(rows, index) {
    const start = number(rows[index]?.plateAngle);
    const end = number(rows[index + 1]?.plateAngle);
    return start !== null && end !== null ? end - start : 0;
  }

  function tableTravel(rows, index) {
    const start = number(rows[index]?.tableAngle);
    const end = number(rows[index + 1]?.tableAngle);
    return start !== null && end !== null ? end - start : 0;
  }

  function lastWipeMovement(rows, beforeIndex, maxLookback = 8) {
    for (let index = beforeIndex; index >= Math.max(0, beforeIndex - maxLookback); index -= 1) {
      const row = rows[index];
      if (Number(row?.cmd) !== 7 || !isWipeAction(row?.action)) continue;
      const delta = segmentDelta(rows, index);
      if (Math.abs(delta) <= EPSILON) continue;
      return {
        index,
        row,
        delta,
        direction: delta > 0 ? 1 : -1,
        aggregate: aggregateFromAction(row.action, row),
        section: sectionFromAction(row.action, aggregateFromAction(row.action, row))
      };
    }
    return null;
  }

  function equivalentTarget(startPlate, targetPlate, direction, minimumTravel = 0) {
    let target = number(targetPlate, startPlate);
    let delta = target - startPlate;
    if (direction > 0) {
      while (delta <= Math.max(EPSILON, minimumTravel - EPSILON)) {
        target += 360;
        delta = target - startPlate;
      }
    } else {
      while (-delta <= Math.max(EPSILON, minimumTravel - EPSILON)) {
        target -= 360;
        delta = target - startPlate;
      }
    }
    return { target, delta };
  }

  function equivalentDelta(delta, direction) {
    return equivalentTarget(0, number(delta, 0), direction).delta;
  }

  function directionReversals(rows) {
    let previous = 0;
    let reversals = 0;
    for (let index = 0; index < rows.length - 1; index += 1) {
      if (Number(rows[index]?.cmd) !== 7) continue;
      const delta = segmentDelta(rows, index);
      const direction = Math.abs(delta) <= EPSILON ? 0 : delta > 0 ? 1 : -1;
      if (!direction) continue;
      if (previous && direction !== previous) reversals += 1;
      previous = direction;
    }
    return reversals;
  }

  function programMetrics(rows) {
    let totalAbsoluteRotation = 0;
    let netRotation = 0;
    let maximumRatio = 0;
    let motionCount = 0;
    for (let index = 0; index < rows.length - 1; index += 1) {
      if (Number(rows[index]?.cmd) !== 7) continue;
      const delta = segmentDelta(rows, index);
      const travel = tableTravel(rows, index);
      totalAbsoluteRotation += Math.abs(delta);
      netRotation += delta;
      if (Math.abs(delta) > EPSILON) motionCount += 1;
      if (travel > EPSILON) maximumRatio = Math.max(maximumRatio, Math.abs(delta / travel));
    }
    return {
      rowCount: rows.length,
      motionCount,
      totalAbsoluteRotation,
      netRotation,
      directionReversals: directionReversals(rows),
      maximumRatio
    };
  }

  function supportForCandidate(objects, map, departingAggregate) {
    const pair = pairedAggregate(departingAggregate);
    const enabledStations = new Set(activeSlotNumbers(map?.enabledStations, map?.stationCount || 6));
    const required = [departingAggregate];
    if (pair && enabledStations.has(pair)) required.push(pair);
    const byAggregate = Object.fromEntries(required.map((aggregate) => [aggregate, innerWipeSupport(objects, aggregate)]));
    const missing = required.filter((aggregate) => !byAggregate[aggregate]?.length);
    return {
      pair,
      required,
      byAggregate,
      missing,
      supported: missing.length === 0,
      objectIds: required.flatMap((aggregate) => byAggregate[aggregate].map((item) => String(item.id))),
      objectNames: required.flatMap((aggregate) => byAggregate[aggregate].map((item) => text(item.name || item.id))),
      ranges: required.flatMap((aggregate) => byAggregate[aggregate].map((item) => ({ aggregate, item, range: objectRange(item) })).filter((entry) => entry.range))
    };
  }

  function unwrapRange(range, reference) {
    if (!range) return null;
    let start = range.start;
    let end = range.end;
    while (end < start) end += 360;
    while (end < reference - EPSILON) {
      start += 360;
      end += 360;
    }
    while (start > reference + 360) {
      start -= 360;
      end -= 360;
    }
    return { start, end };
  }

  function departingContactSupported(support, departingAggregate, startTable, endTable) {
    const entries = support.ranges.filter((entry) => Number(entry.aggregate) === Number(departingAggregate));
    return entries.some((entry) => {
      const range = unwrapRange(entry.range, startTable);
      return range && Math.min(endTable, range.end) - Math.max(startTable, range.start) > EPSILON;
    });
  }

  function findClosingReference(rows, orientationIndex) {
    for (let index = orientationIndex + 1; index < rows.length; index += 1) {
      if (Number(rows[index]?.cmd) === 3) return index;
    }
    return -1;
  }

  function latestSafeReferenceTable(rows, endIndex, destinationAggregate, objects, options = {}) {
    const row = rows[endIndex];
    const baseline = number(row?.tableAngle, 0);
    const minimumStep = Math.max(0.1, number(options.minTableStepDeg, DEFAULT_MIN_TABLE_STEP_DEG));
    const nextTable = number(rows[endIndex + 1]?.tableAngle);
    let latest = baseline;

    const explicit = number(row?.incrementalLatestTableAngle);
    if (explicit !== null) latest = Math.max(latest, explicit);

    const codingStart = number(row?.codingWindowStart);
    if (codingStart !== null) {
      let unwrapped = codingStart;
      while (unwrapped <= baseline + EPSILON) unwrapped += 360;
      latest = Math.max(latest, unwrapped - Math.max(0.1, number(options.codingArrivalMarginDeg, DEFAULT_CODING_ARRIVAL_MARGIN_DEG)));
    }

    const action = text(row?.action).toLowerCase();
    if (/coding|coder|inspection|sensor/.test(action)) {
      const kinds = /coding|coder/.test(action) ? /coding|coder/ : /sensor|inspection/;
      const matching = objects.filter((item) => kinds.test(`${item?.kind || ""} ${item?.type || ""} ${item?.name || ""}`));
      matching.forEach((item) => {
        const range = objectRange(item);
        if (!range) return;
        let start = range.start;
        while (start <= baseline + EPSILON) start += 360;
        latest = Math.max(latest, start - minimumStep);
      });
    }

    const aggregateAngle = number(options.map?.aggregateAngles?.[destinationAggregate], number(options.map?.aggregateAngles?.[String(destinationAggregate)]));
    if (/application/.test(action) && aggregateAngle !== null) {
      let unwrapped = aggregateAngle;
      while (unwrapped <= baseline + EPSILON) unwrapped += 360;
      latest = Math.max(latest, unwrapped - minimumStep);
    }

    if (nextTable !== null) latest = Math.min(latest, nextTable - minimumStep);
    return Math.max(baseline, latest);
  }

  function allocationWindow(rows, orientationIndex, previousWipe, support, objects, options = {}) {
    const endIndex = findClosingReference(rows, orientationIndex);
    if (endIndex < 0) return { valid: false, code: "missing-reference", message: `HMI ${rows[orientationIndex]?.hmi ?? orientationIndex + 1} has no closing CMD 3 reference.` };

    for (let index = previousWipe.index + 1; index < endIndex; index += 1) {
      const row = rows[index];
      if (hasOverride(row, "tableAngle") || hasOverride(row, "plateAngle")) {
        return { valid: false, code: "manual-override", message: `HMI ${row?.hmi ?? index + 1} has a manual angle override inside the allocation window.` };
      }
      if (Number(row?.cmd) === 3 && !convertibleReference(row)) {
        return { valid: false, code: "protected-reference", message: `HMI ${row?.hmi ?? index + 1} is a protected reference and cannot be converted into a continuous correction stage.` };
      }
      if (protectedReference(row) && index !== endIndex) {
        return { valid: false, code: "protected-event", message: `HMI ${row?.hmi ?? index + 1} is a protected mechanical event inside the proposed continuous path.` };
      }
    }

    const startTable = number(rows[previousWipe.index]?.tableAngle, 0);
    const originalEndTable = number(rows[endIndex]?.tableAngle, startTable);
    const destinationAggregate = aggregateFromAction(rows[orientationIndex]?.action, rows[orientationIndex]);
    const endTable = latestSafeReferenceTable(rows, endIndex, destinationAggregate, objects, options);
    const firstEndTable = number(rows[previousWipe.index + 1]?.tableAngle, startTable);
    if (!departingContactSupported(support, previousWipe.aggregate, startTable, firstEndTable)) {
      return { valid: false, code: "inside-contact-window", message: `The final wipe segment for Aggregate ${previousWipe.aggregate} does not overlap its configured inside wipe-down window.` };
    }
    if (endTable <= startTable + EPSILON) {
      return { valid: false, code: "empty-window", message: "The mechanical timeline provides no table travel for the incremental profile." };
    }

    return {
      valid: true,
      startIndex: previousWipe.index,
      orientationIndex,
      endIndex,
      startTable,
      originalEndTable,
      endTable,
      destinationAggregate,
      borrowedTableTravel: endTable - originalEndTable
    };
  }

  function allocateWindow(rows, window, previousWipe, support, options = {}) {
    const maxMoveRatio = Math.max(0.1, number(options.maxMoveRatio, 21));
    const safetyFactor = Math.min(0.98, Math.max(0.5, number(options.safetyFactor, DEFAULT_SAFETY_FACTOR)));
    const safeRatio = maxMoveRatio * safetyFactor;
    const startPlate = number(rows[window.startIndex]?.plateAngle, 0);
    const baselineEndPlate = number(rows[window.endIndex]?.plateAngle, startPlate);
    const mandatoryWipeDelta = segmentDelta(rows, window.startIndex);
    const mandatoryWipeAbs = Math.abs(mandatoryWipeDelta);
    const equivalent = equivalentTarget(startPlate, baselineEndPlate, previousWipe.direction, mandatoryWipeAbs);
    const totalAbs = Math.abs(equivalent.delta);
    const availableSpan = window.endTable - window.startTable;
    const requiredSpan = totalAbs / safeRatio;

    if (totalAbs > MAX_EQUIVALENT_ROTATION_DEG + EPSILON) {
      return { valid: false, code: "rotation-limit", message: `The continued equivalent orientation requires ${totalAbs.toFixed(1)}°, above the ${MAX_EQUIVALENT_ROTATION_DEG.toFixed(0)}° allocation limit.`, totalAbs, requiredSpan, availableSpan };
    }

    const spans = [];
    for (let index = window.startIndex; index < window.endIndex; index += 1) {
      const start = number(rows[index]?.tableAngle, 0);
      const end = index + 1 === window.endIndex ? window.endTable : number(rows[index + 1]?.tableAngle, start);
      spans.push(Math.max(0, end - start));
    }
    const capacities = spans.map((span) => span * safeRatio);
    if (mandatoryWipeAbs > capacities[0] + EPSILON) {
      return { valid: false, code: "wipe-speed", message: `The existing final wipe stage already requires ${(mandatoryWipeAbs / Math.max(spans[0], EPSILON)).toFixed(1)}:1 and cannot safely carry additional rotation.`, totalAbs, requiredSpan, availableSpan };
    }

    const extraAbs = Math.max(0, totalAbs - mandatoryWipeAbs);
    const residual = capacities.map((capacity, index) => Math.max(0, capacity - (index === 0 ? mandatoryWipeAbs : 0)));
    const residualTotal = residual.reduce((sum, value) => sum + value, 0);
    if (extraAbs > residualTotal + EPSILON) {
      return {
        valid: false,
        code: "speed-limit",
        message: `The continued turn requires ${requiredSpan.toFixed(1)}° of table travel at the ${(safeRatio).toFixed(1)}:1 planning limit, but only ${availableSpan.toFixed(1)}° is safely available.`,
        totalAbs,
        requiredSpan,
        availableSpan,
        safeRatio,
        maxMoveRatio
      };
    }

    const allocations = capacities.map(() => 0);
    allocations[0] = mandatoryWipeAbs;
    if (extraAbs > EPSILON) {
      residual.forEach((capacity, index) => {
        allocations[index] += residualTotal > EPSILON ? extraAbs * capacity / residualTotal : 0;
      });
    }

    const direction = previousWipe.direction;
    const signedAllocations = allocations.map((value) => direction * value);
    const totalAllocated = signedAllocations.reduce((sum, value) => sum + value, 0);
    signedAllocations[signedAllocations.length - 1] += equivalent.delta - totalAllocated;

    const ratios = signedAllocations.map((delta, index) => Math.abs(delta) / Math.max(spans[index], EPSILON));
    if (ratios.some((ratio) => !Number.isFinite(ratio) || ratio > maxMoveRatio + EPSILON)) {
      return { valid: false, code: "allocation-ratio", message: "A generated incremental stage exceeds the configured servo-speed limit.", ratios, totalAbs, requiredSpan, availableSpan };
    }

    return {
      valid: true,
      startPlate,
      baselineEndPlate,
      targetPlate: equivalent.target,
      totalDelta: equivalent.delta,
      totalAbs,
      mandatoryWipeDelta,
      spans,
      allocations: signedAllocations,
      ratios,
      requiredSpan,
      availableSpan,
      safeRatio,
      maxMoveRatio,
      support
    };
  }

  function applyAllocation(rows, window, allocation, previousWipe, support, windowId) {
    const candidate = cloneRows(rows);
    const section = previousWipe.section || sectionFromAction(candidate[window.orientationIndex]?.action, window.destinationAggregate || previousWipe.aggregate);
    let plate = allocation.startPlate;
    const stageCount = allocation.allocations.length;

    for (let stage = 0; stage < stageCount; stage += 1) {
      const index = window.startIndex + stage;
      const row = candidate[index];
      const originalCommand = Number(row?.cmd);
      const originalAction = text(row?.action, `Incremental Rotation Stage ${stage + 1}`);
      row.cmd = 7;
      row.baseCmd = 7;
      row.plateAngle = plate;
      row.generatedPlateAngle = plate;
      row.incrementalRotation = true;
      row.incrementalWindowId = windowId;
      row.incrementalStageIndex = stage + 1;
      row.incrementalStageCount = stageCount;
      row.incrementalRotationDirection = previousWipe.direction > 0 ? "positive" : "negative";
      row.incrementalRotationSourceAggregate = previousWipe.aggregate;
      row.incrementalRotationTargetAggregate = window.destinationAggregate;
      row.incrementalRotationInsideObjectIds = support.objectIds;
      row.incrementalRotationInsideObjectNames = support.objectNames;
      row.incrementalRequiredTableSpan = allocation.requiredSpan;
      row.incrementalAvailableTableSpan = allocation.availableSpan;
      row.incrementalBorrowedTableTravel = window.borrowedTableTravel;
      row.incrementalStageTravel = allocation.allocations[stage];
      row.incrementalStageRatio = allocation.ratios[stage];
      row.appliedMotionProfileId = PROFILE_ID;
      row.resolvedMotionProfileId = PROFILE_ID;
      row.plannerIntent = "ROTATE";
      row.plannerRequestedCommand = 7;
      row.plannerRecommendedCommand = 7;
      row.plannerReason = `${windowId} stage ${stage + 1}/${stageCount} allocates ${Math.abs(allocation.allocations[stage]).toFixed(1)}° of bottle rotation across ${allocation.spans[stage].toFixed(1)}° of table travel.`;

      if (stage === 0 && isWipeAction(originalAction)) {
        row.action = originalAction.replace(/\s*•\s*continuous$/i, "") + " • Continuous";
      } else if (index === window.orientationIndex || isOrientationAction(originalAction)) {
        row.action = /^Incremental\b/i.test(originalAction) ? originalAction : `Incremental ${originalAction}`;
      } else if (originalCommand === 3) {
        row.incrementalConvertedReference = true;
        row.action = `Incremental Rotation Stage ${stage + 1} - ${sectionLabel(section)}`;
      }
      plate += allocation.allocations[stage];
    }

    const endRow = candidate[window.endIndex];
    const offset = allocation.targetPlate - allocation.baselineEndPlate;
    endRow.tableAngle = window.endTable;
    endRow.generatedTableAngle = window.endTable;
    endRow.plateAngle = allocation.targetPlate;
    endRow.generatedPlateAngle = allocation.targetPlate;
    endRow.cmd = 3;
    endRow.baseCmd = 3;
    endRow.incrementalRotationTarget = true;
    endRow.incrementalWindowId = windowId;
    endRow.incrementalBorrowedTableTravel = window.borrowedTableTravel;
    endRow.appliedMotionProfileId = PROFILE_ID;
    endRow.resolvedMotionProfileId = PROFILE_ID;

    for (let index = window.endIndex + 1; index < candidate.length; index += 1) {
      if (number(candidate[index]?.plateAngle) !== null) candidate[index].plateAngle = number(candidate[index].plateAngle, 0) + offset;
      if (number(candidate[index]?.generatedPlateAngle) !== null) candidate[index].generatedPlateAngle = number(candidate[index].generatedPlateAngle, 0) + offset;
    }

    return candidate;
  }

  function sectionLabel(section) {
    return ({ neck: "Neck", body: "Body", back: "Back" })[section] || "Process";
  }

  function validateCandidate(rows, options = {}, expectedTarget = null, targetIndex = null) {
    const maxMoveRatio = Math.max(0.1, number(options.maxMoveRatio, 21));
    const issues = [];
    for (let index = 0; index < rows.length; index += 1) {
      if (index > 0 && number(rows[index]?.tableAngle, -Infinity) <= number(rows[index - 1]?.tableAngle, Infinity) + EPSILON) {
        issues.push(`HMI ${rows[index]?.hmi ?? index + 1} does not have a strictly increasing table angle.`);
      }
      if (index >= rows.length - 1) continue;
      const delta = segmentDelta(rows, index);
      const travel = tableTravel(rows, index);
      if (Number(rows[index]?.cmd) === 3 && Math.abs(delta) > EPSILON) issues.push(`HMI ${rows[index]?.hmi ?? index + 1} is CMD 3 but changes the bottle angle.`);
      if (Number(rows[index]?.cmd) === 7) {
        if (Math.abs(delta) <= EPSILON) issues.push(`HMI ${rows[index]?.hmi ?? index + 1} is CMD 7 but produces no bottle movement.`);
        if (travel <= EPSILON || Math.abs(delta / travel) > maxMoveRatio + EPSILON) issues.push(`HMI ${rows[index]?.hmi ?? index + 1} exceeds the ${maxMoveRatio.toFixed(1)}:1 turn-speed limit.`);
      }
    }
    if (expectedTarget !== null && targetIndex !== null && !equivalentOrientation(rows[targetIndex]?.plateAngle, expectedTarget)) {
      issues.push("The generated target orientation is not physically equivalent to the referenced profile target.");
    }
    const grammar = global.LabelerMachineFamilyGrammarDriver;
    if (grammar?.analyze) {
      const result = grammar.analyze(rows, { ...options, family: "TOPMODUL", machineFamily: "TOPMODUL", machineType: "TopModul" });
      (result?.issues || []).filter((issue) => issue.level === "bad").forEach((issue) => issues.push(issue.message));
    }
    return { valid: issues.length === 0, issues };
  }

  function splitLargeStages(rows, options = {}) {
    const maxStageRotation = Math.max(30, number(options.maxStageRotationDeg, DEFAULT_MAX_STAGE_ROTATION_DEG));
    const minimumStep = Math.max(0.1, number(options.minTableStepDeg, DEFAULT_MIN_TABLE_STEP_DEG));
    const output = [];
    let inserted = 0;

    for (let index = 0; index < rows.length; index += 1) {
      const row = { ...rows[index] };
      output.push(row);
      if (index >= rows.length - 1 || Number(row.cmd) !== 7 || !row.incrementalRotation) continue;
      const next = rows[index + 1];
      const delta = number(next?.plateAngle, 0) - number(row.plateAngle, 0);
      const span = number(next?.tableAngle, 0) - number(row.tableAngle, 0);
      const parts = Math.ceil(Math.abs(delta) / maxStageRotation);
      if (parts <= 1 || span < parts * minimumStep - EPSILON) continue;

      for (let part = 1; part < parts; part += 1) {
        const fraction = part / parts;
        output.push({
          ...row,
          hmi: null,
          plc: null,
          cmd: 7,
          baseCmd: 7,
          tableAngle: number(row.tableAngle, 0) + span * fraction,
          generatedTableAngle: number(row.tableAngle, 0) + span * fraction,
          plateAngle: number(row.plateAngle, 0) + delta * fraction,
          generatedPlateAngle: number(row.plateAngle, 0) + delta * fraction,
          action: `Incremental Rotation Substage ${part + 1}/${parts} - ${sectionLabel(sectionFromAction(row.action, row.incrementalRotationTargetAggregate || row.incrementalRotationSourceAggregate))}`,
          incrementalInsertedStage: true,
          incrementalStageIndex: number(row.incrementalStageIndex, 1) + part / parts,
          plannerReason: `Inserted a profile setpoint so no incremental correction stage exceeds ${maxStageRotation.toFixed(0)}° of bottle rotation.`
        });
        inserted += 1;
      }
    }

    return {
      rows: output.map((row, index) => ({ ...row, hmi: index + 1, plc: index })),
      inserted
    };
  }

  function transform(rows, options = {}) {
    const baseline = cloneRows(rows);
    const map = options.map || null;
    const family = machineFamily({ ...options, rows: baseline, map });
    const objects = normalizeObjects({ ...options, map });
    const allowFallback = options.allowFallback !== false;
    const fallbacks = [];
    const appliedMoves = [];
    let working = cloneRows(baseline);
    let windowNumber = 0;

    if (family !== "TOPMODUL") {
      return {
        profileId: PROFILE_ID,
        family,
        eligible: false,
        applied: false,
        rows: baseline,
        appliedMoves: [],
        generatedStages: 0,
        fallbacks: [{ code: "machine-family", message: "Incremental Rotations currently applies only to TopModul machines." }],
        baselineMetrics: programMetrics(baseline),
        incrementalMetrics: programMetrics(baseline)
      };
    }

    for (let index = 0; index < working.length - 1; index += 1) {
      const row = working[index];
      if (Number(row?.cmd) !== 7 || !isOrientationAction(row?.action)) continue;
      if (hasOverride(row, "plateAngle") || hasOverride(row, "tableAngle")) {
        fallbacks.push({ code: "manual-override", hmi: row.hmi ?? index + 1, message: `HMI ${row.hmi ?? index + 1} retains its manual angle override.` });
        continue;
      }

      const previousWipe = lastWipeMovement(working, index - 1);
      if (!previousWipe?.aggregate) continue;
      const currentDelta = segmentDelta(working, index);
      if (Math.sign(currentDelta) === previousWipe.direction && Math.abs(currentDelta) > EPSILON) continue;

      const support = supportForCandidate(objects, map, previousWipe.aggregate);
      if (!support.supported) {
        fallbacks.push({
          code: "inside-wipe-missing",
          hmi: row.hmi ?? index + 1,
          departingAggregate: previousWipe.aggregate,
          missingAggregates: support.missing,
          message: `HMI ${row.hmi ?? index + 1} keeps the referenced backspin because inside wipe-down support is missing for Aggregate ${support.missing.join(" and ")}.`
        });
        continue;
      }

      const window = allocationWindow(working, index, previousWipe, support, objects, { ...options, map });
      if (!window.valid) {
        fallbacks.push({ code: window.code, hmi: row.hmi ?? index + 1, message: `HMI ${row.hmi ?? index + 1} keeps the referenced path. ${window.message}` });
        continue;
      }

      const allocation = allocateWindow(working, window, previousWipe, support, options);
      if (!allocation.valid) {
        fallbacks.push({
          code: allocation.code,
          hmi: row.hmi ?? index + 1,
          ratio: allocation.totalAbs && tableTravel(working, index) > EPSILON ? allocation.totalAbs / tableTravel(working, index) : null,
          requiredTableSpan: allocation.requiredSpan,
          availableTableSpan: allocation.availableSpan,
          message: `HMI ${row.hmi ?? index + 1} keeps the referenced path. ${allocation.message}`
        });
        continue;
      }

      windowNumber += 1;
      const windowId = `IR${String(windowNumber).padStart(2, "0")}`;
      const expectedTarget = number(working[window.endIndex]?.plateAngle, 0);
      const candidate = applyAllocation(working, window, allocation, previousWipe, support, windowId);
      const validation = validateCandidate(candidate, { ...options, map }, expectedTarget, window.endIndex);
      if (!validation.valid) {
        fallbacks.push({ code: "candidate-validation", hmi: row.hmi ?? index + 1, message: `HMI ${row.hmi ?? index + 1} keeps the referenced path because the generated candidate failed validation: ${validation.issues.join(" ")}` });
        continue;
      }

      working = candidate;
      appliedMoves.push({
        id: windowId,
        index,
        hmi: row.hmi ?? index + 1,
        sourceHmi: working[window.startIndex]?.hmi ?? window.startIndex + 1,
        targetHmi: working[window.endIndex]?.hmi ?? window.endIndex + 1,
        departingAggregate: previousWipe.aggregate,
        destinationAggregate: window.destinationAggregate,
        section: previousWipe.section,
        preferredDirection: previousWipe.direction > 0 ? "positive" : "negative",
        baselineDelta: currentDelta,
        incrementalDelta: allocation.totalDelta,
        tableTravel: allocation.availableSpan,
        requiredTableSpan: allocation.requiredSpan,
        borrowedTableTravel: window.borrowedTableTravel,
        speedRatio: Math.max(...allocation.ratios),
        stageCount: allocation.allocations.length,
        stageRotations: allocation.allocations,
        stageRatios: allocation.ratios,
        insideWipeObjectIds: support.objectIds,
        insideWipeObjectNames: support.objectNames,
        message: `${windowId} continues ${previousWipe.direction > 0 ? "forward" : "reverse"} rotation across ${allocation.allocations.length} CMD 7 stages, using ${allocation.availableSpan.toFixed(1)}° of table travel${window.borrowedTableTravel > EPSILON ? ` including ${window.borrowedTableTravel.toFixed(1)}° of safe downstream margin` : ""}.`
      });
    }

    if (!appliedMoves.length) {
      return {
        profileId: PROFILE_ID,
        family,
        eligible: true,
        applied: false,
        rows: baseline,
        appliedMoves: [],
        generatedStages: 0,
        fallbacks,
        baselineMetrics: programMetrics(baseline),
        incrementalMetrics: programMetrics(baseline)
      };
    }

    const split = splitLargeStages(working, options);
    working = split.rows.map((row) => ({
      ...row,
      appliedMotionProfileId: PROFILE_ID,
      resolvedMotionProfileId: PROFILE_ID
    }));
    const finalValidation = validateCandidate(working, { ...options, map });
    if (!finalValidation.valid) {
      return {
        profileId: PROFILE_ID,
        family,
        eligible: true,
        applied: false,
        rows: baseline,
        appliedMoves: [],
        generatedStages: 0,
        fallbacks: [...fallbacks, { code: "final-validation", message: `The complete incremental profile was rejected: ${finalValidation.issues.join(" ")}` }],
        baselineMetrics: programMetrics(baseline),
        incrementalMetrics: programMetrics(baseline)
      };
    }

    const baselineMetrics = programMetrics(baseline);
    const incrementalMetrics = programMetrics(working);
    return {
      profileId: PROFILE_ID,
      family,
      eligible: true,
      applied: true,
      rows: working,
      appliedMoves,
      generatedStages: appliedMoves.reduce((sum, move) => sum + move.stageCount, 0) + split.inserted,
      insertedStages: split.inserted,
      fallbacks: allowFallback ? fallbacks : [],
      baselineMetrics,
      incrementalMetrics,
      comparison: {
        totalAbsoluteRotationChange: incrementalMetrics.totalAbsoluteRotation - baselineMetrics.totalAbsoluteRotation,
        directionReversalChange: incrementalMetrics.directionReversals - baselineMetrics.directionReversals,
        maximumRatioChange: incrementalMetrics.maximumRatio - baselineMetrics.maximumRatio,
        rowCountChange: incrementalMetrics.rowCount - baselineMetrics.rowCount
      }
    };
  }

  global.LabelerIncrementalRotationDriver = Object.freeze({
    PROFILE_ID,
    EPSILON,
    MAX_EQUIVALENT_ROTATION_DEG,
    DEFAULT_SAFETY_FACTOR,
    DEFAULT_MAX_STAGE_ROTATION_DEG,
    DEFAULT_MIN_TABLE_STEP_DEG,
    aggregateFromAction,
    sectionFromAction,
    pairedAggregate,
    activeSlotNumbers,
    normalizeObjects,
    isInsideWipeObject,
    innerWipeSupport,
    objectRange,
    machineFamily,
    isOrientationAction,
    isWipeAction,
    convertibleReference,
    protectedReference,
    segmentDelta,
    tableTravel,
    lastWipeMovement,
    equivalentTarget,
    equivalentDelta,
    directionReversals,
    programMetrics,
    supportForCandidate,
    allocationWindow,
    allocateWindow,
    validateCandidate,
    splitLargeStages,
    transform
  });
})(window);
