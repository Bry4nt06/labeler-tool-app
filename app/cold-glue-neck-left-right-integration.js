"use strict";

(function installColdGlueNeckLeftRightWipe() {
  const RETRY_MS = 50;
  const EPSILON = 0.001;
  const FULL_CYCLE = 360;
  const MIN_ROW_GAP = 0.1;
  const DEFAULT_CENTERLINE_ANGLE = 0;
  const DEFAULT_OVERWIPE_MM = 5;
  const DEFAULT_PRESS_TABLE_DEG = 1.5;
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

  function objectSection(item) {
    const value = String(item?.labelSection || "auto");
    return ["auto", "neck", "body", "back", "none"].includes(value) ? value : "auto";
  }

  function activeObjects(map) {
    const runtime = Array.isArray(state?.coldGlueMap) ? state.coldGlueMap : [];
    const saved = Array.isArray(map?.objects) ? map.objects : [];
    const runtimeHasGeometry = runtime.some((item) =>
      ["brush", "brush-channel", "gripper", "pallet"].includes(String(item?.kind || ""))
    );
    return runtimeHasGeometry ? runtime : saved;
  }

  function gripperForStation(map, station) {
    const candidates = activeObjects(map).filter((item) =>
      ["gripper", "pallet"].includes(String(item?.kind || ""))
      && Number(item?.station) === Number(station)
      && ["auto", "neck"].includes(objectSection(item))
    );
    return candidates.find((item) => objectSection(item) === "neck") || candidates[0] || null;
  }

  function brushObjectsForStation(map, station) {
    return activeObjects(map).filter((item) =>
      Number(item?.station) === Number(station)
      && (item?.kind === "brush" || item?.kind === "brush-channel")
      && ["auto", "neck"].includes(objectSection(item))
    );
  }

  function defaultWipeSide(physicalSide) {
    return physicalSide === "inner" ? "right" : "left";
  }

  function expandBrushes(objects, minimumTable) {
    return objects.flatMap((item, index) => {
      const normalizeRange = ({ physicalSide, wipeSide, pressEnabled, startValue, endValue, suffix }) => {
        const start = atOrAfter(startValue, minimumTable);
        let end = atOrAfter(endValue, start + EPSILON);
        while (end <= start + EPSILON) end += FULL_CYCLE;
        return {
          id: `${item?.id || `brush-${index}`}-${suffix}`,
          sourceId: item?.id || `brush-${index}`,
          physicalSide,
          wipeSide: ["left", "right", "none"].includes(String(wipeSide)) ? String(wipeSide) : defaultWipeSide(physicalSide),
          pressEnabled: Boolean(pressEnabled),
          start,
          end
        };
      };

      if (item?.kind === "brush-channel") {
        const pressEnabled = item.pressLooseSides !== false;
        return [
          normalizeRange({
            physicalSide: "outer",
            wipeSide: item.outerNeckWipeSide || "left",
            pressEnabled,
            startValue: finite(item.outerStart, item.start),
            endValue: finite(item.outerEnd, item.end),
            suffix: "outer"
          }),
          normalizeRange({
            physicalSide: "inner",
            wipeSide: item.innerNeckWipeSide || "right",
            pressEnabled,
            startValue: finite(item.innerStart, item.start),
            endValue: finite(item.innerEnd, item.end),
            suffix: "inner"
          })
        ];
      }

      const physicalSide = item?.side === "inner" ? "inner" : "outer";
      return [normalizeRange({
        physicalSide,
        wipeSide: item.neckWipeSide || defaultWipeSide(physicalSide),
        pressEnabled: item.pressLooseSide !== false,
        startValue: finite(item?.start, 0),
        endValue: finite(item?.end, finite(item?.start, 0) + 1),
        suffix: physicalSide
      })];
    }).sort((a, b) => a.start - b.start || a.end - b.end);
  }

  function mergeRanges(ranges) {
    const sorted = ranges
      .filter((range) => range.end > range.start + EPSILON)
      .sort((a, b) => a.start - b.start || a.end - b.end);
    const merged = [];
    sorted.forEach((range) => {
      const previous = merged.at(-1);
      if (previous && range.start <= previous.end + EPSILON) {
        previous.end = Math.max(previous.end, range.end);
        previous.ids.push(range.id);
      } else {
        merged.push({ start: range.start, end: range.end, ids: [range.id] });
      }
    });
    return merged;
  }

  function intersections(leftRanges, rightRanges) {
    const result = [];
    leftRanges.forEach((left) => {
      rightRanges.forEach((right) => {
        const start = Math.max(left.start, right.start);
        const end = Math.min(left.end, right.end);
        if (end > start + EPSILON) result.push({ start, end, id: `opposed-${left.ids?.[0] || "left"}-${right.ids?.[0] || "right"}` });
      });
    });
    return mergeRanges(result);
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
      motionSource: "cold-glue-neck-left-right",
      coldGlueNeckTwoSideWipe: true,
      ...extra
    });
  }

  function selectedNeckGeometry(gripper) {
    const wipe = typeof sectionWipePlan === "function" ? sectionWipePlan("neck") : null;
    const label = typeof selectedLabelSpec === "function" ? selectedLabelSpec() : null;
    const circumferenceMm = finite(label?.neckBottomCircumferenceMm, NaN);
    const labelDeg = Math.max(0, finite(wipe?.labelDeg, 0));
    const geometry = window.LabelerGeometryDriver;
    const overWipeMm = Math.max(0, finite(gripper?.neckOverWipeMm, DEFAULT_OVERWIPE_MM));
    const overWipeDeg = Number.isFinite(circumferenceMm) && circumferenceMm > 0 && geometry?.degreesFromMm
      ? Math.max(0, finite(geometry.degreesFromMm(overWipeMm, circumferenceMm), 0))
      : 0;
    const stageRequired = labelDeg / 2 + overWipeDeg;
    return { labelDeg, circumferenceMm, overWipeMm, overWipeDeg, stageRequired };
  }

  function tableAngleForGripper(map, station, minimumTable, originalBlock) {
    const gripper = gripperForStation(map, station);
    if (gripper) {
      return {
        tableAngle: atOrAfter(finite(gripper.angle, gripper.start), minimumTable),
        source: "map-gripper",
        gripper
      };
    }

    const settings = state?.coldGlueAggregateSettings || {};
    const fallback = finite(
      settings?.aggregateAngles?.[String(station)],
      finite(
        map?.aggregateAngles?.[String(station)],
        finite(map?.stationAngles?.[String(station)], finite(originalBlock.find((row) => Number(row.cmd) === 3)?.tableAngle, minimumTable))
      )
    );
    return { tableAngle: atOrAfter(fallback, minimumTable), source: "aggregate-fallback", gripper: null };
  }

  function allocateMotion({
    rows,
    windows,
    currentTable,
    currentPlate,
    signedRotation,
    safeRatio,
    station,
    stageName,
    action,
    completionAction,
    geometry
  }) {
    let remaining = Math.abs(signedRotation);
    const direction = Math.sign(signedRotation) || 1;
    let table = currentTable;
    let plate = currentPlate;

    for (const window of windows) {
      if (remaining <= EPSILON) break;
      const start = Math.max(window.start, table + MIN_ROW_GAP);
      if (start >= window.end - EPSILON) continue;
      const availableSpan = window.end - start;
      const rotation = Math.min(remaining, availableSpan * safeRatio, MAX_SAFE_CONTACT_TURN);
      if (rotation <= EPSILON) continue;
      const requiredSpan = rotation / safeRatio;
      const end = Math.min(window.end, start + requiredSpan);
      const actualSpan = Math.max(EPSILON, end - start);
      const actualRotation = Math.min(rotation, actualSpan * safeRatio);

      pushRow(rows, 7, start, plate, action, {
        station,
        section: "neck",
        brushStage: stageName,
        neckWipeSide: stageName,
        wipeOutward: true,
        overWipeMm: geometry.overWipeMm,
        overWipeDeg: geometry.overWipeDeg,
        plannedRotation: direction * actualRotation,
        plannedRatio: actualRotation / actualSpan,
        objectIds: window.ids || []
      });
      plate += direction * actualRotation;
      pushRow(rows, 3, end, plate, completionAction, {
        station,
        section: "neck",
        brushStage: `${stageName}-complete`,
        neckWipeSide: stageName,
        wipeOutward: true,
        overWipeMm: geometry.overWipeMm,
        overWipeDeg: geometry.overWipeDeg,
        plannedRotation: direction * actualRotation,
        plannedRatio: actualRotation / actualSpan,
        objectIds: window.ids || []
      });

      remaining -= actualRotation;
      table = end;
    }

    return { remaining: Math.max(0, remaining), table, plate };
  }

  function buildNeckTwoSideBlock(map, station, previousRow, originalBlock) {
    const brushes = brushObjectsForStation(map, station);
    if (!brushes.length) return originalBlock;

    const gripperReference = tableAngleForGripper(map, station, finite(previousRow?.tableAngle, 0) + MIN_ROW_GAP, originalBlock);
    const gripper = gripperReference.gripper;
    const geometry = selectedNeckGeometry(gripper);
    if (geometry.labelDeg <= EPSILON) return originalBlock;

    const hardLimit = Math.max(0.1, finite(state?.maxMoveRatio, 21));
    const safeRatio = Math.max(0.1, hardLimit * 0.9);
    const output = [];
    let lastTable = finite(previousRow?.tableAngle, 0);
    let plate = finite(previousRow?.plateAngle, finite(state?.buildInputs?.plateStartPositionDeg, 0));

    const gripperTable = gripperReference.tableAngle;
    const centerlineAngle = finite(gripper?.applicationPlateAngleDeg, DEFAULT_CENTERLINE_ANGLE);
    const centerPlate = nearestEquivalent(centerlineAngle, plate);
    const centerRotation = centerPlate - plate;
    const alignmentLead = Math.max(0, finite(gripper?.alignmentLeadTableDeg, 360 / Math.max(1, finite(map?.headCount, 60))));
    const alignmentTable = Math.max(lastTable + MIN_ROW_GAP, gripperTable - alignmentLead);

    if (!gripper) {
      appendIssue({
        level: "warn",
        code: "cold-glue-neck-gripper-fallback",
        station,
        section: "neck",
        message: `Aggregate ${station} has no Neck Gripper / Spender Plate object. The aggregate location and 0° bottle reference were used.`
      });
    }

    if (Math.abs(centerRotation) > EPSILON) {
      const availableSpan = Math.max(EPSILON, alignmentTable - lastTable);
      const requiredSpan = Math.abs(centerRotation) / safeRatio;
      const turnStart = Math.max(lastTable, alignmentTable - requiredSpan);
      const actualSpan = Math.max(EPSILON, alignmentTable - turnStart);
      pushRow(output, 7, turnStart, plate, `Align Neck Label to Gripper Centerline Before Application - Agg ${station}`, {
        station,
        section: "neck",
        brushStage: "gripper-centerline",
        gripperCenterline: true,
        gripperTableAngle: finish(gripperTable),
        alignmentCompleteTableAngle: finish(alignmentTable),
        applicationPlateAngleDeg: centerlineAngle,
        plannedRotation: centerRotation,
        plannedRatio: Math.abs(centerRotation) / actualSpan
      });
      plate = centerPlate;
      pushRow(output, 3, alignmentTable, centerPlate, `Hold Neck Label Centerline Approaching Gripper - Agg ${station}`, {
        station,
        section: "neck",
        brushStage: "gripper-approach-hold",
        gripperCenterline: true,
        applicationPlateAngleDeg: centerlineAngle
      });
      if (requiredSpan > availableSpan + EPSILON) {
        appendIssue({
          level: "bad",
          code: "cold-glue-neck-gripper-window",
          station,
          section: "neck",
          message: `Aggregate ${station} does not provide enough table travel to finish centerline alignment ${alignmentLead.toFixed(1)}° before the gripper.`
        });
      }
    }

    pushRow(output, 3, gripperTable, centerPlate, `Hold Neck Label Centerline Through Gripper Application - Agg ${station}`, {
      station,
      section: "neck",
      brushStage: "gripper-application",
      gripperCenterline: true,
      applicationPlateAngleDeg: centerlineAngle,
      alignmentLeadTableDeg: alignmentLead
    });
    lastTable = gripperTable;
    plate = centerPlate;

    const expanded = expandBrushes(brushes, gripperTable + EPSILON);
    const leftRanges = mergeRanges(expanded.filter((range) => range.wipeSide === "left"));
    const rightRanges = mergeRanges(expanded.filter((range) => range.wipeSide === "right"));
    const outerPressRanges = mergeRanges(expanded.filter((range) => range.physicalSide === "outer" && range.pressEnabled));
    const innerPressRanges = mergeRanges(expanded.filter((range) => range.physicalSide === "inner" && range.pressEnabled));
    const opposedRanges = intersections(outerPressRanges, innerPressRanges);
    const opposed = opposedRanges.find((range) => range.end > gripperTable + EPSILON);

    if (!leftRanges.length) {
      appendIssue({
        level: "bad",
        code: "cold-glue-neck-left-brush-missing",
        station,
        section: "neck",
        side: "left",
        message: `Aggregate ${station} has no Cold Glue brush assigned to the left neck-label wing.`
      });
    }
    if (!rightRanges.length) {
      appendIssue({
        level: "bad",
        code: "cold-glue-neck-right-brush-missing",
        station,
        section: "neck",
        side: "right",
        message: `Aggregate ${station} has no Cold Glue brush assigned to the right neck-label wing.`
      });
    }
    if (!leftRanges.length || !rightRanges.length) return output;

    if (!opposed) {
      appendIssue({
        level: "bad",
        code: "cold-glue-neck-opposed-press-missing",
        station,
        section: "neck",
        message: `Aggregate ${station} has no overlapping inside/outside brush section enabled to press both loose neck-label sides down before wiping.`
      });
      return output;
    }

    const brushEntry = Math.max(opposed.start, lastTable + MIN_ROW_GAP);
    const opposedSpan = Math.max(0, opposed.end - brushEntry);
    const requestedPressSpan = Math.max(0.1, finite(gripper?.neckPressTableDeg, DEFAULT_PRESS_TABLE_DEG));
    const pressSpan = Math.min(opposedSpan, requestedPressSpan);
    const pressEnd = brushEntry + pressSpan;

    pushRow(output, 3, brushEntry, plate, `Press Both Loose Neck Label Sides Down - Agg ${station}`, {
      station,
      section: "neck",
      brushStage: "press-both-sides",
      channelHold: true,
      holdAngle: centerlineAngle,
      pressTableDeg: pressSpan,
      objectIds: opposed.ids || []
    });
    lastTable = pressEnd;

    if (pressSpan + EPSILON < requestedPressSpan) {
      appendIssue({
        level: "bad",
        code: "cold-glue-neck-press-capacity",
        station,
        section: "neck",
        message: `Aggregate ${station} opposed brush overlap provides only ${pressSpan.toFixed(1)}° of the requested ${requestedPressSpan.toFixed(1)}° both-sides press distance.`
      });
    }

    if (geometry.stageRequired >= FULL_CYCLE - EPSILON || geometry.stageRequired * 2 >= FULL_CYCLE - EPSILON) {
      appendIssue({
        level: "bad",
        code: "cold-glue-neck-full-turn-blocked",
        station,
        section: "neck",
        message: `Aggregate ${station} neck wipe geometry would require a complete bottle revolution under brush contact. The move was limited to preserve the label.`
      });
    }

    const order = gripper?.neckWipeOrder === "right-left" ? ["right", "left"] : ["left", "right"];
    const windowsBySide = { left: leftRanges, right: rightRanges };
    const directionBySide = { left: -1, right: 1 };
    const results = {};

    order.forEach((side, index) => {
      const required = Math.min(MAX_SAFE_CONTACT_TURN, geometry.stageRequired * (index === 0 ? 1 : 2));
      const stage = allocateMotion({
        rows: output,
        windows: windowsBySide[side].filter((range) => range.end > lastTable + MIN_ROW_GAP),
        currentTable: lastTable,
        currentPlate: plate,
        signedRotation: directionBySide[side] * required,
        safeRatio,
        station,
        stageName: side,
        action: `Wipe Neck Label ${side === "left" ? "Left" : "Right"} Side Outward + ${geometry.overWipeMm} mm - Agg ${station}`,
        completionAction: `Hold at ${side === "left" ? "Left" : "Right"} Neck Label Over-Wipe Edge - Agg ${station}`,
        geometry
      });
      results[side] = stage;
      lastTable = stage.table;
      plate = stage.plate;
    });

    ["left", "right"].forEach((side) => {
      const remaining = results[side]?.remaining;
      if (!(remaining > EPSILON)) return;
      appendIssue({
        level: "bad",
        code: `cold-glue-neck-${side}-capacity`,
        station,
        section: "neck",
        side,
        message: `Aggregate ${station} ${side} neck-label brush contact is short by ${remaining.toFixed(1)}° of bottle rotation. Extend or reposition the brush assigned to the ${side} wing; the tool will not rotate through a no-contact gap.`
      });
    });

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

  function applyNeckTwoSideMotion(rows, map) {
    if (!Array.isArray(rows) || !map || map.applicationMode !== "cold-glue") return rows;
    let result = rows.map((row) => ({ ...row }));
    const stations = [...new Set(
      result
        .filter((row) => row?.section === "neck" && Number.isFinite(Number(row?.station)))
        .map((row) => Number(row.station))
    )].sort((a, b) => a - b);

    if (state?.motionPlan?.mapDriven) {
      const stationSet = new Set(stations);
      const neckCodes = new Set([
        "cold-glue-gripper-centerline-fallback",
        "cold-glue-gripper-alignment-window",
        "cold-glue-opposed-channel-missing",
        "cold-glue-channel-entry-window",
        "cold-glue-full-turn-blocked",
        "cold-glue-center-out-runout-missing",
        "cold-glue-opposite-edge-contact-blocked",
        "cold-glue-label-length-runout-capacity",
        "cold-glue-center-out-capacity",
        "cold-glue-neck-gripper-fallback",
        "cold-glue-neck-gripper-window",
        "cold-glue-neck-opposed-press-missing",
        "cold-glue-neck-press-capacity",
        "cold-glue-neck-full-turn-blocked",
        "cold-glue-neck-left-brush-missing",
        "cold-glue-neck-right-brush-missing",
        "cold-glue-neck-left-capacity",
        "cold-glue-neck-right-capacity"
      ]);
      state.motionPlan.issues = (Array.isArray(state.motionPlan.issues) ? state.motionPlan.issues : []).filter((issue) =>
        !(issue?.section === "neck" && stationSet.has(Number(issue?.station)) && neckCodes.has(String(issue?.code || "")))
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
      const replacement = buildNeckTwoSideBlock(map, station, previous, originalBlock);
      result.splice(first, last - first + 1, ...replacement);
    });

    result = collapseArtificialCycles(result).map((row, index) => ({ ...row, hmi: index + 1, plc: index }));
    if (state?.motionPlan?.mapDriven) state.motionPlan.rows = result;
    return result;
  }

  function wrapGenerator() {
    const original = window.generatedColdGlueFixedProfile;
    if (typeof original !== "function" || original.coldGlueNeckLeftRightWrappedV2) return false;
    const wrapped = function generatedColdGlueNeckLeftRightProfile(...args) {
      return applyNeckTwoSideMotion(original.apply(this, args), currentMap());
    };
    wrapped.coldGlueNeckLeftRightWrapped = true;
    wrapped.coldGlueNeckLeftRightWrappedV2 = true;
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
