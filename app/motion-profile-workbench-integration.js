"use strict";

(function installMotionProfileWorkbench(global) {
  if (global.LabelerMotionProfileWorkbench) return;

  const STORAGE_KEY = "servoforge-staging-motion-profiles-v1";
  const BUILT_IN_PROFILES = Object.freeze([
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

  function commandDriver() {
    return global.LabelerDriverRegistry?.resolve("servo.command") || global.LabelerServoCommandDriver || null;
  }

  function loadCustomProfiles() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.filter((profile) => profile?.id && profile?.name) : [];
    } catch {
      return [];
    }
  }

  function saveCustomProfiles(profiles) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  }

  function profiles() {
    return [...BUILT_IN_PROFILES, ...loadCustomProfiles()];
  }

  function activeMachineProfileName() {
    const map = typeof activeMachineMap === "function" ? activeMachineMap() : null;
    const machine = String(map?.machineType || "").toUpperCase();
    if (machine.includes("AUTOCOL")) return "AUTOCOL_FUTURE";
    if (machine.includes("MULTIMODUL")) return "MULTIMODUL_FUTURE";
    return state.applicationMode === "cold-glue" ? "COLD_GLUE" : "APL";
  }

  function machineProfile(profile) {
    return !profile || profile.machineProfile === "AUTO" ? activeMachineProfileName() : profile.machineProfile;
  }

  function selectedProfile(id) {
    return profiles().find((profile) => profile.id === id) || BUILT_IN_PROFILES[0];
  }

  function installStyles() {
    if (document.querySelector("#servoMotionLibraryStyles")) return;
    const style = document.createElement("style");
    style.id = "servoMotionLibraryStyles";
    style.textContent = `
      .servo-motion-workbench{width:100%;box-sizing:border-box;overflow:hidden;margin:0 0 8px;padding:9px;border:1px solid var(--line);border-radius:9px;background:var(--panel);font-size:11px}
      .servo-motion-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:7px}.servo-motion-head h2,.servo-motion-head p{margin:0}.servo-motion-head h2{font-size:14px}.servo-motion-head p{margin-top:2px;color:var(--muted);font-size:10px}
      .servo-motion-status{max-width:38%;padding:3px 7px;border:1px solid var(--green);border-radius:999px;color:var(--green);font-size:10px;text-align:center;overflow-wrap:anywhere}
      .servo-profile-manager{display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,.85fr) minmax(0,1.25fr) auto;gap:7px;align-items:end;margin-bottom:7px}.servo-profile-manager label{min-width:0;display:grid;gap:3px;font-size:10px}.servo-profile-manager select,.servo-profile-manager input{width:100%;height:31px;padding:4px 6px}.servo-profile-manager textarea{width:100%;min-height:48px;max-height:64px;padding:5px 6px;resize:vertical}.servo-profile-actions{display:grid;grid-template-columns:1fr 1fr;gap:5px}.servo-profile-actions button{min-height:31px;padding:5px 8px}
      .servo-profile-summary{margin-bottom:7px;padding:6px 8px;border-left:2px solid var(--green);background:var(--input);font-size:9px;color:var(--muted)}.servo-motion-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}.servo-move-card{min-width:0;padding:6px 4px;border:1px solid var(--line);border-radius:7px;background:var(--panel-hi);cursor:pointer;overflow:hidden}.servo-move-card[aria-selected="true"]{border-color:var(--green);box-shadow:inset 0 0 0 1px var(--green)}.servo-move-code{display:inline-grid;place-items:center;width:22px;height:22px;margin-bottom:4px;border-radius:50%;background:var(--input);font-size:10px;font-weight:800}.servo-move-card strong,.servo-move-card small{display:block;overflow-wrap:anywhere}.servo-move-card strong{font-size:10px}.servo-move-card small{margin-top:2px;color:var(--muted);font-size:8px}
      .servo-motion-detail{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:7px;margin-top:7px}.servo-motion-detail>div{min-width:0;padding:8px;border:1px solid var(--line);border-radius:7px;background:var(--input)}.servo-motion-detail h3{margin:0 0 4px;font-size:12px}.servo-motion-detail p{margin:0 0 6px;font-size:10px}.servo-motion-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px}.servo-motion-meta span{padding:4px 5px;border-radius:5px;background:var(--panel);font-size:9px;overflow-wrap:anywhere}.servo-intent-output{display:flex;flex-wrap:wrap;gap:4px;min-height:26px;align-items:center;font-size:10px}.servo-intent-chip{padding:3px 6px;border:1px solid var(--line);border-radius:999px;background:var(--panel)}.servo-intent-error{color:#ff8181}
      #program{overflow-x:hidden}#program>table{width:100%;table-layout:fixed}#program>table th,#program>table td{font-size:10px;padding:4px 3px}#program>table input,#program>table select{min-width:0;width:100%;font-size:10px;padding:3px 4px}
      @media(max-width:1000px){.servo-profile-manager{grid-template-columns:repeat(2,minmax(0,1fr))}.servo-profile-actions{grid-column:1/-1}.servo-motion-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}@media(max-width:650px){.servo-motion-head,.servo-profile-manager,.servo-motion-detail{grid-template-columns:1fr;display:grid}.servo-motion-status{max-width:100%;justify-self:start}.servo-motion-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.servo-profile-actions{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function optionMarkup(selectedId) {
    return profiles().map((profile) => `<option value="${profile.id}"${profile.id === selectedId ? " selected" : ""}>${profile.name}${profile.builtIn ? "" : " (Custom)"}</option>`).join("");
  }

  function markup() {
    const driver = commandDriver();
    if (!driver?.listMoveDefinitions) return "";
    const selectedId = state.selectedMotionProfileId && profiles().some((profile) => profile.id === state.selectedMotionProfileId)
      ? state.selectedMotionProfileId : "automatic";
    const profile = selectedProfile(selectedId);
    const definition = driver.profileDefinition(machineProfile(profile));
    const cards = driver.listMoveDefinitions().map((move, index) => `
      <button class="servo-move-card" type="button" data-servo-move="${move.code}" aria-selected="${index === 0}">
        <span class="servo-move-code">${move.code}</span><strong>${move.name}</strong><small>${move.speedMode.replaceAll("-", " ")}</small>
      </button>`).join("");
    return `<section class="servo-motion-workbench" aria-label="Servo motion library">
      <div class="servo-motion-head"><div><h2>Motion Profile Manager</h2><p>Select, preview, save and remove motion profiles.</p></div><span class="servo-motion-status">${definition.name}</span></div>
      <div class="servo-profile-manager">
        <label>Motion profile<select id="motionProfileSelect">${optionMarkup(selectedId)}</select></label>
        <label>Custom profile name<input id="motionProfileName" type="text" placeholder="Profile name"></label>
        <label>Motion intent sequence<textarea id="servoIntentInput" placeholder="Hold, Rotate, Hold">${profile.intents.join(", ")}</textarea></label>
        <div class="servo-profile-actions"><button id="previewMotionProfile" type="button">Preview</button><button id="saveMotionProfile" type="button">Save Custom</button><button id="deleteMotionProfile" type="button">Delete Custom</button><button id="setDefaultMotionProfile" type="button">Set Default</button></div>
      </div>
      <div id="motionProfileSummary" class="servo-profile-summary">${profile.description}</div>
      <div class="servo-motion-grid">${cards}</div>
      <div class="servo-motion-detail"><div id="servoMoveDetail"></div><div><h3>Profile Preview</h3><div id="servoIntentOutput" class="servo-intent-output" aria-live="polite">Preview the selected profile to see its command plan.</div></div></div>
    </section>`;
  }

  function parseIntents(workbench) {
    return String(workbench.querySelector("#servoIntentInput")?.value || "").split(/[\n,;]+/).map((value) => value.trim()).filter(Boolean);
  }

  function renderMoveDetail(workbench, code) {
    const driver = commandDriver();
    const move = driver?.moveDefinition(code);
    const target = workbench.querySelector("#servoMoveDetail");
    if (!move || !target) return;
    const profile = selectedProfile(workbench.querySelector("#motionProfileSelect")?.value);
    const supported = driver.profileSupportsMove(machineProfile(profile), move.code);
    target.innerHTML = `<h3>CMD ${move.code} — ${move.name}</h3><p>${move.description}</p><div class="servo-motion-meta">
      <span>Starts stopped: <strong>${move.startsStopped === null ? "Profile-dependent" : move.startsStopped ? "Yes" : "No"}</strong></span>
      <span>Ends stopped: <strong>${move.endsStopped === null ? "Profile-dependent" : move.endsStopped ? "Yes" : "No"}</strong></span>
      <span>Speed: <strong>${move.speedMode.replaceAll("-", " ")}</strong></span><span>Profile support: <strong>${supported ? "Enabled" : "Reserved"}</strong></span></div>`;
  }

  function refreshSelection(workbench, profileId) {
    const profile = selectedProfile(profileId);
    state.selectedMotionProfileId = profile.id;
    const intentInput = workbench.querySelector("#servoIntentInput");
    const summary = workbench.querySelector("#motionProfileSummary");
    const nameInput = workbench.querySelector("#motionProfileName");
    if (intentInput) intentInput.value = profile.intents.join(", ");
    if (summary) summary.textContent = profile.description;
    if (nameInput) nameInput.value = profile.builtIn ? "" : profile.name;
    renderMoveDetail(workbench, workbench.querySelector('[data-servo-move][aria-selected="true"]')?.dataset.servoMove || 1);
  }

  function preview(workbench) {
    const driver = commandDriver();
    const profile = selectedProfile(workbench.querySelector("#motionProfileSelect")?.value);
    const output = workbench.querySelector("#servoIntentOutput");
    const result = parseIntents(workbench).map((intent) => {
      const command = driver.commandForIntent(intent, machineProfile(profile));
      const move = command ? driver.moveDefinition(command) : null;
      return command ? `<span class="servo-intent-chip">${intent} → ${command} ${move.name}</span>` : `<span class="servo-intent-chip servo-intent-error">${intent} → unsupported</span>`;
    });
    output.innerHTML = result.join("") || "No intents entered.";
  }

  function bind(workbench) {
    workbench.querySelectorAll("[data-servo-move]").forEach((card) => card.addEventListener("click", () => {
      workbench.querySelectorAll("[data-servo-move]").forEach((entry) => entry.setAttribute("aria-selected", String(entry === card)));
      renderMoveDetail(workbench, card.dataset.servoMove);
    }));
    workbench.querySelector("#motionProfileSelect")?.addEventListener("change", (event) => refreshSelection(workbench, event.currentTarget.value));
    workbench.querySelector("#previewMotionProfile")?.addEventListener("click", () => preview(workbench));
    workbench.querySelector("#saveMotionProfile")?.addEventListener("click", () => {
      const name = String(workbench.querySelector("#motionProfileName")?.value || "").trim();
      const intents = parseIntents(workbench);
      if (!name) return window.alert("Enter a custom profile name before saving.");
      if (!intents.length) return window.alert("Enter at least one motion intent before saving.");
      const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      saveCustomProfiles([...loadCustomProfiles(), { id, name, description: `Custom motion profile using ${intents.length} intent${intents.length === 1 ? "" : "s"}.`, machineProfile: activeMachineProfileName(), intents, builtIn: false, createdAt: new Date().toISOString() }]);
      state.selectedMotionProfileId = id;
      if (typeof saveCurrentSettings === "function") saveCurrentSettings();
      if (typeof render === "function") render();
    });
    workbench.querySelector("#deleteMotionProfile")?.addEventListener("click", () => {
      const profile = selectedProfile(workbench.querySelector("#motionProfileSelect")?.value);
      if (profile.builtIn) return window.alert("Built-in motion profiles cannot be deleted.");
      saveCustomProfiles(loadCustomProfiles().filter((entry) => entry.id !== profile.id));
      state.selectedMotionProfileId = "automatic";
      if (typeof saveCurrentSettings === "function") saveCurrentSettings();
      if (typeof render === "function") render();
    });
    workbench.querySelector("#setDefaultMotionProfile")?.addEventListener("click", () => {
      const profile = selectedProfile(workbench.querySelector("#motionProfileSelect")?.value);
      state.defaultMotionProfileId = profile.id;
      state.selectedMotionProfileId = profile.id;
      if (typeof saveCurrentSettings === "function") saveCurrentSettings();
      const summary = workbench.querySelector("#motionProfileSummary");
      if (summary) summary.textContent = `${profile.description} Default profile saved.`;
    });
    refreshSelection(workbench, state.selectedMotionProfileId || state.defaultMotionProfileId || "automatic");
    renderMoveDetail(workbench, 1);
  }

  function inject() {
    installStyles();
    const program = document.querySelector("#program");
    if (!program || program.querySelector(".servo-motion-workbench")) return;
    const content = markup();
    if (!content) return;
    program.insertAdjacentHTML("afterbegin", content);
    bind(program.querySelector(".servo-motion-workbench"));
  }

  function install() {
    if (typeof renderProgram !== "function") return false;
    const base = renderProgram;
    if (!base.motionProfileWorkbenchWrapped) {
      const wrapped = function renderProgramWithMotionProfileWorkbench(...args) {
        const result = base.apply(this, args);
        inject();
        return result;
      };
      wrapped.motionProfileWorkbenchWrapped = true;
      wrapped.originalRenderProgram = base;
      renderProgram = wrapped;
      global.renderProgram = wrapped;
    }
    return true;
  }

  global.LabelerMotionProfileWorkbench = Object.freeze({ install, inject, profiles, activeMachineProfileName });
  if (install()) inject();
  else window.setTimeout(() => { if (install()) inject(); }, 0);
})(window);
