"use strict";

const STAGING_APPLICATION_VERSION = "0.7.97";
const SERVO_TABLE_ANGLE_STEP_DEG = 0.5;
const SERVO_TABLE_ANGLE_EPSILON = 0.0001;
const MAP_ARC_EPSILON_DEG = 0.001;
const MAP_PAD_VISUAL_MAX_EXTENSION = 36;

function updateRuntimeApplicationVersion() {
  const versionMeta = document.querySelector('meta[name="application-version"]');
  if (versionMeta) versionMeta.content = STAGING_APPLICATION_VERSION;
  const status = document.querySelector("#updateCheckStatus");
  if (status) status.textContent = `Version ${STAGING_APPLICATION_VERSION} • Updates are checked automatically.`;
}

function tableAngleNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hasExplicitTableAngleOverride(value) {
  return value !== null
    && value !== undefined
    && String(value).trim() !== ""
    && Number.isFinite(Number(value));
}

function tableAngleResolution(value) {
  return Math.round(Number(value) * 10) / 10;
}

function terminalTableAngleIndex(rows) {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (row?.terminalRest === true || /end\s*(?:of\s*)?curve/i.test(String(row?.action || ""))) return index;
  }
  return -1;
}

function buildStrictlyIncreasingAngleSeries(rawValues, rows, minimumStep = SERVO_TABLE_ANGLE_STEP_DEG) {
  if (!rawValues.length) return { values: [], adjusted: [] };
  const values = rawValues.map((value, index) => tableAngleResolution(tableAngleNumber(value, index ? rawValues[index - 1] : 0)));
  const original = [...values];
  const terminalIndex = terminalTableAngleIndex(rows);

  for (let index = 1; index < values.length; index += 1) {
    if (values[index] <= values[index - 1] + SERVO_TABLE_ANGLE_EPSILON) {
      values[index] = tableAngleResolution(values[index - 1] + minimumStep);
    }
  }

  if (terminalIndex > 0) {
    const originalTerminal = tableAngleNumber(rawValues[terminalIndex], 359);
    const terminalAngle = tableAngleResolution(Math.max(359, originalTerminal));
    values[terminalIndex] = terminalAngle;
    for (let index = terminalIndex - 1; index >= 0; index -= 1) {
      const latestAllowed = tableAngleResolution(values[index + 1] - minimumStep);
      if (values[index] >= values[index + 1] - SERVO_TABLE_ANGLE_EPSILON) values[index] = latestAllowed;
    }
  }

  for (let index = 1; index < values.length; index += 1) {
    if (values[index] <= values[index - 1] + SERVO_TABLE_ANGLE_EPSILON) {
      values[index] = tableAngleResolution(values[index - 1] + minimumStep);
    }
  }

  const adjusted = values
    .map((value, index) => Math.abs(value - original[index]) > SERVO_TABLE_ANGLE_EPSILON ? index : -1)
    .filter((index) => index >= 0);
  return { values, adjusted };
}

function normalizeServoProgramTableAngles(rows) {
  const source = Array.isArray(rows) ? rows.map((row) => ({ ...row })) : [];
  if (!source.length) return { rows: source, adjustedRows: [], minimumStep: SERVO_TABLE_ANGLE_STEP_DEG };

  const generatedInput = source.map((row) => tableAngleNumber(row.generatedTableAngle, tableAngleNumber(row.tableAngle, 0)));
  const generated = buildStrictlyIncreasingAngleSeries(generatedInput, source);
  source.forEach((row, index) => {
    row.originalGeneratedTableAngle = generatedInput[index];
    row.generatedTableAngle = generated.values[index];
  });

  const finalInput = source.map((row, index) => hasExplicitTableAngleOverride(row.tableAngleOverride)
    ? Number(row.tableAngleOverride)
    : generated.values[index]);
  const finalSeries = buildStrictlyIncreasingAngleSeries(finalInput, source);
  const adjustedRows = new Set([...generated.adjusted, ...finalSeries.adjusted]);

  source.forEach((row, index) => {
    const finalAngle = finalSeries.values[index];
    const hadOverride = hasExplicitTableAngleOverride(row.tableAngleOverride);
    row.originalTableAngle = finalInput[index];
    row.tableAngle = finalAngle;
    row.strictTableAngleSequence = true;
    row.tableAngleSequenceAdjusted = adjustedRows.has(index);
    if (hadOverride && Math.abs(Number(row.tableAngleOverride) - finalAngle) > SERVO_TABLE_ANGLE_EPSILON) {
      row.originalTableAngleOverride = Number(row.tableAngleOverride);
      row.tableAngleOverride = finalAngle;
      row.tableAngleOverrideAdjusted = true;
    } else if (!hadOverride) {
      row.tableAngleOverride = null;
      delete row.originalTableAngleOverride;
      delete row.tableAngleOverrideAdjusted;
    }
  });

  return {
    rows: source,
    adjustedRows: [...adjustedRows].map((index) => source[index]?.hmi ?? index + 1),
    minimumStep: SERVO_TABLE_ANGLE_STEP_DEG
  };
}

if (typeof applyGeneratedServoProfile === "function") {
  const applyGeneratedServoProfileBeforeStrictAngles = applyGeneratedServoProfile;
  applyGeneratedServoProfile = function applyGeneratedServoProfileWithStrictAngles(...args) {
    const result = applyGeneratedServoProfileBeforeStrictAngles.apply(this, args);
    const normalized = normalizeServoProgramTableAngles(state.program);
    state.program = normalized.rows;
    state.tableAngleSequence = {
      valid: true,
      minimumStep: normalized.minimumStep,
      adjustedRows: normalized.adjustedRows,
      adjustedCount: normalized.adjustedRows.length
    };
    return result;
  };
}

function activeMotionPlannerProfileId() {
  return state.selectedMotionProfileId || state.defaultMotionProfileId || "automatic";
}

function selectedMotionPlannerProfile() {
  if (typeof allMotionProfiles !== "function") return null;
  const selectedId = activeMotionPlannerProfileId();
  return allMotionProfiles().find((profile) => profile.id === selectedId) || allMotionProfiles()[0] || null;
}

function activeMotionPlannerMachineProfile(profile = selectedMotionPlannerProfile()) {
  if (typeof resolveProfileMachine === "function") return resolveProfileMachine(profile);
  return "DEFAULT";
}

function motionIntentDisplayName(intent) {
  return String(intent || "HOLD").replaceAll("_", " ");
}

function commandDisplayForPlannerRow(row) {
  if (typeof activeMachineUsesAutocolCommands === "function" && activeMachineUsesAutocolCommands()) {
    return typeof autocolCommandLabel === "function" ? autocolCommandLabel(row) : `CMD ${row.cmd}`;
  }
  return `CMD ${row.cmd}`;
}

function currentMechanicalMotionPlan() {
  const planner = window.LabelerMotionPlannerDriver;
  if (!planner?.buildPlan) return null;
  const rows = typeof programSegments === "function" ? programSegments(state.program) : state.program;
  const profile = selectedMotionPlannerProfile();
  return planner.buildPlan(rows, {
    profileId: activeMotionPlannerProfileId(),
    machineProfile: activeMotionPlannerMachineProfile(profile),
    customIntents: profile?.builtIn ? [] : profile?.intents || []
  });
}

function installMotionPlannerUiStyles() {
  if (document.querySelector("#motionPlannerUiStyles")) return;
  const style = document.createElement("style");
  style.id = "motionPlannerUiStyles";
  style.textContent = `
    .mechanical-timeline { margin:0 0 8px;padding:8px;border:1px solid var(--line);border-radius:8px;background:var(--panel);overflow:hidden; }
    .mechanical-timeline-head { display:flex;justify-content:space-between;gap:8px;align-items:flex-start;margin-bottom:6px; }
    .mechanical-timeline-head h3,.mechanical-timeline-head p { margin:0; }
    .mechanical-timeline-head h3 { font-size:12px; }
    .mechanical-timeline-head p { margin-top:2px;color:var(--muted);font-size:9px; }
    .mechanical-timeline-summary { display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-end; }
    .mechanical-timeline-summary span { padding:3px 6px;border:1px solid var(--line);border-radius:999px;background:var(--input);font-size:8px;white-space:nowrap; }
    .mechanical-timeline-track { display:flex;gap:4px;overflow-x:auto;padding:2px 0 4px;scrollbar-width:thin; }
    .mechanical-event { flex:0 0 136px;min-width:0;padding:5px;border:1px solid var(--line);border-radius:6px;background:var(--panel-hi); }
    .mechanical-event strong,.mechanical-event small,.mechanical-event span { display:block;overflow-wrap:anywhere; }
    .mechanical-event strong { font-size:9px;line-height:1.1; }
    .mechanical-event span { margin-top:2px;font-size:8px;color:var(--green);font-weight:700; }
    .mechanical-event small { margin-top:2px;color:var(--muted);font-size:7px;line-height:1.15; }
    .planner-action-cell { min-width:190px; }
    .planner-action-display { display:grid;gap:2px; }
    .planner-action-line { font-size:9px;font-weight:700;line-height:1.1; }
    .planner-action-line .planner-intent { color:var(--green); }
    .planner-action-display input { width:100%;min-width:0;font-size:9px; }
    #program>table th:last-child,#program>table td:last-child { width:22%; }
  `;
  document.head.appendChild(style);
}

function mechanicalTimelineMarkup(plan) {
  if (!plan?.steps?.length) return "";
  const summary = Object.entries(plan.summary || {})
    .map(([intent, count]) => `<span>${motionIntentDisplayName(intent)} ${count}</span>`)
    .join("");
  const angleSummary = state.tableAngleSequence?.adjustedCount
    ? `<span>Angles repaired ${state.tableAngleSequence.adjustedCount}</span>`
    : `<span>Angles strictly increasing</span>`;
  const events = plan.steps.map((step) => {
    const row = (typeof programSegments === "function" ? programSegments(state.program) : state.program)[step.index] || {};
    const recommendation = Number.isFinite(Number(step.recommendedCommand)) ? ` → CMD ${step.recommendedCommand}` : "";
    const fallback = step.fallbackUsed ? " • fallback" : "";
    return `<article class="mechanical-event" title="${String(step.fallbackReason || step.reason || "").replace(/"/g, "&quot;")}">
      <strong>${step.eventId || `EV${String(step.index + 1).padStart(3, "0")}`} • ${Number.isFinite(step.tableAngle) ? `${step.tableAngle.toFixed(1)} deg` : "--"}</strong>
      <span>${commandDisplayForPlannerRow(row)} • ${motionIntentDisplayName(step.intent)}${recommendation}${fallback}</span>
      <small>${step.action || step.eventType || "Mechanical event"}</small>
    </article>`;
  }).join("");
  return `<section class="mechanical-timeline" aria-label="Mechanical motion timeline">
    <div class="mechanical-timeline-head"><div><h3>Mechanical Timeline</h3><p>Every CMD row has a unique, continuously increasing table angle.</p></div><div class="mechanical-timeline-summary">${angleSummary}${summary}</div></div>
    <div class="mechanical-timeline-track">${events}</div>
  </section>`;
}

function applyPlannerToProgramTable(plan) {
  const rows = document.querySelectorAll("#program tbody tr[data-program-hmi]");
  const sourceRows = typeof programSegments === "function" ? programSegments(state.program) : state.program;
  rows.forEach((tr, index) => {
    const step = plan?.steps?.[index];
    const row = sourceRows[index];
    const actionCell = tr.lastElementChild;
    const actionInput = actionCell?.querySelector("input");
    if (!step || !row || !actionCell || !actionInput) return;
    actionCell.classList.add("planner-action-cell");
    const originalAction = actionInput.value;
    const wrapper = document.createElement("div");
    wrapper.className = "planner-action-display";
    const line = document.createElement("div");
    line.className = "planner-action-line";
    line.innerHTML = `${commandDisplayForPlannerRow(row)} • <span class="planner-intent">${motionIntentDisplayName(step.intent)}</span>`;
    actionInput.replaceWith(wrapper);
    wrapper.appendChild(line);
    wrapper.appendChild(actionInput);
    actionInput.value = originalAction;
    tr.dataset.motionIntent = step.intent;
    tr.dataset.motionEventId = step.eventId || "";
    tr.title = `${step.eventId || "Event"} • ${commandDisplayForPlannerRow(row)} • ${motionIntentDisplayName(step.intent)} • ${step.reason}`;
  });
}

function enhanceProgramWithMotionPlanner() {
  installMotionPlannerUiStyles();
  const program = document.querySelector("#program");
  if (!program) return;
  const plan = currentMechanicalMotionPlan();
  state.plannerPreview = plan;
  program.querySelector(".mechanical-timeline")?.remove();
  const table = program.querySelector(":scope > table");
  if (table && plan) table.insertAdjacentHTML("beforebegin", mechanicalTimelineMarkup(plan));
  applyPlannerToProgramTable(plan);
}

if (typeof renderProgram === "function") {
  const renderProgramBeforeMotionPlanner = renderProgram;
  renderProgram = function renderProgramWithMotionPlanner(...args) {
    const result = renderProgramBeforeMotionPlanner.apply(this, args);
    enhanceProgramWithMotionPlanner();
    return result;
  };
}

function installSafeWipeDownPadRendering() {
  if (typeof angleToXY !== "function" || typeof arcPath !== "function") return;

  arcPath = function safeMapArcPath(startAngle, endAngle, innerRadius, outerRadius) {
    const start = tableAngleNumber(startAngle, 0);
    const end = tableAngleNumber(endAngle, start);
    const rawSpan = end - start;
    let span = ((rawSpan % 360) + 360) % 360;
    if (Math.abs(rawSpan) <= MAP_ARC_EPSILON_DEG) span = MAP_ARC_EPSILON_DEG;
    else if (span <= MAP_ARC_EPSILON_DEG) span = 359.999;

    const resolvedEnd = start + span;
    const requestedInner = tableAngleNumber(innerRadius, 1);
    const requestedOuter = tableAngleNumber(outerRadius, requestedInner + 1);
    const safeInner = Math.max(1, Math.min(requestedInner, requestedOuter - 0.5));
    const safeOuter = Math.max(safeInner + 0.5, Math.max(requestedInner, requestedOuter));
    const startOuter = angleToXY(start, safeOuter);
    const endOuter = angleToXY(resolvedEnd, safeOuter);
    const startInner = angleToXY(start, safeInner);
    const endInner = angleToXY(resolvedEnd, safeInner);
    const largeArc = span > 180 ? 1 : 0;
    const sweepOuter = state.direction === "cw" ? 0 : 1;
    const sweepInner = sweepOuter ? 0 : 1;
    return [
      `M ${startOuter.x} ${startOuter.y}`,
      `A ${safeOuter} ${safeOuter} 0 ${largeArc} ${sweepOuter} ${endOuter.x} ${endOuter.y}`,
      `L ${endInner.x} ${endInner.y}`,
      `A ${safeInner} ${safeInner} 0 ${largeArc} ${sweepInner} ${startInner.x} ${startInner.y}`,
      "Z"
    ].join(" ");
  };

  if (typeof drawConfiguredAssemblies !== "function" || drawConfiguredAssemblies.safePadRenderingInstalled) return;
  const drawConfiguredAssembliesBeforePadSafety = drawConfiguredAssemblies;
  const safeDrawConfiguredAssemblies = function drawConfiguredAssembliesWithSafePads(add, layer) {
    if (state.applicationMode !== "apl" || !Array.isArray(state.aplMapObjects)) {
      return drawConfiguredAssembliesBeforePadSafety(add, layer);
    }
    const originalObjects = state.aplMapObjects;
    state.aplMapObjects = originalObjects.map((item) => {
      if (item?.kind !== "pad") return item;
      const extension = Math.max(4, Math.min(MAP_PAD_VISUAL_MAX_EXTENSION, tableAngleNumber(item.extension, 20)));
      return { ...item, extension };
    });
    try {
      return drawConfiguredAssembliesBeforePadSafety(add, layer);
    } finally {
      state.aplMapObjects = originalObjects;
    }
  };
  safeDrawConfiguredAssemblies.safePadRenderingInstalled = true;
  drawConfiguredAssemblies = safeDrawConfiguredAssemblies;
}

function loadProfileTranslatorRelease() {
  if (window.LabelerProfileTranslatorDriver) return;
  const driverScript = document.createElement("script");
  driverScript.src = "drivers/translation/profile-translator-driver.js?v=0.7.97";
  driverScript.addEventListener("load", () => {
    const integrationScript = document.createElement("script");
    integrationScript.src = "app/profile-translator-integration.js?v=0.7.97";
    integrationScript.addEventListener("load", () => {
      if (typeof render === "function") render();
    });
    document.head.appendChild(integrationScript);
  });
  document.head.appendChild(driverScript);
}

installSafeWipeDownPadRendering();
updateRuntimeApplicationVersion();
loadProfileTranslatorRelease();
