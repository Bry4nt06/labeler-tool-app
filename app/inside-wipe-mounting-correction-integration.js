"use strict";

(function installInsideWipeMountingCorrection(global) {
  if (global.ServoForgeInsideWipeMountingCorrection?.installed) return;

  const PAD_WIDTH_MM = 22;
  const RETRY_MS = 50;
  const MAX_RETRIES = 200;
  let observer = null;

  function mapUnitsPerMillimeterFallback() {
    const renderer = global.LabelerWipeComponentVisualRenderer;
    if (typeof renderer?.mapUnitsPerMillimeter === "function") {
      return renderer.mapUnitsPerMillimeter();
    }
    const referenceRadiusMm = Math.abs(Number(state.referencePitchRadiusMm || state.tablePitchRadiusMm) || 0);
    const mapRadius = Math.abs(Number(state.radius) || 0);
    if (!(referenceRadiusMm > 0) || !(mapRadius > 0)) return 1;
    return mapRadius / referenceRadiusMm;
  }

  function insideMountedPadPath(startAngle, endAngle, centerRadius, widthMapUnits) {
    const start = Number(startAngle) || 0;
    let end = Number(endAngle);
    if (!Number.isFinite(end)) end = start;
    while (end < start) end += 360;

    const width = Math.max(1, Number(widthMapUnits) || PAD_WIDTH_MM * mapUnitsPerMillimeterFallback());
    const innerRadius = Math.max(1, Number(centerRadius) - width / 2);
    const outerRadius = Math.max(innerRadius + 0.5, Number(centerRadius) + width / 2);
    const span = Math.max(0.1, end - start);
    const physicalBevelDeg = (width / Math.max(1, Number(centerRadius))) * 180 / Math.PI * 0.8;
    const bevelDeg = Math.min(span * 0.38, Math.max(0.75, Math.min(5, physicalBevelDeg)));

    // FIELD MOUNTING REFERENCE:
    // For an INSIDE wipe-down, the pad is the radial mirror of the outside pad.
    // The long edge must be toward the table/machine center (innerRadius).
    // The bottle-facing edge (outerRadius) is shortened by the bevel.
    // This produces the same silhouette as the yellow field sketch: long edge
    // on the inside, short/beveled edge against the bottle path.
    const outerStartAngle = start + bevelDeg;
    const innerStartAngle = start;
    const startOuter = angleToXY(outerStartAngle, outerRadius);
    const endOuter = angleToXY(end, outerRadius);
    const startInner = angleToXY(innerStartAngle, innerRadius);
    const endInner = angleToXY(end, innerRadius);
    const outerSpan = Math.max(0.1, end - outerStartAngle);
    const innerSpan = Math.max(0.1, end - innerStartAngle);
    const sweepOuter = state.direction === "cw" ? 0 : 1;
    const sweepInner = sweepOuter ? 0 : 1;

    return [
      `M ${startOuter.x} ${startOuter.y}`,
      `A ${outerRadius} ${outerRadius} 0 ${outerSpan > 180 ? 1 : 0} ${sweepOuter} ${endOuter.x} ${endOuter.y}`,
      `L ${endInner.x} ${endInner.y}`,
      `A ${innerRadius} ${innerRadius} 0 ${innerSpan > 180 ? 1 : 0} ${sweepInner} ${startInner.x} ${startInner.y}`,
      "Z"
    ].join(" ");
  }

  function mapItemById(id) {
    if (!id) return null;
    const sources = [
      Array.isArray(state.aplMapObjects) ? state.aplMapObjects : [],
      typeof activeMachineMap === "function" && Array.isArray(activeMachineMap()?.objects)
        ? activeMachineMap().objects
        : []
    ];
    for (const source of sources) {
      const item = source.find((entry) => String(entry?.id || "") === String(id));
      if (item) return item;
    }
    return null;
  }

  function applyInsidePadGeometry(path) {
    if (!path?.getAttribute) return false;
    const id = path.getAttribute("data-wipe-down-pad");
    const item = mapItemById(id);
    if (!item || String(item.side || "outer") !== "inner") return false;

    const widthMapUnits = typeof global.wipeDownPadWidthMapUnits === "function"
      ? global.wipeDownPadWidthMapUnits()
      : typeof global.LabelerWipeComponentVisualRenderer?.wipeDownPadWidthMapUnits === "function"
        ? global.LabelerWipeComponentVisualRenderer.wipeDownPadWidthMapUnits()
        : PAD_WIDTH_MM * mapUnitsPerMillimeterFallback();
    const centerRadius = Number(state.radius) + Number(state.depths?.wipeInner || 0);
    const desired = insideMountedPadPath(item.start, item.end, centerRadius, widthMapUnits);

    if (path.getAttribute("d") !== desired) path.setAttribute("d", desired);
    path.setAttribute("data-inside-wipe-mount", "long-edge-center-short-bevel-bottle-v2");
    path.setAttribute("data-long-edge-facing", "machine-center");
    path.setAttribute("data-bevel-contact-side", "bottle");

    // The renderer adds a highlight path immediately after the orange pad.
    // Keep that outline on the corrected physical geometry as well.
    const highlight = path.nextElementSibling;
    if (highlight?.tagName?.toLowerCase() === "path" && highlight.getAttribute("d") !== desired) {
      highlight.setAttribute("d", desired);
    }
    return true;
  }

  function refreshRenderedPads() {
    if (!global.document?.querySelectorAll) return 0;
    let corrected = 0;
    global.document.querySelectorAll("path[data-wipe-down-pad]").forEach((path) => {
      if (applyInsidePadGeometry(path)) corrected += 1;
    });
    return corrected;
  }

  function installRenderedGeometryGuard() {
    if (!global.MutationObserver || !global.document?.body || observer) return false;
    observer = new global.MutationObserver(() => {
      global.queueMicrotask?.(refreshRenderedPads) || global.setTimeout(refreshRenderedPads, 0);
    });
    observer.observe(global.document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["d"]
    });
    refreshRenderedPads();
    return true;
  }

  function installWhenRendererReady() {
    let retries = 0;
    const attempt = () => {
      retries += 1;
      const rendererReady = Boolean(global.LabelerWipeComponentVisualRenderer?.spongeWipePadsV2);
      if (rendererReady) {
        installRenderedGeometryGuard();
        refreshRenderedPads();
        return true;
      }
      return false;
    };

    if (attempt()) return;
    const timer = global.setInterval(() => {
      if (attempt() || retries >= MAX_RETRIES) global.clearInterval(timer);
    }, RETRY_MS);

    const featureReady = global.ServoForgeFeatureIntegrationsReady;
    if (featureReady && typeof featureReady.then === "function") {
      featureReady.then(() => {
        if (attempt()) global.clearInterval(timer);
      }).catch(() => {});
    }
  }

  global.ServoForgeInsideWipeMountingCorrection = Object.freeze({
    installed: true,
    PAD_WIDTH_MM,
    insideMountedPadPath,
    applyInsidePadGeometry,
    refreshRenderedPads,
    installRenderedGeometryGuard,
    insidePadYellowSketchMountV2: true,
    renderedGeometryGuardV1: true
  });

  installWhenRendererReady();
})(window);
