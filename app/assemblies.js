"use strict";

function normalizeAssembly(assembly) {
  const normalized = { ...assembly };
  if (normalized.type === "inner-pads") {
    normalized.type = "pads";
    normalized.sides = ["inner"];
  }
  if (!Array.isArray(normalized.sides)) {
    const legacySide = String(normalized.side || "").toLowerCase();
    normalized.sides = legacySide.includes("inner") ? ["inner"] : legacySide.includes("outer") ? ["outer"] : [];
  }
  normalized.sides = [...new Set(normalized.sides.filter((side) => side === "inner" || side === "outer"))];
  if (!normalized.type || normalized.type === "none" || !normalized.sides.length) {
    normalized.type = "none";
    normalized.sides = [];
  }
  const fallback = defaultAssemblies[Math.max(0, Math.min(defaultAssemblies.length - 1, Number(normalized.station || 1) - 1))];
  normalized.spenderAngle = num(normalized.spenderAngle, fallback.spenderAngle);
  normalized.innerRollerAngles = Array.isArray(normalized.innerRollerAngles) ? normalized.innerRollerAngles.slice(0, 2).map((v, i) => num(v, fallback.innerRollerAngles[i])) : [...fallback.innerRollerAngles];
  normalized.outerRollerAngles = Array.isArray(normalized.outerRollerAngles) ? normalized.outerRollerAngles.slice(0, 2).map((v, i) => num(v, fallback.outerRollerAngles[i])) : [...fallback.outerRollerAngles];
  while (normalized.innerRollerAngles.length < 2) normalized.innerRollerAngles.push(fallback.innerRollerAngles[normalized.innerRollerAngles.length]);
  while (normalized.outerRollerAngles.length < 2) normalized.outerRollerAngles.push(fallback.outerRollerAngles[normalized.outerRollerAngles.length]);
  normalized.padSpanDeg = num(normalized.padSpanDeg, Math.max(1, num(normalized.endAngle, fallback.brushEndAngle) - num(normalized.startAngle, fallback.brushStartAngle)));
  normalized.padSideOffsetDeg = Math.max(0, num(normalized.padSideOffsetDeg, num(fallback.padSideOffsetDeg, 3)));
  normalized.brushStartAngle = num(normalized.brushStartAngle, num(normalized.startAngle, fallback.brushStartAngle));
  normalized.brushEndAngle = num(normalized.brushEndAngle, num(normalized.endAngle, fallback.brushEndAngle));
  const brushMid = (normalized.brushStartAngle + normalized.brushEndAngle) / 2;
  const fallbackOuterBrush = [normalized.brushStartAngle, brushMid];
  const fallbackInnerBrush = [brushMid, normalized.brushEndAngle];
  normalized.outerBrushAngles = Array.isArray(normalized.outerBrushAngles) ? normalized.outerBrushAngles.slice(0, 2).map((v, i) => num(v, fallbackOuterBrush[i])) : fallbackOuterBrush;
  normalized.innerBrushAngles = Array.isArray(normalized.innerBrushAngles) ? normalized.innerBrushAngles.slice(0, 2).map((v, i) => num(v, fallbackInnerBrush[i])) : fallbackInnerBrush;
  while (normalized.outerBrushAngles.length < 2) normalized.outerBrushAngles.push(fallbackOuterBrush[normalized.outerBrushAngles.length]);
  while (normalized.innerBrushAngles.length < 2) normalized.innerBrushAngles.push(fallbackInnerBrush[normalized.innerBrushAngles.length]);
  normalized.brushStartAngle = Math.min(...normalized.outerBrushAngles, ...normalized.innerBrushAngles);
  normalized.brushEndAngle = Math.max(...normalized.outerBrushAngles, ...normalized.innerBrushAngles);
  return normalized;
}

function mmToTableDegrees(mm) {
  const radius = Math.max(0.001, num(state.tablePitchRadiusMm, 572.958));
  return (num(mm) / radius) * (180 / Math.PI);
}

function padStartAngle(assembly) {
  return num(assembly.spenderAngle) + mmToTableDegrees(state.padClearanceMm);
}

function padAnglesForSide(assembly, side = "outer") {
  const baseStart = padStartAngle(assembly);
  const bothSelected = assembly.sides?.includes("outer") && assembly.sides?.includes("inner");
  const offset = bothSelected && side === "inner" ? Math.max(0, num(assembly.padSideOffsetDeg, 3)) : 0;
  const start = baseStart + offset;
  return [start, start + Math.max(0.1, num(assembly.padSpanDeg, 20))];
}

function padProfileTableAngles(station) {
  const assembly = normalizeAssembly(state.assemblies.find((entry) => Number(entry.station) === Number(station)) || defaultAssemblies[station - 1]);
  if (assembly.type !== "pads" || !assembly.sides.length) {
    const start = mapPointAngle(new RegExp(`Agg ${station} .*Start`, "i"));
    const stop = mapPointAngle(new RegExp(`Agg ${station} .*Stop`, "i"), start + 20);
    return [start, Math.min(stop, start + profileTiming.wipe1Duration), stop, stop + 0.5];
  }
  const outer = assembly.sides.includes("outer") ? padAnglesForSide(assembly, "outer") : null;
  const inner = assembly.sides.includes("inner") ? padAnglesForSide(assembly, "inner") : null;
  if (outer && inner) {
    return [outer[0], inner[0], inner[1], Math.max(outer[1], inner[1]) + 0.5];
  }
  const window = outer || inner;
  return [window[0], Math.min(window[1], window[0] + profileTiming.wipe1Duration), window[1], window[1] + 0.5];
}

function assemblyAngles(assembly, side = null) {
  if (assembly.type === "rollers") {
    const sides = side ? [side] : assembly.sides;
    return sides.flatMap((position) => position === "inner" ? assembly.innerRollerAngles : assembly.outerRollerAngles).filter(Number.isFinite);
  }
  if (assembly.type === "pads") {
    const sides = side ? [side] : assembly.sides;
    return sides.flatMap((position) => padAnglesForSide(assembly, position)).filter(Number.isFinite);
  }
  if (assembly.type === "brushes") {
    const sides = side ? [side] : assembly.sides;
    return sides.flatMap((position) => position === "inner" ? assembly.innerBrushAngles : assembly.outerBrushAngles).filter(Number.isFinite);
  }
  return [];
}

function assemblySpan(assembly) {
  const angles = assemblyAngles(assembly);
  return angles.length ? Math.max(...angles) - Math.min(...angles) : 0;
}

function syncMapPointsFromAssemblies() {
  if (state.applicationMode === "cold-glue") return;
  state.assemblies.forEach((raw) => {
    const assembly = normalizeAssembly(raw);
    const station = assembly.station;
    const spender = state.mapPoints.find((point) => new RegExp(`Agg ${station} Spender`, "i").test(point.name));
    if (spender) spender.angle = assembly.spenderAngle;

    const rollerPoints = state.mapPoints.filter((point) => new RegExp(`Agg ${station} Roller`, "i").test(point.name));
    const rollerAngles = [...assembly.outerRollerAngles, ...assembly.innerRollerAngles];
    rollerPoints.forEach((point, index) => {
      if (Number.isFinite(rollerAngles[index])) point.angle = rollerAngles[index];
    });

    const startPoint = state.mapPoints.find((point) => new RegExp(`Agg ${station} .*Start`, "i").test(point.name));
    const stopPoint = state.mapPoints.find((point) => new RegExp(`Agg ${station} .*Stop`, "i").test(point.name));
    if (assembly.type === "brushes") {
      if (startPoint) startPoint.angle = assembly.brushStartAngle;
      if (stopPoint) stopPoint.angle = assembly.brushEndAngle;
    } else {
      if (startPoint) startPoint.angle = padAnglesForSide(assembly, /Inner/i.test(startPoint.name) ? "inner" : "outer")[0];
      if (stopPoint) stopPoint.angle = padAnglesForSide(assembly, /Inner/i.test(stopPoint.name) ? "inner" : "outer")[1];
    }
  });
}

function mapPointStation(name) {
  const match = String(name || "").match(/Agg\s*(\d+)/i);
  return match ? Number(match[1]) : null;
}


function assemblyRequiredRatio(assembly) {
  const span = assemblySpan(assembly);
  return span > 0 ? Math.abs(num(assembly.requiredPlateRotation)) / span : Infinity;
}

function assemblyStatus(assembly) {
  if (!assembly.enabled || assembly.type === "none" || !assembly.sides?.length) return { level: "off", text: "Removed", ratio: 0 };
  const span = assemblySpan(assembly);
  const ratio = assemblyRequiredRatio(assembly);
  if (span <= 0) return { level: "bad", text: "Invalid contact distance", ratio };
  if (ratio >= state.maxMoveRatio) return { level: "bad", text: `Servo fault (${fmt(ratio, 2)}:1)`, ratio };
  if (ratio >= state.maxMoveRatio * 0.85) return { level: "warn", text: `Near limit (${fmt(ratio, 2)}:1)`, ratio };
  return { level: "ok", text: `Optimized (${fmt(ratio, 2)}:1)`, ratio };
}

function assemblyTypeLabel(type) {
  return ({ rollers: "Rollers", pads: "Wipe-down pads", brushes: "Brushes", none: "Removed" })[type] || type;
}

function assemblyPositionLabel(assembly) {
  const sides = assembly.sides || [];
  if (sides.length === 2) return "Inner + outer";
  if (sides[0] === "inner") return "Inner";
  if (sides[0] === "outer") return "Outer";
  return "Select assembly";
}


function assemblySelectValue(assembly) {
  if (!assembly.enabled || assembly.type === "none" || !assembly.sides?.length) return "none";
  const hasInner = assembly.sides.includes("inner");
  const hasOuter = assembly.sides.includes("outer");
  const position = hasInner && hasOuter ? "both" : hasInner ? "inner" : "outer";
  return `${assembly.type}:${position}`;
}

function configureSetupDialogMode() {
  const isColdGlue = state.applicationMode === "cold-glue";
  const aplSection = document.getElementById("aplAssemblySection");
  const locationHeading = document.getElementById("objectLocationHeading");
  const locationDescription = document.getElementById("objectLocationDescription");
  const aplGlobalControls = document.getElementById("aplLocationGlobalControls");

  if (aplSection) aplSection.hidden = isColdGlue;
  if (aplGlobalControls) aplGlobalControls.hidden = isColdGlue;
  if (locationHeading) locationHeading.textContent = isColdGlue ? "Cold Glue Map Objects" : "Table-Angle Object Locations";
  if (locationDescription) {
    locationDescription.textContent = isColdGlue
      ? "Cold Glue maps use only brushes and rollers. Add and position those objects in Map Builder; the selected Cold Glue label specification uses center-tack application."
      : "APL spender plates align by their trailing edge. Roller values align to roller centerlines. Pad leading edges are calculated from the spender edge.";
  }
}

function renderAssemblyEditor() {
  if (!els.assemblyEditor) return;
  configureSetupDialogMode();
  els.applicationMode.value = state.applicationMode;
  if (els.tablePitchRadiusMm) { els.tablePitchRadiusMm.value = state.tablePitchRadiusMm; els.tablePitchRadiusMm.disabled = state.applicationMode === "cold-glue"; }
  if (els.padClearanceMm) { els.padClearanceMm.value = state.padClearanceMm; els.padClearanceMm.disabled = state.applicationMode === "cold-glue"; }
  els.applicationModeDescription.textContent = applicationPresets[state.applicationMode]?.description || "";
  els.assemblyEditor.innerHTML = "";
  if (state.applicationMode === "cold-glue") {
    els.assemblyEditor.innerHTML = "";
    renderObjectLocationEditor();
    if (els.assemblySetupSummary) els.assemblySetupSummary.textContent = "Cold Glue map • brushes and rollers only • center-tack label application";
    return;
  }
  state.assemblies = state.assemblies.map((raw, index) => {
    const assembly = normalizeAssembly(raw);
    if (state.applicationMode === "cold-glue") {
      if (assembly.enabled && assembly.type !== "brushes") assembly.type = "brushes";
      if (assembly.enabled && !assembly.sides.length) assembly.sides = ["inner"];
    } else {
      if (assembly.type === "brushes") {
        const fallback = defaultAssemblies[index];
        assembly.type = fallback.type;
        if (!assembly.sides.length) assembly.sides = [...fallback.sides];
      }
      // Rollers physically exist only at neck stations 1 and 2.
      if (index > 1 && assembly.type === "rollers") {
        assembly.type = "pads";
        if (!assembly.sides.length) assembly.sides = ["outer"];
      }
    }
    return normalizeAssembly(assembly);
  });

  state.assemblies.forEach((assembly, index) => {
    const status = assemblyStatus(assembly);
    const row = document.createElement("div");
    row.className = `assembly-row assembly-${status.level}`;
    row.dataset.index = index;
    const currentValue = assemblySelectValue(assembly);
    const selectOptions = state.applicationMode === "cold-glue" ? [
      ["none", "Select brush assembly"],
      ["brushes:inner", "Brushes — Inner"],
      ["brushes:outer", "Brushes — Outer"],
      ["brushes:both", "Brushes — Inner + outer"]
    ] : Number(assembly.station) <= 2 ? [
      ["none", "Select APL assembly"],
      ["rollers:inner", "Rollers — Inner"],
      ["rollers:outer", "Rollers — Outer"],
      ["rollers:both", "Rollers — Inner + outer"],
      ["pads:inner", "Wipe-down pads — Inner"],
      ["pads:outer", "Wipe-down pads — Outer"],
      ["pads:both", "Wipe-down pads — Inner + outer"]
    ] : [
      ["none", "Select wipe-down pad assembly"],
      ["pads:inner", "Wipe-down pads — Inner"],
      ["pads:outer", "Wipe-down pads — Outer"],
      ["pads:both", "Wipe-down pads — Inner + outer"]
    ];
    const options = selectOptions.map(([value, label]) =>
      `<option value="${value}" ${value === currentValue ? "selected" : ""}>${label}</option>`
    ).join("");

    row.innerHTML = `
      <div class="assembly-row-head">
        <strong>Station ${assembly.station}</strong>
        <span class="assembly-status">${status.text}</span>
      </div>
      <button type="button" class="assembly-enable station-toggle ${assembly.enabled ? "is-enabled" : "is-disabled"}" data-station-toggle="${index}" aria-pressed="${assembly.enabled ? "true" : "false"}" ${assembly.removedByLabelLength ? "disabled" : ""}>
        <span class="station-toggle-box" aria-hidden="true">${assembly.enabled ? "✓" : ""}</span>
        <span>${assembly.removedByLabelLength ? `Removed — no ${assembly.removedLabelSection} label` : assembly.enabled ? "Installed" : "Removed"}</span>
      </button>
      <label class="assembly-picker-label">Assembly
        <select class="assembly-native-select" data-assembly-select="${index}" ${assembly.enabled && !assembly.removedByLabelLength ? "" : "disabled"}>
          ${options}
        </select>
      </label>
      <label>Required plate rotation (deg)<input type="number" min="0" step="1" data-field="requiredPlateRotation" value="${fmt(assembly.requiredPlateRotation, 1)}" ${assembly.enabled ? "" : "disabled"} /></label>
      <div class="assembly-distance">Usable contact distance: <strong>${fmt(assemblySpan(assembly), 1)} deg table</strong></div>`;

    const stationToggle = row.querySelector("[data-station-toggle]");
    stationToggle?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const stationIndex = Number(stationToggle.dataset.stationToggle);
      const current = normalizeAssembly(state.assemblies[stationIndex]);
      if (current.removedByLabelLength) return;
      current.enabled = !current.enabled;
      state.assemblies[stationIndex] = current;
      syncMapPointsFromAssemblies();
      renderAssemblyEditor();
      drawMap();
      renderValidation();
    });

    row.querySelectorAll("input[data-field]").forEach((control) => {
      control.addEventListener("change", () => {
        const field = control.dataset.field;
        const current = normalizeAssembly(state.assemblies[index]);
        current[field] = num(control.value, current[field]);
        state.assemblies[index] = current;
        syncMapPointsFromAssemblies();
        renderAssemblyEditor();
        drawMap();
        renderValidation();
      });
    });

    const assemblySelect = row.querySelector("[data-assembly-select]");
    assemblySelect?.addEventListener("change", () => {
      const current = normalizeAssembly(state.assemblies[index]);
      const value = assemblySelect.value;
      if (value === "none") {
        current.type = "none";
        current.sides = [];
      } else {
        const [family, position] = value.split(":");
        current.type = family;
        current.sides = position === "both" ? ["inner", "outer"] : [position];
      }
      state.assemblies[index] = current;
      syncMapPointsFromAssemblies();
      renderAssemblyEditor();
      drawMap();
      renderValidation();
    });

    els.assemblyEditor.appendChild(row);
  });

  const active = state.assemblies.filter((a) => a.enabled && a.type !== "none" && a.sides?.length);
  const faults = active.filter((a) => assemblyStatus(a).level === "bad");
  els.assemblySetupSummary.textContent = `${active.length} stations configured${faults.length ? ` • ${faults.length} setup fault${faults.length === 1 ? "" : "s"}` : " • all within servo limit"}`;
  renderObjectLocationEditor();
}

function renderObjectLocationEditor() {
  if (!els.objectLocationEditor) return;
  els.objectLocationEditor.innerHTML = "";
  if (state.applicationMode === "cold-glue") {
    const cards = coldGlueMapObjects().map((item) => {
      const fields = Number.isFinite(Number(item.angle))
        ? `<label>Table angle<input type="number" step="0.1" data-cg-id="${item.id}" data-cg-field="angle" value="${fmt(item.angle, 1)}"></label>`
        : `<label>Start angle<input type="number" step="0.1" data-cg-id="${item.id}" data-cg-field="start" value="${fmt(item.start, 1)}"></label><label>Stop angle<input type="number" step="0.1" data-cg-id="${item.id}" data-cg-field="end" value="${fmt(item.end, 1)}"></label>`;
      return `<div class="fixed-map-card editable"><strong>${item.name}</strong><div class="fixed-map-fields">${fields}</div><small>${item.kind === "roller" ? "Roller position" : "Brush contact window"}</small></div>`;
    }).join("");
    els.objectLocationEditor.innerHTML = `<div class="fixed-map-toolbar"><span>Cold Glue brush and roller positions feed the servo profile directly.</span><button id="resetColdGlueMap" type="button">Clear Objects</button></div><div class="fixed-map-grid">${cards}</div>`;
    els.objectLocationEditor.querySelectorAll("input[data-cg-id]").forEach((input) => {
      input.addEventListener("change", () => {
        const item = coldGlueMapObjects().find((entry) => entry.id === input.dataset.cgId);
        if (!item) return;
        item[input.dataset.cgField] = num(input.value, item[input.dataset.cgField]);
        render();
      });
    });
    els.objectLocationEditor.querySelector("#resetColdGlueMap")?.addEventListener("click", () => {
      resetColdGlueMap();
      render();
    });
    return;
  }
  state.assemblies.forEach((rawAssembly, index) => {
    const assembly = normalizeAssembly(rawAssembly);
    state.assemblies[index] = assembly;
    const card = document.createElement("div");
    card.className = "location-row";
    card.dataset.index = String(index);
    const familyFields = assembly.type === "rollers" ? `
      <div class="location-subhead">Roller centerlines (table degrees)</div>
      <label>Outer roller 1<input type="number" step="0.1" data-location="outerRollerAngles.0" value="${fmt(assembly.outerRollerAngles[0], 1)}"></label>
      <label>Outer roller 2<input type="number" step="0.1" data-location="outerRollerAngles.1" value="${fmt(assembly.outerRollerAngles[1], 1)}"></label>
      <label>Inner roller 1<input type="number" step="0.1" data-location="innerRollerAngles.0" value="${fmt(assembly.innerRollerAngles[0], 1)}"></label>
      <label>Inner roller 2<input type="number" step="0.1" data-location="innerRollerAngles.1" value="${fmt(assembly.innerRollerAngles[1], 1)}"></label>` : assembly.type === "brushes" ? `
      <div class="location-subhead">Brush contact range (table degrees)</div>
      ${assembly.sides.includes("outer") ? `<label>Outer brush start<input type="number" step="0.1" data-location="outerBrushAngles.0" value="${fmt(assembly.outerBrushAngles[0], 1)}"></label>
      <label>Outer brush stop<input type="number" step="0.1" data-location="outerBrushAngles.1" value="${fmt(assembly.outerBrushAngles[1], 1)}"></label>` : ""}
      ${assembly.sides.includes("inner") ? `<label>Inner brush start<input type="number" step="0.1" data-location="innerBrushAngles.0" value="${fmt(assembly.innerBrushAngles[0], 1)}"></label>
      <label>Inner brush stop<input type="number" step="0.1" data-location="innerBrushAngles.1" value="${fmt(assembly.innerBrushAngles[1], 1)}"></label>` : ""}` : assembly.type === "pads" ? `
      <div class="location-subhead">Wipe-down pad location</div>
      <div class="auto-location">Outer pad leading edge: <strong>${fmt(padAnglesForSide(assembly, "outer")[0], 2)}°</strong><br><span>${fmt(state.padClearanceMm, 1)} mm after the spender edge</span></div>
      <label>Pad contact span (deg)<input type="number" min="0.1" step="0.1" data-location="padSpanDeg" value="${fmt(assembly.padSpanDeg, 1)}"></label>
      ${assembly.sides.includes("inner") && assembly.sides.includes("outer") ? `<label>Inner pad offset from outer (deg)<input type="number" min="0" step="0.1" data-location="padSideOffsetDeg" value="${fmt(assembly.padSideOffsetDeg, 1)}"></label>
      <div class="auto-location">Inner pad leading edge: <strong>${fmt(padAnglesForSide(assembly, "inner")[0], 2)}°</strong></div>` : ""}` : `<div class="auto-location">No wipe-down assembly selected.</div>`;
    const applicatorLocationLabel = state.applicationMode === "cold-glue"
      ? "Pallet position (table deg)"
      : "Spender plate trailing edge (table deg)";
    card.innerHTML = `
      <div class="location-row-head"><strong>Station ${assembly.station}</strong><span>${assemblyTypeLabel(assembly.type)}</span></div>
      <label>${applicatorLocationLabel}<input type="number" step="0.1" data-location="spenderAngle" value="${fmt(assembly.spenderAngle, 1)}"></label>
      ${familyFields}`;
    card.querySelectorAll("[data-location]").forEach((input) => {
      input.addEventListener("change", () => {
        const field = input.dataset.location;
        if (field.includes(".")) {
          const [key, position] = field.split(".");
          assembly[key][Number(position)] = num(input.value, assembly[key][Number(position)]);
        } else assembly[field] = num(input.value, assembly[field]);
        state.assemblies[index] = assembly;
        syncMapPointsFromAssemblies();
        render();
        renderAssemblyEditor();
        renderObjectLocationEditor();
      });
    });
    els.objectLocationEditor.appendChild(card);
  });
}

function applyApplicationPreset(mode) {
  const preset = applicationPresets[mode];
  if (!preset) return;
  state.applicationMode = mode;
  ensureSelectedBrandForApplication();

  // Preserve station installed/removed state and all entered geometry when
  // changing application systems. Only the incompatible assembly family is
  // converted to a valid family for the selected application.
  state.assemblies = state.assemblies.map((raw, index) => {
    const current = normalizeAssembly(raw);
    const fallback = normalizeAssembly(deepClone(preset.defaults[index] || defaultAssemblies[index]));
    if (mode === "cold-glue") {
      return current;
    } else {
      if (current.type === "brushes" || current.type === "none") {
        current.type = fallback.type === "brushes" ? defaultAssemblies[index].type : fallback.type;
        current.sides = current.enabled ? (current.sides.length ? [...current.sides] : [...defaultAssemblies[index].sides]) : [];
      }
      if (index > 1 && current.type === "rollers") {
        current.type = "pads";
        current.sides = current.enabled ? (current.sides.length ? [...current.sides] : ["outer"]) : [];
      }
      if (!current.enabled) {
        current.type = "none";
        current.sides = [];
      }
    }
    return normalizeAssembly(current);
  });

  syncMapPointsFromAssemblies();
  render();
  renderWipeDownBuilder();
}

function drawMapObjectLabel() {
  // Map labels are intentionally disabled. Object names remain available in the Map Builder.
}

function activeAggregateDefinitions() {
  const machineMap = activeMachineMap();
  if (!machineMap) return [];
  const enabled = normalizeEnabledSlots(machineMap.enabledAggregates, machineMap.aggregateCount);
  const angles = normalizeAggregateAngles(machineMap.aggregateAngles, machineMap.applicationMode, machineMap.objects);
  return enabled
    .map((isEnabled, index) => isEnabled ? { number: index + 1, angle: num(angles[String(index + 1)], 0) } : null)
    .filter(Boolean);
}

function drawIndependentAggregates(add, layer) {
  const machineSign = state.direction === "cw" ? 1 : -1;
  activeAggregateDefinitions().forEach((aggregate) => {
    const xy = angleToXY(aggregate.angle, state.radius + state.depths.spender);
    const rotation = angleToSvgRotation(aggregate.angle) + (state.applicationMode === "cold-glue" ? 90 : machineSign * SPENDER_PLATE_ARM_ANGLE);
    const group = add("g", { transform: `translate(${xy.x} ${xy.y}) rotate(${rotation})`, "data-aggregate-marker": aggregate.number }, layer);
    if (state.applicationMode === "cold-glue") {
      add("line", { x1: -9, y1: 0, x2: 9, y2: 0, stroke: "#d71920", "stroke-width": 3, "stroke-linecap": "round" }, group);
    } else {
      add("line", { x1: 0, y1: 0, x2: 30, y2: 0, stroke: "#d71920", "stroke-width": 4, "stroke-linecap": "round" }, group);
      add("circle", { cx: 0, cy: 0, r: 3, fill: "#d71920", stroke: "#ffffff", "stroke-width": 1 }, group);
    }
  });
}

function labelSensorMapStatus(item) {
  const station = Number(item.station);
  const section = state.motionPlan?.stationPlans?.find((plan) => Number(plan.station) === station)?.section || labelSectionForStation(station);
  if (!["neck", "body", "back"].includes(section)) return { color: "#e5d34b", percent: 0, required: Math.min(100, Math.max(1, num(item.requiredVisibilityPercent, 50))), passes: false };
  const seed = generatedAplSeedProfile();
  const targetIndex = section === "neck" ? 1 : section === "body" ? 11 : 21;
  const labelWidth = Math.min(360, Math.max(3, num(sectionWipePlan(section)?.labelDeg, 0)));
  const center = labelSensorInspectionCenter(section, num(seed[targetIndex]?.plateAngle, 0), labelWidth);
  const visibility = labelSensorVisibility(center, plateAngleAt(num(item.angle, item.start), state.program), labelWidth, 180);
  const required = Math.min(100, Math.max(1, num(item.requiredVisibilityPercent, 50)));
  const passes = visibility.percent + 0.001 >= required;
  return { color: passes ? "#25bf72" : item.servoAssist ? "#db4b4b" : "#e5d34b", percent: visibility.percent, required, passes };
}

function labelSensorMapColor(item) {
  return labelSensorMapStatus(item).color;
}

function drawConfiguredAssemblies(add, layer) {
  ensurePersistentApplicationMaps();
  if (state.applicationMode === "cold-glue") {
    const brushFill = "#8b6fc1";
    const brushStroke = "#554176";
    const gripperHalfLength = 9;
    coldGlueMapObjects().forEach((raw) => {
      const item = { ...raw, kind: raw.kind === "wipe" ? "brush" : raw.kind };
      const objectLayer = add("g", { "data-map-object-id": item.id, class: state.selectedMapObjectId === item.id ? "map-object selected-map-object" : "map-object" }, layer);
      if (item.kind === "sensor") {
        const placement = num(item.angle, item.start);
        const centerRadius = state.radius + state.depths.opRoller + 7;
        add("path", { d: arcPath(placement - 1.5, placement + 1.5, centerRadius - 8, centerRadius + 8), fill: labelSensorMapColor(item), "fill-opacity": 0.9, stroke: "#8a7b08", "stroke-width": 2, "data-label-sensor": item.id, "data-sensor-station": item.station }, objectLayer);
        drawMapObjectLabel(add, objectLayer, item, placement, centerRadius, 20);
        return;
      }
      if (item.kind === "coding") {
        const centerRadius = state.radius + state.depths.opRoller;
        add("path", { d: arcPath(num(item.start), num(item.end), centerRadius - 7, centerRadius + 7), fill: "#d7a72c", "fill-opacity": 0.82, stroke: "#8a6410", "stroke-width": 2, "data-coding-object": item.id }, objectLayer);
        drawMapObjectLabel(add, objectLayer, item, (num(item.start) + num(item.end)) / 2, centerRadius, 18);
        return;
      }
      if (item.kind === "gripper") {
        const angle = num(item.angle, item.start);
        if (!Number.isFinite(angle)) return;
        const duplicateAggregate = activeAggregateDefinitions().some((aggregate) => Math.abs(((aggregate.angle - angle + 540) % 360) - 180) < 0.25);
        if (duplicateAggregate) return;
        const xy = angleToXY(angle, state.radius + state.depths.spender);
        const rotation = angleToSvgRotation(angle) + 90;
        const group = add("g", { transform: `translate(${xy.x} ${xy.y}) rotate(${rotation})` }, objectLayer);
        add("line", { x1: -gripperHalfLength, y1: 0, x2: gripperHalfLength, y2: 0, stroke: "#d71920", "stroke-width": 3, "stroke-linecap": "round", "data-cold-glue-gripper": item.id }, group);
        drawMapObjectLabel(add, objectLayer, item, angle, state.radius + state.depths.spender, 18);
        return;
      }
      if (item.kind === "roller") {
        const angle = num(item.angle, item.start);
        if (!Number.isFinite(angle)) return;
        const depth = item.side === "inner" ? state.depths.nonOpRoller : state.depths.opRoller;
        const xy = angleToXY(angle, state.radius + depth);
        add("circle", { cx: xy.x, cy: xy.y, r: 11, fill: "#0d9b57", stroke: "#066b3b", "stroke-width": 2 }, objectLayer);
        drawMapObjectLabel(add, objectLayer, item, angle, state.radius + depth, 17);
        return;
      }
      if (item.kind !== "brush") return;
      const depth = item.side === "inner" ? state.depths.wipeInner : state.depths.wipeOuter;
      const brushCenterRadius = state.radius + depth;
      // Brush extension is a physical setup value, not a literal SVG radial
      // thickness. Scale and cap the drawing so inside/outside brush channels
      // remain separate and bottles stay visible between them.
      const brushHalfWidth = Math.max(4, Math.min(7, num(item.extension, 20) / 4));
      add("path", { d: arcPath(num(item.start), num(item.end), brushCenterRadius - brushHalfWidth, brushCenterRadius + brushHalfWidth), fill: brushFill, "fill-opacity": 0.58, stroke: brushStroke, "stroke-width": 2, "stroke-dasharray": "3 2", "data-cold-glue-brush": item.id }, objectLayer);
      drawMapObjectLabel(add, objectLayer, item, (num(item.start) + num(item.end)) / 2, brushCenterRadius, brushHalfWidth + 13);
    });
    return;
  }

  state.aplMapObjects.forEach((raw) => {
    const item = normalizeBuilderObject(raw, "apl");
    const objectLayer = add("g", { "data-map-object-id": item.id, class: state.selectedMapObjectId === item.id ? "map-object selected-map-object" : "map-object" }, layer);
    const isInner = item.side === "inner";
    if (item.kind === "sensor") {
      const centerRadius = state.radius + state.depths.opRoller + 7;
      const placement = num(item.angle, item.start);
      add("path", {
        d: arcPath(placement - 1.5, placement + 1.5, centerRadius - 8, centerRadius + 8),
        fill: labelSensorMapColor(item), "fill-opacity": 0.9, stroke: "#8a7b08", "stroke-width": 2,
        "data-label-sensor": item.id, "data-sensor-station": item.station
      }, objectLayer);
      drawMapObjectLabel(add, objectLayer, item, placement, centerRadius, 20);
      return;
    }
    if (item.kind === "coding") {
      const centerRadius = state.radius + state.depths.opRoller;
      add("path", { d: arcPath(num(item.start), num(item.end), centerRadius - 7, centerRadius + 7), fill: "#d7a72c", "fill-opacity": 0.82, stroke: "#8a6410", "stroke-width": 2, "data-coding-object": item.id }, objectLayer);
      drawMapObjectLabel(add, objectLayer, item, (num(item.start) + num(item.end)) / 2, centerRadius, 18);
      return;
    }
    if (item.kind === "roller") {
      const depth = isInner ? state.depths.nonOpRoller : state.depths.opRoller;
      const xy = angleToXY(item.start, state.radius + depth);
      add("circle", {
        cx: xy.x, cy: xy.y, r: 12, fill: "#0d9b57", stroke: "#066b3b", "stroke-width": 2,
        "data-apl-roller": item.id, "data-wipe-span": item.wipeSpanDeg
      }, objectLayer);
      drawMapObjectLabel(add, objectLayer, item, item.start, state.radius + depth, 19);
      return;
    }
    const centerRadius = state.radius + (isInner ? state.depths.wipeInner : state.depths.wipeOuter);
    const halfExtension = Math.max(5, num(item.extension, 20) / 2);
    add("path", { d: arcPath(item.start, item.end, centerRadius - halfExtension, centerRadius + halfExtension), fill: "#2a91aa", "fill-opacity": 0.74, stroke: "#0f6074", "stroke-width": 2 }, objectLayer);
    drawMapObjectLabel(add, objectLayer, item, (item.start + item.end) / 2, centerRadius, halfExtension + 13);
  });
}
