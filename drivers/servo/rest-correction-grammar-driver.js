"use strict";

(function installRestCorrectionGrammarDriver(global) {
  if (global.LabelerRestCorrectionGrammarDriver) return;

  const DEFAULT_TOLERANCE = 0.5;
  const MOTION_COMMANDS = new Set([1, 2, 4, 5, 6, 7]);

  function finite(value, fallback = NaN) {
    if (value === null || value === undefined || value === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function isCodingRelease(row) {
    return row?.codingRelease === true
      || /return bottle.*(?:end curve|reference).*after coding|release.*after coding|continue.*after coder/i.test(String(row?.action || ""));
  }

  function isCodingRest(row) {
    if (Number(row?.cmd) !== 3) return false;
    return row?.codingHold === true
      || Boolean(row?.codingReadyTableAngle)
      || row?.codeBoxCenterlineAligned === true
      || row?.codeBoxDirectionCorrected === true
      || Boolean(row?.codingObjectId)
      || (row?.orientationHold === true && /coding|code box/i.test(String(row?.action || "")))
      || /hold.*(?:coding|code box)|(?:coding|code box).*hold|coding.*reference|code box.*centerline/i.test(String(row?.action || ""));
  }

  function correctionMetrics(startRow, destinationRow, startPlate) {
    const destinationPlate = finite(destinationRow?.plateAngle, NaN);
    const tableTravel = finite(destinationRow?.tableAngle, NaN) - finite(startRow?.tableAngle, NaN);
    return {
      plannedRotation: Number.isFinite(destinationPlate) ? destinationPlate - startPlate : startRow?.plannedRotation,
      plannedRatio: Number.isFinite(destinationPlate) && tableTravel > 0.001
        ? Math.abs(destinationPlate - startPlate) / tableTravel
        : startRow?.plannedRatio
    };
  }

  function mergedRest(left, right) {
    const leftActions = Array.isArray(left?.mergedRestActions) ? left.mergedRestActions : [String(left?.action || "Rest")];
    const rightActions = Array.isArray(right?.mergedRestActions) ? right.mergedRestActions : [String(right?.action || "Rest")];
    const codingAction = [right, left].find((row) => isCodingRest({ ...row, cmd: 3 }));
    return {
      ...left,
      ...right,
      cmd: 3,
      tableAngle: left.tableAngle,
      plateAngle: left.plateAngle,
      action: codingAction?.action || right?.action || left?.action || "Rest",
      mergedRestActions: [...leftActions, ...rightActions],
      mergedRestTableAngles: [
        ...(Array.isArray(left?.mergedRestTableAngles) ? left.mergedRestTableAngles : [left?.tableAngle]),
        ...(Array.isArray(right?.mergedRestTableAngles) ? right.mergedRestTableAngles : [right?.tableAngle])
      ].filter((value) => Number.isFinite(finite(value, NaN))),
      restGrammarMerged: true,
      restGrammarReconciled: true
    };
  }

  function collapseEquivalentCodingRests(rows, tolerance) {
    const repairs = [];
    for (let index = 1; index < rows.length; index += 1) {
      const left = rows[index - 1];
      const right = rows[index];
      if (Number(left?.cmd) !== 3 || Number(right?.cmd) !== 3) continue;
      if (right?.terminalRest === true || /end\s*(?:of\s*)?curve/i.test(String(right?.action || ""))) continue;
      if (!isCodingRest(left) && !isCodingRest(right)) continue;
      const leftPlate = finite(left?.plateAngle, NaN);
      const rightPlate = finite(right?.plateAngle, NaN);
      if (!Number.isFinite(leftPlate) || !Number.isFinite(rightPlate)) continue;
      if (Math.abs(rightPlate - leftPlate) > tolerance) continue;

      rows[index - 1] = mergedRest(left, right);
      rows.splice(index, 1);
      repairs.push({
        index: index - 1,
        hmi: index,
        strategy: "merge-equivalent-coding-rests",
        restoredPlateAngle: leftPlate,
        removedAction: String(right?.action || "Rest")
      });
      index -= 1;
    }
    return repairs;
  }

  function normalizeCodingReleaseBlocks(rows, tolerance) {
    const repairs = [];

    for (let releaseIndex = 1; releaseIndex < rows.length; releaseIndex += 1) {
      if (!isCodingRelease(rows[releaseIndex])) continue;

      while (releaseIndex >= 2
        && Number(rows[releaseIndex - 2]?.cmd) === 3
        && Number(rows[releaseIndex - 1]?.cmd) === 3) {
        const earlierPlate = finite(rows[releaseIndex - 2]?.plateAngle, NaN);
        const laterPlate = finite(rows[releaseIndex - 1]?.plateAngle, NaN);
        if (!Number.isFinite(earlierPlate) || !Number.isFinite(laterPlate)) break;
        if (Math.abs(laterPlate - earlierPlate) > tolerance) break;

        const removed = rows[releaseIndex - 1];
        rows[releaseIndex - 2] = mergedRest(rows[releaseIndex - 2], removed);
        rows.splice(releaseIndex - 1, 1);
        releaseIndex -= 1;
        repairs.push({
          index: releaseIndex - 1,
          hmi: releaseIndex,
          strategy: "merge-duplicate-rest-before-coding-release",
          restoredPlateAngle: earlierPlate,
          removedAction: String(removed?.action || "Rest")
        });
      }

      const holdIndex = releaseIndex - 1;
      const hold = rows[holdIndex];
      const release = rows[releaseIndex];
      if (!hold || Number(hold.cmd) !== 3) continue;
      const heldPlate = finite(hold.plateAngle, NaN);
      if (!Number.isFinite(heldPlate)) continue;

      for (let index = holdIndex - 1; index >= 0; index -= 1) {
        const row = rows[index];
        const next = rows[index + 1];
        if (Number(row?.cmd) !== 3 || Number(next?.cmd) !== 3) break;
        const startPlate = finite(row?.plateAngle, NaN);
        const destinationPlate = finite(next?.plateAngle, NaN);
        if (!Number.isFinite(startPlate) || !Number.isFinite(destinationPlate)) break;
        if (Math.abs(destinationPlate - startPlate) <= tolerance) break;
        rows[index] = {
          ...row,
          cmd: 7,
          action: /hold|rest/i.test(String(row?.action || ""))
            ? `Orient to ${String(next?.action || "Coding Reference")}`
            : row.action,
          ...correctionMetrics(row, next, startPlate),
          restGrammarPromotedCorrection: true,
          restGrammarReconciled: true
        };
        repairs.push({
          index,
          hmi: index + 1,
          strategy: "promote-rest-to-correction",
          rejectedPlateTravel: destinationPlate - startPlate,
          restoredPlateAngle: startPlate
        });
      }

      const originalCommand = Number(release.cmd);
      const originalPlate = finite(release.plateAngle, NaN);
      rows[releaseIndex] = {
        ...release,
        cmd: 7,
        plateAngle: heldPlate,
        ...correctionMetrics(release, rows[releaseIndex + 1], heldPlate),
        restGrammarPromotedCorrection: originalCommand !== 7,
        restGrammarStartAligned: true,
        restGrammarReconciled: true,
        originalRestGrammarStartPlate: originalPlate
      };

      if (originalCommand !== 7 || !Number.isFinite(originalPlate) || Math.abs(originalPlate - heldPlate) > tolerance) {
        repairs.push({
          index: releaseIndex,
          hmi: releaseIndex + 1,
          strategy: "restore-coding-release-correction",
          rejectedPlateTravel: Number.isFinite(originalPlate) ? originalPlate - heldPlate : NaN,
          restoredPlateAngle: heldPlate,
          originalCommand
        });
      }
    }

    return repairs;
  }

  function repairPreviousMotion(rows, restIndex, restoredPlate) {
    const previous = rows[restIndex - 1];
    if (!previous || !MOTION_COMMANDS.has(Number(previous.cmd))) return;
    const startPlate = finite(previous.plateAngle, NaN);
    const tableTravel = finite(rows[restIndex]?.tableAngle, NaN) - finite(previous.tableAngle, NaN);
    rows[restIndex - 1] = {
      ...previous,
      plannedRotation: Number.isFinite(startPlate) ? restoredPlate - startPlate : previous.plannedRotation,
      plannedRatio: Number.isFinite(startPlate) && tableTravel > 0.001
        ? Math.abs(restoredPlate - startPlate) / tableTravel
        : previous.plannedRatio,
      restGrammarReconciled: true
    };
  }

  function preserveRestThroughFollowingStart(rows, restIndex, heldPlate) {
    for (let index = restIndex + 1; index < rows.length; index += 1) {
      const row = rows[index];
      const originalPlate = finite(row?.plateAngle, NaN);
      rows[index] = {
        ...row,
        plateAngle: heldPlate,
        restGrammarReconciled: true,
        restGrammarStartAligned: true,
        originalRestGrammarStartPlate: originalPlate
      };
      if (Number(row?.cmd) === 3) continue;
      if (MOTION_COMMANDS.has(Number(row?.cmd))) {
        rows[index] = {
          ...rows[index],
          ...correctionMetrics(rows[index], rows[index + 1], heldPlate)
        };
      }
      return index;
    }
    return rows.length - 1;
  }

  function reconcile(sourceRows, options = {}) {
    if (!Array.isArray(sourceRows) || sourceRows.length < 2) {
      return { rows: sourceRows, repairs: [] };
    }

    const tolerance = Math.max(0, finite(options.tolerance, DEFAULT_TOLERANCE));
    const requestedPreserveIndexes = Array.isArray(options.preserveRestIndexes)
      ? options.preserveRestIndexes
      : [];
    const shouldRepair = typeof options.shouldRepair === "function"
      ? options.shouldRepair
      : () => true;
    const rows = sourceRows.map((row) => ({ ...row }));
    const repairs = [
      ...normalizeCodingReleaseBlocks(rows, tolerance),
      ...collapseEquivalentCodingRests(rows, tolerance)
    ];

    const semanticHoldIndexes = rows.map((row, index) => isCodingRest(row) ? index : -1)
      .filter((index) => index >= 0);
    const preserveIndexes = new Set(semanticHoldIndexes.length
      ? semanticHoldIndexes
      : requestedPreserveIndexes.filter((index) => index >= 0 && index < rows.length));

    for (let index = rows.length - 2; index >= 0; index -= 1) {
      const row = rows[index];
      const next = rows[index + 1];
      if (Number(row?.cmd) !== 3 || preserveIndexes.has(index) || !shouldRepair(row, index, rows)) continue;
      const current = finite(row?.plateAngle, NaN);
      const nextPlate = finite(next?.plateAngle, NaN);
      if (!Number.isFinite(current) || !Number.isFinite(nextPlate)) continue;
      const rejectedTravel = nextPlate - current;
      if (Math.abs(rejectedTravel) <= tolerance) continue;

      rows[index] = {
        ...row,
        plateAngle: nextPlate,
        restGrammarReconciled: true,
        rejectedRestPlateTravel: rejectedTravel,
        originalRestPlateAngle: current
      };
      repairPreviousMotion(rows, index, nextPlate);
      repairs.push({
        index,
        hmi: index + 1,
        strategy: "align-rest-to-next-reference",
        rejectedPlateTravel: rejectedTravel,
        restoredPlateAngle: nextPlate
      });
    }

    [...preserveIndexes].sort((a, b) => a - b).forEach((index) => {
      const row = rows[index];
      const next = rows[index + 1];
      if (!row || !next || Number(row.cmd) !== 3 || !shouldRepair(row, index, rows)) return;
      if (Number(next.cmd) === 7 && Math.abs(finite(next.plateAngle, NaN) - finite(row.plateAngle, NaN)) <= tolerance) return;
      const heldPlate = finite(row.plateAngle, NaN);
      const nextPlate = finite(next.plateAngle, NaN);
      if (!Number.isFinite(heldPlate) || !Number.isFinite(nextPlate)) return;
      const rejectedTravel = nextPlate - heldPlate;
      if (Math.abs(rejectedTravel) <= tolerance) return;
      const alignedThroughIndex = preserveRestThroughFollowingStart(rows, index, heldPlate);
      repairs.push({
        index,
        hmi: index + 1,
        strategy: "preserve-rest-target",
        rejectedPlateTravel: rejectedTravel,
        restoredPlateAngle: heldPlate,
        alignedThroughIndex
      });
    });

    repairs.push(...collapseEquivalentCodingRests(rows, tolerance));

    return {
      rows: rows.map((row, index) => ({ ...row, hmi: index + 1, plc: index })),
      repairs: repairs.sort((left, right) => left.index - right.index)
    };
  }

  const api = Object.freeze({
    DEFAULT_TOLERANCE,
    isCodingRelease,
    isCodingRest,
    collapseEquivalentCodingRests,
    normalizeCodingReleaseBlocks,
    reconcile
  });
  global.LabelerRestCorrectionGrammarDriver = api;
  global.LabelerDriverRegistry?.register("servo.restCorrectionGrammar", api, {
    dependencies: ["servo.command"],
    source: "drivers/servo/rest-correction-grammar-driver.js",
    replace: true
  });

  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
