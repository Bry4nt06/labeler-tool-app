"use strict";

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
