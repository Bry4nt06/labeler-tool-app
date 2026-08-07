"use strict";

(function installLabelCenterlinePolicy(global) {
  if (global.LabelerLabelCenterlinePolicy?.installed) return;

  const VERSION = 1;
  const FRONT_ALIGNMENT_TOLERANCE_DEG = 1;
  const REAR_ALIGNMENT_TOLERANCE_DEG = 1;
  const RETRY_MS = 50;

  const finite = (value, fallback = NaN) => {
    if (value === null || value === undefined || value === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  function signedDelta(value, reference) {
    return ((finite(value, 0) - finite(reference, 0) + 540) % 360) - 180;
  }

  function circularDistance(value, reference) {
    return Math.abs(signedDelta(value, reference));
  }

  function nearestEquivalent(target, reference) {
    const base = finite(target, 0);
    const current = finite(reference, base);
    return base + 360 * Math.round((current - base) / 360);
  }

  function applications() {
    try {
      return typeof global.selectedLabelApplicationState === "function"
        ? global.selectedLabelApplicationState()
        : { neck: true, body: true, back: true };
    } catch {
      return { neck: true, body: true, back: true };
    }
  }

  function rawSeedTargets(seed = []) {
    return {
      neck: finite(seed?.[1]?.plateAngle, NaN),
      body: finite(seed?.[11]?.plateAngle, NaN),
      back: finite(seed?.[21]?.plateAngle, NaN)
    };
  }

  function generatedTargets(seed = [], active = applications()) {
    const raw = rawSeedTargets(seed);
    const hasNeck = active?.neck !== false && Number.isFinite(raw.neck);
    const hasBody = active?.body !== false && Number.isFinite(raw.body);
    const hasBack = active?.back !== false && Number.isFinite(raw.back);
    const front = hasNeck ? raw.neck : hasBody ? raw.body : NaN;

    return {
      neck: hasNeck && Number.isFinite(front) ? nearestEquivalent(front, raw.neck) : raw.neck,
      body: hasBody && Number.isFinite(front) ? nearestEquivalent(front, raw.body) : raw.body,
      back: hasBack
        ? (Number.isFinite(front) ? nearestEquivalent(front + 180, raw.back) : raw.back)
        : raw.back,
      front,
      source: hasNeck ? "neck" : hasBody ? "body" : hasBack ? "back" : "none"
    };
  }

  function sectionFromApplicationRow(row) {
    const explicit = String(row?.section || "").trim().toLowerCase();
    if (["neck", "body", "back"].includes(explicit)
      && (row?.applicationReference || /Application/i.test(String(row?.action || "")))) return explicit;
    const action = String(row?.action || "");
    if (/Hold(?:\s+for)?\s+Neck\s+Application/i.test(action)) return "neck";
    if (/Hold(?:\s+for)?\s+Body\s+Application/i.test(action)) return "body";
    if (/Hold(?:\s+for)?\s+Back\s+Application/i.test(action)) return "back";
    return "";
  }

  function applicationReferences(rows = []) {
    const result = { neck: [], body: [], back: [] };
    (Array.isArray(rows) ? rows : []).forEach((row, index) => {
      const section = sectionFromApplicationRow(row);
      const angle = finite(row?.plateAngle, NaN);
      if (!section || !Number.isFinite(angle)) return;
      result[section].push({ section, angle, index, row });
    });
    return result;
  }

  function centerlineForSection(section, rows = []) {
    const normalized = String(section || "").toLowerCase();
    const refs = applicationReferences(rows);
    if (refs[normalized]?.length) return refs[normalized][0].angle;

    // Neck and Body share the same physical front datum. This fallback is used
    // only when one front application row is absent from a partial/generated
    // row set. A loaded program with both rows always uses each actual row.
    if (normalized === "neck" && refs.body.length) return refs.body[0].angle;
    if (normalized === "body" && refs.neck.length) return refs.neck[0].angle;
    return NaN;
  }

  function rewriteGeneratedSeed(sourceRows) {
    if (!Array.isArray(sourceRows) || !sourceRows.length) return sourceRows;
    const rows = sourceRows.map((row) => ({ ...row }));
    const targets = generatedTargets(rows);
    const indexedSections = {
      neck: [1, 5],
      body: [11, 16],
      back: [21, 26]
    };

    Object.entries(indexedSections).forEach(([section, indexes]) => {
      const target = finite(targets[section], NaN);
      if (!Number.isFinite(target)) return;
      indexes.forEach((index) => {
        if (!rows[index] || !Number.isFinite(finite(rows[index].plateAngle, NaN))) return;
        rows[index] = {
          ...rows[index],
          plateAngle: nearestEquivalent(target, rows[index].plateAngle),
          labelCenterlineTarget: true,
          labelCenterlineSection: section
        };
      });
    });

    rows.forEach((row, index) => {
      const section = sectionFromApplicationRow(row);
      const target = finite(targets[section], NaN);
      if (!section || !Number.isFinite(target) || !Number.isFinite(finite(row?.plateAngle, NaN))) return;
      rows[index] = {
        ...row,
        plateAngle: nearestEquivalent(target, row.plateAngle),
        labelCenterlineTarget: true,
        labelCenterlineSection: section,
        applicationReference: true
      };
    });

    return rows;
  }

  function validationNotes(rows = []) {
    const refs = applicationReferences(rows);
    const notes = [];
    const neck = refs.neck[0]?.angle;
    const body = refs.body[0]?.angle;
    const back = refs.back[0]?.angle;
    const front = Number.isFinite(neck) ? neck : body;

    if (Number.isFinite(neck) && Number.isFinite(body)) {
      const mismatch = circularDistance(neck, body);
      if (mismatch > FRONT_ALIGNMENT_TOLERANCE_DEG) {
        notes.push(["warn", `Front label centerline mismatch: Neck is ${neck.toFixed(1)}° and Body is ${body.toFixed(1)}° (${mismatch.toFixed(1)}° apart). ServoForge sensors will use each label's actual application centerline for this loaded program.`, {
          code: "front-label-centerline-mismatch",
          category: "orientation",
          neckCenterlineDeg: neck,
          bodyCenterlineDeg: body,
          mismatchDeg: mismatch
        }]);
      }
    }

    if (Number.isFinite(front) && Number.isFinite(back)) {
      const expectedBack = front + 180;
      const mismatch = circularDistance(back, expectedBack);
      if (mismatch > REAR_ALIGNMENT_TOLERANCE_DEG) {
        notes.push(["warn", `Rear label centerline mismatch: Back is ${back.toFixed(1)}°; expected approximately ${nearestEquivalent(expectedBack, back).toFixed(1)}° opposite the front datum (${mismatch.toFixed(1)}° error). ServoForge sensors will use the actual Back application centerline for this loaded program.`, {
          code: "back-label-centerline-mismatch",
          category: "orientation",
          frontCenterlineDeg: front,
          backCenterlineDeg: back,
          mismatchDeg: mismatch
        }]);
      }
    }
    return notes;
  }

  function wrapSeedGenerator() {
    const base = global.generatedAplSeedProfile;
    if (typeof base !== "function") return false;
    if (base.labelCenterlinePolicyV1) return true;

    const wrapped = function generatedAplSeedProfileWithCenterlinePolicy(...args) {
      return rewriteGeneratedSeed(base.apply(this, args));
    };
    wrapped.labelCenterlinePolicyV1 = true;
    wrapped.previousGeneratedAplSeedProfile = base;
    global.generatedAplSeedProfile = wrapped;

    const generator = global.LabelerAplSeedProfileGenerator;
    if (generator?.generateSeed) {
      global.LabelerAplSeedProfileGenerator = Object.freeze({
        ...generator,
        generateSeed: wrapped,
        labelCenterlinePolicyV1: true
      });
    }
    return true;
  }

  function install() {
    if (!wrapSeedGenerator()) {
      global.setTimeout?.(install, RETRY_MS);
      return false;
    }
    return true;
  }

  global.LabelerLabelCenterlinePolicy = Object.freeze({
    installed: true,
    VERSION,
    FRONT_ALIGNMENT_TOLERANCE_DEG,
    REAR_ALIGNMENT_TOLERANCE_DEG,
    signedDelta,
    circularDistance,
    nearestEquivalent,
    applications,
    rawSeedTargets,
    generatedTargets,
    sectionFromApplicationRow,
    applicationReferences,
    centerlineForSection,
    rewriteGeneratedSeed,
    validationNotes
  });

  install();
})(typeof window !== "undefined" ? window : globalThis);
