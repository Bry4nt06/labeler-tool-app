"use strict";

(function installBottleVisualRenderer(global) {
  // Shared top-view geometry for the bottle itself. The Mechanical Map and
  // Servo Simulation both use these dimensions so the physical reference does
  // not drift between views.
  const BOTTLE_GEOMETRY = Object.freeze({
    bodyRadius: 7.5,
    shoulderRadius: 5.55,
    neckRadius: 3.25,
    capRadius: 2.2
  });

  const BOTTLE_COLORS = Object.freeze({
    body: "#6f3b20",
    bodyStroke: "#b27a50",
    shoulder: "#5c301d",
    shoulderStroke: "#95623f",
    neck: "#472417",
    neckStroke: "#8f6042",
    cap: "#2d9cff",
    capStroke: "#a8ddff"
  });

  const INDICATORS = Object.freeze({
    // Neck and Body share the front datum. Back remains 180 degrees opposite.
    // Colors follow the ServoForge UI language used in the bottle-table mockup.
    neck: Object.freeze({ center: 0, innerRadius: 4.05, outerRadius: 5.15, color: "#ff8a32" }),
    body: Object.freeze({ center: 0, innerRadius: 6.0, outerRadius: 7.25, color: "#4ca8ff" }),
    back: Object.freeze({ center: 180, innerRadius: 6.0, outerRadius: 7.25, color: "#71d34f" })
  });

  const TABLE_VISUAL = Object.freeze({
    faceInset: 19,
    guideRadiusOffset: 0,
    outerRimOffset: 12,
    pocketRadius: 11.4,
    premiumBottleTableV1: true
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

  function bottleStrokeArcPath(centerAngle, widthDeg, radius) {
    const width = Math.min(330, Math.max(8, Number(widthDeg) || 90));
    const startAngle = centerAngle - width / 2;
    const endAngle = centerAngle + width / 2;
    const point = (angle) => {
      const radians = angle * Math.PI / 180;
      return { x: Math.cos(radians) * radius, y: Math.sin(radians) * radius };
    };
    const start = point(startAngle);
    const end = point(endAngle);
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${width > 180 ? 1 : 0} 1 ${end.x} ${end.y}`;
  }

  function bottleLabelArcWidthDeg(section) {
    if (typeof sectionWipePlan === "function") {
      try {
        const planned = Number(sectionWipePlan(section)?.labelDeg);
        if (Number.isFinite(planned) && planned > 0) return Math.min(330, Math.max(12, planned));
      } catch {
        // Fall back to a readable reference band when recipe geometry is not ready.
      }
    }
    return 90;
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

  function addGradientStop(add, gradient, offset, color, opacity = 1) {
    return add("stop", {
      offset,
      "stop-color": color,
      "stop-opacity": opacity
    }, gradient);
  }

  function drawBottleTableVisual(add, svg, tableRadius, bottleHeads = []) {
    const radius = Math.max(48, Number(tableRadius) || 48);
    const faceRadius = Math.max(30, radius - TABLE_VISUAL.faceInset);
    const guideRadius = radius + TABLE_VISUAL.guideRadiusOffset;
    const outerRadius = radius + TABLE_VISUAL.outerRimOffset;

    const defs = add("defs", { "data-bottle-table-defs": "premium-v1" }, svg);

    const faceGradient = add("radialGradient", {
      id: "servoforge-bottle-table-face",
      cx: "36%",
      cy: "30%",
      r: "78%"
    }, defs);
    addGradientStop(add, faceGradient, "0%", "#6d7379");
    addGradientStop(add, faceGradient, "24%", "#474d53");
    addGradientStop(add, faceGradient, "58%", "#292f35");
    addGradientStop(add, faceGradient, "82%", "#161c22");
    addGradientStop(add, faceGradient, "100%", "#090e13");

    const rimGradient = add("linearGradient", {
      id: "servoforge-bottle-table-rim",
      x1: "0%",
      y1: "0%",
      x2: "100%",
      y2: "100%"
    }, defs);
    addGradientStop(add, rimGradient, "0%", "#d6d9dc", 0.84);
    addGradientStop(add, rimGradient, "28%", "#5f6871", 0.9);
    addGradientStop(add, rimGradient, "52%", "#1a2027", 1);
    addGradientStop(add, rimGradient, "76%", "#8b939b", 0.78);
    addGradientStop(add, rimGradient, "100%", "#313941", 0.95);

    const group = add("g", {
      "data-bottle-table-visual": "premium-v1",
      "aria-label": "ServoForge premium bottle table"
    }, svg);

    // Outer casing and guide-ring stack. These are intentionally neutral metal
    // tones so they stay legible under every theme while retaining ServoForge's
    // orange identity accents.
    add("circle", {
      cx: 0, cy: 0, r: outerRadius,
      fill: "#070c11",
      "fill-opacity": 0.96,
      stroke: "#020507",
      "stroke-width": 5.5
    }, group);
    add("circle", {
      cx: 0, cy: 0, r: outerRadius - 2.2,
      fill: "none",
      stroke: "url(#servoforge-bottle-table-rim)",
      "stroke-width": 2.3,
      "stroke-opacity": 0.9,
      "data-bottle-table-outer-rim": "true"
    }, group);
    add("circle", {
      cx: 0, cy: 0, r: guideRadius + 5.2,
      fill: "none",
      stroke: "#151d25",
      "stroke-width": 8.5,
      "data-bottle-table-guide-track": "true"
    }, group);
    add("circle", {
      cx: 0, cy: 0, r: guideRadius + 5.2,
      fill: "none",
      stroke: "#bac2ca",
      "stroke-width": 1.15,
      "stroke-opacity": 0.43
    }, group);
    add("circle", {
      cx: 0, cy: 0, r: guideRadius + 1.3,
      fill: "none",
      stroke: "#7d8790",
      "stroke-width": 0.8,
      "stroke-opacity": 0.38,
      "stroke-dasharray": "7 6"
    }, group);

    // Brushed-metal table face. Concentric highlights mimic machining marks
    // without using a raster background, so zooming remains crisp.
    add("circle", {
      cx: 0, cy: 0, r: faceRadius,
      fill: "url(#servoforge-bottle-table-face)",
      stroke: "#828a91",
      "stroke-width": 1.3,
      "stroke-opacity": 0.72,
      "data-bottle-table-face": "true"
    }, group);
    [0.18, 0.32, 0.47, 0.62, 0.77, 0.9].forEach((ratio, index) => {
      add("circle", {
        cx: 0,
        cy: 0,
        r: Math.max(8, faceRadius * ratio),
        fill: "none",
        stroke: index % 2 ? "#f2f4f6" : "#020406",
        "stroke-width": index % 2 ? 0.55 : 0.7,
        "stroke-opacity": index % 2 ? 0.09 : 0.16,
        "pointer-events": "none"
      }, group);
    });

    // Hub sits beneath the operational center-angle readout drawn by the scene.
    add("circle", {
      cx: 0, cy: 0, r: 48,
      fill: "#0b1016",
      stroke: "#59626b",
      "stroke-width": 2,
      "stroke-opacity": 0.82,
      "data-bottle-table-hub": "true"
    }, group);
    add("circle", {
      cx: 0, cy: 0, r: 43.5,
      fill: "none",
      stroke: "#ff6738",
      "stroke-width": 1.15,
      "stroke-opacity": 0.42,
      "stroke-dasharray": "18 252",
      "stroke-linecap": "round"
    }, group);

    // Every decorative pocket carries the same head identity as its bottle.
    // The animation renderer updates both from the same live heads() result so
    // pocket and bottle centers cannot drift apart as the table advances.
    (Array.isArray(bottleHeads) ? bottleHeads : []).forEach((head) => {
      if (!Number.isFinite(Number(head?.x)) || !Number.isFinite(Number(head?.y))) return;
      const pocket = add("g", {
        transform: `translate(${Number(head.x)} ${Number(head.y)})`,
        "data-bottle-table-pocket": String(head.head ?? ""),
        "data-animation-pocket": String(head.head ?? "")
      }, group);
      add("circle", {
        cx: 0, cy: 0, r: TABLE_VISUAL.pocketRadius,
        fill: "#080d12",
        "fill-opacity": 0.94,
        stroke: "#0b1015",
        "stroke-width": 3.2
      }, pocket);
      add("circle", {
        cx: 0, cy: 0, r: TABLE_VISUAL.pocketRadius - 1.5,
        fill: "none",
        stroke: "url(#servoforge-bottle-table-rim)",
        "stroke-width": 1.15,
        "stroke-opacity": 0.72
      }, pocket);
      add("circle", {
        cx: 0, cy: 0, r: TABLE_VISUAL.pocketRadius - 3.0,
        fill: "none",
        stroke: "#9da7af",
        "stroke-width": 0.55,
        "stroke-opacity": 0.23
      }, pocket);
    });

    // Four small orange indexing ticks give the table a ServoForge identity and
    // make its orientation visually readable without competing with map data.
    [0, 90, 180, 270].forEach((angle) => {
      const radians = angle * Math.PI / 180;
      const inner = guideRadius + 8.1;
      const outer = guideRadius + 11.2;
      add("line", {
        x1: Math.cos(radians) * inner,
        y1: Math.sin(radians) * inner,
        x2: Math.cos(radians) * outer,
        y2: Math.sin(radians) * outer,
        stroke: "#ff6738",
        "stroke-width": 1.45,
        "stroke-linecap": "round",
        "stroke-opacity": 0.82,
        "pointer-events": "none"
      }, group);
    });

    return group;
  }

  function drawTopViewBottleStructure(add, bottleGroup) {
    // Amber/brown glass body viewed from above. The label bands remain separate
    // overlays, while the center cap stays blue for quick visual recognition.
    add("circle", {
      cx: 0,
      cy: 0,
      r: BOTTLE_GEOMETRY.shoulderRadius,
      fill: BOTTLE_COLORS.shoulder,
      "fill-opacity": 0.96,
      stroke: BOTTLE_COLORS.shoulderStroke,
      "stroke-width": 0.75,
      "stroke-opacity": 0.95,
      "data-bottle-top-view-shoulder": "true"
    }, bottleGroup);

    add("circle", {
      cx: 0,
      cy: 0,
      r: BOTTLE_GEOMETRY.neckRadius,
      fill: BOTTLE_COLORS.neck,
      stroke: BOTTLE_COLORS.neckStroke,
      "stroke-width": 0.95,
      "data-bottle-top-view-neck": "true"
    }, bottleGroup);

    bottleGroup.setAttribute("data-bottle-view", "top");
  }

  function drawBottleLabelIndicators(add, bottleGroup, tableAngle) {
    drawTopViewBottleStructure(add, bottleGroup);

    bottleLabelApplications().forEach((application) => {
      const visual = INDICATORS[application.section];
      const arcWidthDeg = bottleLabelArcWidthDeg(application.section);
      const bandRadius = (visual.innerRadius + visual.outerRadius) / 2;
      const bandWidth = visual.outerRadius - visual.innerRadius;
      const path = bottleStrokeArcPath(visual.center, arcWidthDeg, bandRadius);
      const visible = bottleHasPassedApplication(tableAngle, application.angle) ? "inline" : "none";

      // Dark underlay and soft highlight give the label the raised, rounded band
      // appearance from the mockup while the arc width follows real recipe data.
      add("path", {
        d: path,
        fill: "none",
        stroke: "#05090d",
        "stroke-width": bandWidth + 0.8,
        "stroke-opacity": 0.88,
        "stroke-linecap": "round",
        display: visible,
        "pointer-events": "none",
        "aria-hidden": "true"
      }, bottleGroup);
      add("path", {
        d: path,
        fill: "none",
        stroke: visual.color,
        "stroke-width": bandWidth,
        "stroke-opacity": 0.96,
        "stroke-linecap": "round",
        "data-bottle-label-indicator": application.section,
        "data-bottle-label-arc-deg": arcWidthDeg,
        "data-application-angle": application.angle,
        "data-application-station": application.station,
        display: visible
      }, bottleGroup);
      add("path", {
        d: path,
        fill: "none",
        stroke: "#ffffff",
        "stroke-width": Math.max(0.18, bandWidth * 0.22),
        "stroke-opacity": 0.21,
        "stroke-linecap": "round",
        display: visible,
        "pointer-events": "none",
        "aria-hidden": "true"
      }, bottleGroup);
    });

    add("circle", {
      cx: 0,
      cy: 0,
      r: 2.65,
      fill: "none",
      stroke: BOTTLE_COLORS.capStroke,
      "stroke-width": 0.42,
      "stroke-opacity": 0.42,
      "pointer-events": "none",
      "aria-hidden": "true"
    }, bottleGroup);
  }

  function drawTopViewBottle(add, bottleGroup, tableAngle) {
    add("circle", {
      cx: 0,
      cy: 0,
      r: BOTTLE_GEOMETRY.bodyRadius,
      fill: BOTTLE_COLORS.body,
      stroke: BOTTLE_COLORS.bodyStroke,
      "stroke-width": 1.7,
      "data-bottle-top-view-body": "true"
    }, bottleGroup);
    drawBottleLabelIndicators(add, bottleGroup, tableAngle);
    add("line", {
      x1: 0,
      y1: 0,
      x2: 6.6,
      y2: 0,
      stroke: "#ff4d3a",
      "stroke-width": 2,
      "stroke-linecap": "round",
      "data-bottle-orientation": "true",
      "data-bottle-front-centerline": "true"
    }, bottleGroup);
    add("circle", {
      cx: 0,
      cy: 0,
      r: BOTTLE_GEOMETRY.capRadius,
      fill: BOTTLE_COLORS.cap,
      stroke: BOTTLE_COLORS.capStroke,
      "stroke-width": 0.55,
      "stroke-opacity": 0.92,
      "data-bottle-top-view-cap": "true"
    }, bottleGroup);
    return bottleGroup;
  }

  global.bottleLocalArcPath = bottleLocalArcPath;
  global.bottleStrokeArcPath = bottleStrokeArcPath;
  global.bottleLabelArcWidthDeg = bottleLabelArcWidthDeg;
  global.bottleLabelApplications = bottleLabelApplications;
  global.bottleHasPassedApplication = bottleHasPassedApplication;
  global.bottlePreviewAngle = bottlePreviewAngle;
  global.drawBottleTableVisual = drawBottleTableVisual;
  global.drawBottleLabelIndicators = drawBottleLabelIndicators;
  global.drawTopViewBottle = drawTopViewBottle;
  global.LabelerBottleVisualRenderer = Object.freeze({
    indicators: INDICATORS,
    geometry: BOTTLE_GEOMETRY,
    colors: BOTTLE_COLORS,
    tableVisual: TABLE_VISUAL,
    bottleLocalArcPath,
    bottleStrokeArcPath,
    bottleLabelArcWidthDeg,
    bottleLabelApplications,
    bottleHasPassedApplication,
    bottlePreviewAngle,
    drawBottleTableVisual,
    drawTopViewBottleStructure,
    drawBottleLabelIndicators,
    drawTopViewBottle,
    topViewBottleV1: true,
    premiumBottleTableV1: true,
    recipeSizedLabelBandsV1: true,
    synchronizedBottlePocketsV1: true,
    amberBottleBlueCapV1: true
  });
})(window);