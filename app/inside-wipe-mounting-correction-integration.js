"use strict";

(function installInsideWipeMountingCorrection(global) {
  if (global.ServoForgeInsideWipeMountingCorrection?.installed) return;

  const PAD_PATTERN_ID = "servoforge-wipe-sponge-pattern";
  const PAD_WIDTH_MM = 22;
  const RETRY_MS = 50;
  const MAX_RETRIES = 200;

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

  function sideAwareTrailingPadPath(startAngle, endAngle, centerRadius, widthMapUnits, side = "outer") {
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
    const isInner = String(side) === "inner";

    // Physical mounting reference:
    // Inside wipe-downs are radially flipped compared with outside wipe-downs.
    // The long edge belongs toward the table/machine center. The shorter,
    // beveled edge belongs toward the bottle path, matching the field sketch.
    const outerStartAngle = isInner ? start + bevelDeg : start;
    const innerStartAngle = isInner ? start : start + bevelDeg;
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

  function drawSideAwareSpongePad(add, parent, item, centerRadius) {
    if (typeof global.ensureWipeComponentVisualDefs === "function") {
      global.ensureWipeComponentVisualDefs(add, parent);
    }
    const widthMapUnits = typeof global.wipeDownPadWidthMapUnits === "function"
      ? global.wipeDownPadWidthMapUnits()
      : PAD_WIDTH_MM * mapUnitsPerMillimeterFallback();
    const side = String(item?.side || "outer");
    const d = sideAwareTrailingPadPath(item?.start, item?.end, centerRadius, widthMapUnits, side);
    const pad = add("path", {
      d,
      fill: `url(#${PAD_PATTERN_ID})`,
      stroke: "#7d3511",
      "stroke-width": 1.1,
      "stroke-linejoin": "round",
      "data-wipe-down-pad": item?.id || "",
      "data-pad-width-mm": PAD_WIDTH_MM,
      "data-sponge-material": "orange-foam",
      "data-bevel-facing": "against-machine-direction",
      "data-pad-facing": side === "inner" ? "radially-outward-to-bottle" : "radially-inward-to-bottle",
      "data-bevel-contact-side": side === "inner" ? "bottle" : "machine-center",
      "data-long-edge-facing": side === "inner" ? "machine-center" : "machine-outside",
      "data-inside-wipe-mount": side === "inner" ? "long-edge-center-short-bevel-bottle" : "outside-unchanged",
      "data-machine-direction": state.direction
    }, parent);
    add("path", {
      d,
      fill: "none",
      stroke: "#ffd09b",
      "stroke-width": 0.55,
      "stroke-opacity": 0.38,
      "pointer-events": "none"
    }, parent);
    return pad;
  }

  function installOverride() {
    const renderer = global.LabelerWipeComponentVisualRenderer;
    if (typeof global.drawSpongeWipeDownPad !== "function" || !renderer?.spongeWipePadsV2) return false;

    global.machineTrailingPadPath = sideAwareTrailingPadPath;
    global.drawSpongeWipeDownPad = drawSideAwareSpongePad;
    global.LabelerWipeComponentVisualRenderer = Object.freeze({
      ...renderer,
      machineTrailingPadPath: sideAwareTrailingPadPath,
      drawSpongeWipeDownPad: drawSideAwareSpongePad,
      innerPadBottleBevelV3: true,
      innerPadLongEdgeCenterV3: true,
      innerPadYellowSketchMountV1: true
    });
    return true;
  }

  function installWhenRendererReady() {
    if (installOverride()) {
      if (typeof global.renderMap === "function") global.renderMap();
      return;
    }

    let retries = 0;
    const timer = global.setInterval(() => {
      retries += 1;
      if (installOverride()) {
        global.clearInterval(timer);
        if (typeof global.renderMap === "function") global.renderMap();
      } else if (retries >= MAX_RETRIES) {
        global.clearInterval(timer);
      }
    }, RETRY_MS);

    const featureReady = global.ServoForgeFeatureIntegrationsReady;
    if (featureReady && typeof featureReady.then === "function") {
      featureReady.then(() => {
        if (installOverride()) {
          global.clearInterval(timer);
          if (typeof global.renderMap === "function") global.renderMap();
        }
      }).catch(() => {});
    }
  }

  global.ServoForgeInsideWipeMountingCorrection = Object.freeze({
    installed: true,
    PAD_WIDTH_MM,
    sideAwareTrailingPadPath,
    drawSideAwareSpongePad,
    installOverride,
    installWhenRendererReady,
    innerPadYellowSketchMountV1: true
  });

  installWhenRendererReady();
})(window);
