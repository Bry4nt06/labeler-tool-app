"use strict";

(function installColdGlueCenterOutBrushMotion() {
  const RETRY_MS = 50;
  const EPSILON = 0.001;
  const FULL_CYCLE = 360;
  const MAX_SAFE_TURN = 359;
  const CHANNEL_ENTRY_ANGLE = 90;
  let installed = false;

  function finite(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function currentMap() {
    return typeof activeMachineMap === "function" ? activeMachineMap() : null;
  }

  function finish(value) {
    return typeof finishAngle === "function" ? finishAngle(value) : Math.round(finite(value, 0) * 10) / 10;
  }

  function nearestEquivalent(target, reference) {
    const base = finite(target, 0);
    const current = finite(reference, base);
    return base + FULL_CYCLE * Math.round((current - base) / FULL_CYCLE);
  }

  function stationObjects(map, station) {
    const runtime = Array.isArray(state?.coldGlueMap) ? state.coldGlueMap : [];
    const saved = Array.isArray(map?.objects) ? map.objects : [];
    const source = runtime.some((item) => item?.kind === "brush" || item?.kind === "brush-channel") ? runtime : saved;
    return source.filter((item) => Number(item?.station) === Number(station) && (item?.kind === "brush" || item?.kind === "brush-channel"));
  }

  function expandBrushes(objects) {
    const brushes = [];
    objects.forEach((item, index) => {
      if (item.kind === "brush-channel") {
        brushes.push({
          id: `${item.id || index}-outer`,
          side: "outer",
          start: finite(item.outerStart, item.start),
          end: finite(item.outerEnd, item.end)
        });
        brushes.push({
          id: `${item.id || index}-inner`,
          side: "inner",
          start: finite(item.innerStart, item.start),
          end: finite(item.innerEnd, item.end)
        });
        return;
      }
      brushes.push({
        id: item.id || `brush-${index}`,
        side: item.side === "inner" ? "inner" : "outer",
        start: finite(item.start, 0),
        end: finite(item.end, finite(item.start, 0) + 1)
      });
    });
    return brushes;
  }

  function atOrAfter(angle, minimum) {
    let value = finite(angle, minimum);
    while (value < minimum - EPSILON) value += FULL_CYCLE;
    return value;
  }

  function brushSegments(objects, minimumTable) {
    const brushes = expandBrushes(objects).map((brush) => {
      const start = atOrAfter(brush.start, minimumTable);
      let end = atOrAfter(brush.end, start + EPSILON);
      while (end <= start + EPSILON) end += FULL_CYCLE;
      return { ...brush, start, end };
    });
    if (!brushes.length) return [];

    const points = [...new Set(brushes.flatMap((brush) => [brush.start, brush.end]).map((value) => Number(value.toFixed(6))))].sort((a, b) => a - b);
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

  function virtualizeBrushChannels(source) {
    return (Array.isArray(source) ? source : []).flatMap((item, index) => {
      if (item?.kind !== "brush-channel") return [{ ...item }];
      return [
        {
          ...item,
          id: `${item.id || `channel-${index}`}-outer`,
          kind: "brush",
          side: "outer",
          start: finite(item.outerStart, item.start),
          end: finite(item.outerEnd, item.end),
          role: "process"
        },
        {
          ...item,
          id: `${item.id || `channel-${index}`}-inner`,
          kind: "brush",
          side: "inner",
          start: finite(item.innerStart, item.start),
          end: finite(item.innerEnd, item.end),
          role: "process"
        }
      ];
    });
  }

  function installCenterOutDriverRules() {
    const driver = window.LabelerColdGlueMotionDriver;
    if (!driver || driver.centerOutSafetyInstalledV2) return Boolean(driver);

    driver.createPlan = function createCenterOutBrushPlan(options = {}) {
      const labelDeg = Math.max(0, finite(options.labelDeg, 0));
      const overWipeDeg = Math.max(0, finite(options.overWipeDeg, 0));
      const requestedSideTurn = labelDeg / 2 + overWipeDeg;
      const sideTurn = Math.min(MAX_SAFE_TURN, requestedSideTurn);
      const maxRatio = Math.max(0.1, finite(options.maxRatio, 21));
      const safetyFactor = Math.max(0.25, Math.min(0.98, finite(options.safetyFactor, 0.9)));
      const segments = brushSegments(options.brushes || [], 0);
      const channelEntry = segments[0]?.stage === "opposed";
      const firstSingleIndex = segments.findIndex((segment) => segment.stage === "outer" || segment.stage === "inner");
      const issues = [];
      const process = [];
      const holds = [];

      if (channelEntry) {
        const holdEnd = firstSingleIndex >= 0 ? segments[firstSingleIndex].start : segments.filter((segment) => segment.stage === "opposed").at(-1)?.end;
        if (Number.isFinite(holdEnd)) {
          holds.push({
            id: "cold-glue-opposed-channel-hold",
            role: "hold",
            stage: "opposed",
            start: segments[0].start,
            end: holdEnd,
            span: Math.max(0, holdEnd - segments[0].start),
            holdAngle: CHANNEL_ENTRY_ANGLE,
            holdBottleAngle: true,
            holdCurrent: false,
            channelEntryAngle: CHANNEL_ENTRY_ANGLE
          });
        }
      }

      if (requestedSideTurn >= FULL_CYCLE - EPSILON) {
        issues.push({
          level: "bad",
          code: "cold-glue-full-turn-blocked",
          message: `The center-to-edge brush turn requests ${requestedSideTurn.toFixed(1)}°. Cold Glue contact turns are limited to less than one complete bottle revolution.`
        });
      }

      if (firstSingleIndex < 0) {
        issues.push({
          level: "bad",
          code: "cold-glue-center-out-runout-missing",
          message: "The opposed brush channel has no one-sided exit length. Stagger or extend one brush so the servo can wipe from the 90° channel reference toward one label edge."
        });
      } else {
        const side = segments[firstSingleIndex].stage;
        const direction = side === "inner" ? 1 : -1;
        let remaining = sideTurn;
        for (let index = firstSingleIndex; index < segments.length && remaining > EPSILON; index += 1) {
          const segment = segments[index];
          if (segment.stage !== side) {
            issues.push({
              level: "bad",
              code: "cold-glue-opposite-edge-contact-blocked",
              message: `The brush path changes away from the ${side} one-sided completion surface. The opposite-edge crossing was not generated.`
            });
            break;
          }
          const span = Math.max(EPSILON, segment.end - segment.start);
          const rotation = Math.min(remaining, span * maxRatio * safetyFactor, MAX_SAFE_TURN);
          process.push({
            id: `center-out-${side}-${index}`,
            side,
            role: "process",
            stage: side,
            start: segment.start,
            end: segment.end,
            span,
            rotation,
            ratio: rotation / span,
            direction,
            centerOutFromApplication: true,
            channelEntryAngle: channelEntry ? CHANNEL_ENTRY_ANGLE : null
          });
          remaining -= rotation;
        }
        if (remaining > EPSILON) {
          issues.push({
            level: "bad",
            code: "cold-glue-center-out-capacity",
            message: `The ${side} completion brush is short by ${remaining.toFixed(1)}° of bottle rotation. Extend that same-side surface instead of rotating into the opposite label edge.`
          });
        }
      }

      return {
        labelDeg,
        overWipeDeg,
        totalRotation: sideTurn,
        fullWrap: false,
        centerOutFromApplication: true,
        simultaneousOppositeWipe: channelEntry,
        channelEntryAngle: channelEntry ? CHANNEL_ENTRY_ANGLE : null,
        brushEntryLeadDeg: 0,
        finalPlateTravel: process.reduce((sum, allocation) => sum + allocation.direction * allocation.rotation, 0),
        partialCoveragePercent: 50,
        processRequired: sideTurn,
        finalRequired: 0,
        process,
        final: [],
        holds,
        issues
      };
    };

    driver.flowFacingTarget = () => CHANNEL_ENTRY_ANGLE;
    driver.applicationTarget = (baseTargetDeg) => finite(baseTargetDeg, 0);
    driver.centerOutSafetyInstalled = true;
    driver.centerOutSafetyInstalledV2 = true;
    return true;
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
      motionSource: "cold-glue-center-out-brush",
      coldGlueCenterOut: true,
      ...extra
    });
  }

  function buildCenterOutBlock(map, station, previousRow, originalBlock) {
    const plan = typeof sectionWipePlan === "function" ? sectionWipePlan("neck") : null;
    const labelDeg = Math.max(0, finite(plan?.labelDeg, 0));
    const overWipeDeg = Math.max(0, finite(plan?.overWipeDeg, 0));
    const requestedSideTurn = labelDeg / 2 + overWipeDeg;
    const safeSideTurn = Math.min(MAX_SAFE_TURN, requestedSideTurn);
    const safeRatio = Math.max(0.1, finite(state?.maxMoveRatio, 21) * 0.9);
    const startPlate = finite(previousRow?.plateAngle, finite(state?.buildInputs?.plateStartPositionDeg, 0));
    const centerPlate = finite(state?.buildInputs?.plateStartPositionDeg, 0);
    let lastTable = finite(previousRow?.tableAngle, 0);
    let plate = startPlate;
    const output = [];

    const settings = state?.coldGlueAggregateSettings || {};
    const aggregateAngle = finite(
      settings?.aggregateAngles?.[String(station)],
      finite(map?.aggregateAngles?.[String(station)], finite(map?.stationAngles?.[String(station)], finite(originalBlock.find((row) => Number(row.cmd) === 3)?.tableAngle, lastTable + 1)))
    );
    let applicationTable = atOrAfter(aggregateAngle, lastTable + 0.5);
    if (applicationTable <= lastTable + EPSILON) applicationTable = lastTable + 0.5;

    if (Math.abs(centerPlate - plate) > EPSILON) {
      const turnStart = Math.min(applicationTable - 0.1, lastTable + 0.5);
      pushRow(output, 7, turnStart, plate, `Turn to Neck Center-Line Application - Agg ${station}`, { station, section: "neck", centerLineApplication: true });
      plate = centerPlate;
      pushRow(output, 3, applicationTable, plate, `Hold Neck Center-Line Application - Agg ${station}`, { station, section: "neck", centerLineApplication: true });
    }
    lastTable = applicationTable;

    const objects = stationObjects(map, station);
    const segments = brushSegments(objects, applicationTable);
    if (!segments.length) {
      appendIssue({
        level: "bad",
        code: "cold-glue-no-brushes",
        station,
        section: "neck",
        message: `Aggregate ${station} has no usable Cold Glue brush surface after the label application point.`
      });
      return output;
    }

    const channelEntry = segments[0]?.stage === "opposed";
    const firstSingleIndex = segments.findIndex((segment) => segment.stage === "outer" || segment.stage === "inner");

    if (channelEntry) {
      const brushEntryTable = segments[0].start;
      const entryPlate = nearestEquivalent(CHANNEL_ENTRY_ANGLE, plate);
      const entryRotation = entryPlate - plate;
      const availableSpan = Math.max(EPSILON, brushEntryTable - lastTable);
      const requiredSpan = Math.abs(entryRotation) / safeRatio;
      const turnStart = Math.max(lastTable + 0.1, brushEntryTable - requiredSpan);
      const actualSpan = Math.max(EPSILON, brushEntryTable - turnStart);
      const entryRatio = Math.abs(entryRotation) / actualSpan;

      if (Math.abs(entryRotation) > EPSILON) {
        pushRow(output, 7, turnStart, plate, `Turn to 90° Cold Glue Brush Channel Entry - Agg ${station}`, {
          station,
          section: "neck",
          brushStage: "channel-entry",
          channelEntryAngle: CHANNEL_ENTRY_ANGLE,
          plannedRotation: entryRotation,
          plannedRatio: entryRatio
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

      if (requiredSpan > availableSpan + EPSILON || entryRatio >= finite(state?.maxMoveRatio, 21)) {
        appendIssue({
          level: "bad",
          code: "cold-glue-channel-entry-window",
          station,
          section: "neck",
          message: `Aggregate ${station} does not provide enough table travel after label application to reach the required 90° brush-channel entry before contact. Move the channel later or provide at least ${requiredSpan.toFixed(1)}° of table travel.`
        });
      }
    }

    if (requestedSideTurn >= FULL_CYCLE - EPSILON) {
      appendIssue({
        level: "bad",
        code: "cold-glue-full-turn-blocked",
        station,
        section: "neck",
        message: `Aggregate ${station} would require ${requestedSideTurn.toFixed(1)}° from the center line to a label edge. Cold Glue brush contact is limited to less than one full bottle revolution, so the generated turn was capped at ${MAX_SAFE_TURN}°.`
      });
    }

    if (firstSingleIndex < 0) {
      appendIssue({
        level: "bad",
        code: "cold-glue-center-out-runout-missing",
        station,
        section: "neck",
        message: `Aggregate ${station} holds the bottle at 90° through the opposed brushes, but both brushes end together. Stagger or extend one brush so the bottle can turn from 90° toward that brush's label edge without crossing to the opposite edge.`
      });
      return output;
    }

    const side = segments[firstSingleIndex].stage;
    const direction = side === "inner" ? 1 : -1;
    const usable = [];
    let unsafeTransition = false;
    for (let index = firstSingleIndex; index < segments.length; index += 1) {
      const segment = segments[index];
      if (segment.stage === side) {
        usable.push(segment);
        continue;
      }
      unsafeTransition = true;
      break;
    }

    if (unsafeTransition) {
      appendIssue({
        level: "bad",
        code: "cold-glue-opposite-edge-contact-blocked",
        station,
        section: "neck",
        side,
        message: `Aggregate ${station} changes from the ${side} one-sided brush back into opposed or opposite-side contact after the servo begins wiping. The unsafe crossing was blocked; keep the one-sided completion brush continuous through the channel exit.`
      });
    }

    let remaining = safeSideTurn;
    usable.forEach((segment) => {
      if (remaining <= EPSILON) return;
      const span = Math.max(EPSILON, segment.end - segment.start);
      const rotation = Math.min(remaining, span * safeRatio, MAX_SAFE_TURN);
      if (rotation <= EPSILON) return;
      const start = Math.max(segment.start, lastTable);
      const end = Math.max(start + EPSILON, segment.end);
      pushRow(output, 7, start, plate, `${channelEntry ? "Cold Glue Neck 90° Channel Exit" : "Cold Glue Neck Center-Out"} — ${side === "inner" ? "Inside" : "Outside"} Brush - Agg ${station}`, {
        station,
        section: "neck",
        brushStage: side,
        brushSide: side,
        centerOutFromApplication: true,
        channelEntryAngle: channelEntry ? CHANNEL_ENTRY_ANGLE : null,
        plannedRotation: rotation,
        plannedRatio: rotation / Math.max(EPSILON, end - start)
      });
      plate += direction * rotation;
      pushRow(output, 3, end, plate, `Cold Glue Neck ${side === "inner" ? "Inside" : "Outside"} Edge Hold - Agg ${station}`, {
        station,
        section: "neck",
        brushStage: `${side}-complete`,
        brushSide: side,
        centerOutFromApplication: true,
        channelEntryAngle: channelEntry ? CHANNEL_ENTRY_ANGLE : null,
        plannedRotation: rotation,
        plannedRatio: rotation / Math.max(EPSILON, end - start)
      });
      lastTable = end;
      remaining -= rotation;
    });

    if (remaining > EPSILON) {
      appendIssue({
        level: "bad",
        code: "cold-glue-center-out-capacity",
        station,
        section: "neck",
        side,
        message: `Aggregate ${station} ${side} brush runout is short by ${remaining.toFixed(1)}° of bottle rotation. Extend the same-side brush surface; the tool will not finish the label by rotating into the opposite label edge.`
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
      return Math.abs(tableAngle - raw) > EPSILON ? { ...row, tableAngle: finish(tableAngle), tableCycleCorrected: true } : { ...row };
    });
  }

  function applyCenterOutMotion(rows, map) {
    if (!Array.isArray(rows) || !map || map.applicationMode !== "cold-glue") return rows;
    let result = rows.map((row) => ({ ...row }));
    const stations = [...new Set(result.filter((row) => row?.section === "neck" && Number.isFinite(Number(row?.station))).map((row) => Number(row.station)))].sort((a, b) => a - b);
    if (state?.motionPlan?.mapDriven) {
      const stationSet = new Set(stations);
      state.motionPlan.issues = (Array.isArray(state.motionPlan.issues) ? state.motionPlan.issues : []).filter((issue) => !(issue?.section === "neck" && stationSet.has(Number(issue?.station))));
    }

    stations.forEach((station) => {
      const indexes = result.map((row, index) => Number(row?.station) === station && row?.section === "neck" ? index : -1).filter((index) => index >= 0);
      if (!indexes.length || !stationObjects(map, station).length) return;
      const first = indexes[0];
      const last = indexes[indexes.length - 1];
      const previous = result[first - 1] || null;
      const originalBlock = result.slice(first, last + 1);
      const replacement = buildCenterOutBlock(map, station, previous, originalBlock);
      result.splice(first, last - first + 1, ...replacement);
    });

    result = collapseArtificialCycles(result).map((row, index) => ({ ...row, hmi: index + 1, plc: index }));
    if (state?.motionPlan?.mapDriven) state.motionPlan.rows = result;
    return result;
  }

  function wrapGenerator() {
    const original = window.generatedColdGlueFixedProfile;
    if (typeof original !== "function" || original.coldGlueCenterOutWrappedV2) return false;
    const wrapped = function generatedColdGlueCenterOutProfile(...args) {
      installCenterOutDriverRules();
      const runtimeObjects = Array.isArray(state?.coldGlueMap) ? state.coldGlueMap : null;
      if (runtimeObjects) state.coldGlueMap = virtualizeBrushChannels(runtimeObjects);
      try {
        const rows = original.apply(this, args);
        return applyCenterOutMotion(rows, currentMap());
      } finally {
        if (runtimeObjects) state.coldGlueMap = runtimeObjects;
      }
    };
    wrapped.coldGlueCenterOutWrapped = true;
    wrapped.coldGlueCenterOutWrappedV2 = true;
    wrapped.originalGenerator = original;
    window.generatedColdGlueFixedProfile = wrapped;
    try { generatedColdGlueFixedProfile = wrapped; } catch { /* global binding may be read-only */ }
    return true;
  }

  function install() {
    if (installed) return true;
    if (typeof state === "undefined" || typeof window.generatedColdGlueFixedProfile !== "function") return false;
    if (!installCenterOutDriverRules()) return false;
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