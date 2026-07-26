"use strict";

(function installMechanicalEventMilestones() {
  const RELEASE_VERSION = "0.8.5";
  const RETRY_MS = 25;
  let installed = false;

  function activeMachineType() {
    const map = typeof activeMachineMap === "function" ? activeMachineMap() : null;
    return String(map?.machineType || map?.name || "TopModul");
  }

  function plannerOptions() {
    const map = typeof activeMachineMap === "function" ? activeMachineMap() : null;
    return {
      map,
      machineType: activeMachineType(),
      applicationMode: state.applicationMode,
      objects: map?.objects || [],
      aplObjects: state.aplMapObjects,
      coldGlueObjects: state.coldGlueMap
    };
  }

  function installMechanicalEventPlanner() {
    const planner = window.LabelerMechanicalEventPlannerDriver;
    if (!planner?.buildPlan) return false;

    window.LabelerMotionPlannerDriver = Object.freeze({
      ...planner,
      buildPlan(rows, options = {}) {
        return planner.buildPlan(rows, { ...plannerOptions(), ...options });
      },
      buildTimeline(rows, options = {}) {
        return planner.buildTimeline(rows, { ...plannerOptions(), ...options });
      }
    });
    return true;
  }

  function activeMechanicalPlan() {
    return state.motionTranslation?.plan
      || state.motionPlan?.planner
      || state.plannerPreview
      || null;
  }

  function syncMechanicalTimeline(plan = activeMechanicalPlan()) {
    if (!plan?.events?.length) return null;
    state.mechanicalTimeline = {
      source: plan.source || "mechanical-events",
      machineType: plan.machineType || activeMachineType(),
      applicationMode: plan.applicationMode || state.applicationMode,
      events: plan.events,
      processes: plan.processes || [],
      eventSummary: plan.eventSummary || {}
    };
    state.motionPlan = {
      ...(state.motionPlan || {}),
      planner: plan,
      mechanicalTimeline: state.mechanicalTimeline
    };
    return state.mechanicalTimeline;
  }

  function installStyles() {
    if (document.querySelector("#milestone67Styles")) return;
    const style = document.createElement("style");
    style.id = "milestone67Styles";
    style.textContent = `
      .mechanical-event-process { display:block;margin-top:2px;color:var(--muted);font-size:7px;font-weight:600;overflow-wrap:anywhere; }
    `;
    document.head.appendChild(style);
  }

  function decorateMechanicalTimeline() {
    const plan = activeMechanicalPlan();
    if (!plan?.steps?.length) return;
    syncMechanicalTimeline(plan);

    document.querySelectorAll(".mechanical-event").forEach((card, index) => {
      const step = plan.steps[index];
      if (!step) return;
      card.dataset.mechanicalEventId = step.eventId || "";
      card.dataset.processId = step.processId || "";
      card.dataset.aggregate = step.aggregate ?? "";
      card.dataset.section = step.section || "";
      card.dataset.eventType = step.eventType || "";

      const small = card.querySelector("small");
      if (small && step.processId && !small.querySelector(".mechanical-event-process")) {
        small.insertAdjacentHTML("beforeend", `<span class="mechanical-event-process">${step.processId}</span>`);
      }
    });
  }

  function installRenderDecoration() {
    if (typeof enhanceProgramWithMotionPlanner !== "function" || enhanceProgramWithMotionPlanner.mechanicalEvents) return;
    const before = enhanceProgramWithMotionPlanner;
    enhanceProgramWithMotionPlanner = function enhanceProgramWithMechanicalEvents(...args) {
      const output = before.apply(this, args);
      decorateMechanicalTimeline();
      return output;
    };
    enhanceProgramWithMotionPlanner.mechanicalEvents = true;
  }

  function install() {
    if (installed) return true;
    if (typeof state === "undefined"
      || !window.LabelerMechanicalEventPlannerDriver
      || typeof enhanceProgramWithMotionPlanner !== "function") return false;

    installed = true;
    installStyles();
    installMechanicalEventPlanner();
    installRenderDecoration();

    const versionMeta = document.querySelector('meta[name="application-version"]');
    if (versionMeta) versionMeta.content = RELEASE_VERSION;
    return true;
  }

  function waitForDependencies() {
    if (install()) return;
    window.setTimeout(waitForDependencies, RETRY_MS);
  }

  waitForDependencies();
})();
