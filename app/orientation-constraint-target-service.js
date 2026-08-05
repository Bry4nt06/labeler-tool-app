"use strict";

(function installOrientationConstraintTargetService(global) {
  if (global.LabelerOrientationConstraintTargetService) return;

  const EPS = 0.001;
  const num = (value, fallback = NaN) => {
    if (value === null || value === undefined || value === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const done = (value) => typeof global.finishAngle === "function"
    ? global.finishAngle(value)
    : Math.round(num(value, 0) * 10) / 10;

  function orientationDriver() {
    return global.LabelerDriverRegistry?.resolve("profile.mapObjectOrientation")
      || global.LabelerMapObjectOrientationDriver
      || null;
  }

  function sensorStationDriver() {
    return global.LabelerDriverRegistry?.resolve("profile.sensorStationLabel")
      || global.LabelerSensorStationLabelDriver
      || null;
  }

  function sensorAimOffset(item) {
    const driver = sensorStationDriver();
    if (driver?.sensorAimOffset) return driver.sensorAimOffset(item?.sensorAimOffsetDeg);
    return Math.max(-90, Math.min(90, num(item?.sensorAimOffsetDeg, 0)));
  }

  function activeMap() {
    try { return typeof global.activeMachineMap === "function" ? global.activeMachineMap() : null; }
    catch { return null; }
  }

  function applications() {
    try { return global.selectedLabelApplicationState(); }
    catch { return { neck: true, body: true, back: true }; }
  }

  function stationSections(map) {
    try {
      return typeof global.inferAplStationSections === "function"
        ? global.inferAplStationSections(map)
        : { ...(map?.stationSections || {}) };
    } catch {
      return { ...(map?.stationSections || {}) };
    }
  }

  function sectionName(section) {
    return typeof global.sectionLabel === "function"
      ? global.sectionLabel(section)
      : String(section || "Label");
  }

  function windowFor(item, rows) {
    return orientationDriver()?.objectWindow({ item, rows }) || {
      start: num(item?.angle, item?.start),
      end: item?.kind === "sensor"
        ? num(item?.angle, item?.start) + 3
        : Math.max(num(item?.start, 0) + 0.5, num(item?.end, num(item?.start, 0) + 5))
    };
  }

  function applicationTarget(section, rows, before) {
    let seedTarget = 0;
    try {
      const seed = global.generatedAplSeedProfile();
      seedTarget = num(seed[section === "neck" ? 1 : section === "body" ? 11 : 21]?.plateAngle, 0);
    } catch {
      seedTarget = 0;
    }
    return orientationDriver()?.applicationTarget({
      section,
      rows,
      before,
      plannedTarget: global.state?.motionPlan?.[`${section}ApplicationTarget`],
      seedTarget
    }) ?? seedTarget;
  }

  function geometry(section) {
    const wipe = typeof global.sectionWipePlan === "function" ? global.sectionWipePlan(section) : null;
    const width = Math.min(360, Math.max(0.1, num(wipe?.labelDeg, 0.1)));
    const label = typeof global.selectedLabelSpec === "function" ? global.selectedLabelSpec() : null;
    const bottle = typeof global.selectedBottleSpec === "function" ? global.selectedBottleSpec() : null;
    const circumference = section === "neck"
      ? num(label?.neckBottomCircumferenceMm, NaN)
      : num(typeof global.bodyCircumference === "function" ? global.bodyCircumference(bottle) : NaN, NaN);
    const code = typeof global.degFromMm === "function"
      ? num(global.degFromMm(label?.codeBoxCenterMm, circumference), NaN)
      : NaN;
    const inspection = typeof global.degFromMm === "function"
      ? num(global.degFromMm(global.state?.buildInputs?.backInspectionOffsetMm, circumference), 0)
      : 0;
    return { width, code, inspection };
  }

  function plateAt(tableAngle, rows) {
    if (typeof global.plateAngleAt === "function") {
      const value = num(global.plateAngleAt(tableAngle, rows), NaN);
      if (Number.isFinite(value)) return value;
    }
    const sorted = [...(Array.isArray(rows) ? rows : [])]
      .sort((left, right) => num(left?.tableAngle, 0) - num(right?.tableAngle, 0));
    let index = -1;
    sorted.forEach((row, candidate) => {
      if (num(row?.tableAngle, -Infinity) <= tableAngle + EPS) index = candidate;
    });
    if (index < 0) return num(sorted[0]?.plateAngle, 0);
    const current = sorted[index];
    const next = sorted[index + 1];
    if (Number(current?.cmd) !== 7 || !next) return num(current?.plateAngle, 0);
    const start = num(current.tableAngle, tableAngle);
    const stop = num(next.tableAngle, start);
    if (stop <= start + EPS) return num(current.plateAngle, 0);
    const progress = Math.min(1, Math.max(0, (tableAngle - start) / (stop - start)));
    return num(current.plateAngle, 0)
      + (num(next.plateAngle, num(current.plateAngle, 0)) - num(current.plateAngle, 0)) * progress;
  }

  function targetFor(item, section, rows, currentPlate, tableAngle) {
    const shape = geometry(section);
    const application = applicationTarget(section, rows, tableAngle);
    const center = typeof global.labelSensorInspectionCenter === "function"
      ? global.labelSensorInspectionCenter(section, application, shape.width)
      : application;
    const aim = item?.kind === "sensor" ? sensorAimOffset(item) : 0;
    let sensorPlan = null;
    if (item.kind === "sensor") {
      const required = Math.min(100, Math.max(1, num(item.requiredVisibilityPercent, 50)));
      if (typeof global.nearestLabelSensorTarget === "function") {
        // Solve in the sensor's viewing coordinate, then convert back to the
        // physical bottle-plate target. Aimed hardware can therefore satisfy
        // the same view with less bottle rotation.
        const viewedPlan = global.nearestLabelSensorTarget(
          num(currentPlate, 0) + aim,
          center,
          shape.width,
          required,
          180
        );
        sensorPlan = {
          ...viewedPlan,
          viewedTarget: viewedPlan.target,
          target: num(viewedPlan.target, center) - aim,
          sensorAimOffsetDeg: aim
        };
      } else {
        sensorPlan = {
          target: center - aim,
          viewedTarget: center,
          visibility: { percent: 100 },
          sensorAimOffsetDeg: aim
        };
      }
    }
    const target = orientationDriver()?.orientationTarget({
      item,
      section,
      currentPlate,
      applicationTarget: application,
      labelWidthDeg: shape.width,
      labelCenter: center,
      sensorTarget: sensorPlan?.target,
      sensorVisibilityPercent: sensorPlan?.visibility?.percent,
      coderCenterlineTarget: global.state?.motionPlan?.coderCenterlineTarget,
      codeBoxOffsetDeg: shape.code,
      inspectionOffsetDeg: shape.inspection
    }) || {
      target: item.kind === "sensor" ? center - aim : currentPlate,
      mode: item.kind === "coding" ? "code-box" : "label-center",
      required: item.kind === "sensor" ? num(item.requiredVisibilityPercent, 50) : 100,
      visibility: 100,
      center,
      width: shape.width
    };
    return {
      ...target,
      center: num(target.center, center),
      width: num(target.width, shape.width),
      sensorAimOffsetDeg: aim,
      viewedTarget: sensorPlan?.viewedTarget,
      required: item.kind === "sensor"
        ? Math.min(100, Math.max(1, num(target.required, item.requiredVisibilityPercent || 50)))
        : 100
    };
  }

  function visibilityAt(object, plateAngle) {
    if (object?.item?.kind !== "sensor") return 100;
    if (typeof global.labelSensorVisibility !== "function") return num(object?.target?.visibility, 0);
    const effectiveViewAngle = num(plateAngle, 0) + sensorAimOffset(object.item);
    return num(global.labelSensorVisibility(
      object.target.center,
      effectiveViewAngle,
      object.target.width,
      180
    )?.percent, 0);
  }

  function enabled(item) {
    if (item?.kind === "sensor") {
      return item.enabled !== false && Boolean(item.orientBottle ?? item.servoAssist);
    }
    if (item?.kind === "coding") {
      return String(item.orientationLabelSection || "auto").toLowerCase() !== "none"
        && item.disableServoOrientation !== true;
    }
    return false;
  }

  global.LabelerOrientationConstraintTargetService = Object.freeze({
    EPS,
    num,
    done,
    orientationDriver,
    sensorStationDriver,
    sensorAimOffset,
    activeMap,
    applications,
    stationSections,
    sectionName,
    windowFor,
    applicationTarget,
    geometry,
    plateAt,
    targetFor,
    visibilityAt,
    enabled
  });
})(typeof window !== "undefined" ? window : globalThis);
