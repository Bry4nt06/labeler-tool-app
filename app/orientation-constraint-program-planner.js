"use strict";

(function installOrientationConstraintProgramPlanner(global) {
  if (global.LabelerOrientationConstraintProgramPlanner) return;

  const GAP = 0.5;
  const EPS = 0.001;
  const targetService = () => global.LabelerOrientationConstraintTargetService;
  const constraintDriver = () => global.LabelerDriverRegistry?.resolve("profile.orientationConstraintPlanner")
    || global.LabelerOrientationConstraintPlannerDriver
    || null;
  const orientationDriver = () => global.LabelerDriverRegistry?.resolve("profile.mapObjectOrientation")
    || global.LabelerMapObjectOrientationDriver
    || null;
  const rowBuilder = () => global.LabelerDriverRegistry?.resolve("profile.mapObjectRowBuilder")
    || global.LabelerMapObjectRowBuilderDriver
    || null;
  const issueFactory = () => global.LabelerDriverRegistry?.resolve("profile.orientationIssueFactory")
    || global.LabelerOrientationIssueFactoryDriver
    || null;

  function stripGeneratedRows(rows) {
    return rows.filter((row) => {
      if (row?.terminalRest) return true;
      if (row?.mapObjectOrientation
        || row?.orientationHold
        || row?.mapObjectOrientationContinuation
        || row?.orientationConstraintContinuation
        || row?.coderAfterWipeHandoff
        || row?.coderAfterWipeContinuation
        || row?.codingHold
        || row?.codingMotion
        || row?.codingRelease
        || row?.sensorRelease
        || row?.orientationRelease
        || row?.sensorId
        || row?.codingObjectId
        || row?.orientationConstraintMerged) return false;
      return !/(?:orient|hold|continue).*?(?:sensor|coder|coding|code box|label inspection)|return.*(?:bottle|plate|orientation)|release.*(?:coder|sensor|inspection)/i
        .test(String(row?.action || ""));
    });
  }

  function activePhysicalMotion(tableAngle, rows) {
    const svc = targetService();
    const sorted = [...rows].sort((a, b) => svc.num(a?.tableAngle, 0) - svc.num(b?.tableAngle, 0));
    let index = -1;
    sorted.forEach((row, candidate) => {
      if (svc.num(row?.tableAngle, -Infinity) <= tableAngle + EPS) index = candidate;
    });
    const current = sorted[index];
    const next = sorted[index + 1];
    if (!current || Number(current.cmd) !== 7 || !next) return null;
    if (svc.num(next.tableAngle, tableAngle) <= tableAngle + EPS) return null;
    return orientationDriver()?.isPhysicalContactTransition(current) ? current : null;
  }

  function motionSatisfies(object, rows) {
    const svc = targetService();
    const start = svc.num(object?.window?.start, 0);
    const end = Math.max(start, svc.num(object?.window?.end, start));
    const samples = end - start <= EPS
      ? [start]
      : [start, start + (end - start) / 2, Math.max(start, end - EPS)];
    return samples.every((tableAngle) => constraintDriver()?.objectSatisfied(
      object,
      svc.plateAt(tableAngle, rows),
      svc.visibilityAt
    ));
  }

  function issue({ level = "bad", code, item, section, message, extras = {} }) {
    return issueFactory()?.issue?.({ level, code, item, section, message, extras })
      || { level, code, objectId: item?.id, station: item?.station, section, message, ...extras };
  }

  function groupLabel(objects) {
    return objects
      .map((object) => object.item.name || (object.item.kind === "coding" ? "Coder" : "Label Sensor"))
      .join(" + ");
  }

  function groupSectionLabel(objects) {
    const svc = targetService();
    const sections = [...new Set(objects.map((object) => object.section))];
    return sections.length === 1 ? svc.sectionName(sections[0]) : "Shared Label";
  }

  function metadata(objects) {
    const sections = [...new Set(objects.map((object) => object.section))];
    const sources = [...new Set(objects.map((object) => object.sectionResolution.source))];
    const sensorIds = objects.filter((object) => object.item.kind === "sensor").map((object) => object.item.id);
    const codingObjectIds = objects.filter((object) => object.item.kind === "coding").map((object) => object.item.id);
    return {
      section: sections.length === 1 ? sections[0] : "shared",
      orientationSections: sections,
      station: objects[0]?.item?.station,
      mapDriven: true,
      mapObjectOrientation: true,
      orientationConstraintPlanner: true,
      orientationConstraintMerged: objects.length > 1,
      orientationObjectId: objects[0]?.item?.id,
      orientationObjectIds: objects.map((object) => object.item.id),
      sensorId: sensorIds[0],
      sensorIds,
      codingObjectId: codingObjectIds[0],
      codingObjectIds,
      autoTargetSource: sources.length === 1 ? sources[0] : "mixed"
    };
  }

  function addPlan(plans, object, target, group, extras = {}) {
    const svc = targetService();
    plans.push({
      objectId: object.item.id,
      kind: object.item.kind,
      name: object.item.name || (object.item.kind === "coding" ? "Coder" : "Label Sensor"),
      station: object.item.station,
      section: object.section,
      targetMode: object.target.mode,
      targetPlateAngle: svc.done(target),
      windowStart: svc.done(object.window.start),
      windowStop: svc.done(object.window.end),
      requiredVisibilityPercent: object.target.required,
      plannedVisibilityPercent: object.item.kind === "sensor" ? svc.done(svc.visibilityAt(object, target)) : 100,
      autoTargetSource: object.sectionResolution.source,
      mergedConstraintGroup: group.objects.length > 1,
      mergedObjectIds: group.objects.map((entry) => entry.item.id),
      orientationDriver: "profile.mapObjectOrientation",
      orientationConstraintPlannerDriver: "profile.orientationConstraintPlanner",
      rowBuilderDriver: "profile.mapObjectRowBuilder",
      ...extras
    });
  }

  function occupiedRows(rows, start, end) {
    const svc = targetService();
    return rows.filter((row) => {
      const table = svc.num(row?.tableAngle, NaN);
      return Number.isFinite(table) && table > start + EPS && table < end - EPS;
    });
  }

  function continueAfterGroup(rows, group, target, rowMetadata, issues) {
    const svc = targetService();
    const builder = rowBuilder();
    const nextIndex = rows.findIndex((row) => svc.num(row?.tableAngle, Infinity) > group.window.end + EPS);
    if (nextIndex < 0) return;
    const next = rows[nextIndex];
    const expected = svc.num(next?.plateAngle, target);
    if (constraintDriver()?.sameCommandAngle(expected, target)) return;

    if (Number(next.cmd) === 7) {
      const destination = rows[nextIndex + 1];
      rows[nextIndex] = builder.retargetContinuation(next, {
        plateAngle: target,
        rotation: destination ? svc.num(destination.plateAngle, target) - target : 0,
        ratio: destination
          ? Math.abs(svc.num(destination.plateAngle, target) - target)
            / Math.max(EPS, svc.num(destination.tableAngle, next.tableAngle) - svc.num(next.tableAngle, 0))
          : 0,
        formatter: svc.done,
        marker: "orientationConstraintContinuation",
        extras: { orientationConstraintPlanner: true }
      });
      return;
    }

    const start = group.window.end + GAP;
    const stop = svc.num(next.tableAngle, start);
    if (start >= stop - EPS) {
      issues.push(issue({
        code: "orientation-constraint-exit-window",
        item: group.objects[0].item,
        section: group.objects[0].section,
        message: `${groupLabel(group.objects)} has no open table travel after its shared orientation window.`
      }));
      return;
    }
    rows.splice(nextIndex, 0, builder.continuation({
      tableAngle: start,
      plateAngle: target,
      action: `Continue After ${groupLabel(group.objects)}`,
      metadata: rowMetadata,
      rotation: expected - target,
      ratio: Math.abs(expected - target) / Math.max(EPS, stop - start),
      formatter: svc.done,
      marker: "orientationConstraintContinuation",
      extras: { orientationConstraintPlanner: true }
    }));
  }

  function planGroup(rows, group, issues, plans) {
    const svc = targetService();
    const driver = constraintDriver();
    const builder = rowBuilder();
    const start = svc.num(group.window.start, 0);
    const end = svc.num(group.window.end, start);
    const existingAngles = group.objects.map((object) => svc.plateAt(object.window.start, rows));

    if (group.objects.every((object) => motionSatisfies(object, rows))) {
      group.objects.forEach((object, index) => addPlan(plans, object, existingAngles[index], group, {
        satisfiedByExistingMotion: true,
        sharedTargetReason: "existing-motion-satisfies-object"
      }));
      return;
    }

    const physicalObject = group.objects.find((object) => activePhysicalMotion(object.window.start, rows));
    if (physicalObject) {
      const motion = activePhysicalMotion(physicalObject.window.start, rows);
      group.objects.forEach((object, index) => {
        if (motionSatisfies(object, rows)) {
          addPlan(plans, object, existingAngles[index], group, {
            satisfiedByExistingMotion: true,
            sharedTargetReason: "physical-motion-satisfies-object"
          });
        } else {
          issues.push(issue({
            code: "orientation-constraint-physical-overlap",
            item: object.item,
            section: object.section,
            message: `${object.item.name || "Map object"} is inside "${motion?.action || "the active wipe"}" and that motion does not satisfy its target.`
          }));
        }
      });
      return;
    }

    const currentPlate = svc.plateAt(start, rows);
    const shared = driver.chooseSharedTarget({
      objects: group.objects,
      currentPlate,
      visibilityAt: svc.visibilityAt
    });
    if (!shared.compatible) {
      const actualOverlap = group.objects.some((left, index) =>
        group.objects.slice(index + 1).some((right) => driver.windowsOverlap(left.window, right.window, 0)));
      if (!actualOverlap && group.objects.length > 1) {
        group.objects.forEach((object) => planGroup(rows, { objects: [object], window: { ...object.window } }, issues, plans));
        return;
      }
      group.objects.forEach((object) => issues.push(issue({
        code: "orientation-constraint-conflict",
        item: object.item,
        section: object.section,
        message: `${groupLabel(group.objects)} overlap but require incompatible bottle orientations (${shared.reason}).`,
        extras: { mergedObjectIds: group.objects.map((entry) => entry.item.id), conflictReason: shared.reason }
      })));
      return;
    }

    const exactStart = rows.find((row) => Math.abs(svc.num(row?.tableAngle, Infinity) - start) <= EPS);
    if (exactStart && Number(exactStart.cmd) !== 3) {
      group.objects.forEach((object) => issues.push(issue({
        code: "orientation-constraint-window-start-occupied",
        item: object.item,
        section: object.section,
        message: `${groupLabel(group.objects)} begins on active command "${exactStart.action || `HMI ${exactStart.hmi || "?"}`}".`
      })));
      return;
    }
    const occupied = occupiedRows(rows, start, end).filter((row) => !row?.terminalRest);
    if (occupied.length) {
      group.objects.forEach((object) => issues.push(issue({
        code: "orientation-constraint-window-occupied",
        item: object.item,
        section: object.section,
        message: `${groupLabel(group.objects)} cannot hold a shared target because "${occupied[0].action || `HMI ${occupied[0].hmi || "?"}`}" starts inside the window.`
      })));
      return;
    }

    let previousIndex = -1;
    rows.forEach((row, index) => {
      if (svc.num(row?.tableAngle, -Infinity) < start - EPS) previousIndex = index;
    });
    const previous = rows[previousIndex];
    if (!previous) {
      group.objects.forEach((object) => issues.push(issue({
        code: "orientation-constraint-no-reference",
        item: object.item,
        section: object.section,
        message: `${object.item.name || "Map object"} has no prior servo reference.`
      })));
      return;
    }

    const reusable = Number(previous.cmd) === 7 && !orientationDriver()?.isPhysicalContactTransition(previous);
    const turnStart = reusable ? svc.num(previous.tableAngle, 0) : svc.num(previous.tableAngle, 0) + GAP;
    const target = svc.num(shared.target, currentPlate);
    const startingPlate = svc.num(previous.plateAngle, currentPlate);
    const rotation = target - startingPlate;
    const span = start - turnStart;
    const ratio = Math.abs(rotation) / Math.max(EPS, span);
    const maxRatio = Math.max(0.1, svc.num(global.state?.maxMoveRatio, 21));
    if (turnStart >= start - EPS || (Math.abs(rotation) > EPS && ratio >= maxRatio)) {
      group.objects.forEach((object) => issues.push(issue({
        code: "orientation-constraint-capacity",
        item: object.item,
        section: object.section,
        message: `${groupLabel(group.objects)} needs ${Math.abs(rotation).toFixed(1)}° bottle rotation in ${Math.max(0, span).toFixed(1)}° table travel (${ratio.toFixed(2)}:1; limit ${maxRatio.toFixed(1)}:1).`
      })));
      return;
    }

    const rowMetadata = metadata(group.objects);
    const label = groupLabel(group.objects);
    const hold = builder.hold({
      tableAngle: start,
      plateAngle: target,
      action: `Hold ${groupSectionLabel(group.objects)} Orientation Through ${label}`,
      metadata: rowMetadata,
      window: group.window,
      formatter: svc.done,
      extras: {
        orientationConstraintPlanner: true,
        orientationConstraintReason: shared.reason,
        requiredLabelVisibilityPercent: Math.max(...group.objects.map((object) => svc.num(object.target.required, 0))),
        plannedLabelVisibilityPercent: Math.min(...group.objects
          .filter((object) => object.item.kind === "sensor")
          .map((object) => svc.visibilityAt(object, target))
          .concat([100]))
      }
    });
    const exactStartIndex = rows.findIndex((row) => Math.abs(svc.num(row?.tableAngle, Infinity) - start) <= EPS);

    if (reusable) {
      rows[previousIndex] = builder.retargetTurn(previous, {
        plateAngle: startingPlate,
        action: `Orient ${groupSectionLabel(group.objects)} for ${label}`,
        metadata: rowMetadata,
        rotation,
        ratio,
        formatter: svc.done,
        extras: {
          orientationConstraintPlanner: true,
          orientationConstraintMerged: group.objects.length > 1,
          interruptedAction: String(previous.action || "Servo transition")
        }
      });
      if (exactStartIndex >= 0 && Number(rows[exactStartIndex].cmd) === 3) {
        rows[exactStartIndex] = { ...rows[exactStartIndex], ...hold };
      } else rows.splice(previousIndex + 1, 0, hold);
    } else if (Math.abs(rotation) > EPS) {
      const turn = builder.turn({
        tableAngle: turnStart,
        plateAngle: startingPlate,
        action: `Orient ${groupSectionLabel(group.objects)} for ${label}`,
        metadata: rowMetadata,
        rotation,
        ratio,
        formatter: svc.done,
        extras: { orientationConstraintPlanner: true, orientationConstraintMerged: group.objects.length > 1 }
      });
      if (exactStartIndex >= 0 && Number(rows[exactStartIndex].cmd) === 3) {
        rows.splice(previousIndex + 1, 0, turn);
        const adjusted = rows.findIndex((row) => Math.abs(svc.num(row?.tableAngle, Infinity) - start) <= EPS && Number(row.cmd) === 3);
        rows[adjusted] = { ...rows[adjusted], ...hold };
      } else rows.splice(previousIndex + 1, 0, turn, hold);
    } else if (exactStartIndex >= 0 && Number(rows[exactStartIndex].cmd) === 3) {
      rows[exactStartIndex] = { ...rows[exactStartIndex], ...hold };
    } else rows.splice(previousIndex + 1, 0, hold);

    rows.sort((a, b) => svc.num(a?.tableAngle, 0) - svc.num(b?.tableAngle, 0));
    continueAfterGroup(rows, group, target, rowMetadata, issues);
    group.objects.forEach((object) => addPlan(plans, object, target, group, {
      sharedTargetReason: shared.reason,
      rotation: svc.done(rotation),
      ratio: svc.done(ratio),
      reusedActiveTransition: reusable
    }));
  }

  function process(sourceRows) {
    const svc = targetService();
    const map = svc?.activeMap();
    const driver = constraintDriver();
    if (!svc || !map || map.applicationMode !== "apl" || !driver || !Array.isArray(sourceRows) || !sourceRows.length) return sourceRows;

    const source = sourceRows.map((row) => ({ ...row }));
    let rows = stripGeneratedRows(source).sort((a, b) => svc.num(a?.tableAngle, 0) - svc.num(b?.tableAngle, 0));
    const active = svc.applications();
    const sections = svc.stationSections(map);
    const issues = [];
    const plans = [];
    const objects = (map.objects || [])
      .filter((item) => ["sensor", "coding"].includes(item?.kind) && svc.enabled(item))
      .map((item) => {
        const window = svc.windowFor(item, source);
        const sectionResolution = driver.resolveSection({
          item,
          rows: source,
          before: window.start,
          activeApplications: active,
          stationSections: sections,
          fallbackStationSection: (station) => typeof global.labelSectionForStation === "function"
            ? global.labelSectionForStation(station)
            : ""
        });
        const currentPlate = svc.plateAt(window.start, rows);
        return {
          item,
          window,
          section: sectionResolution.section,
          sectionResolution,
          target: sectionResolution.section === "none"
            ? null
            : svc.targetFor(item, sectionResolution.section, source, currentPlate, window.start)
        };
      })
      .filter((object) => object.section !== "none" && object.target)
      .sort((a, b) => a.window.start - b.window.start);

    driver.groupObjects(objects, 0.5).forEach((group) => {
      rows.sort((a, b) => svc.num(a?.tableAngle, 0) - svc.num(b?.tableAngle, 0));
      planGroup(rows, group, issues, plans);
    });

    const finalized = global.LabelerServoCommandDriver?.finalize
      ? global.LabelerServoCommandDriver.finalize(rows)
      : rows;
    const output = finalized.map((row, index) => ({ ...row, hmi: index + 1, plc: index }));
    if (global.state?.motionPlan && typeof global.state.motionPlan === "object") {
      const retained = (Array.isArray(global.state.motionPlan.issues) ? global.state.motionPlan.issues : [])
        .filter((entry) => {
          const code = String(entry?.code || "");
          return !/^map-object-/.test(code)
            && !/^label-sensor-/.test(code)
            && !/^coder-/.test(code)
            && !/^orientation-constraint-/.test(code);
        });
      Object.assign(global.state.motionPlan, {
        rows: output,
        issues: [...retained, ...issues],
        mapObjectOrientationPlans: plans,
        orientationConstraintPlans: plans,
        mapObjectOrientationDriven: true,
        orientationConstraintPlanner: true,
        mapObjectOrientationDriver: "profile.mapObjectOrientation",
        orientationConstraintPlannerDriver: "profile.orientationConstraintPlanner",
        mapObjectRowBuilderDriver: "profile.mapObjectRowBuilder",
        finalPlateAngle: output.at(-1)?.plateAngle
      });
    }
    return output;
  }

  global.LabelerOrientationConstraintProgramPlanner = Object.freeze({
    GAP,
    EPS,
    stripGeneratedRows,
    activePhysicalMotion,
    motionSatisfies,
    process
  });
})(typeof window !== "undefined" ? window : globalThis);
