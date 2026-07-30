(function (global) {
  "use strict";

  const RETRY_MS = 50;
  const EPSILON = 0.001;
  const COVERAGE_CODES = new Set(["optimizer-wipe-contact", "optimizer-wipe-object-missing"]);
  let installed = false;

  function number(value, fallback = null) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function text(value, fallback = "") {
    const resolved = String(value ?? "").trim();
    return resolved || fallback;
  }

  function activeMap(options = {}) {
    if (options.map && typeof options.map === "object") return options.map;
    try {
      return typeof activeMachineMap === "function" ? activeMachineMap() : null;
    } catch {
      return null;
    }
  }

  function normalizeSection(value) {
    const section = text(value).toLowerCase();
    return ["neck", "body", "back", "none"].includes(section) ? section : "";
  }

  function itemApplication(item) {
    return item?.application === "cold-glue"
      || ["brush", "brush-channel", "gripper"].includes(String(item?.kind || ""))
      ? "cold-glue"
      : "apl";
  }

  function objectSection(item, map) {
    const explicit = normalizeSection(item?.labelSection);
    if (explicit) return explicit;
    const station = String(item?.station ?? item?.aggregate ?? "");
    const stationSection = normalizeSection(map?.stationSections?.[station]);
    return stationSection;
  }

  function wipeObject(item) {
    return /pad|roller|brush|wipe/i.test(`${item?.kind || ""} ${item?.type || ""} ${item?.name || ""}`);
  }

  function activeObjects(options = {}) {
    const map = activeMap(options);
    const source = Array.isArray(map?.objects) && map.objects.length
      ? map.objects
      : Array.isArray(options.objects) && options.objects.length
        ? options.objects
        : map?.applicationMode === "cold-glue"
          ? options.coldGlueObjects
          : options.aplObjects;
    const result = [];
    const seen = new Set();
    (Array.isArray(source) ? source : []).forEach((item, index) => {
      if (!item || typeof item !== "object") return;
      const id = text(item.id, `${item.kind || item.type || "object"}-${index}`);
      if (seen.has(id)) return;
      seen.add(id);
      result.push({ ...item, id });
    });
    return result;
  }

  function stageSide(frame, candidates) {
    const stage = text(frame?.row?.stage || frame?.row?.brushStage).toLowerCase();
    const action = text(frame?.action).toLowerCase();
    let requested = "";
    if (/outer|outside/.test(stage) || /wipe turn 1|outside/.test(action)) requested = "outer";
    if (/inner|inside/.test(stage) || /wipe turn 2|inside/.test(action)) requested = "inner";
    if (!requested) return "";
    const hasOuter = candidates.some((item) => item?.side !== "inner");
    const hasInner = candidates.some((item) => item?.side === "inner");
    return hasOuter && hasInner ? requested : "";
  }

  function matchingObjects(frame, objects, map) {
    const explicit = new Set((frame?.objectIds || frame?.row?.objectIds || []).map(String));
    let candidates = explicit.size
      ? objects.filter((item) => explicit.has(String(item.id)))
      : objects.filter((item) =>
          Number(item?.station ?? item?.aggregate) === Number(frame?.aggregate)
          && wipeObject(item)
        );

    const expectedApplication = map?.applicationMode === "cold-glue"
      || /cold-glue/i.test(text(frame?.row?.motionSource))
      ? "cold-glue"
      : "apl";
    const applicationMatches = candidates.filter((item) => itemApplication(item) === expectedApplication);
    if (applicationMatches.length) candidates = applicationMatches;

    const section = normalizeSection(frame?.section || frame?.row?.section);
    if (section) {
      const sectionMatches = candidates.filter((item) => {
        const assigned = objectSection(item, map);
        return !assigned || assigned === section;
      });
      if (sectionMatches.length) candidates = sectionMatches;
      else if (candidates.some((item) => objectSection(item, map))) return [];
    }

    const side = stageSide(frame, candidates);
    if (side) candidates = candidates.filter((item) => side === "inner" ? item.side === "inner" : item.side !== "inner");
    return candidates;
  }

  function rawObjectRange(item, driver) {
    if (driver?.objectRange) return driver.objectRange(item);
    const start = number(item?.angle, number(item?.start));
    if (start === null) return null;
    let end = number(item?.end);
    if (end === null) end = start + Math.max(0, number(item?.wipeSpanDeg, 0));
    if (end < start) end += 360;
    return { start, end: Math.max(start, end) };
  }

  function overlap(startA, endA, startB, endB) {
    return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
  }

  function alignedObjectRange(item, frame, driver) {
    const range = rawObjectRange(item, driver);
    if (!range) return null;
    const frameStart = number(frame?.tableStart, 0);
    const frameEnd = number(frame?.tableEnd, frameStart);
    const targetMid = (frameStart + frameEnd) / 2;
    const baseMid = (range.start + range.end) / 2;
    const baseShift = Math.round((targetMid - baseMid) / 360);
    let best = null;
    [baseShift - 1, baseShift, baseShift + 1].forEach((turns) => {
      const shifted = { start: range.start + turns * 360, end: range.end + turns * 360 };
      const score = overlap(frameStart, frameEnd, shifted.start, shifted.end);
      if (!best || score > best.score) best = { ...shifted, score };
    });
    return best;
  }

  function unionCoverage(ranges, start, end) {
    const clipped = ranges
      .filter(Boolean)
      .map((range) => ({ start: Math.max(start, range.start), end: Math.min(end, range.end) }))
      .filter((range) => range.end > range.start + EPSILON)
      .sort((a, b) => a.start - b.start);
    if (!clipped.length) return 0;
    let total = 0;
    let current = { ...clipped[0] };
    clipped.slice(1).forEach((range) => {
      if (range.start <= current.end + EPSILON) current.end = Math.max(current.end, range.end);
      else {
        total += current.end - current.start;
        current = { ...range };
      }
    });
    total += current.end - current.start;
    return total;
  }

  function sectionAssignments(objects, frame, map) {
    return [...new Set(objects
      .filter((item) => Number(item?.station ?? item?.aggregate) === Number(frame?.aggregate) && wipeObject(item))
      .map((item) => objectSection(item, map))
      .filter(Boolean))];
  }

  function coverageDiagnostics(rows, options, driver) {
    const map = activeMap(options);
    const objects = activeObjects(options);
    const frames = driver.buildFrames(rows, options);
    const diagnostics = [];

    frames
      .filter((frame) => /wipe|brush|pad|roller/i.test(text(frame.action)) && [1, 2, 4, 5, 6, 7].includes(Number(frame.command)))
      .forEach((frame) => {
        const matches = matchingObjects(frame, objects, map);
        if (!matches.length) {
          const assignments = sectionAssignments(objects, frame, map);
          const expected = normalizeSection(frame.section || frame.row?.section);
          const mismatch = expected && assignments.length && !assignments.includes(expected);
          diagnostics.push({
            level: mismatch ? "bad" : "warn",
            code: "optimizer-wipe-object-missing",
            category: "coverage",
            hmi: frame.hmi,
            eventId: frame.eventId,
            message: mismatch
              ? `${frame.action} is generated as a ${expected} wipe, but Aggregate ${frame.aggregate} is assigned to ${assignments.join(" / ")} wipe-down objects.`
              : `${frame.action} has no matching pad, roller, or brush on the active map.`,
            recommendation: mismatch
              ? `In Map Builder, set Label type / wipe definition for Aggregate ${frame.aggregate} to ${expected}, or change the generated station assignment to match the physical label.`
              : "Assign the mechanical event to an active Map Builder object or add the missing wipe-down object.",
            expectedSection: expected || null,
            mappedSections: assignments,
            objectIds: []
          });
          return;
        }

        const frameStart = number(frame.tableStart, 0);
        const frameEnd = number(frame.tableEnd, frameStart);
        const span = Math.max(EPSILON, frameEnd - frameStart);
        const ranges = matches.map((item) => alignedObjectRange(item, frame, driver));
        const covered = unionCoverage(ranges, frameStart, frameEnd);
        const coverage = Math.min(1, covered / span);
        if (coverage >= 0.75) return;

        const names = [...new Set(matches.map((item) => text(item.name || item.id)))];
        const side = stageSide(frame, matches);
        diagnostics.push({
          level: coverage <= 0.05 ? "bad" : "warn",
          code: "optimizer-wipe-contact",
          category: "coverage",
          hmi: frame.hmi,
          eventId: frame.eventId,
          message: `${frame.action} overlaps its mapped ${side ? `${side} ` : ""}wipe-down surface for only ${(coverage * 100).toFixed(0)}% of the command window.`,
          recommendation: `Reposition or extend ${names.join(", ") || "the wipe-down object"} so the entire CMD window occurs under physical contact.`,
          coveragePercent: coverage * 100,
          objectIds: matches.map((item) => String(item.id)),
          alignedRanges: ranges.filter(Boolean).map(({ start, end }) => ({ start, end }))
        });
      });

    return diagnostics;
  }

  function install() {
    if (installed) return true;
    const driver = global.LabelerProgramOptimizerDriver;
    if (!driver?.analyze || !driver?.buildFrames) return false;

    const originalAnalyze = driver.analyze.bind(driver);
    const wrappedAnalyze = function analyzeWithMapAwareCoverage(rows, options = {}) {
      const result = originalAnalyze(rows, options);
      const replacements = coverageDiagnostics(result?.sourceRows || rows, options, driver);
      const retained = (result?.diagnostics || []).filter((item) => !COVERAGE_CODES.has(item?.code));
      const diagnostics = [...retained, ...replacements];
      const weight = { bad: 0, warn: 1, info: 2, ok: 3 };
      diagnostics.sort((a, b) => (weight[a.level] ?? 9) - (weight[b.level] ?? 9) || number(a.hmi, 9999) - number(b.hmi, 9999));
      result.diagnostics = diagnostics;
      if (driver.calculateMetrics) result.currentMetrics = driver.calculateMetrics(result.sourceRows || rows, options, diagnostics);
      result.status = diagnostics.some((item) => item.level === "bad")
        ? "ACTION"
        : diagnostics.some((item) => item.level === "warn")
          ? "REVIEW"
          : "HEALTHY";
      return result;
    };

    global.LabelerProgramOptimizerDriver = Object.freeze({ ...driver, analyze: wrappedAnalyze });
    installed = true;

    try {
      if (typeof state !== "undefined" && state.programOptimization) {
        state.programOptimization.lastSignature = "";
        state.programOptimization.result = null;
      }
      window.setTimeout(() => {
        if (typeof renderProgram === "function") renderProgram();
        if (typeof renderValidation === "function") renderValidation();
      }, 0);
    } catch {
      // The next normal render will run the corrected analyzer.
    }
    return true;
  }

  function wait() {
    if (install()) return;
    window.setTimeout(wait, RETRY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait, { once: true });
  else wait();
})(window);
