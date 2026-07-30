"use strict";

(function installMapObjectWipeDefinitions() {
  const RETRY_MS = 50;
  const MECHANICAL_KINDS = new Set(["pad", "roller", "sensor"]);
  const LABEL_SECTIONS = new Set(["auto", "neck", "body", "back", "none"]);
  let installed = false;
  let decorationPending = false;

  function activeMap() {
    return typeof activeMachineMap === "function" ? activeMachineMap() : null;
  }

  function normalizeSection(value) {
    const section = String(value || "auto").trim().toLowerCase();
    return LABEL_SECTIONS.has(section) ? section : "auto";
  }

  function isAplMechanicalObject(item) {
    return item?.application !== "cold-glue" && MECHANICAL_KINDS.has(String(item?.kind || ""));
  }

  function stationFallbackSection(map, station) {
    const explicit = normalizeSection(map?.stationSections?.[String(station)]);
    if (explicit !== "auto") return explicit;
    if (typeof inferAplStationSections === "function") {
      const inferred = normalizeSection(inferAplStationSections(map)?.[String(station)]);
      if (inferred !== "auto") return inferred;
    }
    return Number(station) <= 2 ? "neck" : Number(station) <= 4 ? "body" : "back";
  }

  function sectionForObject(item, map = activeMap()) {
    const explicit = normalizeSection(item?.labelSection);
    return explicit === "auto" ? stationFallbackSection(map, item?.station) : explicit;
  }

  function definitionLabel(section) {
    if (section === "none") return "None — no wipe profile";
    const coldGlue = state.applicationMode === "cold-glue";
    if (coldGlue) return `${section.charAt(0).toUpperCase()}${section.slice(1)} — center tack`;
    if (section === "neck") {
      return `Neck — ${state.buildInputs?.neckApplication === "Leading Edge" ? "leading edge" : "center tack"}`;
    }
    return `${section.charAt(0).toUpperCase()}${section.slice(1)} — leading edge`;
  }

  function ensureObjectDefinitions(map = activeMap()) {
    if (!map || map.applicationMode !== "apl") return;
    map.stationSections = map.stationSections && typeof map.stationSections === "object" ? map.stationSections : {};
    (map.objects || []).filter(isAplMechanicalObject).forEach((item) => {
      const current = normalizeSection(item.labelSection);
      const legacy = normalizeSection(map.stationSections?.[String(item.station)]);
      item.labelSection = current === "auto" && legacy !== "auto" ? legacy : current;
    });
  }

  function applyStationDefinition(map, station, section) {
    if (!map) return;
    const normalized = normalizeSection(section);
    map.stationSections = map.stationSections && typeof map.stationSections === "object" ? map.stationSections : {};
    if (normalized === "auto") delete map.stationSections[String(station)];
    else map.stationSections[String(station)] = normalized;
    (map.objects || [])
      .filter((item) => isAplMechanicalObject(item) && Number(item.station) === Number(station))
      .forEach((item) => { item.labelSection = normalized; });
  }

  function removeObject(itemId) {
    const map = activeMap();
    if (!map) return;
    const index = (map.objects || []).findIndex((item) => String(item.id) === String(itemId));
    if (index < 0) return;
    const item = map.objects[index];
    if (typeof recordBuilderHistory === "function") recordBuilderHistory(`Quick delete ${item.name || "map object"}`);
    map.objects.splice(index, 1);
    if (state.selectedMapObjectId === item.id) state.selectedMapObjectId = "";
    if (typeof refreshAfterBuilderEdit === "function") refreshAfterBuilderEdit({ persist: true });
    if (typeof renderWipeDownBuilder === "function") renderWipeDownBuilder();
  }

  function labelSelectorMarkup(selected) {
    return [
      ["auto", "Auto — infer from map order"],
      ["neck", definitionLabel("neck")],
      ["body", definitionLabel("body")],
      ["back", definitionLabel("back")],
      ["none", definitionLabel("none")]
    ].map(([value, label]) => `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`).join("");
  }

  function decorateObjectRow(row, item, map) {
    const summary = row.querySelector(":scope > summary");
    if (summary && !summary.querySelector(".builder-quick-delete")) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "builder-quick-delete danger";
      button.textContent = "Delete";
      button.title = "Delete this object immediately. Use Map Builder Undo to restore it.";
      button.setAttribute("aria-label", `Quick delete ${item.name || "map object"}`);
      button.addEventListener("pointerdown", (event) => event.stopPropagation());
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        removeObject(item.id);
      });
      summary.appendChild(button);
    }

    if (!isAplMechanicalObject(item) || item.kind === "sensor") return;
    const oldSelect = row.querySelector("[data-station-section]");
    const oldLabel = oldSelect?.closest("label");
    if (!oldLabel || oldLabel.dataset.objectWipeDefinition === "true") return;

    const objectSection = normalizeSection(item.labelSection);
    const stationSection = normalizeSection(map.stationSections?.[String(item.station)]);
    const selected = objectSection === "auto" && stationSection !== "auto" ? stationSection : objectSection;
    const replacement = document.createElement("label");
    replacement.dataset.objectWipeDefinition = "true";
    replacement.innerHTML = `Label type / wipe definition<select data-object-label-section>${labelSelectorMarkup(selected)}</select><small>Defines how this station wipes the label. Paired outside and inside objects stay synchronized.</small>`;
    oldLabel.replaceWith(replacement);

    replacement.querySelector("select")?.addEventListener("change", (event) => {
      const section = normalizeSection(event.currentTarget.value);
      if (typeof recordBuilderHistory === "function") recordBuilderHistory(`Set Station ${item.station} label type`);
      applyStationDefinition(map, item.station, section);
      if (typeof refreshAfterBuilderEdit === "function") refreshAfterBuilderEdit({ persist: true });
      if (typeof renderWipeDownBuilder === "function") renderWipeDownBuilder();
    });
  }

  function decorateBuilder() {
    decorationPending = false;
    const map = activeMap();
    const list = document.querySelector("#wipeBuilderList");
    if (!map || !list) return;
    ensureObjectDefinitions(map);
    list.querySelectorAll(".wipe-builder-row[data-builder-object-id]").forEach((row) => {
      const item = (map.objects || []).find((entry) => String(entry.id) === String(row.dataset.builderObjectId));
      if (item) decorateObjectRow(row, item, map);
    });
  }

  function scheduleDecoration() {
    if (decorationPending) return;
    decorationPending = true;
    window.requestAnimationFrame(decorateBuilder);
  }

  function contactRange(items) {
    if (!items.length) return null;
    return {
      start: Math.min(...items.map((item) => Number(item.start))),
      end: Math.max(...items.map((item) => Number(item.end)))
    };
  }

  function nearestEquivalentAtOrAfter(angle, minimum) {
    let value = Number(angle);
    while (value < minimum - 0.001) value += 360;
    return value;
  }

  function dividedPadWindows(outside, inside, firstRotation, secondRotation, cycleMinimum) {
    let outsideStart = nearestEquivalentAtOrAfter(outside.start, cycleMinimum);
    let outsideEnd = nearestEquivalentAtOrAfter(outside.end, outsideStart + 0.1);
    let insideStart = nearestEquivalentAtOrAfter(inside.start, outsideStart);
    let insideEnd = nearestEquivalentAtOrAfter(inside.end, insideStart + 0.1);

    const overlapStart = Math.max(outsideStart, insideStart);
    const overlapEnd = Math.min(outsideEnd, insideEnd);
    if (overlapEnd > overlapStart + 0.1) {
      const first = Math.abs(Number(firstRotation) || 0);
      const second = Math.abs(Number(secondRotation) || 0);
      const fraction = first + second > 0 ? first / (first + second) : 0.5;
      const desired = Math.min(outsideEnd, insideEnd) * fraction + Math.max(outsideStart, insideStart) * (1 - fraction);
      const split = Math.max(overlapStart, Math.min(overlapEnd, desired));
      const transitionGap = Math.min(0.5, Math.max(0.1, (overlapEnd - overlapStart) / 4));
      outsideEnd = Math.max(outsideStart + 0.1, split - transitionGap / 2);
      insideStart = Math.min(insideEnd - 0.1, split + transitionGap / 2);
    } else if (insideStart < outsideEnd + 0.1) {
      insideStart = nearestEquivalentAtOrAfter(inside.start, outsideEnd + 0.1);
      insideEnd = nearestEquivalentAtOrAfter(inside.end, insideStart + 0.1);
    }

    return { outsideStart, outsideEnd, insideStart, insideEnd };
  }

  function splitDualPadStation(rows, map, station) {
    const pads = (map.objects || []).filter((item) => item.application !== "cold-glue" && item.kind === "pad" && Number(item.station) === Number(station));
    const outside = contactRange(pads.filter((item) => item.side !== "inner"));
    const inside = contactRange(pads.filter((item) => item.side === "inner"));
    if (!outside || !inside) return rows;

    const turnOne = rows.findIndex((row) => Number(row.station) === Number(station) && /Wipe Turn 1/i.test(String(row.action || "")) && Number(row.cmd) === 7);
    const turnTwo = rows.findIndex((row, index) => index > turnOne && Number(row.station) === Number(station) && /Wipe Turn 2/i.test(String(row.action || "")) && Number(row.cmd) === 7);
    if (turnOne < 0 || turnTwo < 0) return rows;
    const finalRest = rows.findIndex((row, index) => index > turnTwo && Number(row.station) === Number(station) && Number(row.cmd) === 3);
    if (finalRest < 0) return rows;

    const firstStartPlate = Number(rows[turnOne].plateAngle);
    const afterFirstPlate = Number(rows[turnTwo].plateAngle);
    const finalPlate = Number(rows[finalRest].plateAngle);
    if (![firstStartPlate, afterFirstPlate, finalPlate].every(Number.isFinite)) return rows;

    const previousTable = Number(rows[turnOne - 1]?.tableAngle ?? 0);
    const windows = dividedPadWindows(outside, inside, afterFirstPlate - firstStartPlate, finalPlate - afterFirstPlate, previousTable);

    // Existing neck profiles may already contain two CMD 7/CMD 3 pairs, but an
    // overlapping inside pad can push the second pair to another revolution.
    // Rebuild every dual-pad station from the physical divided contact surface.
    const firstTurn = {
      ...rows[turnOne],
      tableAngle: windows.outsideStart,
      plateAngle: firstStartPlate,
      stage: "outer-pad",
      plannedRotation: afterFirstPlate - firstStartPlate,
      plannedRatio: Math.abs(afterFirstPlate - firstStartPlate) / Math.max(0.001, windows.outsideEnd - windows.outsideStart)
    };
    const firstRest = {
      ...rows[turnTwo],
      cmd: 3,
      tableAngle: windows.outsideEnd,
      plateAngle: afterFirstPlate,
      action: `${String(rows[turnOne].action || "Wipe Turn 1")} - Rest`,
      stage: "outer-pad-complete",
      plannedRotation: afterFirstPlate - firstStartPlate,
      plannedRatio: firstTurn.plannedRatio
    };
    const secondTurn = {
      ...rows[turnTwo],
      cmd: 7,
      tableAngle: windows.insideStart,
      plateAngle: afterFirstPlate,
      stage: "inner-pad",
      plannedRotation: finalPlate - afterFirstPlate,
      plannedRatio: Math.abs(finalPlate - afterFirstPlate) / Math.max(0.001, windows.insideEnd - windows.insideStart)
    };
    const secondRest = {
      ...rows[finalRest],
      cmd: 3,
      tableAngle: windows.insideEnd,
      plateAngle: finalPlate,
      stage: "complete",
      plannedRotation: finalPlate - afterFirstPlate,
      plannedRatio: secondTurn.plannedRatio,
      dualPadSplit: true
    };

    const result = [...rows.slice(0, turnOne), firstTurn, firstRest, secondTurn, secondRest, ...rows.slice(finalRest + 1)];
    return result.map((row, index) => ({ ...row, hmi: index + 1, plc: index }));
  }

  function applyDualPadLogic(rows, map) {
    if (!Array.isArray(rows) || !map || map.applicationMode !== "apl") return rows;
    const stations = [...new Set((map.objects || []).filter((item) => item.kind === "pad").map((item) => Number(item.station)).filter(Number.isFinite))].sort((a, b) => a - b);
    let result = rows;
    stations.forEach((station) => { result = splitDualPadStation(result, map, station); });
    if (window.LabelerServoCommandDriver?.finalize) result = window.LabelerServoCommandDriver.finalize(result);
    result = result.map((row, index) => ({ ...row, hmi: index + 1, plc: index }));
    if (state.motionPlan && state.motionPlan.mapDriven) {
      state.motionPlan.rows = result;
      state.motionPlan.issues = Array.isArray(state.motionPlan.issues) ? state.motionPlan.issues : [];
      const existingCodes = new Set(state.motionPlan.issues.map((issue) => `${issue.code}:${issue.station || ""}:${issue.stage || ""}`));
      result.filter((row) => row.dualPadSplit || row.stage === "outer-pad" || row.stage === "inner-pad").forEach((row) => {
        const ratio = Number(row.plannedRatio);
        if (!Number.isFinite(ratio) || ratio < state.maxMoveRatio) return;
        const key = `apl-dual-pad-capacity:${row.station || ""}:${row.stage || ""}`;
        if (existingCodes.has(key)) return;
        existingCodes.add(key);
        state.motionPlan.issues.push({
          level: "bad",
          code: "apl-dual-pad-capacity",
          station: row.station,
          section: row.section,
          stage: row.stage,
          message: `Aggregate ${row.station} ${row.stage === "outer-pad" ? "outside" : "inside"} wipe-down pad requires ${ratio.toFixed(2)}:1, above the ${Number(state.maxMoveRatio).toFixed(1)}:1 limit. Increase that pad's contact span or reposition the paired pad.`
        });
      });
    }
    return result;
  }

  function syncMapDefinitionsBeforeGeneration(map) {
    if (!map || map.applicationMode !== "apl") return;
    ensureObjectDefinitions(map);
    const stations = [...new Set((map.objects || []).filter(isAplMechanicalObject).map((item) => Number(item.station)).filter(Number.isFinite))];
    stations.forEach((station) => {
      const objects = map.objects.filter((item) => isAplMechanicalObject(item) && Number(item.station) === station);
      const explicit = objects.map((item) => normalizeSection(item.labelSection)).filter((section) => section !== "auto");
      if (explicit.length) applyStationDefinition(map, station, explicit[0]);
    });
  }

  function wrapProfileGenerator() {
    const original = window.generatedAplMapDrivenProfile;
    if (typeof original !== "function" || original.mapObjectWipeDefinitionWrapped) return;
    const wrapped = function generatedAplMapDrivenProfileWithObjectDefinitions(machineMap, ...args) {
      syncMapDefinitionsBeforeGeneration(machineMap);
      return applyDualPadLogic(original.call(this, machineMap, ...args), machineMap);
    };
    wrapped.mapObjectWipeDefinitionWrapped = true;
    window.generatedAplMapDrivenProfile = wrapped;
    try { generatedAplMapDrivenProfile = wrapped; } catch { /* global binding may be read-only */ }
  }

  function wrapBuilderRenderer() {
    const original = window.renderWipeDownBuilder;
    if (typeof original !== "function" || original.mapObjectWipeDefinitionWrapped) return;
    const wrapped = function renderWipeDownBuilderWithDefinitions(...args) {
      const result = original.apply(this, args);
      scheduleDecoration();
      return result;
    };
    wrapped.mapObjectWipeDefinitionWrapped = true;
    window.renderWipeDownBuilder = wrapped;
    try { renderWipeDownBuilder = wrapped; } catch { /* global binding may be read-only */ }
  }

  function installStyles() {
    if (document.querySelector("#mapObjectWipeDefinitionStyles")) return;
    const style = document.createElement("style");
    style.id = "mapObjectWipeDefinitionStyles";
    style.textContent = `
      .wipe-builder-row>summary>span{min-width:0}
      .builder-quick-delete{flex:0 0 auto;min-width:54px!important;min-height:26px!important;height:26px!important;margin-left:auto!important;padding:3px 7px!important;font-size:8px!important;line-height:1!important;position:relative;z-index:2}
      [data-object-wipe-definition] small{display:block;margin-top:3px;color:var(--muted);font-size:8px;line-height:1.35}
      @media(max-width:520px){.builder-quick-delete{min-width:48px!important;padding:3px 5px!important}}
    `;
    document.head.appendChild(style);
  }

  function install() {
    if (installed) return true;
    if (typeof state === "undefined" || typeof activeMachineMap !== "function" || typeof renderWipeDownBuilder !== "function") return false;
    installed = true;
    installStyles();
    wrapProfileGenerator();
    wrapBuilderRenderer();
    ensureObjectDefinitions();
    scheduleDecoration();
    window.setTimeout(() => { wrapProfileGenerator(); wrapBuilderRenderer(); scheduleDecoration(); }, 500);
    return true;
  }

  function wait() {
    if (install()) return;
    window.setTimeout(wait, RETRY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait, { once: true });
  else wait();
})();
