"use strict";

(function installBottleVisualRenderer(global) {
  const INDICATORS = Object.freeze({
    neck: Object.freeze({ center: 0, innerRadius: 5.8, outerRadius: 7.1, color: "#f0c84b" }),
    body: Object.freeze({ center: 0, innerRadius: 4.2, outerRadius: 5.5, color: "#42c987" }),
    back: Object.freeze({ center: 180, innerRadius: 5.2, outerRadius: 7.1, color: "#a984e8" })
  });

  function bottleLocalArcPath(startAngle, endAngle, innerRadius, outerRadius) {
    const point = (angle, radius) => {
      const radians = angle * Math.PI / 180;
      return { x: Math.cos(radians) * radius, y: Math.sin(radians) * radius };
    };
    const startOuter = point(startAngle, outerRadius);
    const endOuter = point(endAngle, outerRadius);
    const startInner = point(startAngle, innerRadius);
    const endInner = point(endAngle, innerRadius);
    const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
    return [
      `M ${startOuter.x} ${startOuter.y}`,
      `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
      `L ${endInner.x} ${endInner.y}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${startInner.x} ${startInner.y}`,
      "Z"
    ].join(" ");
  }

  function bottleLabelApplications() {
    const available = typeof selectedLabelApplicationState === "function"
      ? selectedLabelApplicationState()
      : { neck: true, body: true, back: true };
    const applications = [];
    const seen = new Set();
    activeAggregateDefinitions()
      .sort((left, right) => norm(left.angle) - norm(right.angle))
      .forEach((aggregate) => {
        const section = labelSectionForStation(aggregate.number);
        if (!INDICATORS[section] || !available[section] || seen.has(section)) return;
        seen.add(section);
        applications.push({ section, station: aggregate.number, angle: norm(aggregate.angle) });
      });
    return applications;
  }

  function bottleHasPassedApplication(tableAngle, applicationAngle) {
    return norm(tableAngle) + 0.001 >= norm(applicationAngle);
  }

  function bottlePreviewAngle(head, program = currentProgram()) {
    if (head?.head === 1 && state.previewBottleAngle !== null && state.previewBottleAngle !== "" && Number.isFinite(Number(state.previewBottleAngle))) {
      return Number(state.previewBottleAngle);
    }
    return plateAngleAt(head?.tableAngle, program);
  }

  function drawBottleLabelIndicators(add, bottleGroup, tableAngle) {
    bottleLabelApplications().forEach((application) => {
      const visual = INDICATORS[application.section];
      const start = visual.center - 45;
      const end = visual.center + 45;
      add("path", {
        d: bottleLocalArcPath(start, end, visual.innerRadius, visual.outerRadius),
        fill: visual.color,
        stroke: visual.color,
        "stroke-width": 0.4,
        "data-bottle-label-indicator": application.section,
        "data-application-angle": application.angle,
        "data-application-station": application.station,
        display: bottleHasPassedApplication(tableAngle, application.angle) ? "inline" : "none"
      }, bottleGroup);
    });
  }

  global.bottleLocalArcPath = bottleLocalArcPath;
  global.bottleLabelApplications = bottleLabelApplications;
  global.bottleHasPassedApplication = bottleHasPassedApplication;
  global.bottlePreviewAngle = bottlePreviewAngle;
  global.drawBottleLabelIndicators = drawBottleLabelIndicators;
  global.LabelerBottleVisualRenderer = Object.freeze({
    indicators: INDICATORS,
    bottleLocalArcPath,
    bottleLabelApplications,
    bottleHasPassedApplication,
    bottlePreviewAngle,
    drawBottleLabelIndicators
  });
})(window);
