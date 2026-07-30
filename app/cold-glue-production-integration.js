"use strict";

(function installColdGlueProductionIntegration() {
  const RETRY_MS = 50;
  const EPSILON = 0.001;
  const FULL_CYCLE = 360;
  const MIN_GAP = 0.1;
  const SECTIONS = ["neck", "body", "back"];
  const DEFAULT_APPLICATION = { neck: 0, body: 0, back: 180 };
  let installed = false;
  let decorationPending = false;
  let observer = null;

  function finite(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  function norm(value) {
    const result = finite(value, 0) % FULL_CYCLE;
    return result < 0 ? result + FULL_CYCLE : result;
  }
  function finish(value) {
    return typeof finishAngle === "function" ? finishAngle(value) : Math.round(finite(value, 0) * 10) / 10;
  }
  function after(angle, minimum) {
    let value = finite(angle, minimum);
    while (value < minimum - EPSILON) value += FULL_CYCLE;
    return value;
  }
  function nearest(target, reference) {
    return finite(target, 0) + FULL_CYCLE * Math.round((finite(reference, target) - finite(target, 0)) / FULL_CYCLE);
  }
  function activeMap() {
    try { return typeof activeMachineMap === "function" ? activeMachineMap() : null; } catch { return null; }
  }
  function isColdGlue(item) {
    return item?.application === "cold-glue" || ["brush", "brush-channel", "gripper", "pallet"].includes(String(item?.kind || ""));
  }
  function objectAngle(item) {
    if (["gripper", "pallet", "roller", "sensor"].includes(String(item?.kind || ""))) return norm(finite(item?.angle, item?.start));
    if (item?.kind === "brush-channel") return norm(Math.min(finite(item.outerStart, item.start), finite(item.innerStart, item.start)));
    return norm(finite(item?.start, item?.angle));
  }
  function stationHint(item) {
    const matches = [...String(item?.name || "").matchAll(/station\s*(\d+)/ig)];
    const station = Number(matches.at(-1)?.[1]);
    return Number.isFinite(station) && station >= 1 && station <= 6 ? Math.round(station) : null;
  }
  function validStation(value) {
    const station = Math.round(Number(value));
    return Number.isFinite(station) && station >= 1 && station <= 6 ? station : null;
  }
  function sortedGrippers(map) {
    return (map?.objects || []).filter((item) => isColdGlue(item) && ["gripper", "pallet"].includes(String(item.kind || ""))).sort((a, b) => objectAngle(a) - objectAngle(b));
  }
  function precedingGripper(grippers, angle) {
    if (!grippers.length) return null;
    const position = norm(angle);
    let owner = grippers.at(-1);
    for (const gripper of grippers) {
      if (objectAngle(gripper) <= position + EPSILON) owner = gripper;
      else break;
    }
    return owner;
  }
  function setValue(target, key, value) {
    if (target[key] === value) return false;
    target[key] = value;
    return true;
  }
  function updateEnabled(map) {
    const used = new Set((map.objects || []).filter((item) => isColdGlue(item) && item.kind !== "coding").map((item) => validStation(item.station)).filter(Boolean));
    if (!used.size) return false;
    const enabled = Array.from({ length: 6 }, (_, index) => used.has(index + 1));
    let changed = false;
    if (JSON.stringify(map.enabledStations) !== JSON.stringify(enabled)) { map.enabledStations = enabled; changed = true; }
    if (JSON.stringify(map.enabledAggregates) !== JSON.stringify(enabled)) { map.enabledAggregates = [...enabled]; changed = true; }
    changed = setValue(map, "stationCount", enabled.filter(Boolean).length) || changed;
    changed = setValue(map, "aggregateCount", enabled.filter(Boolean).length) || changed;
    return changed;
  }
  function normalizeObjectParameters(item, map) {
    if (!item || !isColdGlue(item)) return false;
    let changed = false;
    changed = setValue(item, "application", "cold-glue") || changed;
    if (!["auto", "neck", "body", "back", "none"].includes(String(item.labelSection || ""))) changed = setValue(item, "labelSection", "auto") || changed;
    if (["gripper", "pallet"].includes(item.kind)) {
      const section = SECTIONS.includes(String(item.labelSection)) ? item.labelSection : "neck";
      if (!Number.isFinite(Number(item.applicationPlateAngleDeg))) changed = setValue(item, "applicationPlateAngleDeg", DEFAULT_APPLICATION[section]) || changed;
      if (!Number.isFinite(Number(item.brushEntryPlateAngleDeg))) changed = setValue(item, "brushEntryPlateAngleDeg", finite(item.applicationPlateAngleDeg, 0) + 90) || changed;
      if (!Number.isFinite(Number(item.alignmentLeadTableDeg))) changed = setValue(item, "alignmentLeadTableDeg", Math.max(.5, 360 / Math.max(1, finite(map?.headCount, 60)))) || changed;
      if (!Number.isFinite(Number(item.neckOverWipeMm))) changed = setValue(item, "neckOverWipeMm", 5) || changed;
      if (!Number.isFinite(Number(item.neckPressTableDeg))) changed = setValue(item, "neckPressTableDeg", 4) || changed;
      if (!["left-right", "right-left"].includes(String(item.neckWipeOrder || ""))) changed = setValue(item, "neckWipeOrder", "left-right") || changed;
    } else if (item.kind === "brush") {
      if (!["left", "right", "none"].includes(String(item.neckWipeSide || ""))) changed = setValue(item, "neckWipeSide", item.side === "inner" ? "right" : "left") || changed;
      if (typeof item.pressLooseSide !== "boolean") changed = setValue(item, "pressLooseSide", true) || changed;
    } else if (item.kind === "brush-channel") {
      if (!["left", "right", "none"].includes(String(item.outerNeckWipeSide || ""))) changed = setValue(item, "outerNeckWipeSide", "left") || changed;
      if (!["left", "right", "none"].includes(String(item.innerNeckWipeSide || ""))) changed = setValue(item, "innerNeckWipeSide", "right") || changed;
      if (typeof item.pressLooseSides !== "boolean") changed = setValue(item, "pressLooseSides", true) || changed;
    }
    return changed;
  }
  function normalizeMap(map) {
    if (!map || map.applicationMode !== "cold-glue" || !Array.isArray(map.objects)) return false;
    let changed = false;
    const grippers = sortedGrippers(map);
    map.aggregateAngles = map.aggregateAngles && typeof map.aggregateAngles === "object" ? map.aggregateAngles : {};
    map.stationAngles = map.stationAngles && typeof map.stationAngles === "object" ? map.stationAngles : {};

    if (grippers.length >= 3) {
      const firstThree = grippers.slice(0, 3);
      const usedStations = new Set();
      const bySection = new Map();
      firstThree.forEach((gripper, index) => {
        const section = SECTIONS[index];
        let station = validStation(gripper.station) || stationHint(gripper);
        if (!station || usedStations.has(station)) station = [1, 2, 3, 4, 5, 6].find((candidate) => !usedStations.has(candidate)) || index + 1;
        usedStations.add(station);
        changed = setValue(gripper, "station", station) || changed;
        changed = setValue(gripper, "labelSection", section) || changed;
        changed = normalizeObjectParameters(gripper, map) || changed;
        const angle = objectAngle(gripper);
        if (finite(map.aggregateAngles[String(station)], NaN) !== angle) { map.aggregateAngles[String(station)] = angle; changed = true; }
        if (finite(map.stationAngles[String(station)], NaN) !== angle) { map.stationAngles[String(station)] = angle; changed = true; }
        bySection.set(section, gripper);
      });
      map.objects.forEach((item) => {
        if (!isColdGlue(item) || firstThree.includes(item) || item.kind === "coding") return;
        const explicit = SECTIONS.includes(String(item.labelSection)) ? String(item.labelSection) : null;
        const owner = explicit ? bySection.get(explicit) : precedingGripper(firstThree, objectAngle(item));
        if (!owner) return;
        changed = setValue(item, "station", Number(owner.station)) || changed;
        if (!explicit || item.labelSection === "auto") changed = setValue(item, "labelSection", owner.labelSection) || changed;
        changed = normalizeObjectParameters(item, map) || changed;
      });
    } else {
      const wasCollapsed = Number(map.coldGlueGripperSequenceVersion) === 1;
      map.objects.forEach((item) => {
        if (!isColdGlue(item) || item.kind === "coding") return;
        const hint = stationHint(item);
        if (hint && (wasCollapsed || validStation(item.station) === 1 || !validStation(item.station))) changed = setValue(item, "station", hint) || changed;
        changed = normalizeObjectParameters(item, map) || changed;
      });
      if (grippers.length === 1 && !SECTIONS.includes(String(grippers[0].labelSection))) changed = setValue(grippers[0], "labelSection", "neck") || changed;
    }
    changed = updateEnabled(map) || changed;
    changed = setValue(map, "coldGlueGripperSequenceVersion", 2) || changed;
    if (changed) {
      try { if (typeof syncApplicationMapToLegacyState === "function") syncApplicationMapToLegacyState(); } catch { }
      try { if (typeof saveCurrentSettings === "function") saveCurrentSettings(); } catch { }
    }
    return changed;
  }

  function sectionOptions(selected) {
    return [["auto", "Auto from station program"], ["neck", "Neck label"], ["body", "Body label"], ["back", "Back label"], ["none", "No label process"]]
      .map(([value, label]) => `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`).join("");
  }
  function sideOptions(selected) {
    return [["left", "Left neck-label wing"], ["right", "Right neck-label wing"], ["none", "No neck-label wiping"]]
      .map(([value, label]) => `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`).join("");
  }
  function parameterMarkup(item) {
    const common = `<label>Label use<select data-cold-glue-param="labelSection">${sectionOptions(String(item.labelSection || "auto"))}</select><small>Defines which label geometry this object belongs to.</small></label>`;
    if (["gripper", "pallet"].includes(item.kind)) return `${common}<label>Bottle angle on gripper centerline<input data-cold-glue-param="applicationPlateAngleDeg" type="number" step="0.1" value="${finish(item.applicationPlateAngleDeg)}"></label><label>Bottle angle entering brushes<input data-cold-glue-param="brushEntryPlateAngleDeg" type="number" step="0.1" value="${finish(item.brushEntryPlateAngleDeg)}"></label><label>Finish alignment before gripper (table deg)<input data-cold-glue-param="alignmentLeadTableDeg" type="number" min="0" step="0.1" value="${finish(item.alignmentLeadTableDeg)}"></label><label>Neck wipe order<select data-cold-glue-param="neckWipeOrder"><option value="left-right"${item.neckWipeOrder !== "right-left" ? " selected" : ""}>Left side, then right side</option><option value="right-left"${item.neckWipeOrder === "right-left" ? " selected" : ""}>Right side, then left side</option></select></label><label>Neck over-wipe (mm)<input data-cold-glue-param="neckOverWipeMm" type="number" min="0" step="0.1" value="${finish(item.neckOverWipeMm)}"></label><label>Both-sides press distance (table deg)<input data-cold-glue-param="neckPressTableDeg" type="number" min="0.1" step="0.1" value="${finish(item.neckPressTableDeg)}"></label>`;
    if (item.kind === "brush") return `${common}<label>Neck-label wipe side<select data-cold-glue-param="neckWipeSide">${sideOptions(item.neckWipeSide)}</select></label><label class="inline-check"><input data-cold-glue-param="pressLooseSide" type="checkbox"${item.pressLooseSide !== false ? " checked" : ""}> Use during initial both-sides press</label>`;
    if (item.kind === "brush-channel") return `${common}<label>Outside brush wipes<select data-cold-glue-param="outerNeckWipeSide">${sideOptions(item.outerNeckWipeSide)}</select></label><label>Inside brush wipes<select data-cold-glue-param="innerNeckWipeSide">${sideOptions(item.innerNeckWipeSide)}</select></label><label class="inline-check"><input data-cold-glue-param="pressLooseSides" type="checkbox"${item.pressLooseSides !== false ? " checked" : ""}> Use channel overlap to press both loose sides</label>`;
    return common;
  }
  function decorate() {
    decorationPending = false;
    const map = activeMap();
    const list = document.querySelector("#wipeBuilderList");
    if (!map || map.applicationMode !== "cold-glue" || !list) return;
    normalizeMap(map);
    const grippers = sortedGrippers(map).slice(0, 3);
    list.querySelectorAll(".wipe-builder-row[data-builder-object-id]").forEach((row) => {
      const item = (map.objects || []).find((entry) => String(entry.id) === String(row.dataset.builderObjectId));
      if (!item || !isColdGlue(item)) return;
      const editor = row.querySelector(".builder-object-editor");
      if (!editor) return;
      let fieldset = editor.querySelector(":scope > .cold-glue-process-parameters");
      if (!fieldset) {
        fieldset = document.createElement("fieldset");
        fieldset.className = "cold-glue-process-parameters";
        editor.prepend(fieldset);
      }
      const signature = JSON.stringify([item.labelSection, item.applicationPlateAngleDeg, item.brushEntryPlateAngleDeg, item.alignmentLeadTableDeg, item.neckWipeOrder, item.neckOverWipeMm, item.neckPressTableDeg, item.neckWipeSide, item.pressLooseSide, item.outerNeckWipeSide, item.innerNeckWipeSide, item.pressLooseSides]);
      if (fieldset.dataset.signature !== signature) {
        fieldset.dataset.signature = signature;
        const order = grippers.indexOf(item);
        fieldset.innerHTML = `<legend>Cold Glue process parameters</legend>${order >= 0 ? `<div class="cold-glue-gripper-order-badge">Application Gripper ${order + 1} • ${String(item.labelSection).toUpperCase()}</div>` : ""}<div class="cold-glue-parameter-grid">${parameterMarkup(item)}</div>`;
      }
    });
  }
  function scheduleDecorate() { if (!decorationPending) { decorationPending = true; requestAnimationFrame(decorate); } }
  function refresh() {
    try { if (typeof syncApplicationMapToLegacyState === "function") syncApplicationMapToLegacyState(); } catch { }
    try { if (typeof applyGeneratedServoProfile === "function") applyGeneratedServoProfile(); } catch { }
    try { if (typeof saveCurrentSettings === "function") saveCurrentSettings(); } catch { }
    try { if (typeof render === "function") render(); } catch { }
  }
  function bindControls() {
    if (document.documentElement.dataset.coldGlueProductionControlsBound === "true") return;
    document.documentElement.dataset.coldGlueProductionControlsBound = "true";
    const apply = (event) => {
      const control = event.target.closest?.("[data-cold-glue-param]");
      if (!control) return;
      const row = control.closest(".wipe-builder-row[data-builder-object-id]");
      const map = activeMap();
      const item = map?.objects?.find((entry) => String(entry.id) === String(row?.dataset.builderObjectId));
      if (!item) return;
      const key = control.dataset.coldGlueParam;
      item[key] = control.type === "checkbox" ? control.checked : control.type === "number" ? finite(control.value, item[key]) : control.value;
      normalizeObjectParameters(item, map);
      refresh();
      scheduleDecorate();
    };
    document.addEventListener("input", apply);
    document.addEventListener("change", apply);
  }

  function activeObjects(map) {
    const runtime = Array.isArray(state?.coldGlueMap) ? state.coldGlueMap : [];
    return runtime.some((item) => ["brush", "brush-channel", "gripper", "pallet"].includes(String(item?.kind || ""))) ? runtime : map.objects || [];
  }
  function gripperFor(map, section) {
    return sortedGrippers(map).find((item) => String(item.labelSection) === section) || null;
  }
  function brushesFor(map, station) {
    return activeObjects(map).filter((item) => Number(item.station) === Number(station) && ["brush", "brush-channel"].includes(String(item.kind || "")) && ["auto", "neck"].includes(String(item.labelSection || "auto")));
  }
  function expandBrushes(items, minimum) {
    const ranges = [];
    items.forEach((item, index) => {
      const add = (physicalSide, wipeSide, press, startValue, endValue, suffix) => {
        const start = after(startValue, minimum);
        let end = after(endValue, start + EPSILON);
        while (end <= start + EPSILON) end += FULL_CYCLE;
        ranges.push({ id: `${item.id || index}-${suffix}`, physicalSide, wipeSide, press, start, end });
      };
      if (item.kind === "brush-channel") {
        add("outer", item.outerNeckWipeSide || "left", item.pressLooseSides !== false, finite(item.outerStart, item.start), finite(item.outerEnd, item.end), "outer");
        add("inner", item.innerNeckWipeSide || "right", item.pressLooseSides !== false, finite(item.innerStart, item.start), finite(item.innerEnd, item.end), "inner");
      } else {
        const physical = item.side === "inner" ? "inner" : "outer";
        add(physical, item.neckWipeSide || (physical === "inner" ? "right" : "left"), item.pressLooseSide !== false, item.start, item.end, physical);
      }
    });
    return ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  }
  function mergeRanges(ranges) {
    const result = [];
    ranges.filter((range) => range.end > range.start + EPSILON).sort((a, b) => a.start - b.start).forEach((range) => {
      const previous = result.at(-1);
      if (previous && range.start <= previous.end + EPSILON) { previous.end = Math.max(previous.end, range.end); previous.ids.push(range.id); }
      else result.push({ start: range.start, end: range.end, ids: [range.id] });
    });
    return result;
  }
  function intersections(left, right) {
    const ranges = [];
    left.forEach((a) => right.forEach((b) => {
      const start = Math.max(a.start, b.start), end = Math.min(a.end, b.end);
      if (end > start + EPSILON) ranges.push({ start, end, id: `${a.ids?.[0]}-${b.ids?.[0]}` });
    }));
    return mergeRanges(ranges);
  }
  function neckGeometry(gripper) {
    const wipe = typeof sectionWipePlan === "function" ? sectionWipePlan("neck") : null;
    const label = typeof selectedLabelSpec === "function" ? selectedLabelSpec() : null;
    const circumference = finite(label?.neckBottomCircumferenceMm, NaN);
    const labelDeg = Math.max(0, finite(wipe?.labelDeg, 0));
    const overMm = Math.max(0, finite(gripper?.neckOverWipeMm, 5));
    const overDeg = Number.isFinite(circumference) && circumference > 0 && window.LabelerGeometryDriver?.degreesFromMm ? Math.max(0, finite(window.LabelerGeometryDriver.degreesFromMm(overMm, circumference), 0)) : 0;
    return { labelDeg, overMm, overDeg, first: labelDeg / 2 + overDeg, second: labelDeg + overDeg * 2 };
  }
  function row(cmd, tableAngle, plateAngle, action, extra = {}) {
    return { hmi: 0, plc: 0, cmd, tableAngle: finish(tableAngle), plateAngle: finish(plateAngle), action, fixedColdGlueMap: false, motionSource: "cold-glue-production-neck", coldGlueNeckTwoSideWipe: true, ...extra };
  }
  function allocate(output, ranges, currentTable, currentPlate, rotation, ratio, station, side, geometry) {
    let remaining = Math.abs(rotation);
    const direction = Math.sign(rotation) || 1;
    let table = currentTable, plate = currentPlate;
    for (const range of ranges) {
      if (remaining <= EPSILON) break;
      const start = Math.max(range.start, table + MIN_GAP);
      if (start >= range.end - EPSILON) continue;
      const amount = Math.min(remaining, (range.end - start) * ratio, 359);
      if (amount <= EPSILON) continue;
      const end = Math.min(range.end, start + amount / ratio);
      output.push(row(7, start, plate, `Wipe Neck Label ${side === "left" ? "Left" : "Right"} Side Outward + ${geometry.overMm} mm - Agg ${station}`, { station, section: "neck", brushStage: side, neckWipeSide: side, plannedRotation: direction * amount, plannedRatio: amount / Math.max(EPSILON, end - start), objectIds: range.ids || [] }));
      plate += direction * amount;
      output.push(row(3, end, plate, `Hold at ${side === "left" ? "Left" : "Right"} Neck Label Over-Wipe Edge - Agg ${station}`, { station, section: "neck", brushStage: `${side}-complete`, neckWipeSide: side, plannedRotation: direction * amount, objectIds: range.ids || [] }));
      remaining -= amount;
      table = end;
    }
    return { table, plate, remaining };
  }
  function buildNeckBlock(map, station, previous) {
    const gripper = gripperFor(map, "neck") || sortedGrippers(map).find((item) => Number(item.station) === Number(station));
    const brushes = brushesFor(map, station);
    const geometry = neckGeometry(gripper);
    if (!brushes.length || geometry.labelDeg <= EPSILON) return null;
    const priorTable = finite(previous?.tableAngle, 0);
    let plate = finite(previous?.plateAngle, finite(state?.buildInputs?.plateStartPositionDeg, 0));
    const gripperTable = after(finite(gripper?.angle, gripper?.start), priorTable + MIN_GAP);
    const center = nearest(finite(gripper?.applicationPlateAngleDeg, 0), plate);
    const entry = nearest(finite(gripper?.brushEntryPlateAngleDeg, center + 90), center);
    const lead = Math.max(.5, finite(gripper?.alignmentLeadTableDeg, 360 / Math.max(1, finite(map.headCount, 60))));
    const alignmentEnd = Math.max(priorTable + MIN_GAP, gripperTable - lead);
    const safeRatio = Math.max(.1, finite(state?.maxMoveRatio, 21) * .9);
    const output = [];
    if (Math.abs(center - plate) > EPSILON) {
      const start = Math.max(priorTable, alignmentEnd - Math.abs(center - plate) / safeRatio);
      output.push(row(7, start, plate, `Align Neck Label to Gripper Centerline Before Application - Agg ${station}`, { station, section: "neck", brushStage: "gripper-centerline", plannedRotation: center - plate }));
      plate = center;
      output.push(row(3, alignmentEnd, plate, `Hold Neck Label Centerline Approaching Gripper - Agg ${station}`, { station, section: "neck", brushStage: "gripper-approach-hold" }));
    }
    output.push(row(7, gripperTable, center, `Turn Neck Label from Gripper Centerline to ${finish(norm(entry))}° Brush Entry - Agg ${station}`, { station, section: "neck", brushStage: "gripper-to-brush-entry", plannedRotation: entry - center }));

    const expanded = expandBrushes(brushes, gripperTable + EPSILON);
    const left = mergeRanges(expanded.filter((range) => range.wipeSide === "left"));
    const right = mergeRanges(expanded.filter((range) => range.wipeSide === "right"));
    const opposed = intersections(mergeRanges(expanded.filter((range) => range.physicalSide === "outer" && range.press)), mergeRanges(expanded.filter((range) => range.physicalSide === "inner" && range.press))).find((range) => range.end > gripperTable + EPSILON);
    const pressStart = Math.max(opposed?.start ?? Math.min(...expanded.map((range) => range.start)), gripperTable + MIN_GAP);
    const pressEnd = Math.min(opposed?.end ?? pressStart + .1, pressStart + Math.max(.1, finite(gripper?.neckPressTableDeg, 4)));
    output.push(row(3, pressStart, entry, `Press Both Loose Neck Label Sides Down at ${finish(norm(entry))}° - Agg ${station}`, { station, section: "neck", brushStage: "press-both-sides", channelHold: true, holdAngle: entry }));
    if (pressEnd > pressStart + EPSILON) output.push(row(3, pressEnd, entry, `Hold Through Both-Sides Neck Label Press - Agg ${station}`, { station, section: "neck", brushStage: "press-both-sides-complete", channelHold: true, holdAngle: entry }));

    let table = pressEnd, currentPlate = entry;
    const order = gripper?.neckWipeOrder === "right-left" ? ["right", "left"] : ["left", "right"];
    for (const side of order) {
      const required = side === order[0] ? geometry.first : geometry.second;
      const direction = side === "left" ? -1 : 1;
      const result = allocate(output, (side === "left" ? left : right).filter((range) => range.end > table + MIN_GAP), table, currentPlate, direction * required, safeRatio, station, side, geometry);
      table = result.table;
      currentPlate = result.plate;
      if (result.remaining > EPSILON && state?.motionPlan?.mapDriven) {
        state.motionPlan.issues = Array.isArray(state.motionPlan.issues) ? state.motionPlan.issues : [];
        state.motionPlan.issues.push({ level: "bad", code: `cold-glue-neck-${side}-capacity`, station, section: "neck", side, message: `Aggregate ${station} ${side} neck-label brush contact is short by ${result.remaining.toFixed(1)}° of bottle rotation. Extend or reposition that brush; the tool will not rotate through a no-contact gap.` });
      }
    }
    return output;
  }
  function explicitTargets(rows, map) {
    const output = rows.map((entry) => ({ ...entry }));
    SECTIONS.forEach((section) => {
      const gripper = gripperFor(map, section);
      if (!gripper) return;
      output.forEach((entry) => {
        if (entry.section !== section) return;
        if (Number(entry.cmd) === 3 && /Application.*Reference/i.test(String(entry.action || ""))) entry.plateAngle = finish(nearest(gripper.applicationPlateAngleDeg, entry.plateAngle));
      });
    });
    return output;
  }
  function continuity(rows) {
    const output = rows.map((entry) => ({ ...entry }));
    if (!output.length) return output;
    let current = finite(output[0].plateAngle, 0);
    output[0].plateAngle = finish(current);
    for (let index = 1; index < output.length; index += 1) {
      const entry = output[index], previous = output[index - 1];
      if (Number(entry.cmd) === 7) {
        entry.plateAngle = finish(current);
        const next = output[index + 1];
        if (next && Number(next.cmd) === 3 && Math.abs(finite(next.plateAngle, current) - current) <= EPSILON) { entry.cmd = 3; entry.zeroMoveConvertedToHold = true; }
      } else if (Number(entry.cmd) === 3) {
        if (Number(previous.cmd) === 7) current = finite(entry.plateAngle, current);
        else entry.plateAngle = finish(current);
      }
    }
    return output.map((entry, index) => ({ ...entry, hmi: index + 1, plc: index }));
  }
  function postProcess(rows, map) {
    let output = explicitTargets(rows, map);
    const neckGripper = gripperFor(map, "neck") || sortedGrippers(map)[0];
    if (neckGripper) {
      const station = Number(neckGripper.station);
      const indexes = output.map((entry, index) => Number(entry.station) === station && entry.section === "neck" ? index : -1).filter((index) => index >= 0);
      if (indexes.length) {
        const first = indexes[0], last = indexes.at(-1);
        const replacement = buildNeckBlock(map, station, output[first - 1] || null);
        if (replacement?.length) output.splice(first, last - first + 1, ...replacement);
      }
    }
    output = continuity(output);
    if (state?.motionPlan?.mapDriven) {
      state.motionPlan.rows = output;
      state.motionPlan.gripperSequence = sortedGrippers(map).slice(0, 3).map((gripper, index) => ({ order: index + 1, section: gripper.labelSection, station: gripper.station, tableAngle: objectAngle(gripper), applicationPlateAngleDeg: gripper.applicationPlateAngleDeg, brushEntryPlateAngleDeg: gripper.brushEntryPlateAngleDeg }));
    }
    return output;
  }
  function wrapGenerator() {
    const original = window.generatedColdGlueFixedProfile;
    if (typeof original !== "function" || original.coldGlueProductionWrapped) return false;
    const wrapped = function (...args) {
      const map = activeMap();
      if (map?.applicationMode === "cold-glue") normalizeMap(map);
      const rows = original.apply(this, args);
      return map?.applicationMode === "cold-glue" ? postProcess(rows, map) : rows;
    };
    wrapped.coldGlueProductionWrapped = true;
    wrapped.originalGenerator = original;
    window.generatedColdGlueFixedProfile = wrapped;
    try { generatedColdGlueFixedProfile = wrapped; } catch { }
    return true;
  }
  function wrapBuilder() {
    const original = window.renderWipeDownBuilder;
    if (typeof original !== "function" || original.coldGlueProductionWrapped) return;
    const wrapped = function (...args) { const result = original.apply(this, args); scheduleDecorate(); return result; };
    wrapped.coldGlueProductionWrapped = true;
    window.renderWipeDownBuilder = wrapped;
    try { renderWipeDownBuilder = wrapped; } catch { }
  }
  function styles() {
    if (document.querySelector("#coldGlueProductionStyles")) return;
    const style = document.createElement("style");
    style.id = "coldGlueProductionStyles";
    style.textContent = `.cold-glue-process-parameters{margin:0 0 9px;padding:8px;border:1px solid color-mix(in srgb,var(--green) 42%,var(--line));border-radius:7px;background:color-mix(in srgb,var(--panel) 88%,var(--green) 12%)}.cold-glue-process-parameters legend{padding:0 5px;color:var(--green);font-size:9px;font-weight:800}.cold-glue-parameter-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.cold-glue-parameter-grid small{display:block;margin-top:3px;color:var(--muted);font-size:8px}.cold-glue-gripper-order-badge{margin:0 0 7px;padding:6px 8px;border:1px solid var(--green);border-radius:6px;color:var(--green);font-size:9px;font-weight:900}@media(max-width:800px){.cold-glue-parameter-grid{grid-template-columns:1fr}}`;
    document.head.appendChild(style);
  }
  function install() {
    if (installed) return true;
    if (typeof state === "undefined" || typeof window.generatedColdGlueFixedProfile !== "function" || !document.querySelector("#wipeBuilderList")) return false;
    installed = true;
    styles(); bindControls(); normalizeMap(activeMap()); wrapGenerator(); wrapBuilder(); scheduleDecorate();
    if (!observer) {
      observer = new MutationObserver(scheduleDecorate);
      observer.observe(document.querySelector("#wipeBuilderList"), { childList: true, subtree: true });
    }
    setTimeout(() => { wrapGenerator(); wrapBuilder(); scheduleDecorate(); }, 500);
    return true;
  }
  (function wait() { if (!install()) setTimeout(wait, RETRY_MS); })();
})();
