"use strict";

(function installColdGlueThreeGripperSequenceV2() {
  const RETRY_MS = 50;
  const EPSILON = 0.001;
  const FULL_CYCLE = 360;
  const SECTIONS = ["neck", "body", "back"];
  const DEFAULT_APPLICATION_ANGLES = Object.freeze({ neck: 0, body: 0, back: 180 });
  const DEFAULT_ENTRY_OFFSET = 90;
  const DEFAULT_NECK_PRESS_TABLE_DEG = 4;
  const SEQUENCE_VERSION = 2;
  let installed = false;
  let decoratePending = false;
  let mapObserver = null;

  function finite(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function norm(value) {
    const parsed = finite(value, 0) % FULL_CYCLE;
    return parsed < 0 ? parsed + FULL_CYCLE : parsed;
  }

  function finish(value) {
    return typeof finishAngle === "function"
      ? finishAngle(value)
      : Math.round(finite(value, 0) * 10) / 10;
  }

  function nearestEquivalent(target, reference) {
    const base = finite(target, 0);
    const current = finite(reference, base);
    return base + FULL_CYCLE * Math.round((current - base) / FULL_CYCLE);
  }

  function activeMap() {
    try {
      return typeof activeMachineMap === "function" ? activeMachineMap() : null;
    } catch {
      return null;
    }
  }

  function isColdGlueObject(item) {
    return item?.application === "cold-glue"
      || ["brush", "brush-channel", "gripper", "pallet"].includes(String(item?.kind || ""));
  }

  function objectAngle(item) {
    if (["gripper", "pallet", "roller", "sensor"].includes(String(item?.kind || ""))) {
      return norm(finite(item?.angle, finite(item?.start, 0)));
    }
    if (item?.kind === "brush-channel") {
      return norm(Math.min(
        finite(item?.outerStart, finite(item?.start, 0)),
        finite(item?.innerStart, finite(item?.start, 0))
      ));
    }
    return norm(finite(item?.start, finite(item?.angle, 0)));
  }

  function sortedGrippers(map) {
    return (Array.isArray(map?.objects) ? map.objects : [])
      .filter((item) => isColdGlueObject(item) && ["gripper", "pallet"].includes(String(item?.kind || "")))
      .sort((left, right) => objectAngle(left) - objectAngle(right));
  }

  function precedingGripper(grippers, angle) {
    if (!grippers.length) return null;
    const position = norm(angle);
    let owner = grippers[grippers.length - 1];
    for (const gripper of grippers) {
      if (objectAngle(gripper) <= position + EPSILON) owner = gripper;
      else break;
    }
    return owner;
  }

  function stationHint(item) {
    const matches = [...String(item?.name || "").matchAll(/station\s*(\d+)/ig)];
    const parsed = Number(matches.at(-1)?.[1]);
    return Number.isFinite(parsed) && parsed >= 1 && parsed <= 6 ? Math.round(parsed) : null;
  }

  function validStation(value) {
    const station = Math.round(Number(value));
    return Number.isFinite(station) && station >= 1 && station <= 6 ? station : null;
  }

  function setValue(target, key, value) {
    if (target[key] === value) return false;
    target[key] = value;
    return true;
  }

  function syncAndSave(changed) {
    if (!changed) return false;
    try { if (typeof syncApplicationMapToLegacyState === "function") syncApplicationMapToLegacyState(); } catch { }
    try { if (typeof saveCurrentSettings === "function") saveCurrentSettings(); } catch { }
    return true;
  }

  function updateEnabledStations(map) {
    const used = new Set(
      map.objects
        .filter((item) => isColdGlueObject(item) && item.kind !== "coding")
        .map((item) => validStation(item.station))
        .filter(Boolean)
    );
    if (!used.size) return false;
    const enabled = Array.from({ length: 6 }, (_, index) => used.has(index + 1));
    let changed = false;
    if (JSON.stringify(map.enabledAggregates) !== JSON.stringify(enabled)) {
      map.enabledAggregates = enabled;
      changed = true;
    }
    if (JSON.stringify(map.enabledStations) !== JSON.stringify(enabled)) {
      map.enabledStations = enabled;
      changed = true;
    }
    changed = setValue(map, "aggregateCount", enabled.filter(Boolean).length) || changed;
    changed = setValue(map, "stationCount", enabled.filter(Boolean).length) || changed;
    return changed;
  }

  function repairSparseGripperMap(map, grippers) {
    let changed = false;
    const wasCollapsed = Number(map.coldGlueGripperSequenceVersion) === 1;
    map.objects.forEach((item) => {
      if (!isColdGlueObject(item) || item.kind === "coding") return;
      const hint = stationHint(item);
      if (hint && (wasCollapsed || validStation(item.station) === 1 || !validStation(item.station))) {
        changed = setValue(item, "station", hint) || changed;
      }
      changed = setValue(item, "application", "cold-glue") || changed;
    });

    grippers.forEach((gripper, index) => {
      const station = validStation(gripper.station) || stationHint(gripper) || index + 1;
      changed = setValue(gripper, "station", station) || changed;
      if (!SECTIONS.includes(String(gripper.labelSection)) && grippers.length === 1) {
        changed = setValue(gripper, "labelSection", "neck") || changed;
      }
      if (!Number.isFinite(Number(gripper.applicationPlateAngleDeg))) {
        const section = SECTIONS.includes(String(gripper.labelSection)) ? gripper.labelSection : "neck";
        changed = setValue(gripper, "applicationPlateAngleDeg", DEFAULT_APPLICATION_ANGLES[section]) || changed;
      }
      if (!Number.isFinite(Number(gripper.brushEntryPlateAngleDeg))) {
        changed = setValue(gripper, "brushEntryPlateAngleDeg", finite(gripper.applicationPlateAngleDeg, 0) + DEFAULT_ENTRY_OFFSET) || changed;
      }
    });

    changed = updateEnabledStations(map) || changed;
    changed = setValue(map, "coldGlueGripperSequenceVersion", SEQUENCE_VERSION) || changed;
    return syncAndSave(changed);
  }

  function normalizeThreeGrippers(map, grippers) {
    let changed = false;
    const firstThree = grippers.slice(0, 3);
    const usedStations = new Set();
    const gripperBySection = new Map();
    map.aggregateAngles = map.aggregateAngles && typeof map.aggregateAngles === "object" ? map.aggregateAngles : {};
    map.stationAngles = map.stationAngles && typeof map.stationAngles === "object" ? map.stationAngles : {};

    firstThree.forEach((gripper, index) => {
      const section = SECTIONS[index];
      let station = validStation(gripper.station) || stationHint(gripper);
      if (!station || usedStations.has(station)) {
        station = [1, 2, 3, 4, 5, 6].find((candidate) => !usedStations.has(candidate)) || index + 1;
      }
      usedStations.add(station);
      const applicationAngle = Number.isFinite(Number(gripper.applicationPlateAngleDeg))
        ? Number(gripper.applicationPlateAngleDeg)
        : DEFAULT_APPLICATION_ANGLES[section];
      changed = setValue(gripper, "application", "cold-glue") || changed;
      changed = setValue(gripper, "station", station) || changed;
      changed = setValue(gripper, "labelSection", section) || changed;
      changed = setValue(gripper, "applicationPlateAngleDeg", applicationAngle) || changed;
      if (!Number.isFinite(Number(gripper.brushEntryPlateAngleDeg))) {
        changed = setValue(gripper, "brushEntryPlateAngleDeg", applicationAngle + DEFAULT_ENTRY_OFFSET) || changed;
      }
      if (!Number.isFinite(Number(gripper.alignmentLeadTableDeg))) {
        changed = setValue(gripper, "alignmentLeadTableDeg", Math.max(0.5, 360 / Math.max(1, finite(map.headCount, 60)))) || changed;
      }
      if (section === "neck") {
        if (!Number.isFinite(Number(gripper.neckOverWipeMm))) changed = setValue(gripper, "neckOverWipeMm", 5) || changed;
        if (!Number.isFinite(Number(gripper.neckPressTableDeg))) changed = setValue(gripper, "neckPressTableDeg", DEFAULT_NECK_PRESS_TABLE_DEG) || changed;
        if (!gripper.neckWipeOrder) changed = setValue(gripper, "neckWipeOrder", "left-right") || changed;
      }
      const angle = objectAngle(gripper);
      if (finite(map.aggregateAngles[String(station)], NaN) !== angle) {
        map.aggregateAngles[String(station)] = angle;
        changed = true;
      }
      if (finite(map.stationAngles[String(station)], NaN) !== angle) {
        map.stationAngles[String(station)] = angle;
        changed = true;
      }
      gripperBySection.set(section, gripper);
    });

    map.objects.forEach((item) => {
      if (!isColdGlueObject(item) || firstThree.includes(item) || item.kind === "coding") return;
      const explicitSection = SECTIONS.includes(String(item.labelSection)) ? String(item.labelSection) : null;
      const owner = explicitSection ? gripperBySection.get(explicitSection) : precedingGripper(firstThree, objectAngle(item));
      if (!owner) return;
      const section = String(owner.labelSection);
      changed = setValue(item, "application", "cold-glue") || changed;
      changed = setValue(item, "station", Number(owner.station)) || changed;
      if (!explicitSection || item.labelSection === "auto") changed = setValue(item, "labelSection", section) || changed;
      if (section === "neck" && item.kind === "brush") {
        if (!item.neckWipeSide || item.neckWipeSide === "none") changed = setValue(item, "neckWipeSide", item.side === "inner" ? "right" : "left") || changed;
        if (typeof item.pressLooseSide !== "boolean") changed = setValue(item, "pressLooseSide", true) || changed;
      }
      if (section === "neck" && item.kind === "brush-channel") {
        if (!item.outerNeckWipeSide || item.outerNeckWipeSide === "none") changed = setValue(item, "outerNeckWipeSide", "left") || changed;
        if (!item.innerNeckWipeSide || item.innerNeckWipeSide === "none") changed = setValue(item, "innerNeckWipeSide", "right") || changed;
        if (typeof item.pressLooseSides !== "boolean") changed = setValue(item, "pressLooseSides", true) || changed;
      }
    });

    changed = updateEnabledStations(map) || changed;
    changed = setValue(map, "coldGlueGripperSequenceVersion", SEQUENCE_VERSION) || changed;
    return syncAndSave(changed);
  }

  function normalizeGripperSequence(map) {
    if (!map || map.applicationMode !== "cold-glue" || !Array.isArray(map.objects)) return false;
    const grippers = sortedGrippers(map);
    return grippers.length >= 3
      ? normalizeThreeGrippers(map, grippers)
      : repairSparseGripperMap(map, grippers);
  }

  function gripperForSection(map, section) {
    return sortedGrippers(map).find((item) => String(item.labelSection) === section) || null;
  }

  function applicationReferenceRow(row) {
    return Number(row?.cmd) === 3 && /Application.*Reference/i.test(String(row?.action || ""));
  }

  function applyExplicitApplicationTargets(rows, map) {
    const output = rows.map((row) => ({ ...row }));
    output.forEach((row) => {
      const section = String(row?.section || "");
      const gripper = gripperForSection(map, section);
      if (!gripper) return;
      if (applicationReferenceRow(row)) {
        row.plateAngle = finish(nearestEquivalent(gripper.applicationPlateAngleDeg, row.plateAngle));
        row.gripperSectionReference = true;
      }
      if (row?.brushEntryAlignment && Number(row?.cmd) === 3) {
        row.plateAngle = finish(nearestEquivalent(gripper.brushEntryPlateAngleDeg, row.plateAngle));
        row.gripperBrushEntryReference = true;
      }
    });
    return output;
  }

  function applyNeckBrushEntry(rows, map) {
    const output = rows.map((row) => ({ ...row }));
    const gripper = gripperForSection(map, "neck");
    if (!gripper) return output;
    const neckIndexes = output.map((row, index) => row?.coldGlueNeckTwoSideWipe ? index : -1).filter((index) => index >= 0);
    if (!neckIndexes.length) return output;
    const first = neckIndexes[0];
    const last = neckIndexes[neckIndexes.length - 1];
    const applicationIndex = neckIndexes.find((index) => output[index]?.brushStage === "gripper-application");
    const pressIndex = neckIndexes.find((index) => output[index]?.brushStage === "press-both-sides");
    if (applicationIndex === undefined || pressIndex === undefined) return output;
    const center = nearestEquivalent(finite(gripper.applicationPlateAngleDeg, 0), finite(output[applicationIndex]?.plateAngle, 0));
    const entry = nearestEquivalent(finite(gripper.brushEntryPlateAngleDeg, center + DEFAULT_ENTRY_OFFSET), center);
    output[applicationIndex] = {
      ...output[applicationIndex], cmd: 7, plateAngle: finish(center),
      action: `Turn Neck Label from Gripper Centerline to ${finish(norm(entry))}° Brush Entry - Station ${gripper.station}`,
      brushStage: "gripper-to-brush-entry", plannedRotation: entry - center, gripperTableAngle: finish(objectAngle(gripper))
    };
    output[pressIndex] = {
      ...output[pressIndex], cmd: 3, plateAngle: finish(entry), holdAngle: finish(entry),
      action: `Press Both Loose Neck Label Sides Down at ${finish(norm(entry))}° - Station ${gripper.station}`
    };
    let current = entry;
    for (let index = pressIndex + 1; index <= last; index += 1) {
      const row = output[index];
      if (Number(row?.cmd) === 7 && Number.isFinite(Number(row?.plannedRotation))) row.plateAngle = finish(current);
      else if (Number(row?.cmd) === 3 && /-complete$/.test(String(row?.brushStage || "")) && Number.isFinite(Number(row?.plannedRotation))) {
        current += Number(row.plannedRotation);
        row.plateAngle = finish(current);
      } else if (Number(row?.cmd) === 3) row.plateAngle = finish(current);
    }
    output[first] = { ...output[first], gripperSequenceSection: "neck" };
    return output;
  }

  function normalizeCommandContinuity(rows) {
    const output = rows.map((row) => ({ ...row }));
    if (!output.length) return output;
    let current = finite(output[0]?.plateAngle, 0);
    output[0].plateAngle = finish(current);
    for (let index = 1; index < output.length; index += 1) {
      const row = output[index];
      const previous = output[index - 1];
      if (Number(row.cmd) === 7) {
        row.plateAngle = finish(current);
        const next = output[index + 1];
        if (next && Number(next.cmd) === 3 && Math.abs(finite(next.plateAngle, current) - current) <= EPSILON) {
          row.cmd = 3;
          row.action = String(row.action || "Hold").replace(/\s*-\s*Turn$/i, " - Hold");
          row.zeroMoveConvertedToHold = true;
        }
      } else if (Number(row.cmd) === 3) {
        if (Number(previous?.cmd) === 7) current = finite(row.plateAngle, current);
        else if (Math.abs(finite(row.plateAngle, current) - current) > EPSILON) {
          row.plateAngle = finish(current);
          row.silentRestMoveRemoved = true;
        } else row.plateAngle = finish(current);
      }
    }
    return output.map((row, index) => ({ ...row, hmi: index + 1, plc: index }));
  }

  function postProcess(rows, map) {
    if (sortedGrippers(map).length < 3) return rows;
    let output = applyExplicitApplicationTargets(rows, map);
    output = applyNeckBrushEntry(output, map);
    output = normalizeCommandContinuity(output);
    if (state?.motionPlan?.mapDriven) {
      state.motionPlan.rows = output;
      state.motionPlan.gripperSequence = sortedGrippers(map).slice(0, 3).map((gripper, index) => ({
        order: index + 1,
        section: gripper.labelSection,
        station: gripper.station,
        tableAngle: objectAngle(gripper),
        applicationPlateAngleDeg: finite(gripper.applicationPlateAngleDeg, DEFAULT_APPLICATION_ANGLES[gripper.labelSection] || 0),
        brushEntryPlateAngleDeg: finite(gripper.brushEntryPlateAngleDeg, 90)
      }));
    }
    return output;
  }

  function refreshMotion() {
    try { if (typeof syncApplicationMapToLegacyState === "function") syncApplicationMapToLegacyState(); } catch { }
    try { if (typeof applyGeneratedServoProfile === "function") applyGeneratedServoProfile(); } catch { }
    try { if (typeof saveCurrentSettings === "function") saveCurrentSettings(); } catch { }
    try { if (typeof render === "function") render(); } catch { }
  }

  function decorateGrippers() {
    decoratePending = false;
    const map = activeMap();
    const list = document.querySelector("#wipeBuilderList");
    if (!map || map.applicationMode !== "cold-glue" || !list) return;
    const changed = normalizeGripperSequence(map);
    if (changed && typeof renderWipeDownBuilder === "function") {
      window.requestAnimationFrame(() => renderWipeDownBuilder());
      return;
    }
    const grippers = sortedGrippers(map).slice(0, 3);
    grippers.forEach((gripper, index) => {
      const row = list.querySelector(`.wipe-builder-row[data-builder-object-id="${CSS.escape(String(gripper.id))}"]`);
      const grid = row?.querySelector(".cold-glue-process-parameters .cold-glue-parameter-grid");
      if (!grid) return;
      let badge = row.querySelector(".cold-glue-gripper-order-badge");
      if (!badge) {
        badge = document.createElement("div");
        badge.className = "cold-glue-gripper-order-badge";
        grid.parentElement?.insertBefore(badge, grid);
      }
      badge.textContent = grippers.length >= 3
        ? `Application Gripper ${index + 1} • ${String(gripper.labelSection || "").toUpperCase()} • Station ${gripper.station}`
        : `Gripper • Station ${gripper.station} • add ${3 - grippers.length} more gripper object${3 - grippers.length === 1 ? "" : "s"} to enable automatic Neck/Body/Back assignment`;
      if (!grid.querySelector('[data-cold-glue-sequence-param="brushEntryPlateAngleDeg"]')) {
        const label = document.createElement("label");
        label.innerHTML = `Bottle angle entering brushes<input data-cold-glue-sequence-param="brushEntryPlateAngleDeg" type="number" step="0.1" value="${finish(finite(gripper.brushEntryPlateAngleDeg, 90))}"><small>Reached after the label leaves this gripper and before physical brush contact begins.</small>`;
        grid.appendChild(label);
      }
    });
  }

  function scheduleDecorate() {
    if (decoratePending) return;
    decoratePending = true;
    window.requestAnimationFrame(decorateGrippers);
  }

  function bindSequenceControls() {
    if (document.documentElement.dataset.coldGlueGripperSequenceV2Bound === "true") return;
    document.documentElement.dataset.coldGlueGripperSequenceV2Bound = "true";
    const apply = (event) => {
      const control = event.target.closest?.("[data-cold-glue-sequence-param]");
      if (!control) return;
      const row = control.closest(".wipe-builder-row[data-builder-object-id]");
      const map = activeMap();
      const item = map?.objects?.find((entry) => String(entry.id) === String(row?.dataset.builderObjectId));
      if (!item) return;
      item[control.dataset.coldGlueSequenceParam] = finite(control.value, item[control.dataset.coldGlueSequenceParam]);
      refreshMotion();
      scheduleDecorate();
    };
    document.addEventListener("input", apply);
    document.addEventListener("change", apply);
  }

  function installStyles() {
    if (document.querySelector("#coldGlueGripperSequenceStyles")) return;
    const style = document.createElement("style");
    style.id = "coldGlueGripperSequenceStyles";
    style.textContent = `.cold-glue-gripper-order-badge{margin:0 0 7px;padding:6px 8px;border:1px solid var(--green);border-radius:6px;background:color-mix(in srgb,var(--panel) 82%,var(--green) 18%);color:var(--green);font-size:9px;font-weight:900;letter-spacing:.04em}`;
    document.head.appendChild(style);
  }

  function wrapGenerator() {
    const original = window.generatedColdGlueFixedProfile;
    if (typeof original !== "function" || original.coldGlueThreeGripperWrappedV2) return false;
    const wrapped = function generatedColdGlueThreeGripperProfileV2(...args) {
      const map = activeMap();
      if (map?.applicationMode === "cold-glue") normalizeGripperSequence(map);
      const rows = original.apply(this, args);
      return map?.applicationMode === "cold-glue" ? postProcess(rows, map) : rows;
    };
    wrapped.coldGlueThreeGripperWrappedV2 = true;
    wrapped.originalGenerator = original;
    window.generatedColdGlueFixedProfile = wrapped;
    try { generatedColdGlueFixedProfile = wrapped; } catch { }
    return true;
  }

  function install() {
    if (installed) return true;
    if (typeof state === "undefined" || typeof window.generatedColdGlueFixedProfile !== "function") return false;
    if (!wrapGenerator()) return false;
    installStyles();
    bindSequenceControls();
    const changed = normalizeGripperSequence(activeMap());
    const list = document.querySelector("#wipeBuilderList");
    if (list && !mapObserver) {
      mapObserver = new MutationObserver(scheduleDecorate);
      mapObserver.observe(list, { childList: true, subtree: true });
    }
    if (changed && typeof renderWipeDownBuilder === "function") window.setTimeout(() => renderWipeDownBuilder(), 0);
    scheduleDecorate();
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
