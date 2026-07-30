"use strict";

(function installOptimizerBrushChannelExpansion(global) {
  const RETRY_MS = 50;
  let installed = false;

  function finite(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function expandObjects(objects) {
    return (Array.isArray(objects) ? objects : []).flatMap((item, index) => {
      if (item?.kind !== "brush-channel") return [{ ...item }];
      const baseName = String(item.name || `Brush Channel ${index + 1}`);
      return [
        {
          ...item,
          id: `${item.id || `brush-channel-${index}`}-outer`,
          name: `${baseName} — Outside`,
          kind: "brush",
          side: "outer",
          start: finite(item.outerStart, item.start),
          end: finite(item.outerEnd, item.end)
        },
        {
          ...item,
          id: `${item.id || `brush-channel-${index}`}-inner`,
          name: `${baseName} — Inside`,
          kind: "brush",
          side: "inner",
          start: finite(item.innerStart, item.start),
          end: finite(item.innerEnd, item.end)
        }
      ];
    });
  }

  function mapForOptions(options = {}) {
    const map = options.map && typeof options.map === "object"
      ? options.map
      : typeof activeMachineMap === "function"
        ? activeMachineMap()
        : null;
    if (!map || !Array.isArray(map.objects) || !map.objects.some((item) => item?.kind === "brush-channel")) return options;
    const expanded = { ...map, objects: expandObjects(map.objects) };
    return { ...options, map: expanded, coldGlueObjects: expanded.objects };
  }

  function install() {
    if (installed) return true;
    const driver = global.LabelerProgramOptimizerDriver;
    if (!driver?.analyze || driver.brushChannelExpansionInstalled) return Boolean(driver?.brushChannelExpansionInstalled);
    const originalAnalyze = driver.analyze.bind(driver);
    global.LabelerProgramOptimizerDriver = Object.freeze({
      ...driver,
      brushChannelExpansionInstalled: true,
      analyze(rows, options = {}) {
        return originalAnalyze(rows, mapForOptions(options));
      }
    });
    installed = true;
    return true;
  }

  function wait() {
    if (install()) return;
    window.setTimeout(wait, RETRY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait, { once: true });
  else wait();
})(window);
