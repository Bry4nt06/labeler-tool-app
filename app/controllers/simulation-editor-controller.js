"use strict";

(function installSimulationEditorController(global) {
  const actions = global.LabelerWorkspaceActionService;

  function line(sourceIndex) {
    const index = Number(sourceIndex);
    return Number.isInteger(index) ? state.simulation?.lines?.[index] : null;
  }

  function renderAll(mutate) {
    return actions.execute({ mutate, render: "all" });
  }

  function updateCommand(sourceIndex, value) {
    if (!line(sourceIndex)) return;
    renderAll(() => actions.call("setSimulationCommand", Number(sourceIndex), value));
  }

  function updateTableAngle(sourceIndex, value) {
    const current = line(sourceIndex);
    if (!current) return;
    renderAll(() => {
      state.simulation.useCustom = true;
      state.simulation.lines[sourceIndex] = {
        ...current,
        tableAngle: actions.number(value, current.tableAngle)
      };
    });
  }

  function updatePlateAngle(sourceIndex, value) {
    const current = line(sourceIndex);
    if (!current) return;
    renderAll(() => {
      state.simulation.useCustom = true;
      state.simulation.lines[sourceIndex] = {
        ...current,
        plateAngle: value === "" ? null : actions.number(value, current.plateAngle)
      };
    });
  }

  function updateAction(sourceIndex, value) {
    const current = line(sourceIndex);
    if (!current) return;
    state.simulation.useCustom = true;
    state.simulation.lines[sourceIndex] = { ...current, action: String(value ?? "") };
    actions.render(["map", "simulation-map"]);
  }

  function deleteLine(sourceIndex) {
    if (!line(sourceIndex)) return;
    renderAll(() => actions.call("deleteSimulationLine", Number(sourceIndex)));
  }

  function addLineBeforeEnd() {
    renderAll(() => actions.call("addSimulationLineBeforeEnd"));
  }

  function profileContext() {
    const map = actions.call("activeMachineMap");
    return {
      mapId: map?.id || state.activeMapId || "",
      mapName: map?.name || "Unnamed Map",
      brand: state.selectedBrand || "Unspecified brand",
      bottleType: state.selectedBottle || "Unspecified bottle",
      applicationMode: state.applicationMode || "apl"
    };
  }

  function saveProfile(nameValue, descriptionValue) {
    const name = String(nameValue || "").trim();
    if (!name) {
      global.alert("Enter a profile name before saving.");
      document.querySelector("#servoProfileName")?.focus();
      return;
    }
    actions.execute({
      mutate() {
        const profile = {
          id: `servo-profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name,
          description: String(descriptionValue || "").trim(),
          savedAt: new Date().toISOString(),
          ...profileContext(),
          simulation: actions.call("deepClone", state.simulation) || JSON.parse(JSON.stringify(state.simulation))
        };
        if (!Array.isArray(state.servoProfileLibrary)) state.servoProfileLibrary = [];
        state.servoProfileLibrary.push(profile);
        state.activeServoProfileId = profile.id;
      },
      persist: true,
      render: "all"
    });
  }

  function selectProfile(profileId) {
    state.activeServoProfileId = String(profileId || "");
    actions.render("simulation");
  }

  function loadProfile(profileId) {
    const profile = state.servoProfileLibrary?.find((entry) => entry.id === profileId);
    if (!profile) return;
    if (!profile.simulation || typeof profile.simulation !== "object") {
      global.alert("This older profile does not contain custom simulation settings.");
      return;
    }
    const map = state.mapLibrary.find((entry) => entry.id === profile.mapId);
    if (!map) {
      global.alert(`The saved map “${profile.mapName || "Unknown"}” is no longer available.`);
      return;
    }
    actions.execute({
      mutate() {
        actions.call("loadMachineMapIntoRuntime", map, false);
        if (profile.applicationMode) state.applicationMode = profile.applicationMode;
        if (state.labelSpecs.some((entry) => entry.brand === profile.brand)) state.selectedBrand = profile.brand;
        if (state.bottleSpecs.some((entry) => entry.bottleType === profile.bottleType)) state.selectedBottle = profile.bottleType;
        state.simulation = actions.call("deepClone", profile.simulation) || JSON.parse(JSON.stringify(profile.simulation));
        actions.call("ensureSimulationRows");
        state.activeServoProfileId = profile.id;
      },
      persist: true,
      render: "all"
    });
  }

  function deleteProfile(profileId) {
    const profile = state.servoProfileLibrary?.find((entry) => entry.id === profileId);
    if (!profile || !global.confirm(`Delete saved servo profile “${profile.name}”?`)) return;
    actions.execute({
      mutate() {
        state.servoProfileLibrary = state.servoProfileLibrary.filter((entry) => entry.id !== profileId);
        if (state.activeServoProfileId === profileId) state.activeServoProfileId = "";
      },
      persist: true,
      render: "all"
    });
  }

  global.LabelerSimulationEditorController = Object.freeze({
    updateCommand,
    updateTableAngle,
    updatePlateAngle,
    updateAction,
    deleteLine,
    addLineBeforeEnd,
    saveProfile,
    selectProfile,
    loadProfile,
    deleteProfile
  });
})(window);
