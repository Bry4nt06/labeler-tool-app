(function (global) {
  "use strict";

  const families = {
    apl: ["rollers", "pads"],
    "cold-glue": ["rollers", "brushes"]
  };

  function allowedFamilies(mode, station) {
    if (mode === "cold-glue") return ["rollers", "brushes"];
    return Number(station) <= 2 ? ["rollers", "pads"] : ["pads"];
  }

  function isAllowed(mode, station, type) {
    return allowedFamilies(mode, station).includes(type);
  }

  global.LabelerApplicationModeDriver = { families, allowedFamilies, isAllowed };
})(window);
