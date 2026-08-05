"use strict";

(function installAplContactWindowDriver(global) {
  if (global.LabelerAplContactWindowDriver) return;

  const EPS = 0.001;
  const COMMAND_GAP_DEG = 0.5;
  const MIN_CONTACT_SPAN_DEG = 0.1;

  function finite(value, fallback = NaN) {
    if (value === null || value === undefined || value === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function clone(value) {
    if (typeof structuredClone === "function") {
      try { return structuredClone(value); } catch { /* fall through */ }
    }
    return JSON.parse(JSON.stringify(value));
  }

  function rangeFor(items = []) {
    const source = (Array.isArray(items) ? items : []).filter(Boolean);
    if (!source.length) return null;
    const start = Math.min(...source.map((item) => finite(item?.start, 0)));
    let end = Math.max(...source.map((item) => finite(item?.end, finite(item?.start, 0) + MIN_CONTACT_SPAN_DEG)));
    while (end <= start + EPS) end += 360;
    return { start, end };
  }

  function overlapHandoff(outsideItems = [], insideItems = [], options = {}) {
    const gap = Math.max(COMMAND_GAP_DEG, finite(options.commandGapDeg, COMMAND_GAP_DEG));
    const minimumSpan = Math.max(MIN_CONTACT_SPAN_DEG, finite(options.minimumSpanDeg, MIN_CONTACT_SPAN_DEG));
    const outside = rangeFor(outsideItems);
    const inside = rangeFor(insideItems);
    if (!outside || !inside) return null;

    let insideStart = inside.start;
    let insideEnd = inside.end;
    while (insideEnd <= outside.start + EPS) {
      insideStart += 360;
      insideEnd += 360;
    }

    const overlapStart = Math.max(outside.start, insideStart);
    const overlapEnd = Math.min(outside.end, insideEnd);
    if (overlapEnd < overlapStart - EPS) return null;

    const handoff = (overlapStart + overlapEnd) / 2;
    const outsideEnd = Math.min(outside.end, handoff - gap / 2);
    const insideBegin = Math.max(insideStart, handoff + gap / 2);
    if (outsideEnd <= outside.start + minimumSpan - EPS
      || insideBegin >= insideEnd - minimumSpan + EPS) return null;

    return {
      outside,
      inside: { start: insideStart, end: insideEnd },
      overlapStart,
      overlapEnd,
      handoff,
      outsideEnd,
      insideStart: insideBegin,
      commandGapDeg: insideBegin - outsideEnd
    };
  }

  function splitOverlappingPadObjects(objects = [], options = {}) {
    const output = clone(Array.isArray(objects) ? objects : []);
    const adjustments = [];
    const stations = [...new Set(output
      .filter((item) => item?.kind === "pad" && item?.application !== "cold-glue")
      .map((item) => Number(item?.station))
      .filter(Number.isFinite))];

    stations.forEach((station) => {
      const stationPads = output.filter((item) => item?.kind === "pad"
        && item?.application !== "cold-glue"
        && Number(item?.station) === station);
      const outside = stationPads.filter((item) => item?.side !== "inner");
      const inside = stationPads.filter((item) => item?.side === "inner");
      const handoff = overlapHandoff(outside, inside, options);
      if (!handoff) return;

      outside.forEach((item) => {
        const end = finite(item?.end, NaN);
        if (!Number.isFinite(end) || end <= handoff.outsideEnd + EPS) return;
        item.end = handoff.outsideEnd;
        if (Number.isFinite(finite(item?.outerEnd, NaN))) item.outerEnd = Math.min(finite(item.outerEnd), handoff.outsideEnd);
      });
      inside.forEach((item) => {
        let start = finite(item?.start, NaN);
        let end = finite(item?.end, NaN);
        if (!Number.isFinite(start) || !Number.isFinite(end)) return;
        while (end <= start + EPS) end += 360;
        while (end <= handoff.outside.start + EPS) {
          start += 360;
          end += 360;
        }
        if (start >= handoff.insideStart - EPS) return;
        item.start = handoff.insideStart;
        item.end = end;
        if (Number.isFinite(finite(item?.innerStart, NaN))) item.innerStart = Math.max(finite(item.innerStart), handoff.insideStart);
      });

      adjustments.push({
        station,
        outsideOriginalEnd: handoff.outside.end,
        insideOriginalStart: handoff.inside.start,
        outsideProgramEnd: handoff.outsideEnd,
        insideProgramStart: handoff.insideStart,
        overlapStart: handoff.overlapStart,
        overlapEnd: handoff.overlapEnd,
        commandGapDeg: handoff.commandGapDeg
      });
    });

    return { objects: output, adjustments };
  }

  const api = Object.freeze({
    EPS,
    COMMAND_GAP_DEG,
    MIN_CONTACT_SPAN_DEG,
    finite,
    rangeFor,
    overlapHandoff,
    splitOverlappingPadObjects
  });

  global.LabelerAplContactWindowDriver = api;
  global.LabelerDriverRegistry?.register?.("profile.aplContactWindow", api, {
    source: "drivers/profile/apl-contact-window-driver.js",
    replace: true
  });

  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
