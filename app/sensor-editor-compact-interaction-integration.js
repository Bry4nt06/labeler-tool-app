"use strict";

(function installSensorEditorCompactInteraction(global) {
  if (global.LabelerSensorEditorCompactInteraction?.installed) return;

  const VERSION = 14;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const EDITABLE_FIELDS = new Set([
    "angle",
    "sensorAimOffsetDeg",
    "requiredVisibilityPercent"
  ]);
  let commitTimer = null;
  let previewTimer = null;
  let mapFrame = null;
  let renderMapWrapped = false;

  function activeMap() {
    try { return typeof global.activeMachineMap === "function" ? global.activeMachineMap() : null; }
    catch { return null; }
  }

  function editableMap() {
    try { return typeof global.editableMachineMap === "function" ? global.editableMachineMap() : activeMap(); }
    catch { return activeMap(); }
  }

  function sensorFromControl(control) {
    const row = control?.closest?.(".wipe-builder-row[data-builder-object-id]");
    const map = editableMap();
    if (!row || !map || !Array.isArray(map.objects)) return null;
    const sensor = map.objects.find((item) => (
      item?.kind === "sensor"
      && String(item.id) === String(row.dataset.builderObjectId)
    ));
    return sensor ? { row, map, sensor } : null;
  }

  function boundedValue(field, value) {
    if (!Number.isFinite(value)) return NaN;
    if (field === "sensorAimOffsetDeg") return Math.max(-90, Math.min(90, value));
    if (field === "requiredVisibilityPercent") return Math.max(1, Math.min(100, value));
    return value;
  }

  function syncRuntimeSensor(sensor, field, value) {
    const runtime = Array.isArray(global.state?.aplMapObjects)
      ? global.state.aplMapObjects.find((item) => String(item?.id) === String(sensor.id))
      : null;
    [sensor, runtime].filter(Boolean).forEach((item) => {
      item[field] = value;
      if (field === "angle") {
        item.start = value;
        item.end = value;
      }
    });
  }

  function applyControlValue(control, { finalize = false } = {}) {
    const field = String(control?.dataset?.builderField || "");
    if (!EDITABLE_FIELDS.has(field)) return false;
    const resolved = sensorFromControl(control);
    if (!resolved) return false;

    const raw = String(control.value ?? "").trim();
    const partial = raw === "" || raw === "-" || raw === "." || raw === "-.";
    const parsed = partial ? NaN : Number(raw);
    const next = boundedValue(field, parsed);

    if (!Number.isFinite(next)) {
      if (finalize) {
        const fallback = Number(resolved.sensor[field]);
        control.value = Number.isFinite(fallback) ? String(fallback) : "0";
      }
      return true;
    }

    syncRuntimeSensor(resolved.sensor, field, next);
    resolved.row.dataset.sensorAimOffsetDeg = String(
      field === "sensorAimOffsetDeg"
        ? next
        : Number(resolved.sensor.sensorAimOffsetDeg || 0)
    );

    if (finalize && Number(control.value) !== next) control.value = String(next);
    return true;
  }

  function refreshLiveStatus(control) {
    const resolved = sensorFromControl(control);
    if (!resolved) return false;
    const liveStatus = global.LabelerSensorDirectionLiveStatus;
    if (liveStatus?.refreshStatusNode) {
      return Boolean(liveStatus.refreshStatusNode(resolved.row, resolved.sensor));
    }

    const svc = global.LabelerOrientationConstraintTargetService;
    const status = svc?.labelSensorMapStatus?.(resolved.sensor, global.state?.program);
    const node = resolved.row.querySelector?.(".sensor-inline-status");
    if (!status || !node) return false;
    node.classList.toggle("sensor-status-pass", Boolean(status.passes));
    node.classList.toggle("sensor-status-fail", !status.passes);
    const strong = node.querySelector("strong");
    const detail = node.querySelector("span");
    if (strong) strong.textContent = `${Number(status.percent || 0).toFixed(1).replace(/\.0$/, "")}% visible`;
    if (detail) detail.textContent = `Required: ${Number(status.required || 0).toFixed(0)}%`;
    return true;
  }

  function refreshAllLiveStatus() {
    global.LabelerSensorDirectionLiveStatus?.refreshAllStatusCards?.();
  }

  function scheduleMapCenterlines() {
    if (mapFrame) return;
    mapFrame = global.requestAnimationFrame(() => {
      mapFrame = null;
      drawSensorCenterlines();
    });
  }

  function finishProgramRefresh() {
    refreshAllLiveStatus();
    global.renderValidation?.();
    global.renderMap?.();
    drawSensorCenterlines();
  }

  function regenerateSensorPreview() {
    previewTimer = null;
    try {
      if (global.state?.selectedBrand && typeof global.applyGeneratedServoProfile === "function") {
        const result = global.applyGeneratedServoProfile();
        Promise.resolve(result)
          .catch((error) => console.error("Unable to regenerate live sensor preview.", error))
          .finally(finishProgramRefresh);
      } else {
        finishProgramRefresh();
      }
    } catch (error) {
      console.error("Unable to regenerate live sensor preview.", error);
    }
  }

  function schedulePreviewRegeneration(delay = 160) {
    if (previewTimer) global.clearTimeout(previewTimer);
    previewTimer = global.setTimeout(regenerateSensorPreview, delay);
  }

  function commitSensorEdits() {
    commitTimer = null;
    if (previewTimer) {
      global.clearTimeout(previewTimer);
      previewTimer = null;
    }
    try {
      const map = editableMap();
      const policy = global.LabelerDriverRegistry?.resolve?.("profile.sensorStationLabel")
        || global.LabelerSensorStationLabelDriver;
      if (map && policy?.normalizeMap) policy.normalizeMap(map, { rename: true });
      global.saveCurrentSettings?.();
      if (global.state?.selectedBrand && typeof global.applyGeneratedServoProfile === "function") {
        const result = global.applyGeneratedServoProfile();
        Promise.resolve(result)
          .catch((error) => console.error("Unable to commit compact sensor edits.", error))
          .finally(finishProgramRefresh);
      } else {
        finishProgramRefresh();
      }
    } catch (error) {
      console.error("Unable to commit compact sensor edits.", error);
    }
  }

  function scheduleCommit(delay = 260) {
    if (commitTimer) global.clearTimeout(commitTimer);
    commitTimer = global.setTimeout(commitSensorEdits, delay);
  }

  function captureSensorInput(event, finalize = false) {
    const control = event.target;
    if (!(control instanceof HTMLInputElement)) return;
    if (!EDITABLE_FIELDS.has(String(control.dataset.builderField || ""))) return;
    if (!sensorFromControl(control)) return;

    // Own these events before the legacy document-level Map Builder handler.
    // The old handler regenerates and rebuilds the row on every keystroke,
    // which destroys focus and interrupts normal keyboard entry.
    event.stopImmediatePropagation();
    event.stopPropagation();

    applyControlValue(control, { finalize });
    refreshLiveStatus(control);
    scheduleMapCenterlines();

    // Keep the active input mounted while the user types. The status card is
    // updated immediately, then the servo profile is regenerated after a short
    // idle delay without rebuilding the Map Builder row.
    if (finalize) scheduleCommit(0);
    else schedulePreviewRegeneration(160);
  }

  function escapeId(value) {
    if (global.CSS?.escape) return global.CSS.escape(String(value));
    return String(value).replace(/["\\]/g, "\\$&");
  }

  function sensorAim(item) {
    const policy = global.LabelerDriverRegistry?.resolve?.("profile.sensorStationLabel")
      || global.LabelerSensorStationLabelDriver;
    return policy?.sensorAimOffset
      ? policy.sensorAimOffset(item?.sensorAimOffsetDeg)
      : Math.max(-90, Math.min(90, Number(item?.sensorAimOffsetDeg || 0)));
  }

  function drawSensorCenterlines() {
    const map = activeMap();
    const svg = document.querySelector("#mapSvg");
    if (!map || !svg || !global.state || typeof global.angleToXY !== "function" || typeof global.angleToSvgRotation !== "function") return;

    svg.querySelectorAll("[data-sensor-aim-indicator],[data-sensor-aim-centerline]").forEach((node) => node.remove());

    (map.objects || []).filter((item) => item?.kind === "sensor").forEach((item) => {
      const objectLayer = svg.querySelector(`[data-map-object-id="${escapeId(item.id)}"]`);
      if (!objectLayer) return;

      const placement = Number(item.angle ?? item.start);
      if (!Number.isFinite(placement)) return;
      const radius = Number(global.state.radius || 0) + Number(global.state.depths?.opRoller || 0) + 7;
      const xy = global.angleToXY(placement, radius);
      const directionSign = global.state.direction === "cw" ? -1 : 1;
      const aim = sensorAim(item);
      const rotation = global.angleToSvgRotation(placement) + 180 + directionSign * aim;
      const selected = String(global.state.selectedMapObjectId || "") === String(item.id);
      const rayLength = Math.max(120, radius * 2 + 38);

      const group = document.createElementNS(SVG_NS, "g");
      group.setAttribute("transform", `translate(${xy.x} ${xy.y}) rotate(${rotation})`);
      group.setAttribute("data-sensor-aim-centerline", String(item.id));
      group.setAttribute("pointer-events", "none");

      const ray = document.createElementNS(SVG_NS, "line");
      ray.setAttribute("x1", "0");
      ray.setAttribute("y1", "0");
      ray.setAttribute("x2", String(rayLength));
      ray.setAttribute("y2", "0");
      ray.setAttribute("stroke", "#58aeca");
      ray.setAttribute("stroke-width", selected ? "2" : "1.35");
      ray.setAttribute("stroke-dasharray", "7 5");
      ray.setAttribute("stroke-opacity", selected ? "0.78" : "0.38");
      ray.setAttribute("vector-effect", "non-scaling-stroke");
      group.appendChild(ray);

      const direction = document.createElementNS(SVG_NS, "line");
      direction.setAttribute("x1", "0");
      direction.setAttribute("y1", "0");
      direction.setAttribute("x2", "38");
      direction.setAttribute("y2", "0");
      direction.setAttribute("stroke", "#58aeca");
      direction.setAttribute("stroke-width", selected ? "3" : "2.25");
      direction.setAttribute("stroke-linecap", "round");
      direction.setAttribute("vector-effect", "non-scaling-stroke");
      group.appendChild(direction);

      const arrow = document.createElementNS(SVG_NS, "path");
      arrow.setAttribute("d", "M 42 0 L 33 -5 L 33 5 Z");
      arrow.setAttribute("fill", "#58aeca");
      arrow.setAttribute("fill-opacity", selected ? "1" : "0.72");
      group.appendChild(arrow);

      const origin = document.createElementNS(SVG_NS, "circle");
      origin.setAttribute("cx", "0");
      origin.setAttribute("cy", "0");
      origin.setAttribute("r", selected ? "3.2" : "2.5");
      origin.setAttribute("fill", "#58aeca");
      group.appendChild(origin);

      const title = document.createElementNS(SVG_NS, "title");
      title.textContent = `${item.name || "Sensor"} centerline: ${aim}° aim`;
      group.appendChild(title);
      objectLayer.appendChild(group);
    });
  }

  function wrapMapRenderer() {
    if (renderMapWrapped || typeof global.renderMap !== "function") return renderMapWrapped;
    const base = global.renderMap;
    global.renderMap = function renderMapWithSensorCenterlines(...args) {
      const result = base.apply(this, args);
      drawSensorCenterlines();
      return result;
    };
    global.renderMap.sensorEditorCompactV14 = true;
    global.renderMap.previousFunction = base;
    renderMapWrapped = true;
    return true;
  }

  function installStyles() {
    document.querySelector("#sensorEditorCompactInteractionStyles")?.remove();
    const style = document.createElement("style");
    style.id = "sensorEditorCompactInteractionStyles";
    style.textContent = `
      .sensor-station-inherited-row{
        background:var(--panel)!important;
        border-color:color-mix(in srgb,var(--blue) 34%,var(--line))!important;
      }
      .sensor-station-inherited-row>summary{
        background:color-mix(in srgb,var(--panel-hi) 84%,var(--input))!important;
      }
      .sensor-station-inherited-row .builder-object-editor{
        padding:4px 6px 5px!important;
        background:var(--panel-hi)!important;
      }
      .sensor-station-inherited-row.selected-builder-object{
        border-color:var(--accent,#35c98b)!important;
      }
      .sensor-station-inherited-row .builder-row-title{display:none!important}
      .sensor-station-inherited-row .builder-row-grid{
        display:grid!important;
        grid-template-columns:minmax(108px,1.08fr) repeat(3,minmax(88px,1fr))!important;
        grid-auto-rows:min-content!important;
        gap:4px!important;
        align-items:start!important;
      }
      .sensor-station-inherited-row .builder-row-grid>.sensor-grid-field{
        min-width:0!important;
        min-height:0!important;
        height:auto!important;
        align-self:start!important;
        margin:0!important;
        padding:4px 6px!important;
        border:1px solid color-mix(in srgb,var(--line) 82%,var(--blue))!important;
        border-radius:5px!important;
        background:color-mix(in srgb,var(--panel) 74%,var(--input))!important;
      }
      .sensor-station-inherited-row label.sensor-grid-field{
        display:grid!important;
        grid-template-rows:auto 27px auto!important;
        align-content:start!important;
        justify-content:stretch!important;
        gap:2px!important;
        line-height:1.05!important;
      }
      .sensor-station-inherited-row label.sensor-grid-field input:not([type="checkbox"]),
      .sensor-station-inherited-row label.sensor-grid-field select{
        width:100%!important;
        height:27px!important;
        min-height:27px!important;
        margin:0!important;
        padding:2px 7px!important;
      }
      .sensor-station-inherited-row .sensor-activation-control{
        display:grid!important;
        grid-template-rows:auto auto!important;
        align-content:start!important;
        align-items:start!important;
        justify-content:stretch!important;
        flex:none!important;
        flex-wrap:nowrap!important;
        gap:2px!important;
        width:auto!important;
        max-width:none!important;
        min-height:0!important;
        height:auto!important;
        font-size:11px!important;
      }
      .sensor-station-inherited-row .sensor-activation-control>span{
        display:flex!important;
        align-items:center!important;
        gap:5px!important;
        min-height:27px!important;
        font-size:11px!important;
        white-space:nowrap!important;
      }
      .sensor-station-inherited-row .sensor-activation-control small,
      .sensor-station-inherited-row .sensor-grid-field small{
        display:block!important;
        flex:0 0 auto!important;
        min-height:0!important;
        margin:0!important;
        font-size:8.5px!important;
        line-height:1.05!important;
      }
      .sensor-station-inherited-row .sensor-inherited-label-field{
        display:grid!important;
        grid-template-rows:auto auto auto!important;
        align-content:start!important;
        gap:1px!important;
        min-height:0!important;
      }
      .sensor-station-inherited-row .sensor-field-caption{font-size:8.5px!important;line-height:1!important}
      .sensor-station-inherited-row .sensor-inherited-label-value{font-size:12px!important;line-height:1.05!important}
      .sensor-station-inherited-row .sensor-field-status{
        grid-column:span 2!important;
        display:grid!important;
        grid-template-rows:auto auto!important;
        align-content:center!important;
        align-items:start!important;
        gap:1px!important;
        min-height:47px!important;
      }
      .sensor-station-inherited-row .sensor-inline-status strong{font-size:12px!important;line-height:1.05!important}
      .sensor-station-inherited-row .sensor-inline-status span{font-size:8.5px!important;line-height:1.05!important}
      .sensor-station-inherited-row .builder-object-actions{margin-top:4px!important;gap:5px!important}
      .sensor-station-inherited-row .builder-object-actions button{min-height:25px!important;padding:3px 7px!important}
      @media (max-width:760px){
        .sensor-station-inherited-row .builder-row-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
        .sensor-station-inherited-row .sensor-field-status{grid-column:span 2!important}
      }
    `;
    document.head.appendChild(style);
  }

  function install() {
    installStyles();
    wrapMapRenderer();
    drawSensorCenterlines();
  }

  global.addEventListener("input", (event) => captureSensorInput(event, false), true);
  global.addEventListener("change", (event) => captureSensorInput(event, true), true);
  global.addEventListener("blur", (event) => {
    const control = event.target;
    if (!(control instanceof HTMLInputElement)) return;
    if (!EDITABLE_FIELDS.has(String(control.dataset.builderField || ""))) return;
    if (!sensorFromControl(control)) return;
    applyControlValue(control, { finalize: true });
    refreshLiveStatus(control);
    scheduleCommit(0);
  }, true);
  global.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const control = event.target;
    if (!(control instanceof HTMLInputElement)) return;
    if (!EDITABLE_FIELDS.has(String(control.dataset.builderField || ""))) return;
    if (!sensorFromControl(control)) return;
    control.blur();
  }, true);

  const retry = () => {
    install();
    if (!renderMapWrapped) global.setTimeout(retry, 50);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", retry, { once: true });
  else retry();

  global.LabelerSensorEditorCompactInteraction = Object.freeze({
    installed: true,
    VERSION,
    EDITABLE_FIELDS,
    applyControlValue,
    refreshLiveStatus,
    regenerateSensorPreview,
    commitSensorEdits,
    drawSensorCenterlines
  });
})(typeof window !== "undefined" ? window : globalThis);
