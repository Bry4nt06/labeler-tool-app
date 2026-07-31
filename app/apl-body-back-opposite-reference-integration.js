"use strict";

(function installAplBodyBackOppositeReferenceFix() {
  const RETRY_MS = 50;
  const EPSILON = 0.001;
  let installed = false;

  function numeric(value, fallback = NaN) {
    if (value === null || value === undefined || value === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function finish(value) {
    return typeof finishAngle === "function"
      ? finishAngle(value)
      : Math.round(numeric(value, 0) * 10) / 10;
  }

  function circularDistance(left, right) {
    const delta = ((numeric(left, 0) - numeric(right, 0) + 540) % 360) - 180;
    return Math.abs(delta);
  }

  function nearestEquivalent(target, reference) {
    const base = numeric(target, 0);
    const current = numeric(reference, base);
    return base + 360 * Math.round((current - base) / 360);
  }

  function isNoNeckBodyBackProgram() {
    if (state.applicationMode !== "apl" || typeof selectedLabelApplicationState !== "function") return false;
    const applications = selectedLabelApplicationState();
    return Boolean(!applications.neck && applications.body && applications.back);
  }

  function findRow(rows, pattern, start = 0) {
    for (let index = Math.max(0, start); index < rows.length; index += 1) {
      if (pattern.test(String(rows[index]?.action || ""))) return index;
    }
    return -1;
  }

  function lastRowBefore(rows, pattern, before) {
    for (let index = Math.min(rows.length - 1, before - 1); index >= 0; index -= 1) {
      if (pattern.test(String(rows[index]?.action || ""))) return index;
    }
    return -1;
  }

  function deriveBackApplicationTarget(rows, holdIndex) {
    const bodyApplicationIndex = lastRowBefore(rows, /Hold\s+for\s+Body\s+Application/i, holdIndex);
    const bodyApplication = bodyApplicationIndex >= 0
      ? numeric(rows[bodyApplicationIndex]?.plateAngle, NaN)
      : NaN;
    const oppositeFallback = Number.isFinite(bodyApplication) ? bodyApplication + 180 : NaN;

    try {
      const label = typeof selectedLabelSpec === "function" ? selectedLabelSpec() : null;
      const bottle = typeof selectedBottleSpec === "function" ? selectedBottleSpec() : null;
      const bottleCirc = typeof bodyCircumference === "function" ? bodyCircumference(bottle) : NaN;
      const neckCirc = numeric(label?.neckBottomCircumferenceMm, NaN);
      const input = state.buildInputs || {};
      const centerFront = typeof buildProgramSummary === "function"
        ? numeric(buildProgramSummary().rows.find(([name]) => name === "Center Line Front (deg)")?.[1], NaN)
        : NaN;
      const centerBack = Number.isFinite(centerFront) ? centerFront + 180 : NaN;
      const neckContact = typeof degFromMm === "function" ? numeric(degFromMm(input.neckContactMm, neckCirc), NaN) : NaN;
      const backContact = typeof degFromMm === "function" ? numeric(degFromMm(input.backContactMm, bottleCirc), NaN) : NaN;
      const neckOffset = typeof degFromMm === "function" ? numeric(degFromMm(input.neckOffsetMm, neckCirc), 0) : 0;
      const backOffset = typeof degFromMm === "function" ? numeric(degFromMm(input.backOffsetMm, bottleCirc), 0) : 0;
      const backFull = typeof degFromMm === "function" ? numeric(degFromMm(label?.backLengthMm, bottleCirc), NaN) : NaN;
      const backHalf = Number.isFinite(backFull) ? backFull / 2 : NaN;
      const leading = input.neckApplication === "Leading Edge";

      let target = [centerBack, neckContact, backContact, backHalf].every(Number.isFinite)
        ? (leading
          ? (centerBack + backContact - (neckOffset + neckContact)) - backHalf + backOffset
          : (centerBack + backContact - neckOffset + neckContact) - backHalf + backOffset)
        : oppositeFallback;

      // A Back label can have its own edge/contact offsets, but its application
      // reference must remain on the opposite half of the bottle from Body.
      if (Number.isFinite(target) && Number.isFinite(bodyApplication) && circularDistance(target, bodyApplication) < 90) {
        target += 180;
      }
      return Number.isFinite(target) ? target : oppositeFallback;
    } catch {
      return oppositeFallback;
    }
  }

  function belongsToBackChain(row) {
    return String(row?.section || "").toLowerCase() === "back"
      || /(?:Back\s+Application|Wipe.*Back|Back.*Wipe)/i.test(String(row?.action || ""));
  }

  function updateMotionPlan(rows, delta, target) {
    if (!state.motionPlan || typeof state.motionPlan !== "object") return;
    state.motionPlan.rows = rows;
    state.motionPlan.finalPlateAngle = rows.at(-1)?.plateAngle;
    state.motionPlan.backApplicationTarget = finish(target);
    state.motionPlan.backApplicationShiftDeg = finish(delta);
    state.motionPlan.backApplicationOppositeBody = true;
    state.motionPlan.noNeckBodyBackOppositeReferenceFixed = true;
  }

  function correctBackReference(sourceRows) {
    if (!isNoNeckBodyBackProgram() || !Array.isArray(sourceRows) || !sourceRows.length) return sourceRows;

    const rows = sourceRows.map((row) => ({ ...row }));
    const holdIndex = findRow(rows, /Hold\s+for\s+Back\s+Application\s*-\s*Agg\s*\d+/i);
    if (holdIndex < 0) return sourceRows;
    const turnIndex = lastRowBefore(rows, /Turn\s+for\s+Back\s+Application\s*-\s*Agg\s*\d+/i, holdIndex + 1);
    const currentTarget = numeric(rows[holdIndex]?.plateAngle, NaN);
    const rawTarget = deriveBackApplicationTarget(rows, holdIndex);
    if (!Number.isFinite(currentTarget) || !Number.isFinite(rawTarget)) return sourceRows;

    const bodyReferenceIndex = lastRowBefore(rows, /Hold\s+for\s+Body\s+Application/i, holdIndex);
    const bodyReference = bodyReferenceIndex >= 0
      ? numeric(rows[bodyReferenceIndex]?.plateAngle, currentTarget - 180)
      : currentTarget - 180;
    const correctedTarget = nearestEquivalent(rawTarget, bodyReference + 180);
    const delta = correctedTarget - currentTarget;
    if (Math.abs(delta) <= EPSILON) return sourceRows;

    for (let index = holdIndex; index < rows.length; index += 1) {
      if (/Coding/i.test(String(rows[index]?.action || ""))) break;
      if (!belongsToBackChain(rows[index])) continue;
      rows[index] = {
        ...rows[index],
        plateAngle: finish(numeric(rows[index].plateAngle, 0) + delta),
        backApplicationOppositeBody: true,
        backApplicationShiftDeg: finish(delta)
      };
    }

    if (turnIndex >= 0) {
      const startPlate = numeric(rows[turnIndex]?.plateAngle, bodyReference);
      const tableStart = numeric(rows[turnIndex]?.tableAngle, 0);
      const tableEnd = numeric(rows[holdIndex]?.tableAngle, tableStart);
      const rotation = correctedTarget - startPlate;
      const ratio = Math.abs(rotation) / Math.max(EPSILON, tableEnd - tableStart);
      rows[turnIndex] = {
        ...rows[turnIndex],
        plannedRotation: rotation,
        plannedRatio: ratio,
        backApplicationTarget: finish(correctedTarget),
        backApplicationOppositeBody: true
      };
      rows[holdIndex] = {
        ...rows[holdIndex],
        plannedRotation: rotation,
        plannedRatio: ratio,
        backApplicationTarget: finish(correctedTarget),
        backApplicationOppositeBody: true
      };
    }

    const reindexed = rows.map((row, index) => ({ ...row, hmi: index + 1, plc: index }));
    updateMotionPlan(reindexed, delta, correctedTarget);
    return reindexed;
  }

  function install() {
    if (installed) return true;
    if (typeof state === "undefined"
      || typeof generatedAplMapDrivenProfile !== "function"
      || generatedAplMapDrivenProfile.noNeckBodyBackOppositeReferenceFix) return false;

    const before = generatedAplMapDrivenProfile;
    generatedAplMapDrivenProfile = function generatedAplMapDrivenProfileWithOppositeBackReference(machineMap, ...args) {
      return correctBackReference(before.call(this, machineMap, ...args));
    };
    generatedAplMapDrivenProfile.noNeckBodyBackOppositeReferenceFix = true;
    installed = true;

    try {
      if (isNoNeckBodyBackProgram() && typeof applyGeneratedServoProfile === "function") {
        applyGeneratedServoProfile();
        if (typeof render === "function") render();
      }
    } catch (error) {
      console.error("Unable to refresh the opposite Back-label application reference.", error);
    }
    return true;
  }

  function wait() {
    if (install()) return;
    window.setTimeout(wait, RETRY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait, { once: true });
  else wait();
})();