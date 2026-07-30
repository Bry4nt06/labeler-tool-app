"use strict";

(function installMapObjectWipeDefinitions() {
  const RETRY_MS = 50;
  const SECTIONS = new Set(["auto", "neck", "body", "back", "none"]);
  let installed = false;
  let pending = false;

  function map() { return typeof activeMachineMap === "function" ? activeMachineMap() : null; }
  function section(value) { const result = String(value || "auto").toLowerCase(); return SECTIONS.has(result) ? result : "auto"; }
  function mechanical(item) { return item?.application !== "cold-glue" && ["pad", "roller", "sensor"].includes(String(item?.kind || "")); }
  function inferred(active, station) {
    const explicit = section(active?.stationSections?.[String(station)]);
    if (explicit !== "auto") return explicit;
    const guess = typeof inferAplStationSections === "function" ? section(inferAplStationSections(active)?.[String(station)]) : "auto";
    return guess !== "auto" ? guess : Number(station) <= 2 ? "neck" : Number(station) <= 4 ? "body" : "back";
  }
  function ensureDefinitions(active = map()) {
    if (!active || active.applicationMode !== "apl") return;
    active.stationSections = active.stationSections && typeof active.stationSections === "object" ? active.stationSections : {};
    (active.objects || []).filter(mechanical).forEach((item) => {
      const current = section(item.labelSection);
      const legacy = section(active.stationSections[String(item.station)]);
      item.labelSection = current === "auto" && legacy !== "auto" ? legacy : current;
    });
  }
  function applyStation(active, station, value) {
    const resolved = section(value);
    active.stationSections = active.stationSections || {};
    if (resolved === "auto") delete active.stationSections[String(station)];
    else active.stationSections[String(station)] = resolved;
    (active.objects || []).filter((item) => mechanical(item) && Number(item.station) === Number(station)).forEach((item) => { item.labelSection = resolved; });
  }
  function removeObject(id) {
    const active = map();
    const index = active?.objects?.findIndex((item) => String(item.id) === String(id)) ?? -1;
    if (index < 0) return;
    if (typeof recordBuilderHistory === "function") recordBuilderHistory(`Quick delete ${active.objects[index].name || "map object"}`);
    active.objects.splice(index, 1);
    if (state.selectedMapObjectId === id) state.selectedMapObjectId = "";
    if (typeof refreshAfterBuilderEdit === "function") refreshAfterBuilderEdit({ persist: true });
    if (typeof renderWipeDownBuilder === "function") renderWipeDownBuilder();
  }
  function options(selected) {
    const neckMode = state.buildInputs?.neckApplication === "Leading Edge" ? "leading edge" : "center tack";
    return [["auto", "Auto — infer from map order"], ["neck", `Neck — ${neckMode}`], ["body", "Body — leading edge"], ["back", "Back — leading edge"], ["none", "None — no wipe profile"]]
      .map(([value, label]) => `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`).join("");
  }
  function decorate() {
    pending = false;
    const active = map();
    const list = document.querySelector("#wipeBuilderList");
    if (!active || !list) return;
    ensureDefinitions(active);
    list.querySelectorAll(".wipe-builder-row[data-builder-object-id]").forEach((row) => {
      const item = (active.objects || []).find((entry) => String(entry.id) === String(row.dataset.builderObjectId));
      if (!item) return;
      const summary = row.querySelector(":scope > summary");
      if (summary && !summary.querySelector(".builder-quick-delete")) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "builder-quick-delete danger";
        button.textContent = "Delete";
        button.title = "Delete this object immediately. Use Undo to restore it.";
        button.addEventListener("pointerdown", (event) => event.stopPropagation());
        button.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); removeObject(item.id); });
        summary.appendChild(button);
      }
      if (!mechanical(item) || item.kind === "sensor") return;
      const old = row.querySelector("[data-station-section]")?.closest("label");
      if (!old || old.dataset.objectWipeDefinition === "true") return;
      const selected = section(item.labelSection) === "auto" ? inferred(active, item.station) : section(item.labelSection);
      const replacement = document.createElement("label");
      replacement.dataset.objectWipeDefinition = "true";
      replacement.innerHTML = `Label type / wipe definition<select data-object-label-section>${options(selected)}</select><small>Defines how this station wipes the label. Paired outside and inside objects remain synchronized.</small>`;
      old.replaceWith(replacement);
      replacement.querySelector("select").addEventListener("change", (event) => {
        if (typeof recordBuilderHistory === "function") recordBuilderHistory(`Set Station ${item.station} label type`);
        applyStation(active, item.station, event.currentTarget.value);
        if (typeof refreshAfterBuilderEdit === "function") refreshAfterBuilderEdit({ persist: true });
        renderWipeDownBuilder();
      });
    });
  }
  function schedule() { if (!pending) { pending = true; requestAnimationFrame(decorate); } }

  function range(items) {
    if (!items.length) return null;
    return { start: Math.min(...items.map((item) => Number(item.start))), end: Math.max(...items.map((item) => Number(item.end))) };
  }
  function after(angle, minimum) { let value = Number(angle); while (value < minimum - .001) value += 360; return value; }
  function windows(outside, inside, firstRotation, secondRotation, minimum) {
    let outsideStart = after(outside.start, minimum);
    let outsideEnd = after(outside.end, outsideStart + .1);
    let insideStart = after(inside.start, outsideStart);
    let insideEnd = after(inside.end, insideStart + .1);
    const overlapStart = Math.max(outsideStart, insideStart);
    const overlapEnd = Math.min(outsideEnd, insideEnd);
    if (overlapEnd > overlapStart + .1) {
      const first = Math.abs(Number(firstRotation) || 0);
      const second = Math.abs(Number(secondRotation) || 0);
      const fraction = first + second ? first / (first + second) : .5;
      const split = overlapStart + (overlapEnd - overlapStart) * fraction;
      const gap = Math.min(.5, Math.max(.1, (overlapEnd - overlapStart) / 4));
      outsideEnd = Math.max(outsideStart + .1, split - gap / 2);
      insideStart = Math.min(insideEnd - .1, split + gap / 2);
    } else if (insideStart < outsideEnd + .1) {
      insideStart = after(inside.start, outsideEnd + .1);
      insideEnd = after(inside.end, insideStart + .1);
    }
    return { outsideStart, outsideEnd, insideStart, insideEnd };
  }
  function splitStation(rows, active, station) {
    const pads = (active.objects || []).filter((item) => item.application !== "cold-glue" && item.kind === "pad" && Number(item.station) === Number(station));
    const outside = range(pads.filter((item) => item.side !== "inner"));
    const inside = range(pads.filter((item) => item.side === "inner"));
    if (!outside || !inside) return rows;
    const one = rows.findIndex((row) => Number(row.station) === station && /Wipe Turn 1/i.test(String(row.action || "")) && Number(row.cmd) === 7);
    const two = rows.findIndex((row, index) => index > one && Number(row.station) === station && /Wipe Turn 2/i.test(String(row.action || "")) && Number(row.cmd) === 7);
    const rest = rows.findIndex((row, index) => index > two && Number(row.station) === station && Number(row.cmd) === 3);
    if (one < 0 || two < 0 || rest < 0) return rows;
    const p0 = Number(rows[one].plateAngle), p1 = Number(rows[two].plateAngle), p2 = Number(rows[rest].plateAngle);
    if (![p0, p1, p2].every(Number.isFinite)) return rows;
    const span = windows(outside, inside, p1 - p0, p2 - p1, Number(rows[one - 1]?.tableAngle || 0));
    const ratio1 = Math.abs(p1 - p0) / Math.max(.001, span.outsideEnd - span.outsideStart);
    const ratio2 = Math.abs(p2 - p1) / Math.max(.001, span.insideEnd - span.insideStart);
    const replacement = [
      { ...rows[one], tableAngle: span.outsideStart, plateAngle: p0, stage: "outer-pad", plannedRotation: p1 - p0, plannedRatio: ratio1 },
      { ...rows[two], cmd: 3, tableAngle: span.outsideEnd, plateAngle: p1, action: `${rows[one].action || "Wipe Turn 1"} - Rest`, stage: "outer-pad-complete", plannedRotation: p1 - p0, plannedRatio: ratio1 },
      { ...rows[two], cmd: 7, tableAngle: span.insideStart, plateAngle: p1, stage: "inner-pad", plannedRotation: p2 - p1, plannedRatio: ratio2 },
      { ...rows[rest], cmd: 3, tableAngle: span.insideEnd, plateAngle: p2, stage: "complete", plannedRotation: p2 - p1, plannedRatio: ratio2, dualPadSplit: true }
    ];
    return [...rows.slice(0, one), ...replacement, ...rows.slice(rest + 1)].map((row, index) => ({ ...row, hmi: index + 1, plc: index }));
  }
  function applyDualPads(rows, active) {
    if (!Array.isArray(rows) || active?.applicationMode !== "apl") return rows;
    let result = rows;
    [...new Set((active.objects || []).filter((item) => item.kind === "pad").map((item) => Number(item.station)).filter(Number.isFinite))].sort((a, b) => a - b).forEach((station) => { result = splitStation(result, active, station); });
    if (window.LabelerServoCommandDriver?.finalize) result = window.LabelerServoCommandDriver.finalize(result);
    result = result.map((row, index) => ({ ...row, hmi: index + 1, plc: index }));
    if (state.motionPlan?.mapDriven) state.motionPlan.rows = result;
    return result;
  }
  function wrap() {
    const generator = window.generatedAplMapDrivenProfile;
    if (typeof generator === "function" && !generator.mapObjectWipeDefinitionWrapped) {
      const wrapped = function (active, ...args) { ensureDefinitions(active); return applyDualPads(generator.call(this, active, ...args), active); };
      wrapped.mapObjectWipeDefinitionWrapped = true;
      window.generatedAplMapDrivenProfile = wrapped;
      try { generatedAplMapDrivenProfile = wrapped; } catch { }
    }
    const renderer = window.renderWipeDownBuilder;
    if (typeof renderer === "function" && !renderer.mapObjectWipeDefinitionWrapped) {
      const wrapped = function (...args) { const result = renderer.apply(this, args); schedule(); return result; };
      wrapped.mapObjectWipeDefinitionWrapped = true;
      window.renderWipeDownBuilder = wrapped;
      try { renderWipeDownBuilder = wrapped; } catch { }
    }
  }
  function styles() {
    if (document.querySelector("#mapObjectWipeDefinitionStyles")) return;
    const style = document.createElement("style");
    style.id = "mapObjectWipeDefinitionStyles";
    style.textContent = `.wipe-builder-row>summary>span{min-width:0}.builder-quick-delete{flex:0 0 auto;min-width:54px!important;min-height:26px!important;height:26px!important;margin-left:auto!important;padding:3px 7px!important;font-size:8px!important;position:relative;z-index:2}[data-object-wipe-definition] small{display:block;margin-top:3px;color:var(--muted);font-size:8px}`;
    document.head.appendChild(style);
  }
  function install() {
    if (installed) return true;
    if (typeof state === "undefined" || typeof activeMachineMap !== "function" || typeof renderWipeDownBuilder !== "function") return false;
    installed = true;
    styles(); wrap(); ensureDefinitions(); schedule();
    setTimeout(() => { wrap(); schedule(); }, 500);
    return true;
  }
  (function wait() { if (!install()) setTimeout(wait, RETRY_MS); })();
})();
