"use strict";

(function installColdGlueGripperChannelMotion() {
  const RETRY_MS = 50;
  const EPSILON = 0.001;
  const FULL_CYCLE = 360;
  const GRIPPER_CENTERLINE_ANGLE = 0;
  const CHANNEL_ENTRY_ANGLE = 90;
  const MAX_SAFE_CONTACT_TURN = 359;
  let installed = false;

  function finite(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function finish(value) {
    return typeof finishAngle === "function"
      ? finishAngle(value)
      : Math.round(finite(value, 0) * 10) / 10;
  }

  function currentMap() {
    try {
      return typeof activeMachineMap === "function" ? activeMachineMap() : null;
    } catch {
      return null;
    }
  }

  function nearestEquivalent(target, reference) {
    const base = finite(target, 0);
    const current = finite(reference, base);
    return base + FULL_CYCLE * Math.round((current - base) / FULL_CYCLE);
  }

  function atOrAfter(angle, minimum) {
    let value = finite(angle, minimum);
    while (value < minimum - EPSILON) value += FULL_CYCLE;
    return value;
  }

  function activeObjects(map) {
    const runtime = Array.isArray(state?.coldGlueMap) ? state.coldGlueMap : [];
    const saved = Array.isArray(map?.objects) ? map.objects : [];
    const runtimeHasGeometry = runtime.some((item) => ["brush", "brush-channel", "gripper", "pallet"].includes(String(item?.kind || "")));
    return runtimeHasGeometry ? runtime : saved;
  }

  function gripperForStation(map, station) {
    const candidates = activeObjects(map).filter((item) => ["gripper", "pallet"].includes(String(item?.kind || "")));
    return candidates.find((item) => Number(item?.station) === Number(station)) || null;
  }

  function brushObjectsForStation(map, station) {
    return activeObjects(map).filter((item) =>
      Number(item?.station) === Number(station)
      && (item?.kind === "brush" || item?.kind === "brush-channel")
    );
  }

  function expandBrushes(objects) {
    return objects.flatMap((item, index) => {
      if (item?.kind !== "brush-channel") {
        return [{
          id: item?.id || `brush-${index}`,
          side: item?.side === "inner" ? "inner" : "outer",
          start: finite(item?.start, 0),
          end: finite(item?.end, finite(item?.start, 0) + 1)
        }];
      }
      return [
        {
          id: `${item.id || `channel-${index}`}-outer`,
          side: "outer",
          start: finite(item.outerStart, item.start),
          end: finite(item.outerEnd, item.end)
        },
        {
          id: `${item.id || `channel-${index}`}-inner`,
          side: "inner",
          start: finite(item.innerStart, item.start),
          end: finite(item.innerEnd, item.end)
        }
      ];
    });
  }

  function brushSegments(objects, minimumTable) {
    const brushes = expandBrushes(objects).map((brush) => {
      const start = atOrAfter(brush.start, minimumTable);
      let end = atOrAfter(brush.end, start + EPSILON);
      while (end <= start + EPSILON) end += FULL_CYCLE;
      return { ...brush, start, end };
    });
    if (!brushes.length) return [];

    const points = [...new Set(
      brushes.flatMap((brush) => [brush.start, brush.end]).map((value) => Number(value.toFixed(6)))
    )].sort((a, b) => a - b);
    const raw = [];
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index];
      const end = points[index + 1];
      if (end <= start + EPSILON) continue;
      const middle = (start + end) / 2;
      const outer = brushes.some((brush) => brush.side === "outer" && middle >= brush.start - EPSILON && middle <= brush.end + EPSILON);
      const inner = brushes.some((brush) => brush.side === "inner" && middle >= brush.start - EPSILON && middle <= brush.end + EPSILON);
      if (!outer && !inner) continue;
      raw.push({ start, end, stage: outer && inner ? "opposed" : outer ? "outer" : "inner" });
    }

    return raw.reduce((segments, segment) => {
      const previous = segments.at(-1);
      if (previous && previous.stage === segment.stage && Math.abs(previous.end - segment.start) <= EPSILON) previous.end = segment.end;
      else segments.push({ ...segment });
      return segments;
    }, []);
  }

  function appendIssue(issue) {
    if (!state?.motionPlan?.mapDriven) return;
    state.motionPlan.issues = Array.isArray(state.motionPlan.issues) ? state.motionPlan.issues : [];
    const key = `${issue.code}:${issue.station || ""}:${issue.side || ""}`;
    if (state.motionPlan.issues.some((entry) => `${entry.code}:${entry.station || ""}:${entry.side || ""}` === key)) return;
    state.motionPlan.issues.push(issue);
  }

  function pushRow(rows, cmd, tableAngle, plateAngle, action, extra = {}) {
    rows.push({
      hmi: 0,
      plc: 0,
      cmd,
      tableAngle: finish(tableAngle),
      plateAngle: finish(plateAngle),
      action,
      fixedColdGlueMap: false,
      motionSource: "cold-glue-gripper-channel",
      coldGlueCenterOut: true,
      gripperChannelAligned: true,
      ...extra
    });
  }

  function tableAngleForGripper(map, station, minimumTable, originalBlock) {
    const gripper = gripperForStation(map, station);
    if (gripper) return {
      tableAngle: atOrAfter(finite(gripper.angle, gripper.start), minimumTable),
      source: "map-gripper",
      gripper
    };

    const settings = state?.coldGlueAggregateSettings || {};
    const fallback = finite(
      settings?.aggregateAngles?.[String(station)],
      finite(map?.aggregateAngles?.[String(station)], finite(map?.stationAngles?.[String(station)], finite(originalBlock.find((row) => Number(row.cmd) === 3)?.tableAngle, minimumTable)))
    );
    return { tableAngle: atOrAfter(fallback, minimumTable), source: "aggregate-fallback", gripper: null };
  }

  function buildAlignedChannelBlock(map, station, previousRow, originalBlock) {
    const brushes = brushObjectsForStation(map, station);
    const originalUsesChannel = brushes.some((item) => item.kind === "brush-channel")
      || (() => {
        const expanded = expandBrushes(brushes);
        return expanded.some((brush, index) => expanded.some((other, otherIndex) =>
          index !== otherIndex
          && brush.side !== other.side
          && Math.min(brush.end, other.end) > Math.max(brush.start, other.start) + EPSILON
        ));
      })();
    if (!originalUsesChannel) return originalBlock;

    const wipePlan = typeof sectionWipePlan === "function" ? sectionWipePlan("neck") : null;
    const labelDeg = Math.max(0, finite(wipePlan?.labelDeg, 0));
    const requestedBrushTurn = labelDeg;
    const safeBrushTurn = Math.min(MAX_SAFE_CONTACT_TURN, requestedBrushTurn);
    const hardLimit = Math.max(0.1, finite(state?.maxMoveRatio, 21));
    const safeRatio = Math.max(0.1, hardLimit * 0.9);
    let lastTable = finite(previousRow?.tableAngle, 0);
    let plate = finite(previousRow?.plateAngle, finite(state?.buildInputs?.plateStartPositionDeg, 0));
    const output = [];

    const gripperReference = tableAngleForGripper(map, station, lastTable + 0.1, originalBlock);
    const gripperTable = gripperReference.tableAngle;
    const gripperPlate = nearestEquivalent(GRIPPER_CENTERLINE_ANGLE, plate);
    const gripperRotation = gripperPlate - plate;

    if (!gripperReference.gripper) {
      appendIssue({
        level: "warn",
        code: "cold-glue-gripper-centerline-fallback",
        station,
        section: "neck",
        message: `Aggregate ${station} has no Gripper / Spender Plate object. The aggregate position was used as the gripper centerline reference.`
      });
    }

    if (Math.abs(gripperRotation) > EPSILON) {
      const availableSpan = Math.max(EPSILON, gripperTable - lastTable);
      const requiredSpan = Math.abs(gripperRotation) / safeRatio;
      const turnStart = Math.max(lastTable, gripperTable - requiredSpan);
      const actualSpan = Math.max(EPSILON, gripperTable - turnStart);
      pushRow(output, 7, turnStart, plate, `Align Bottle to Gripper Centerline - Agg ${station}`, {
        station,
        section: "neck",
        brushStage: "gripper-alignment",
        gripperCenterline: true,
        gripperTableAngle: finish(gripperTable),
        gripperPlateAngle: GRIPPER_CENTERLINE_ANGLE,
        plannedRotation: gripperRotation,
        plannedRatio: Math.abs(gripperRotation) / actualSpan
      });
      plate = gripperPlate;
      pushRow(output, 3, gripperTable, plate, `Hold Gripper Centerline for Neck Application - Agg ${station}`, {
        station,
        section: "neck",
        brushStage: "gripper-application",
        gripperCenterline: true,
        gripperTableAngle: finish(gripperTable),
        gripperPlateAngle: GRIPPER_CENTERLINE_ANGLE
      });
      if (requiredSpan > availableSpan + EPSILON) {
        appendIssue({
          level: "bad",
          code: "cold-glue-gripper-alignment-window",
          station,
          section: "neck",
          message: `Aggregate ${station} does not provide enough table travel to align the bottle with the gripper centerline before label application. At least ${requiredSpan.toFixed(1)}° of table travel is required.`
        });
      }
    }
    lastTable = gripperTable;

    const segments = brushSegments(brushes, gripperTable + EPSILON);
    if (!segments.length || segments[0].stage !== "opposed") {
      appendIssue({
        level: "bad",
        code: "cold-glue-opposed-channel-missing",
        station,
        section: "neck",
        message: `Aggregate ${station} does not enter an opposed inside/outside brush channel after the gripper. Add overlapping inside and outside brush surfaces before the one-sided runout.`
      });
      return output.length ? output : originalBlock;
    }

    const firstSingleIndex = segments.findIndex((segment) => segment.stage === "outer" || segment.stage === "inner");
    const brushEntryTable = segments[0].start;
    const entryPlate = nearestEquivalent(CHANNEL_ENTRY_ANGLE, plate);
    const entryRotation = entryPlate - plate;
    const entryAvailableSpan = Math.max(EPSILON, brushEntryTable - gripperTable);
    const entryRequiredSpan = Math.abs(entryRotation) / safeRatio;
    const entryTurnStart = Math.max(gripperTable + 0.1, brushEntryTable - entryRequiredSpan);
    const entryActualSpan = Math.max(EPSILON, brushEntryTable - entryTurnStart);

    if (Math.abs(entryRotation) > EPSILON) {
      pushRow(output, 7, entryTurnStart, plate, `Turn from Gripper Centerline to 90° Brush Channel Entry - Agg ${station}`, {
        station,
        section: "neck",
        brushStage: "channel-entry",
        gripperCenterline: true,
        channelEntryAngle: CHANNEL_ENTRY_ANGLE,
        plannedRotation: entryRotation,
        plannedRatio: Math.abs(entryRotation) / entryActualSpan
      });
      plate = entryPlate;
      pushRow(output, 3, brushEntryTable, plate, `Hold 90° Through Opposed Cold Glue Brush Channel - Agg ${station}`, {
        station,
        section: "neck",
        brushStage: "opposed",
        channelHold: true,
        holdAngle: CHANNEL_ENTRY_ANGLE,
        channelEntryAngle: CHANNEL_ENTRY_ANGLE
      });
    }
    lastTable = brushEntryTable;

    if (entryRequiredSpan > entryAvailableSpan + EPSILON) {
      appendIssue({
        level: "bad",
        code: "cold-glue-channel-entry-window",
        station,
        section: "neck",
        message: `Aggregate ${station} does not provide enough table travel between the gripper and brush entrance to move from the gripper centerline to 90°. Move the channel later or provide at least ${entryRequiredSpan.toFixed(1)}° of table travel.`
      });
    }

    if (requestedBrushTurn >= FULL_CYCLE - EPSILON) {
      appendIssue({
        level: "bad",
        code: "cold-glue-full-turn-blocked",
        station,
        section: "neck",
        message: `Aggregate ${station} requires ${requestedBrushTurn.toFixed(1)}° of label-length wiping after the channel opens. Cold Glue brush contact cannot complete a full bottle revolution, so the generated movement was capped at ${MAX_SAFE_CONTACT_TURN}°.`
      });
    }

    if (firstSingleIndex < 0) {
      appendIssue({
        level: "bad",
        code: "cold-glue-center-out-runout-missing",
        station,
        section: "neck",
        message: `Aggregate ${station} has no one-sided brush runout after the opposed channel. Extend one brush beyond the other so the bottle can rotate away from the remaining brush by the label length.`
      });
      return output;
    }

    const openSide = segments[firstSingleIndex].stage;
    const direction = openSide === "inner" ? 1 : -1;
    const usable = [];
    let unsafeTransition = false;
    for (let index = firstSingleIndex; index < segments.length; index += 1) {
      const segment = segments[index];
      if (segment.stage === openSide) usable.push(segment);
      else {
        unsafeTransition = true;
        break;
      }
    }

    if (unsafeTransition) {
      appendIssue({
        level: "bad",
        code: "cold-glue-opposite-edge-contact-blocked",
        station,
        section: "neck",
        side: openSide,
        message: `Aggregate ${station} returns to opposed or opposite-side brush contact after the channel opens. The unsafe opposite-edge crossing was not generated.`
      });
    }

    let remaining = safeBrushTurn;
    usable.forEach((segment) => {
      if (remaining <= EPSILON) return;
      const start = Math.max(segment.start, lastTable);
      const end = Math.max(start + EPSILON, segment.end);
      const span = Math.max(EPSILON, end - start);
      const rotation = Math.min(remaining, span * safeRatio, MAX_SAFE_CONTACT_TURN);
      if (rotation <= EPSILON) return;
      pushRow(output, 7, start, plate, `Wipe Away from ${openSide === "inner" ? "Inside" : "Outside"} Brush for One Label Length - Agg ${station}`, {
        station,
        section: "neck",
        brushStage: openSide,
        brushSide: openSide,
        channelOpenWipe: true,
        wipeAwayFromBrush: true,
        labelLengthRotation: labelDeg,
        plannedRotation: rotation,
        plannedRatio: rotation / span
      });
      plate += direction * rotation;
      pushRow(output, 3, end, plate, `Cold Glue Neck Label-Length Wipe Complete - Agg ${station}`, {
        station,
        section: "neck",
        brushStage: `${openSide}-complete`,
        brushSide: openSide,
        channelOpenWipe: true,
        wipeAwayFromBrush: true,
        labelLengthRotation: labelDeg,
        plannedRotation: rotation,
        plannedRatio: rotation / span
      });
      lastTable = end;
      remaining -= rotation;
    });

    if (remaining > EPSILON) {
      appendIssue({
        level: "bad",
        code: "cold-glue-label-length-runout-capacity",
        station,
        section: "neck",
        side: openSide,
        message: `Aggregate ${station} ${openSide} brush runout is short by ${remaining.toFixed(1)}° of bottle rotation. The open brush length must support one complete label-length wipe without crossing to the opposite side.`
      });
    }

    return output;
  }

  function collapseArtificialCycles(rows) {
    if (!Array.isArray(rows) || rows.length < 2) return rows;
    let previous = finite(rows[0]?.tableAngle, 0);
    return rows.map((row, index) => {
      if (index === 0) return { ...row };
      const raw = finite(row?.tableAngle, previous);
      let tableAngle = raw;
      while (tableAngle - previous >= FULL_CYCLE - EPSILON) tableAngle -= FULL_CYCLE;
      if (tableAngle < previous - EPSILON) {
        previous = raw;
        return { ...row };
      }
      previous = tableAngle;
      return Math.abs(tableAngle - raw) > EPSILON
        ? { ...row, tableAngle: finish(tableAngle), tableCycleCorrected: true }
        : { ...row };
    });
  }

  function applyGripperChannelMotion(rows, map) {
    if (!Array.isArray(rows) || !map || map.applicationMode !== "cold-glue") return rows;
    let result = rows.map((row) => ({ ...row }));
    const stations = [...new Set(
      result
        .filter((row) => row?.section === "neck" && Number.isFinite(Number(row?.station)))
        .map((row) => Number(row.station))
    )].sort((a, b) => a - b);

    if (state?.motionPlan?.mapDriven) {
      const stationSet = new Set(stations);
      const replacedCodes = new Set([
        "cold-glue-gripper-centerline-fallback",
        "cold-glue-gripper-alignment-window",
        "cold-glue-opposed-channel-missing",
        "cold-glue-channel-entry-window",
        "cold-glue-full-turn-blocked",
        "cold-glue-center-out-runout-missing",
        "cold-glue-opposite-edge-contact-blocked",
        "cold-glue-label-length-runout-capacity",
        "cold-glue-center-out-capacity"
      ]);
      state.motionPlan.issues = (Array.isArray(state.motionPlan.issues) ? state.motionPlan.issues : []).filter((issue) =>
        !(issue?.section === "neck" && stationSet.has(Number(issue?.station)) && replacedCodes.has(String(issue?.code || "")))
      );
    }

    stations.forEach((station) => {
      const indexes = result
        .map((row, index) => Number(row?.station) === station && row?.section === "neck" ? index : -1)
        .filter((index) => index >= 0);
      if (!indexes.length || !brushObjectsForStation(map, station).length) return;
      const first = indexes[0];
      const last = indexes[indexes.length - 1];
      const previous = result[first - 1] || null;
      const originalBlock = result.slice(first, last + 1);
      const replacement = buildAlignedChannelBlock(map, station, previous, originalBlock);
      result.splice(first, last - first + 1, ...replacement);
    });

    result = collapseArtificialCycles(result).map((row, index) => ({ ...row, hmi: index + 1, plc: index }));
    if (state?.motionPlan?.mapDriven) state.motionPlan.rows = result;
    return result;
  }

  function wrapGenerator() {
    const original = window.generatedColdGlueFixedProfile;
    if (typeof original !== "function" || original.coldGlueGripperChannelWrapped) return false;
    const wrapped = function generatedColdGlueGripperChannelProfile(...args) {
      return applyGripperChannelMotion(original.apply(this, args), currentMap());
    };
    wrapped.coldGlueGripperChannelWrapped = true;
    wrapped.originalGenerator = original;
    window.generatedColdGlueFixedProfile = wrapped;
    try { generatedColdGlueFixedProfile = wrapped; } catch { /* global binding may be read-only */ }
    return true;
  }

  function install() {
    if (installed) return true;
    if (typeof state === "undefined" || typeof window.generatedColdGlueFixedProfile !== "function") return false;
    if (!wrapGenerator()) return false;
    installed = true;
    return true;
  }

  function wait() {
    if (install()) return;
    window.setTimeout(wait, RETRY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait, { once: true });
  else wait();
})();
