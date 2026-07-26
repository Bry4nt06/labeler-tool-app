"use strict";

function removeZoneSiteControls() {
  document.querySelector("#developerMenu")?.remove();
  document.querySelector("#mapZone")?.closest("label")?.remove();
  document.querySelector("#mapSite")?.closest("label")?.remove();
  document.querySelector("#buildInputs .zone-site-selection")?.remove();
}

if (typeof mapsForMapLibraryLocation === "function") {
  mapsForMapLibraryLocation = () => [...state.mapLibrary];
}

if (typeof renderBuildInputs === "function") {
  const renderBuildInputsBase = renderBuildInputs;
  renderBuildInputs = function renderBuildInputsWithoutZoneSite(...args) {
    const result = renderBuildInputsBase.apply(this, args);
    document.querySelector("#buildInputs .zone-site-selection")?.remove();
    return result;
  };
}

const quadrantControl = document.querySelector("#showQuadrantReferences")?.closest("label");
const overlayPanel = document.querySelector(".map-overlay-control");
if (quadrantControl && overlayPanel) overlayPanel.appendChild(quadrantControl);

const MOTION_PROFILE_STORAGE_KEY = "servoforge-staging-motion-profiles-v1";

const BUILT_IN_MOTION_PROFILES = Object.freeze([
  {
    id: "automatic",
    name: "Automatic",
    description: "Selects the best available strategy for the active machine and application.",
    machineProfile: "AUTO",
    intents: ["Hold", "Rotate", "Hold"],
    builtIn: true
  },
  {
    id: "rest-correction",
    name: "Rest / Correction",
    description: "Uses the proven Rest (3) and Correction (7) motion strategy.",
    machineProfile: "DEFAULT",
    intents: ["Hold", "Rotate", "Hold", "Rotate", "Hold"],
    builtIn: true
  },
  {
    id: "continuous-motion",
    name: "Continuous Motion",
    description: "Targets Startup, Continuous, Changeover and End commands where supported.",
    machineProfile: "MULTIMODUL_FUTURE",
    intents: ["Startup", "Continuous", "Changeover", "Continuous", "End"],
    builtIn: true
  },
  {
    id: "special-spline",
    name: "Special / Spline",
    description: "Targets Special (4) calculated motion stages for complex container geometry.",
    machineProfile: "MULTIMODUL_FUTURE",
    intents: ["Hold", "Special", "Hold"],
    builtIn: true
  }
]);

function loadCustomMotionProfiles() {
  try {
    const parsed = JSON.parse(localStorage.getItem(MOTION_PROFILE_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((profile) => profile && profile.id && profile.name) : [];
  } catch {
    return [];
  }
}

function saveCustomMotionProfiles(profiles) {
  localStorage.setItem(MOTION_PROFILE_STORAGE_KEY, JSON.stringify(profiles));
}

function allMotionProfiles() {
  return [...BUILT_IN_MOTION_PROFILES, ...loadCustomMotionProfiles()];
}

function activeMachineProfileName() {
  const map = typeof activeMachineMap === "function" ? activeMachineMap() : null;
  const machine = String(map?.machineType || "").toUpperCase();
  if (machine.includes("AUTOCOL")) return "AUTOCOL_FUTURE";
  if (machine.includes("MULTIMODUL")) return "MULTIMODUL_FUTURE";
  return state.applicationMode === "cold-glue" ? "COLD_GLUE" : "APL";
}

function resolveProfileMachine(profile) {
  if (!profile || profile.machineProfile === "AUTO") return activeMachineProfileName();
  return profile.machineProfile;
}

function installServoMotionLibraryStyles() {
  if (document.querySelector("#servoMotionLibraryStyles")) return;
  const style = document.createElement("style");
  style.id = "servoMotionLibraryStyles";
  style.textContent = `
    .servo-motion-workbench { width:100%;max-width:100%;box-sizing:border-box;overflow:hidden;margin:0 0 8px;padding:9px;border:1px solid var(--line);border-radius:9px;background:var(--panel);font-size:11px; }
    .servo-motion-head { display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:7px; }
    .servo-motion-head>div { min-width:0; }
    .servo-motion-head h2,.servo-motion-head p { margin:0; }
    .servo-motion-head h2 { font-size:14px;line-height:1.15; }
    .servo-motion-head p { margin-top:2px;color:var(--muted);font-size:10px;line-height:1.25; }
    .servo-motion-status { flex:0 1 auto;max-width:38%;padding:3px 7px;border:1px solid var(--green);border-radius:999px;color:var(--green);font-size:10px;line-height:1.1;text-align:center;white-space:normal;overflow-wrap:anywhere; }
    .servo-profile-manager { display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,.85fr) minmax(0,1.25fr) auto;gap:7px;align-items:end;margin-bottom:7px; }
    .servo-profile-manager label { min-width:0;display:grid;gap:3px;font-size:10px; }
    .servo-profile-manager input,.servo-profile-manager select,.servo-profile-manager textarea,.servo-profile-manager button { min-width:0;font-size:11px; }
    .servo-profile-manager select,.servo-profile-manager input { width:100%;height:31px;padding:4px 6px; }
    .servo-profile-manager textarea { width:100%;min-height:48px;max-height:64px;padding:5px 6px;resize:vertical;line-height:1.2; }
    .servo-profile-actions { display:grid;grid-template-columns:1fr 1fr;gap:5px; }
    .servo-profile-actions button { min-height:31px;padding:5px 8px;white-space:nowrap; }
    .servo-profile-summary { margin-bottom:7px;padding:6px 8px;border-left:2px solid var(--green);background:var(--input);font-size:9px;line-height:1.3;color:var(--muted); }
    .servo-motion-grid { display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px;width:100%; }
    .servo-move-card { min-width:0;width:100%;padding:6px 4px;border:1px solid var(--line);border-radius:7px;background:var(--panel-hi);cursor:pointer;overflow:hidden; }
    .servo-move-card[aria-selected="true"] { border-color:var(--green);box-shadow:inset 0 0 0 1px var(--green); }
    .servo-move-code { display:inline-grid;place-items:center;width:22px;height:22px;margin-bottom:4px;border-radius:50%;background:var(--input);font-size:10px;font-weight:800; }
    .servo-move-card strong,.servo-move-card small { display:block;max-width:100%;overflow-wrap:anywhere; }
    .servo-move-card strong { font-size:10px;line-height:1.1; }
    .servo-move-card small { margin-top:2px;color:var(--muted);font-size:8px;line-height:1.05; }
    .servo-motion-detail { display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:7px;margin-top:7px; }
    .servo-motion-detail>div { min-width:0;padding:8px;border:1px solid var(--line);border-radius:7px;background:var(--input);overflow:hidden; }
    .servo-motion-detail h3 { margin:0 0 4px;font-size:12px;line-height:1.15; }
    .servo-motion-detail p { margin:0 0 6px;font-size:10px;line-height:1.25; }
    .servo-motion-meta { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px; }
    .servo-motion-meta span { min-width:0;padding:4px 5px;border-radius:5px;background:var(--panel);font-size:9px;line-height:1.15;overflow-wrap:anywhere; }
    .servo-intent-output { display:flex;flex-wrap:wrap;gap:4px;min-height:26px;align-items:center;font-size:10px; }
    .servo-intent-chip { max-width:100%;padding:3px 6px;border:1px solid var(--line);border-radius:999px;background:var(--panel);overflow-wrap:anywhere; }
    .servo-intent-error { color:#ff8181; }
    #program { overflow-x:hidden; }
    #program>table { width:100%;table-layout:fixed; }
    #program>table th,#program>table td { font-size:10px;padding:4px 3px; }
    #program>table input,#program>table select { min-width:0;width:100%;font-size:10px;padding:3px 4px; }
    @media(max-width:1000px){.servo-profile-manager{grid-template-columns:repeat(2,minmax(0,1fr));}.servo-profile-actions{grid-column:1/-1}.servo-motion-grid{grid-template-columns:repeat(4,minmax(0,1fr));}}
    @media(max-width:650px){.servo-motion-head,.servo-profile-manager,.servo-motion-detail{grid-template-columns:1fr;display:grid}.servo-motion-status{max-width:100%;justify-self:start}.servo-motion-grid{grid-template-columns:repeat(2,minmax(0,1fr));}.servo-profile-actions{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function motionProfileOptions(selectedId) {
  return allMotionProfiles().map((profile) => `<option value="${profile.id}"${profile.id === selectedId ? " selected" : ""}>${profile.name}${profile.builtIn ? "" : " (Custom)"}</option>`).join("");
}

function servoMotionWorkbenchMarkup() {
  const driver = window.LabelerServoCommandDriver;
  if (!driver?.listMoveDefinitions) return "";
  const profiles = allMotionProfiles();
  const selectedId = state.selectedMotionProfileId && profiles.some((profile) => profile.id === state.selectedMotionProfileId)
    ? state.selectedMotionProfileId
    : "automatic";
  const selectedProfile = profiles.find((profile) => profile.id === selectedId) || profiles[0];
  const machineProfile = resolveProfileMachine(selectedProfile);
  const machineDefinition = driver.profileDefinition(machineProfile);
  const cards = driver.listMoveDefinitions().map((move, index) => `
    <button class="servo-move-card" type="button" data-servo-move="${move.code}" aria-selected="${index === 0}">
      <span class="servo-move-code">${move.code}</span>
      <strong>${move.name}</strong>
      <small>${move.speedMode.replaceAll("-", " ")}</small>
    </button>`).join("");
  return `
    <section class="servo-motion-workbench" aria-label="Servo motion library">
      <div class="servo-motion-head">
        <div><h2>Motion Profile Manager</h2><p>Select, preview, save and remove motion profiles. Generation will be connected in the next milestone.</p></div>
        <span class="servo-motion-status">${machineDefinition.name}</span>
      </div>
      <div class="servo-profile-manager">
        <label>Motion profile<select id="motionProfileSelect">${motionProfileOptions(selectedId)}</select></label>
        <label>Custom profile name<input id="motionProfileName" type="text" placeholder="Profile name"></label>
        <label>Motion intent sequence<textarea id="servoIntentInput" placeholder="Hold, Rotate, Hold">${selectedProfile.intents.join(", ")}</textarea></label>
        <div class="servo-profile-actions">
          <button id="previewMotionProfile" type="button">Preview</button>
          <button id="saveMotionProfile" type="button">Save Custom</button>
          <button id="deleteMotionProfile" type="button">Delete Custom</button>
          <button id="setDefaultMotionProfile" type="button">Set Default</button>
        </div>
      </div>
      <div id="motionProfileSummary" class="servo-profile-summary">${selectedProfile.description}</div>
      <div class="servo-motion-grid">${cards}</div>
      <div class="servo-motion-detail">
        <div id="servoMoveDetail"></div>
        <div><h3>Profile Preview</h3><div id="servoIntentOutput" class="servo-intent-output" aria-live="polite">Preview the selected profile to see its command plan.</div></div>
      </div>
    </section>`;
}

function renderServoMoveDetail(code) {
  const driver = window.LabelerServoCommandDriver;
  const move = driver?.moveDefinition(code);
  const target = document.querySelector("#servoMoveDetail");
  if (!move || !target) return;
  const profile = allMotionProfiles().find((item) => item.id === document.querySelector("#motionProfileSelect")?.value) || BUILT_IN_MOTION_PROFILES[0];
  const machineProfile = resolveProfileMachine(profile);
  const supported = driver.profileSupportsMove(machineProfile, move.code);
  target.innerHTML = `
    <h3>CMD ${move.code} — ${move.name}</h3>
    <p>${move.description}</p>
    <div class="servo-motion-meta">
      <span>Starts stopped: <strong>${move.startsStopped === null ? "Profile-dependent" : move.startsStopped ? "Yes" : "No"}</strong></span>
      <span>Ends stopped: <strong>${move.endsStopped === null ? "Profile-dependent" : move.endsStopped ? "Yes" : "No"}</strong></span>
      <span>Speed: <strong>${move.speedMode.replaceAll("-", " ")}</strong></span>
      <span>Profile support: <strong>${supported ? "Enabled" : "Reserved"}</strong></span>
    </div>`;
}

function parseIntentInput() {
  return String(document.querySelector("#servoIntentInput")?.value || "")
    .split(/[\n,;]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function previewSelectedMotionProfile() {
  const driver = window.LabelerServoCommandDriver;
  const selected = allMotionProfiles().find((profile) => profile.id === document.querySelector("#motionProfileSelect")?.value) || BUILT_IN_MOTION_PROFILES[0];
  const machineProfile = resolveProfileMachine(selected);
  const output = document.querySelector("#servoIntentOutput");
  const intents = parseIntentInput();
  const plan = intents.map((intent) => {
    const command = driver.commandForIntent(intent, machineProfile);
    return { intent, command, move: command ? driver.moveDefinition(command) : null };
  });
  output.innerHTML = plan.map((step) => step.command
    ? `<span class="servo-intent-chip">${step.intent} → ${step.command} ${step.move.name}</span>`
    : `<span class="servo-intent-chip servo-intent-error">${step.intent} → unsupported</span>`).join("") || "No intents entered.";
}

function refreshMotionProfileSelection(profileId) {
  state.selectedMotionProfileId = profileId;
  const profile = allMotionProfiles().find((item) => item.id === profileId) || BUILT_IN_MOTION_PROFILES[0];
  const input = document.querySelector("#servoIntentInput");
  const summary = document.querySelector("#motionProfileSummary");
  const nameInput = document.querySelector("#motionProfileName");
  if (input) input.value = profile.intents.join(", ");
  if (summary) summary.textContent = profile.description;
  if (nameInput) nameInput.value = profile.builtIn ? "" : profile.name;
  renderServoMoveDetail(document.querySelector('[data-servo-move][aria-selected="true"]')?.dataset.servoMove || 1);
}

function bindServoMotionWorkbench() {
  const driver = window.LabelerServoCommandDriver;
  const workbench = document.querySelector(".servo-motion-workbench");
  if (!driver || !workbench) return;

  workbench.querySelectorAll("[data-servo-move]").forEach((card) => card.addEventListener("click", () => {
    workbench.querySelectorAll("[data-servo-move]").forEach((entry) => entry.setAttribute("aria-selected", String(entry === card)));
    renderServoMoveDetail(card.dataset.servoMove);
  }));

  workbench.querySelector("#motionProfileSelect")?.addEventListener("change", (event) => {
    refreshMotionProfileSelection(event.currentTarget.value);
  });

  workbench.querySelector("#previewMotionProfile")?.addEventListener("click", previewSelectedMotionProfile);

  workbench.querySelector("#saveMotionProfile")?.addEventListener("click", () => {
    const name = String(workbench.querySelector("#motionProfileName")?.value || "").trim();
    if (!name) {
      window.alert("Enter a custom profile name before saving.");
      return;
    }
    const intents = parseIntentInput();
    if (!intents.length) {
      window.alert("Enter at least one motion intent before saving.");
      return;
    }
    const profiles = loadCustomMotionProfiles();
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    profiles.push({
      id,
      name,
      description: `Custom motion profile using ${intents.length} intent${intents.length === 1 ? "" : "s"}.`,
      machineProfile: activeMachineProfileName(),
      intents,
      builtIn: false,
      createdAt: new Date().toISOString()
    });
    saveCustomMotionProfiles(profiles);
    state.selectedMotionProfileId = id;
    if (typeof saveCurrentSettings === "function") saveCurrentSettings();
    if (typeof render === "function") render();
  });

  workbench.querySelector("#deleteMotionProfile")?.addEventListener("click", () => {
    const selectedId = workbench.querySelector("#motionProfileSelect")?.value;
    const selected = allMotionProfiles().find((profile) => profile.id === selectedId);
    if (!selected || selected.builtIn) {
      window.alert("Built-in motion profiles cannot be deleted.");
      return;
    }
    saveCustomMotionProfiles(loadCustomMotionProfiles().filter((profile) => profile.id !== selectedId));
    state.selectedMotionProfileId = "automatic";
    if (typeof saveCurrentSettings === "function") saveCurrentSettings();
    if (typeof render === "function") render();
  });

  workbench.querySelector("#setDefaultMotionProfile")?.addEventListener("click", () => {
    const selectedId = workbench.querySelector("#motionProfileSelect")?.value || "automatic";
    state.defaultMotionProfileId = selectedId;
    state.selectedMotionProfileId = selectedId;
    if (typeof saveCurrentSettings === "function") saveCurrentSettings();
    const summary = workbench.querySelector("#motionProfileSummary");
    if (summary) summary.textContent = `${allMotionProfiles().find((profile) => profile.id === selectedId)?.description || ""} Default profile saved.`;
  });

  const initialId = state.selectedMotionProfileId || state.defaultMotionProfileId || "automatic";
  refreshMotionProfileSelection(initialId);
  renderServoMoveDetail(1);
}

function injectServoMotionWorkbench() {
  installServoMotionLibraryStyles();
  const program = document.querySelector("#program");
  if (!program || program.querySelector(".servo-motion-workbench")) return;
  program.insertAdjacentHTML("afterbegin", servoMotionWorkbenchMarkup());
  bindServoMotionWorkbench();
}

if (typeof renderProgram === "function") {
  const renderProgramBase = renderProgram;
  renderProgram = function renderProgramWithMotionLibrary(...args) {
    const result = renderProgramBase.apply(this, args);
    injectServoMotionWorkbench();
    return result;
  };
}

removeZoneSiteControls();
initializeLabelerApp();
removeZoneSiteControls();
injectServoMotionWorkbench();
