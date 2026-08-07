"use strict";

(function installSensorMapVisibilityColorIntegration(global) {
  if (global.LabelerSensorMapVisibilityColor?.installed) return;

  const VERSION = 1;
  const PALETTE = Object.freeze({
    neutral: Object.freeze({ level: "neutral", color: "#4ca8ff", minimum: null, maximum: null }),
    red: Object.freeze({ level: "critical", color: "#ff4d4f", minimum: 0, maximum: 24.999 }),
    orange: Object.freeze({ level: "low", color: "#ff8a32", minimum: 25, maximum: 49.999 }),
    yellow: Object.freeze({ level: "medium", color: "#ffd84d", minimum: 50, maximum: 74.999 }),
    lime: Object.freeze({ level: "good", color: "#9adf4f", minimum: 75, maximum: 89.999 }),
    green: Object.freeze({ level: "excellent", color: "#2ed47a", minimum: 90, maximum: 100 })
  });

  let wrappedMapRenderer = false;
  let wrappedSimulationRenderer = false;
  let wrappedProgramGenerator = false;

  function clampPercent(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : null;
  }

  function statusFor(sensor) {
    const service = global.LabelerOrientationConstraintTargetService;
    if (!service?.labelSensorMapStatus || !sensor) return null;
    try {
      return service.labelSensorMapStatus(sensor, global.state?.program);
    } catch {
      return null;
    }
  }

  function visualForStatus(status) {
    const percent = clampPercent(status?.percent);
    if (percent === null) return { ...PALETTE.neutral, percent: null, passes: false, required: null };
    const band = percent >= 90
      ? PALETTE.green
      : percent >= 75
        ? PALETTE.lime
        : percent >= 50
          ? PALETTE.yellow
          : percent >= 25
            ? PALETTE.orange
            : PALETTE.red;
    return {
      ...band,
      percent,
      passes: Boolean(status?.passes),
      required: clampPercent(status?.required),
      section: status?.section || "none"
    };
  }

  function visualForSensor(sensor) {
    return visualForStatus(statusFor(sensor));
  }

  function labelForSection(section) {
    try {
      if (typeof global.sectionLabel === "function") return global.sectionLabel(section);
    } catch {}
    const normalized = String(section || "label").toLowerCase();
    return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
  }

  function sensorForId(id) {
    const key = String(id ?? "");
    const candidates = [];
    try {
      const map = typeof global.activeMachineMap === "function" ? global.activeMachineMap() : null;
      if (Array.isArray(map?.objects)) candidates.push(...map.objects);
    } catch {}
    if (Array.isArray(global.state?.aplMapObjects)) candidates.push(...global.state.aplMapObjects);
    try {
      if (typeof global.coldGlueMapObjects === "function") {
        const coldGlue = global.coldGlueMapObjects();
        if (Array.isArray(coldGlue)) candidates.push(...coldGlue);
      }
    } catch {}
    return candidates.find((item) => item?.kind === "sensor" && String(item.id) === key) || null;
  }

  function applyVisualToNode(node, sensor, status = statusFor(sensor)) {
    if (!node) return false;
    const visual = visualForStatus(status);
    node.setAttribute("fill", visual.color);
    node.setAttribute("fill-opacity", "0.92");
    node.setAttribute("stroke", visual.passes ? "#eafff3" : "#fff1e8");
    node.setAttribute("stroke-width", visual.passes ? "1.45" : "1.25");
    node.setAttribute("stroke-opacity", "0.94");
    node.setAttribute("data-sensor-visibility-level", visual.level);
    node.setAttribute("data-sensor-visibility-color", visual.color);
    node.setAttribute("data-sensor-visibility-percent", visual.percent === null ? "unknown" : visual.percent.toFixed(3));
    node.setAttribute("data-sensor-visibility-passes", String(visual.passes));
    node.style.filter = `drop-shadow(0 0 3px ${visual.color})`;
    node.style.transition = "fill 120ms linear, stroke 120ms linear, filter 120ms linear";

    const percentText = visual.percent === null ? "visibility unavailable" : `${visual.percent.toFixed(1)}% visible`;
    const requiredText = visual.required === null ? "" : ` • Required ${visual.required.toFixed(0)}% • ${visual.passes ? "PASS" : "BELOW REQUIREMENT"}`;
    node.setAttribute("aria-label", `${sensor?.name || "Label sensor"} • ${labelForSection(visual.section)} label • ${percentText}${requiredText}`);
    return true;
  }

  function refreshAllSensorMapColors() {
    if (!global.document?.querySelectorAll) return false;
    let refreshed = false;
    global.document.querySelectorAll("[data-label-sensor]").forEach((node) => {
      const sensor = sensorForId(node.getAttribute("data-label-sensor"));
      if (sensor) refreshed = applyVisualToNode(node, sensor) || refreshed;
      else {
        const visual = visualForStatus(null);
        node.setAttribute("fill", visual.color);
        node.setAttribute("fill-opacity", "0.82");
        node.setAttribute("stroke", "#dceeff");
        node.setAttribute("stroke-width", "1.1");
        node.style.filter = `drop-shadow(0 0 2px ${visual.color})`;
      }
    });
    return refreshed;
  }

  function wrapRenderer(name, flagName) {
    if (typeof global[name] !== "function") return false;
    const base = global[name];
    if (base.sensorVisibilityColorV1) return true;
    global[name] = function renderWithSensorVisibilityColor(...args) {
      const result = base.apply(this, args);
      refreshAllSensorMapColors();
      return result;
    };
    global[name].sensorVisibilityColorV1 = true;
    global[name].previousFunction = base;
    if (flagName === "map") wrappedMapRenderer = true;
    if (flagName === "simulation") wrappedSimulationRenderer = true;
    return true;
  }

  function wrapProgramGenerator() {
    if (typeof global.applyGeneratedServoProfile !== "function") return false;
    const base = global.applyGeneratedServoProfile;
    if (base.sensorVisibilityColorV1) return true;
    global.applyGeneratedServoProfile = function applyGeneratedServoProfileWithSensorMapColor(...args) {
      const result = base.apply(this, args);
      Promise.resolve(result).finally(() => global.setTimeout(refreshAllSensorMapColors, 0));
      return result;
    };
    global.applyGeneratedServoProfile.sensorVisibilityColorV1 = true;
    global.applyGeneratedServoProfile.previousFunction = base;
    wrappedProgramGenerator = true;
    return true;
  }

  function install() {
    if (!global.LabelerOrientationConstraintTargetService?.labelSensorMapStatus) return false;

    // The legacy map renderer asks this global helper only for presentation
    // color. Keep physical visibility math in the orientation service and map
    // the returned percentage to a UI status color here.
    global.labelSensorMapColor = function labelSensorMapVisibilityColor(sensor) {
      return visualForSensor(sensor).color;
    };
    global.labelSensorMapColor.sensorVisibilityColorV1 = true;

    wrapRenderer("renderMap", "map");
    wrapRenderer("renderSimulationMap", "simulation");
    wrapProgramGenerator();
    refreshAllSensorMapColors();
    return true;
  }

  function waitForRuntime() {
    if (install()) return;
    global.setTimeout(waitForRuntime, 50);
  }

  global.LabelerSensorMapVisibilityColor = Object.freeze({
    installed: true,
    VERSION,
    palette: PALETTE,
    clampPercent,
    statusFor,
    visualForStatus,
    visualForSensor,
    applyVisualToNode,
    refreshAllSensorMapColors,
    install,
    visibilityColorScaleV1: true
  });

  if (global.document?.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", waitForRuntime, { once: true });
  } else {
    waitForRuntime();
  }
})(typeof window !== "undefined" ? window : globalThis);
