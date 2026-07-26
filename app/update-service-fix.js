"use strict";

(function loadConsolidatedStagingUpdateManager() {
  if (document.querySelector('script[data-servoforge-update-manager="0.8.3"]')) return;
  const script = document.createElement("script");
  script.src = "app/update-manager.js?v=0.8.3";
  script.dataset.servoforgeUpdateManager = "0.8.3";
  script.addEventListener("load", () => {
    if (typeof registerToolUpdateService === "function") registerToolUpdateService();
  });
  document.head.appendChild(script);
})();

(function loadMilestonesSixAndSeven() {
  if (window.LabelerMechanicalEventPlannerDriver) return;
  const plannerScript = document.createElement("script");
  plannerScript.src = "drivers/planning/mechanical-event-planner-driver.js?v=0.8.3";
  plannerScript.addEventListener("load", () => {
    const integrationScript = document.createElement("script");
    integrationScript.src = "app/milestone-6-7-integration.js?v=0.8.3";
    document.head.appendChild(integrationScript);
  });
  document.head.appendChild(plannerScript);
})();
