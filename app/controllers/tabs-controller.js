"use strict";

(function installTabsController(global) {
  const actions = global.LabelerWorkspaceActionService;

  function activate(tabName, tabElement = null) {
    actions.execute({
      mutate() {
        state.activeTab = tabName;
        document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
        document.querySelectorAll(".table-wrap").forEach((panel) => panel.classList.remove("active"));
        tabElement?.classList.add("active");
        document.querySelector(`#${tabName}`)?.classList.add("active");
      },
      persist: true,
      render: "all"
    });
  }

  global.LabelerTabsController = Object.freeze({ activate });
})(window);