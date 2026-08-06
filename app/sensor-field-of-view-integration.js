"use strict";

(function installSensorFieldOfView(global) {
  if (global.LabelerSensorFieldOfView?.installed) return;

  const SVG_NS = "http://www.w3.org/2000/svg";
  const VERSION = 2;
  const DEFAULT_FIELD_OF_VIEW_DEG = 18;
  const MIN_FIELD_OF_VIEW_DEG = 4;
  const MAX_FIELD_OF_VIEW_DEG = 60;
  const RETRY_MS = 50;
  let renderMapWrapped = false;
  let frame = null;
  let observer = null;
  let observedSvg = null;

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function escapeId(value) {
    if (global.CSS?.escape) return global.CSS.escape(String(value));
    return String(value).replace(/["\\]/g, "\\$&");
  }

  function activeMap() {
    try { return typeof global.activeMachineMap === "function" ? global.activeMachineMap() : null; }
    catch { return null; }
  }

  function sensorAim(item) {
    const raw = Number(item?.sensorAimOffsetDeg || 0);
    const fallback = clamp(Number.isFinite(raw) ? raw : 0, -90, 90);
    const policy = global.LabelerDriverRegistry?.resolve?.("profile.sensorStationLabel")
      || global.LabelerSensorStationLabelDriver;
    if (typeof policy?.sensorAimOffset !== "function") return fallback;
    const resolved = Number(policy.sensorAimOffset(raw));
    return Number.isFinite(resolved) ? clamp(resolved, -90, 90) : fallback;
  }

  function fieldOfViewDeg(item) {
    const raw = Number(item?.sensorFieldOfViewDeg);
    return clamp(
      Number.isFinite(raw) ? raw : DEFAULT_FIELD_OF_VIEW_DEG,
      MIN_FIELD_OF_VIEW_DEG,
      MAX_FIELD_OF_VIEW_DEG
    );
  }

  function sensorRotation(placement, aim, direction, rotationFunction = global.angleToSvgRotation) {
    const baseRotation = typeof rotationFunction === "function"
      ? Number(rotationFunction(placement))
      : Number(placement) - 90;
    const directionSign = direction === "cw" ? -1 : 1;
    return baseRotation + 180 + directionSign * Number(aim || 0);
  }

  function coneGeometry(length, fieldWidthDeg) {
    const resolvedLength = Math.max(1, Number(length) || 1);
    const resolvedField = clamp(
      Number(fieldWidthDeg) || DEFAULT_FIELD_OF_VIEW_DEG,
      MIN_FIELD_OF_VIEW_DEG,
      MAX_FIELD_OF_VIEW_DEG
    );
    const halfAngleRad = resolvedField * Math.PI / 360;
    const edgeX = resolvedLength * Math.cos(halfAngleRad);
    const edgeY = resolvedLength * Math.sin(halfAngleRad);
    return {
      length: resolvedLength,
      fieldOfViewDeg: resolvedField,
      halfAngleDeg: resolvedField / 2,
      edgeX,
      edgeY,
      path: `M 0 0 L ${edgeX} ${-edgeY} A ${resolvedLength} ${resolvedLength} 0 0 1 ${edgeX} ${edgeY} Z`
    };
  }

  function isVisibleSensorLayer(objectLayer) {
    if (!objectLayer || objectLayer.hidden || objectLayer.style?.display === "none") return false;
    try {
      if (typeof global.getComputedStyle === "function" && global.getComputedStyle(objectLayer).display === "none") return false;
    } catch { }
    return true;
  }

  function overlayLayer(svg) {
    let layer = Array.from(svg.children || []).find((node) => node.hasAttribute?.("data-sensor-field-of-view-layer"));
    if (!layer) {
      layer = global.document.createElementNS(SVG_NS, "g");
      layer.setAttribute("data-sensor-field-of-view-layer", "true");
      layer.setAttribute("aria-label", "Sensor field-of-view cones");
      layer.setAttribute("pointer-events", "none");
    }

    const assemblies = Array.from(svg.children || []).find((node) =>
      node.getAttribute?.("aria-label") === "Configured wipe-down assemblies"
    );
    if (assemblies) svg.insertBefore(layer, assemblies);
    else if (layer.parentNode !== svg) svg.appendChild(layer);
    return layer;
  }

  function disconnectObserver() {
    observer?.disconnect?.();
  }

  function connectObserver(svg) {
    if (!svg || typeof global.MutationObserver !== "function") return;
    if (!observer) {
      observer = new global.MutationObserver((records) => {
        const externalMutation = records.some((record) => {
          const targetLayer = record.target?.closest?.("[data-sensor-field-of-view-layer]");
          if (targetLayer) return false;
          const changed = [...(record.addedNodes || []), ...(record.removedNodes || [])];
          return changed.some((node) => !node?.hasAttribute?.("data-sensor-field-of-view-layer"));
        });
        if (externalMutation) scheduleDraw();
      });
    }
    observedSvg = svg;
    observer.observe(svg, { childList: true, subtree: true });
  }

  function draw() {
    const map = activeMap();
    const svg = global.document?.querySelector?.("#mapSvg");
    if (!map || !svg || !global.state || typeof global.angleToXY !== "function") return false;

    disconnectObserver();
    const layer = overlayLayer(svg);
    layer.replaceChildren();

    (Array.isArray(map.objects) ? map.objects : [])
      .filter((item) => item?.kind === "sensor")
      .forEach((item) => {
        const objectLayer = svg.querySelector(`[data-map-object-id="${escapeId(item.id)}"]`);
        if (!isVisibleSensorLayer(objectLayer)) return;

        const placement = Number(item.angle ?? item.start);
        if (!Number.isFinite(placement)) return;

        const radius = Number(global.state.radius || 0)
          + Number(global.state.depths?.opRoller || 0)
          + 7;
        const xy = global.angleToXY(placement, radius);
        const aim = sensorAim(item);
        const rotation = sensorRotation(placement, aim, global.state.direction);
        const fieldWidth = fieldOfViewDeg(item);
        const coneLength = clamp(radius * 0.48, 105, 150);
        const geometry = coneGeometry(coneLength, fieldWidth);
        const selected = String(global.state.selectedMapObjectId || "") === String(item.id);

        const group = global.document.createElementNS(SVG_NS, "g");
        group.setAttribute("transform", `translate(${xy.x} ${xy.y}) rotate(${rotation})`);
        group.setAttribute("data-sensor-field-of-view", String(item.id));
        group.setAttribute("data-sensor-aim-deg", String(aim));
        group.setAttribute("data-sensor-field-of-view-deg", String(fieldWidth));
        group.setAttribute("pointer-events", "none");
        group.setAttribute("aria-hidden", "true");

        const cone = global.document.createElementNS(SVG_NS, "path");
        cone.setAttribute("d", geometry.path);
        cone.setAttribute("fill", "#55d7ff");
        cone.setAttribute("fill-opacity", selected ? "0.32" : "0.18");
        cone.setAttribute("stroke", "#7ce4ff");
        cone.setAttribute("stroke-width", selected ? "1.8" : "1.35");
        cone.setAttribute("stroke-opacity", selected ? "0.95" : "0.72");
        cone.setAttribute("vector-effect", "non-scaling-stroke");
        group.appendChild(cone);

        const centerline = global.document.createElementNS(SVG_NS, "line");
        centerline.setAttribute("x1", "0");
        centerline.setAttribute("y1", "0");
        centerline.setAttribute("x2", String(coneLength));
        centerline.setAttribute("y2", "0");
        centerline.setAttribute("stroke", "#b8f2ff");
        centerline.setAttribute("stroke-width", selected ? "2" : "1.4");
        centerline.setAttribute("stroke-opacity", selected ? "1" : "0.82");
        centerline.setAttribute("stroke-dasharray", "6 4");
        centerline.setAttribute("vector-effect", "non-scaling-stroke");
        group.appendChild(centerline);

        const origin = global.document.createElementNS(SVG_NS, "circle");
        origin.setAttribute("cx", "0");
        origin.setAttribute("cy", "0");
        origin.setAttribute("r", selected ? "3.5" : "2.8");
        origin.setAttribute("fill", "#b8f2ff");
        origin.setAttribute("stroke", "#0b657c");
        origin.setAttribute("stroke-width", "1");
        origin.setAttribute("vector-effect", "non-scaling-stroke");
        group.appendChild(origin);

        const title = global.document.createElementNS(SVG_NS, "title");
        title.textContent = `${item.name || "Sensor"} field of view: ${fieldWidth}° at ${aim}° rotation`;
        group.appendChild(title);
        layer.appendChild(group);
      });

    connectObserver(svg);
    return true;
  }

  function scheduleDraw() {
    if (frame) return;
    const schedule = typeof global.requestAnimationFrame === "function"
      ? global.requestAnimationFrame.bind(global)
      : (callback) => global.setTimeout?.(callback, 0);
    frame = schedule(() => {
      frame = null;
      draw();
    });
  }

  function isSensorEditorInput(target) {
    const field = String(target?.dataset?.builderField || "");
    if (!["angle", "sensorAimOffsetDeg"].includes(field)) return false;
    return Boolean(target?.closest?.('.wipe-builder-row[data-builder-object-id]'));
  }

  function wrapMapRenderer() {
    if (renderMapWrapped || typeof global.renderMap !== "function") return renderMapWrapped;
    const base = global.renderMap;
    global.renderMap = function renderMapWithSensorFieldOfView(...args) {
      const result = base.apply(this, args);
      draw();
      return result;
    };
    global.renderMap.sensorFieldOfViewV2 = true;
    global.renderMap.previousFunction = base;
    renderMapWrapped = true;
    return true;
  }

  function install() {
    const svg = global.document?.querySelector?.("#mapSvg");
    const wrapped = wrapMapRenderer();
    if (svg && observedSvg !== svg) {
      disconnectObserver();
      connectObserver(svg);
    }
    if (wrapped && svg) draw();
    return wrapped;
  }

  if (typeof global.addEventListener === "function") {
    global.addEventListener("input", (event) => {
      if (isSensorEditorInput(event.target)) scheduleDraw();
    }, true);
    global.addEventListener("change", (event) => {
      if (isSensorEditorInput(event.target)) scheduleDraw();
    }, true);
  }

  const retry = () => {
    if (!install() && typeof global.setTimeout === "function") global.setTimeout(retry, RETRY_MS);
  };

  global.LabelerSensorFieldOfView = Object.freeze({
    installed: true,
    VERSION,
    DEFAULT_FIELD_OF_VIEW_DEG,
    MIN_FIELD_OF_VIEW_DEG,
    MAX_FIELD_OF_VIEW_DEG,
    sensorAim,
    fieldOfViewDeg,
    sensorRotation,
    coneGeometry,
    draw,
    scheduleDraw,
    install
  });

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", retry, { once: true });
    } else retry();
  }
})(typeof window !== "undefined" ? window : globalThis);
