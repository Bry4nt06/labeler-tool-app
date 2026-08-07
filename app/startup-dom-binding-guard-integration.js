"use strict";

(function installStartupDomBindingGuard(global) {
  if (global.LabelerStartupDomBindingGuard?.installed) return;

  if (typeof els === "undefined" || !els || typeof els !== "object") {
    throw new Error("ServoForge DOM binding registry is not available.");
  }

  const REQUIRED_BINDINGS = Object.freeze({
    bottleSpecs: "#bottleSpecs",
    labelSpecs: "#labelSpecs",
    buildInputs: "#buildInputs",
    program: "#program",
    simulation: "#simulation",
    heads: "#heads",
    stations: "#stations"
  });

  const repaired = [];
  const missing = [];

  Object.entries(REQUIRED_BINDINGS).forEach(([name, selector]) => {
    if (!els[name]) {
      const element = document.querySelector(selector);
      if (element) {
        els[name] = element;
        repaired.push(name);
      }
    }
    if (!els[name]) missing.push(`${name} (${selector})`);
  });

  if (missing.length) {
    throw new Error(`ServoForge startup DOM bindings are missing: ${missing.join(", ")}`);
  }

  // Some modular controllers intentionally reference the binding registry from
  // window while legacy renderers use the shared global lexical `els` object.
  // Publish the same object so both paths resolve identical DOM nodes.
  global.els = els;

  global.LabelerStartupDomBindingGuard = Object.freeze({
    installed: true,
    version: 1,
    requiredBindings: REQUIRED_BINDINGS,
    repaired: Object.freeze([...repaired])
  });
})(window);
