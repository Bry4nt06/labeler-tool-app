"use strict";

(function installLabelCenterlinePolicy(global) {
  if (global.LabelerLabelCenterlinePolicy?.installed) return;

  const VERSION = 2;
  const CENTER_TACK = "center-tack";
  const LEADING_EDGE = "leading-edge";
  const DEFAULT_REFERENCES = Object.freeze({
    neck: CENTER_TACK,
    body: LEADING_EDGE,
    back: LEADING_EDGE
  });
  const FRONT_ALIGNMENT_TOLERANCE_DEG = 1;
  const REAR_ALIGNMENT_TOLERANCE_DEG = 1;
  const RETRY_MS = 50;

  const finite = (value, fallback = NaN) => {
    if (value === null || value === undefined || value === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const stateRef = () => typeof state !== "undefined" ? state : global.state;

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

  function normalizeApplicationReference(value, fallback = CENTER_TACK) {
    const normalized = String(value ?? "").trim().toLowerCase().replace(/[_\s]+/g, "-");
    if (["leading", "leading-edge", "edge", "left-edge"].includes(normalized)) return LEADING_EDGE;
    if (["center", "centre", "center-tack", "centre-tack", "centerline", "centreline"].includes(normalized)) return CENTER_TACK;
    return fallback;
  }

  function ensureApplicationReferenceDefaults(target = stateRef()) {
    if (!target || typeof target !== "object") return null;
    target.buildInputs = target.buildInputs && typeof target.buildInputs === "object" ? target.buildInputs : {};
    const inputs = target.buildInputs;
    const legacyNeck = normalizeApplicationReference(inputs.neckApplication, DEFAULT_REFERENCES.neck);
    inputs.neckApplicationReference = normalizeApplicationReference(inputs.neckApplicationReference, legacyNeck);
    inputs.bodyApplicationReference = normalizeApplicationReference(inputs.bodyApplicationReference, DEFAULT_REFERENCES.body);
    inputs.backApplicationReference = normalizeApplicationReference(inputs.backApplicationReference, DEFAULT_REFERENCES.back);

    // Keep the previous Neck field synchronized for integrations that have not
    // yet retired the legacy two-value setting.
    inputs.neckApplication = inputs.neckApplicationReference === LEADING_EDGE ? "Leading Edge" : "Center";
    return inputs;
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

  function applicationReference(section, row = null, target = stateRef()) {
    if (String(target?.applicationMode || "").toLowerCase() === "cold-glue") return CENTER_TACK;
    const normalizedSection = String(section || "").trim().toLowerCase();
    if (!["neck", "body", "back"].includes(normalizedSection)) return CENTER_TACK;
    const rowMode = normalizeApplicationReference(row?.applicationReferenceMode, "");
    if (rowMode === CENTER_TACK || rowMode === LEADING_EDGE) return rowMode;
    const inputs = ensureApplicationReferenceDefaults(target) || {};
    return normalizeApplicationReference(
      inputs[`${normalizedSection}ApplicationReference`],
      DEFAULT_REFERENCES[normalizedSection]
    );
  }

  function selectedLabel(target = stateRef()) {
    try {
      if (typeof global.selectedLabelSpec === "function") return global.selectedLabelSpec();
    } catch {}
    return (target?.labelSpecs || []).find((row) => String(row?.brand || "") === String(target?.selectedBrand || "")) || null;
  }

  function selectedBottle(target = stateRef()) {
    try {
      if (typeof global.selectedBottleSpec === "function") return global.selectedBottleSpec();
    } catch {}
    return (target?.bottleSpecs || []).find((row) => String(row?.bottleType || "") === String(target?.selectedBottle || "")) || null;
  }

  function bodyCircumferenceValue(target = stateRef()) {
    const bottle = selectedBottle(target);
    try {
      if (typeof global.bodyCircumference === "function") return finite(global.bodyCircumference(bottle), NaN);
    } catch {}
    const diameter = finite(bottle?.diameterTargetMm, NaN);
    const reduction = finite(bottle?.radiusReductionMm, 0);
    return Number.isFinite(diameter) ? Math.max(0.001, diameter - reduction * 2) * Math.PI : NaN;
  }

  function labelWidthDeg(section, target = stateRef()) {
    const normalized = String(section || "").toLowerCase();
    try {
      const wipe = typeof global.sectionWipePlan === "function" ? global.sectionWipePlan(normalized) : null;
      const fromPlan = finite(wipe?.labelDeg, NaN);
      if (Number.isFinite(fromPlan) && fromPlan > 0) return Math.min(360, fromPlan);
    } catch {}

    const label = selectedLabel(target);
    const bodyCirc = bodyCircumferenceValue(target);
    const neckCirc = finite(label?.neckBottomCircumferenceMm, NaN);
    const mm = normalized === "neck"
      ? finite(label?.neckBottomCurveMm, finite(label?.neckLengthMm, NaN))
      : normalized === "body"
        ? finite(label?.bodyLengthMm, NaN)
        : finite(label?.backLengthMm, NaN);
    const circumference = normalized === "neck" ? neckCirc : bodyCirc;
    if (!Number.isFinite(mm) || !Number.isFinite(circumference) || circumference <= 0) return NaN;
    return Math.min(360, Math.max(0.1, mm / circumference * 360));
  }

  function sectionOffsetDeg(section, target = stateRef()) {
    const normalized = String(section || "").toLowerCase();
    if (normalized === "neck") return 0;
    const inputs = ensureApplicationReferenceDefaults(target) || {};
    const mm = finite(inputs[`${normalized}OffsetMm`], 0);
    if (!mm) return 0;
    const circumference = bodyCircumferenceValue(target);
    return Number.isFinite(circumference) && circumference > 0 ? mm / circumference * 360 : 0;
  }

  function finishedCenterlineFromApplication(section, applicationAngle, row = null, target = stateRef()) {
    const angle = finite(applicationAngle, NaN);
    if (!Number.isFinite(angle)) return NaN;
    const mode = applicationReference(section, row, target);
    if (mode !== LEADING_EDGE) return angle;
    const width = labelWidthDeg(section, target);
    return Number.isFinite(width) ? angle + width / 2 : angle;
  }

  function applicationTargetFromCenterline(section, centerline, mode = applicationReference(section), target = stateRef()) {
    const center = finite(centerline, NaN);
    if (!Number.isFinite(center)) return NaN;
    if (normalizeApplicationReference(mode, DEFAULT_REFERENCES[section] || CENTER_TACK) !== LEADING_EDGE) return center;
    const width = labelWidthDeg(section, target);
    return Number.isFinite(width) ? center - width / 2 : center;
  }

  function rawSeedTargets(seed = []) {
    return {
      neck: finite(seed?.[1]?.plateAngle, NaN),
      body: finite(seed?.[11]?.plateAngle, NaN),
      back: finite(seed?.[21]?.plateAngle, NaN)
    };
  }

  function summaryFrontCenterline() {
    try {
      const summary = typeof global.buildProgramSummary === "function" ? global.buildProgramSummary() : null;
      return finite(summary?.rows?.find?.(([name]) => name === "Center Line Front (deg)")?.[1], NaN);
    } catch {
      return NaN;
    }
  }

  function generatedTargets(seed = [], active = applications(), target = stateRef()) {
    ensureApplicationReferenceDefaults(target);
    const raw = rawSeedTargets(seed);
    const hasNeck = active?.neck !== false && Number.isFinite(raw.neck);
    const hasBody = active?.body !== false && Number.isFinite(raw.body);
    const hasBack = active?.back !== false && Number.isFinite(raw.back);

    let front = summaryFrontCenterline();
    if (!Number.isFinite(front)) {
      if (hasNeck) front = finishedCenterlineFromApplication("neck", raw.neck, seed?.[1], target);
      else if (hasBody) front = finishedCenterlineFromApplication("body", raw.body, seed?.[11], target) - sectionOffsetDeg("body", target);
    }

    const finishedCenterlines = {
      neck: hasNeck && Number.isFinite(front) ? front : NaN,
      body: hasBody && Number.isFinite(front) ? front + sectionOffsetDeg("body", target) : NaN,
      back: hasBack
        ? (Number.isFinite(front)
          ? front + 180 + sectionOffsetDeg("back", target)
          : finishedCenterlineFromApplication("back", raw.back, seed?.[21], target))
        : NaN
    };

    const result = {
      front,
      source: hasNeck ? "neck" : hasBody ? "body" : hasBack ? "back" : "none",
      raw,
      finishedCenterlines,
      references: {
        neck: applicationReference("neck", null, target),
        body: applicationReference("body", null, target),
        back: applicationReference("back", null, target)
      }
    };

    ["neck", "body", "back"].forEach((section) => {
      const center = finishedCenterlines[section];
      result[section] = Number.isFinite(center)
        ? applicationTargetFromCenterline(section, center, result.references[section], target)
        : raw[section];
    });
    return result;
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

  function applicationReferences(rows = [], target = stateRef()) {
    const result = { neck: [], body: [], back: [] };
    (Array.isArray(rows) ? rows : []).forEach((row, index) => {
      const section = sectionFromApplicationRow(row);
      const angle = finite(row?.plateAngle, NaN);
      if (!section || !Number.isFinite(angle)) return;
      const mode = applicationReference(section, row, target);
      const centerline = finishedCenterlineFromApplication(section, angle, row, target);
      result[section].push({
        section,
        angle,
        applicationAngle: angle,
        applicationReferenceMode: mode,
        centerline,
        labelWidthDeg: labelWidthDeg(section, target),
        index,
        row
      });
    });
    return result;
  }

  function applicationTargetForSection(section, rows = []) {
    const normalized = String(section || "").toLowerCase();
    return applicationReferences(rows)[normalized]?.[0]?.applicationAngle ?? NaN;
  }

  function centerlineForSection(section, rows = [], target = stateRef()) {
    const normalized = String(section || "").toLowerCase();
    const refs = applicationReferences(rows, target);
    if (refs[normalized]?.length) return refs[normalized][0].centerline;

    // Neck and Body share the front datum after application/wipe-down. This
    // fallback is only for partial row sets where one front application is not
    // present. Back never borrows a front row because its datum is rear-facing.
    if (normalized === "neck" && refs.body.length) return refs.body[0].centerline - sectionOffsetDeg("body", target);
    if (normalized === "body" && refs.neck.length) return refs.neck[0].centerline + sectionOffsetDeg("body", target);
    return NaN;
  }

  function shiftRange(rows, start, end, delta) {
    if (!Number.isFinite(delta) || Math.abs(delta) < 1e-12) return;
    for (let index = start; index <= end; index += 1) {
      if (!rows[index]) continue;
      const angle = finite(rows[index].plateAngle, NaN);
      if (!Number.isFinite(angle)) continue;
      rows[index] = { ...rows[index], plateAngle: angle + delta };
    }
  }

  function rewriteGeneratedSeed(sourceRows) {
    if (!Array.isArray(sourceRows) || !sourceRows.length) return sourceRows;
    const target = stateRef();
    ensureApplicationReferenceDefaults(target);
    const rows = sourceRows.map((row) => ({ ...row }));
    const active = applications();
    const targets = generatedTargets(sourceRows, active, target);
    const chains = {
      neck: [[1, 4, 1], [5, 8, 5]],
      body: [[11, 15, 11], [16, 20, 16]],
      back: [[21, 25, 21], [26, 30, 26]]
    };

    Object.entries(chains).forEach(([section, groups]) => {
      if (active?.[section] === false) return;
      const desired = finite(targets[section], NaN);
      if (!Number.isFinite(desired)) return;
      groups.forEach(([start, end, anchor]) => {
        const current = finite(rows?.[anchor]?.plateAngle, NaN);
        if (!Number.isFinite(current)) return;
        const equivalentTarget = nearestEquivalent(desired, current);
        shiftRange(rows, start, end, equivalentTarget - current);
      });
    });

    rows.forEach((row, index) => {
      const section = sectionFromApplicationRow(row);
      if (!section) return;
      const mode = applicationReference(section, row, target);
      rows[index] = {
        ...row,
        applicationReference: true,
        applicationReferenceMode: mode,
        finishedLabelReference: "derived-from-application-and-label-width"
      };
    });

    return rows;
  }

  function validationNotes(rows = [], target = stateRef()) {
    const refs = applicationReferences(rows, target);
    const notes = [];
    const neck = refs.neck[0]?.centerline;
    const body = refs.body[0]?.centerline;
    const back = refs.back[0]?.centerline;
    const front = Number.isFinite(neck) ? neck : body;

    if (Number.isFinite(neck) && Number.isFinite(body)) {
      const expectedBody = neck + sectionOffsetDeg("body", target);
      const mismatch = circularDistance(body, expectedBody);
      if (mismatch > FRONT_ALIGNMENT_TOLERANCE_DEG) {
        notes.push(["warn", `Finished front-label centerline mismatch: Neck resolves to ${neck.toFixed(1)}° and Body resolves to ${body.toFixed(1)}° (${mismatch.toFixed(1)}° error). Application/tack angles may differ by design; this warning compares the finished label centers after applying the selected reference modes.`, {
          code: "front-label-centerline-mismatch",
          category: "orientation",
          neckCenterlineDeg: neck,
          bodyCenterlineDeg: body,
          mismatchDeg: mismatch
        }]);
      }
    }

    if (Number.isFinite(front) && Number.isFinite(back)) {
      const expectedBack = front + 180 + sectionOffsetDeg("back", target);
      const mismatch = circularDistance(back, expectedBack);
      if (mismatch > REAR_ALIGNMENT_TOLERANCE_DEG) {
        notes.push(["warn", `Finished Back-label centerline mismatch: Back resolves to ${back.toFixed(1)}°; expected approximately ${nearestEquivalent(expectedBack, back).toFixed(1)}° opposite the front datum (${mismatch.toFixed(1)}° error). Application/tack angles may differ from centerline when Leading Edge is selected.`, {
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
    if (base.labelCenterlinePolicyV2) return true;

    const wrapped = function generatedAplSeedProfileWithApplicationReferencePolicy(...args) {
      ensureApplicationReferenceDefaults(stateRef());
      return rewriteGeneratedSeed(base.apply(this, args));
    };
    wrapped.labelCenterlinePolicyV2 = true;
    wrapped.previousGeneratedAplSeedProfile = base;
    global.generatedAplSeedProfile = wrapped;

    const generator = global.LabelerAplSeedProfileGenerator;
    if (generator?.generateSeed) {
      global.LabelerAplSeedProfileGenerator = Object.freeze({
        ...generator,
        generateSeed: wrapped,
        labelCenterlinePolicyV2: true
      });
    }
    return true;
  }

  function install() {
    ensureApplicationReferenceDefaults(stateRef());
    if (!wrapSeedGenerator()) {
      global.setTimeout?.(install, RETRY_MS);
      return false;
    }
    return true;
  }

  global.LabelerLabelCenterlinePolicy = Object.freeze({
    installed: true,
    VERSION,
    CENTER_TACK,
    LEADING_EDGE,
    DEFAULT_REFERENCES,
    FRONT_ALIGNMENT_TOLERANCE_DEG,
    REAR_ALIGNMENT_TOLERANCE_DEG,
    signedDelta,
    circularDistance,
    nearestEquivalent,
    normalizeApplicationReference,
    ensureApplicationReferenceDefaults,
    applications,
    applicationReference,
    labelWidthDeg,
    sectionOffsetDeg,
    finishedCenterlineFromApplication,
    applicationTargetFromCenterline,
    rawSeedTargets,
    generatedTargets,
    sectionFromApplicationRow,
    applicationReferences,
    applicationTargetForSection,
    centerlineForSection,
    rewriteGeneratedSeed,
    validationNotes
  });

  install();
})(typeof window !== "undefined" ? window : globalThis);
