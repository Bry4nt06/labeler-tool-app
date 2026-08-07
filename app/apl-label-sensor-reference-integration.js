"use strict";

(function installAplLabelSensorReferenceIntegration() {
  const RETRY_MS = 50;
  let installed = false;

  function number(value, fallback = NaN) {
    if (value === null || value === undefined || value === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function activeMap() {
    return typeof activeMachineMap === "function" ? activeMachineMap() : null;
  }

  function stationSections(machineMap) {
    try {
      return typeof inferAplStationSections === "function"
        ? inferAplStationSections(machineMap)
        : { ...(machineMap?.stationSections || {}) };
    } catch {
      return { ...(machineMap?.stationSections || {}) };
    }
  }

  function applicationTarget(section) {
    const program = Array.isArray(state?.program) ? state.program : [];
    const policyTarget = number(window.LabelerLabelCenterlinePolicy?.centerlineForSection?.(section, program), NaN);
    if (Number.isFinite(policyTarget)) return policyTarget;

    const motionTarget = number(state?.motionPlan?.[`${section}ApplicationTarget`], NaN);
    if (Number.isFinite(motionTarget)) return motionTarget;

    const sectionName = typeof sectionLabel === "function" ? sectionLabel(section) : section;
    const exactReference = program.find((row) =>
      String(row?.section || "").toLowerCase() === section
      && row?.applicationReference
      && Number.isFinite(number(row?.plateAngle, NaN))
    );
    if (exactReference) return number(exactReference.plateAngle, NaN);

    const actionPattern = new RegExp(`Hold(?:\\s+for)?\\s+${sectionName}\\s+Application`, "i");
    const actionReference = program.find((row) =>
      actionPattern.test(String(row?.action || ""))
      && Number.isFinite(number(row?.plateAngle, NaN))
    );
    if (actionReference) return number(actionReference.plateAngle, NaN);

    try {
      const seed = typeof generatedAplSeedProfile === "function" ? generatedAplSeedProfile() : [];
      const index = section === "neck" ? 1 : section === "body" ? 11 : 21;
      return number(seed?.[index]?.plateAngle, 0);
    } catch {
      return 0;
    }
  }

  function correctedSensorNotes() {
    const machineMap = activeMap();
    if (!machineMap || machineMap.applicationMode !== "apl") return [];

    const applications = typeof selectedLabelApplicationState === "function"
      ? selectedLabelApplicationState()
      : { neck: true, body: true, back: true };
    const sections = stationSections(machineMap);
    const notes = [];
    const service = window.LabelerOrientationConstraintTargetService;

    (machineMap.objects || [])
      .filter((item) => item?.kind === "sensor")
      .filter((item) => typeof isStationEnabled !== "function" || isStationEnabled(machineMap, Number(item.station)))
      .forEach((sensor) => {
        const station = Number(sensor.station);
        const section = sections[String(station)]
          || (typeof labelSectionForStation === "function" ? labelSectionForStation(station) : null);

        if (!section || section === "none" || !applications[section]) {
          notes.push(["bad", `${sensor.name || "Label Sensor"} at Station ${station} is assigned to a label that is not active.`, { objectId: sensor.id }]);
          return;
        }

        const status = service?.labelSensorMapStatus?.(sensor, state.program);
        if (status) {
          const visible = number(status.percent, 0) + 0.001 >= number(status.required, 50);
          notes.push([visible ? "ok" : "warn", visible
            ? `${sensor.name || "Label Sensor"} at Station ${station} can view ${fmt(status.percent, 1)}% of the ${sectionLabel(section).toLowerCase()} label (${fmt(status.required, 0)}% required). The calculation uses the label centerline established by its application event and the configured sensor aim.`
            : `${sensor.name || "Label Sensor"} at Station ${station} can view ${fmt(status.percent, 1)}% of the ${sectionLabel(section).toLowerCase()} label; at least ${fmt(status.required, 0)}% is required. The calculation uses the label centerline established by its application event and the configured sensor aim.${sensor.servoAssist ? " Servo assist is enabled; the planner should use the shortest valid correction before the sensor." : " Enable Orient bottle for sensor or adjust the sensor geometry."}`, {
              objectId: sensor.id,
              sensorAimOffsetDeg: status.sensorAimOffsetDeg,
              labelCenterlineDeg: status.labelCenter,
              bottleAtSensorDeg: status.plateAngle,
              visiblePercent: status.percent
            }]);
          return;
        }

        // Fallback for startup timing before the shared target service is ready.
        const placement = number(sensor.angle, sensor.start);
        const wipe = typeof sectionWipePlan === "function" ? sectionWipePlan(section) : null;
        const labelWidth = Math.min(360, Math.max(3, number(wipe?.labelDeg, 0)));
        const target = applicationTarget(section);
        const labelCenter = typeof labelSensorInspectionCenter === "function"
          ? labelSensorInspectionCenter(section, target, labelWidth)
          : target;
        const bottleAngle = typeof plateAngleAt === "function" ? plateAngleAt(placement, state.program) : target;
        const aim = Math.max(-90, Math.min(90, number(sensor.sensorAimOffsetDeg, 0)));
        const viewedAngle = bottleAngle - aim;
        const requiredVisibility = Math.min(100, Math.max(1, number(sensor.requiredVisibilityPercent, 50)));
        const visibility = typeof labelSensorVisibility === "function"
          ? labelSensorVisibility(labelCenter, viewedAngle, labelWidth, 180)
          : { percent: 0 };
        const visible = number(visibility.percent, 0) + 0.001 >= requiredVisibility;
        notes.push([visible ? "ok" : "warn", `${sensor.name || "Label Sensor"} at Station ${station} can view ${fmt(visibility.percent, 1)}% of the ${sectionLabel(section).toLowerCase()} label (${fmt(requiredVisibility, 0)}% required).`, { objectId: sensor.id }]);
      });

    return notes;
  }

  function centerlinePolicyNotes() {
    try {
      return window.LabelerLabelCenterlinePolicy?.validationNotes?.(state?.program) || [];
    } catch {
      return [];
    }
  }

  function install() {
    if (installed) return true;
    if (typeof state === "undefined" || typeof validate !== "function") return false;
    if (validate.aplLabelSensorReferenceIntegration) {
      installed = true;
      return true;
    }

    const baseValidate = validate;
    const wrapped = function validateWithActiveLabelSensorReference(...args) {
      const notes = baseValidate.apply(this, args);
      const sensorIds = new Set((activeMap()?.objects || [])
        .filter((item) => item?.kind === "sensor")
        .map((item) => String(item.id)));
      const withoutLegacySensorResults = (Array.isArray(notes) ? notes : []).filter((note) => {
        const objectId = note?.[2]?.objectId;
        return !objectId || !sensorIds.has(String(objectId));
      });
      return [...withoutLegacySensorResults, ...centerlinePolicyNotes(), ...correctedSensorNotes()];
    };
    wrapped.aplLabelSensorReferenceIntegration = true;
    validate = wrapped;
    window.validate = wrapped;
    installed = true;

    if (typeof renderValidation === "function") renderValidation();
    return true;
  }

  function wait() {
    if (install()) return;
    window.setTimeout(wait, RETRY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait, { once: true });
  else wait();
})();
