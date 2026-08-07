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

  function centerlinePolicy() {
    return global.LabelerLabelCenterlinePolicy || null;
  }

  function sensorAimOffset(item) {
    const driver = sensorStationDriver();
    if (driver?.sensorAimOffset) return driver.sensorAimOffset(item?.sensorAimOffsetDeg);
    return Math.max(-90, Math.min(90, num(item?.sensorAimOffsetDeg, 0)));
  }

  function machineDirectionSign() {
    return global.state?.direction === "cw" ? -1 : 1;
  }

  // Bottle plate angle and sensor aim are both machine-relative logical angles.
  // The map renderer mirrors both into screen/world coordinates for CW maps, so
  // the visibility solver must not mirror sensor aim a second time.
  function sensorPhysicalAimOffset(item) {
    return sensorAimOffset(item);
  }

  function sensorViewingAngle(item, plateAngle) {
    return num(plateAngle, 0) - sensorPhysicalAimOffset(item);
  }

  function bottleAngleForSensorView(item, viewedAngle) {
    return num(viewedAngle, 0) + sensorPhysicalAimOffset(item);
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
    // For an existing/imported program, the physical label centerline is the
    // bottle plate angle at that label's actual application event. Use that row
    // before any generated-plan fallback so sensors work for legacy programs,
    // custom programs, and future ServoForge programs with the same rule.
    const rowTarget = num(centerlinePolicy()?.centerlineForSection?.(section, rows), NaN);
    if (Number.isFinite(rowTarget)) return rowTarget;

    const motionTarget = num(global.state?.motionPlan?.[`${section}ApplicationTarget`], NaN);
    if (Number.isFinite(motionTarget)) return motionTarget;

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
      plannedTarget: motionTarget,
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
    const configuredAim = item?.kind === "sensor" ? sensorAimOffset(item) : 0;
    const physicalAim = item?.kind === "sensor" ? sensorPhysicalAimOffset(item) : 0;
    let sensorPlan = null;
    if (item.kind === "sensor") {
      const required = Math.min(100, Math.max(1, num(item.requiredVisibilityPercent, 50)));
      if (typeof global.nearestLabelSensorTarget === "function") {
        const viewedPlan = global.nearestLabelSensorTarget(
          sensorViewingAngle(item, currentPlate),
          center,
          shape.width,
          required,
          180
        );
        sensorPlan = {
          ...viewedPlan,
          viewedTarget: viewedPlan.target,
          target: bottleAngleForSensorView(item, num(viewedPlan.target, center)),
          sensorAimOffsetDeg: configuredAim,
          sensorPhysicalAimOffsetDeg: physicalAim
        };
      } else {
        sensorPlan = {
          target: bottleAngleForSensorView(item, center),
          viewedTarget: center,
          visibility: { percent: 100 },
          sensorAimOffsetDeg: configuredAim,
          sensorPhysicalAimOffsetDeg: physicalAim
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
      target: item.kind === "sensor" ? sensorPlan?.target ?? bottleAngleForSensorView(item, center) : currentPlate,
      mode: item.kind === "coding" ? "code-box" : "label-center",
      required: item.kind === "sensor" ? num(item.requiredVisibilityPercent, 50) : 100,
      visibility: item.kind === "sensor" ? num(sensorPlan?.visibility?.percent, 100) : 100,
      center,
      width: shape.width
    };
    return {
      ...target,
      center: num(target.center, center),
      width: num(target.width, shape.width),
      sensorAimOffsetDeg: configuredAim,
      sensorPhysicalAimOffsetDeg: physicalAim,
      viewedCurrent: item.kind === "sensor" ? sensorViewingAngle(item, currentPlate) : undefined,
      viewedTarget: sensorPlan?.viewedTarget,
      required: item.kind === "sensor"
        ? Math.min(100, Math.max(1, num(target.required, item.requiredVisibilityPercent || 50)))
        : 100
    };
  }

  function visibilityAt(object, plateAngle) {
    if (object?.item?.kind !== "sensor") return 100;
    if (typeof global.labelSensorVisibility !== "function") return num(object?.target?.visibility, 0);
    const effectiveViewAngle = sensorViewingAngle(object.item, plateAngle);
    return num(global.labelSensorVisibility(
      object.target.center,
      effectiveViewAngle,
      object.target.width,
      180
    )?.percent, 0);
  }

  function labelSensorMapStatus(item, rows = global.state?.program) {
    const sourceRows = Array.isArray(rows) ? rows : [];
    const map = activeMap();
    const station = Number(item?.station);
    const sections = stationSections(map);
    const section = sections[String(station)]
      || (typeof global.labelSectionForStation === "function" ? global.labelSectionForStation(station) : null);
    const required = Math.min(100, Math.max(1, num(item?.requiredVisibilityPercent, 50)));
    if (!item || item.kind !== "sensor" || !section || section === "none" || !applications()[section]) {
      return { percent: 0, required, passes: false, section: section || "none" };
    }

    const placement = num(item.angle, item.start);
    const currentPlate = plateAt(placement, sourceRows);
    const window = windowFor(item, sourceRows);
    const target = targetFor(item, section, sourceRows, currentPlate, placement);
    const object = { item, section, window, target };
    const percent = visibilityAt(object, currentPlate);
    const resolvedRequired = Math.min(100, Math.max(1, num(target.required, required)));
    return {
      percent,
      required: resolvedRequired,
      passes: percent + EPS >= resolvedRequired,
      section,
      placement,
      plateAngle: currentPlate,
      viewedPlateAngle: sensorViewingAngle(item, currentPlate),
      targetPlateAngle: num(target.target, currentPlate),
      sensorAimOffsetDeg: sensorAimOffset(item),
      sensorPhysicalAimOffsetDeg: sensorPhysicalAimOffset(item),
      labelCenter: num(target.center, 0),
      labelWidthDeg: num(target.width, 0)
    };
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

  const api = Object.freeze({
    EPS,
    num,
    done,
    orientationDriver,
    sensorStationDriver,
    centerlinePolicy,
    sensorAimOffset,
    machineDirectionSign,
    sensorPhysicalAimOffset,
    sensorViewingAngle,
    bottleAngleForSensorView,
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
    labelSensorMapStatus,
    enabled
  });

  global.LabelerOrientationConstraintTargetService = api;
  global.labelSensorMapStatus = labelSensorMapStatus;
})(typeof window !== "undefined" ? window : globalThis);
