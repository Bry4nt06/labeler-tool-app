"use strict";

(function installSensorDirectionLiveStatusIntegration(global) {
  if (global.LabelerSensorDirectionLiveStatus?.installed) return;

  const VERSION = 2;
  const RETRY_MS = 50;
  let wrappedProgramGenerator = false;
  let wrappedBuilderRenderer = false;

  function service() {
    return global.LabelerOrientationConstraintTargetService || null;
  }

  function activeMap() {
    try { return typeof global.activeMachineMap === "function" ? global.activeMachineMap() : null; }
    catch { return null; }
  }

  function fmt(value, digits = 1) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(digits).replace(/\.0$/, "") : "0";
  }

  function sectionLabel(section) {
    try {
      if (typeof global.sectionLabel === "function") return global.sectionLabel(section);
    } catch {}
    const normalized = String(section || "").toLowerCase();
    return normalized ? `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}` : "Label";
  }

  function statusFor(sensor) {
    const svc = service();
    if (!svc?.labelSensorMapStatus) return null;
    return svc.labelSensorMapStatus(sensor, global.state?.program);
  }

  function refreshStatusNode(row, sensor) {
    const status = statusFor(sensor);
    const node = row?.querySelector?.(".sensor-inline-status");
    if (!status || !node) return false;

    node.classList.toggle("sensor-status-pass", Boolean(status.passes));
    node.classList.toggle("sensor-status-fail", !status.passes);
    const strong = node.querySelector("strong");
    const detail = node.querySelector("span");
    if (strong) strong.textContent = `${fmt(status.percent, 1)}% visible`;
    if (detail) detail.textContent = `Required: ${fmt(status.required, 0)}% • ${sectionLabel(status.section)} label`;
    node.title = [
      `Sensor aim: ${fmt(status.sensorAimOffsetDeg, 1)}°`,
      `Physical aim: ${fmt(status.sensorPhysicalAimOffsetDeg, 1)}°`,
      `Bottle: ${fmt(status.plateAngle, 1)}°`,
      `Sensor-relative view: ${fmt(status.viewedPlateAngle, 1)}°`,
      `Label center: ${fmt(status.labelCenter, 1)}°`
    ].join(" • ");
    row.dataset.sensorVisiblePercent = String(status.percent);
    row.dataset.sensorPhysicalAimOffsetDeg = String(status.sensorPhysicalAimOffsetDeg);
    row.dataset.sensorStatusUpdatedAt = String(Date.now());
    return true;
  }

  function refreshAllStatusCards() {
    const map = activeMap();
    if (!map || !Array.isArray(map.objects)) return false;
    let refreshed = false;
    document.querySelectorAll(".wipe-builder-row[data-builder-object-id]").forEach((row) => {
      const sensor = map.objects.find((item) => item?.kind === "sensor" && String(item.id) === String(row.dataset.builderObjectId));
      if (sensor) refreshed = refreshStatusNode(row, sensor) || refreshed;
    });
    return refreshed;
  }

  function wrapProgramGenerator() {
    if (wrappedProgramGenerator || typeof global.applyGeneratedServoProfile !== "function") return wrappedProgramGenerator;
    const base = global.applyGeneratedServoProfile;
    global.applyGeneratedServoProfile = function applyGeneratedServoProfileWithSensorStatus(...args) {
      const result = base.apply(this, args);
      Promise.resolve(result).finally(() => global.setTimeout(refreshAllStatusCards, 0));
      return result;
    };
    global.applyGeneratedServoProfile.sensorDirectionLiveStatusV2 = true;
    global.applyGeneratedServoProfile.previousFunction = base;
    wrappedProgramGenerator = true;
    return true;
  }

  function wrapBuilderRenderer() {
    if (wrappedBuilderRenderer || typeof global.renderWipeDownBuilder !== "function") return wrappedBuilderRenderer;
    const base = global.renderWipeDownBuilder;
    global.renderWipeDownBuilder = function renderWipeDownBuilderWithDirectionAwareSensorStatus(...args) {
      const result = base.apply(this, args);
      refreshAllStatusCards();
      return result;
    };
    global.renderWipeDownBuilder.sensorDirectionLiveStatusV2 = true;
    global.renderWipeDownBuilder.previousFunction = base;
    wrappedBuilderRenderer = true;
    return true;
  }

  function install() {
    const svc = service();
    if (!svc?.labelSensorMapStatus) return false;
    global.labelSensorMapStatus = svc.labelSensorMapStatus;
    wrapProgramGenerator();
    wrapBuilderRenderer();
    refreshAllStatusCards();
    return wrappedProgramGenerator && wrappedBuilderRenderer;
  }

  function wait() {
    if (install()) return;
    global.setTimeout(wait, RETRY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait, { once: true });
  else wait();

  global.LabelerSensorDirectionLiveStatus = Object.freeze({
    installed: true,
    VERSION,
    statusFor,
    refreshStatusNode,
    refreshAllStatusCards
  });
})(typeof window !== "undefined" ? window : globalThis);
