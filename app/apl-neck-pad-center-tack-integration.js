"use strict";

(function installAplNeckPadCenterTackIntegration() {
  const RETRY_MS = 50;
  let installed = false;

  function explicitSections(machineMap) {
    const source = machineMap?.stationSections && typeof machineMap.stationSections === "object"
      ? machineMap.stationSections
      : {};
    const result = {};
    Object.entries(source).forEach(([station, section]) => {
      if (["neck", "body", "back", "none"].includes(section)) result[String(station)] = section;
    });
    return result;
  }

  function installedApplicationStations(machineMap) {
    return [...new Set((machineMap?.objects || [])
      .filter((item) => item?.kind === "roller" || item?.kind === "pad")
      .filter((item) => typeof isStationEnabled !== "function" || isStationEnabled(machineMap, Number(item.station)))
      .map((item) => Number(item.station))
      .filter((station) => Number.isFinite(station) && station >= 1 && station <= 6))]
      .sort((a, b) => a - b);
  }

  function stationOwnedSection(station) {
    const number = Number(station);
    if (number <= 2) return "neck";
    if (number <= 4) return "body";
    return "back";
  }

  function inferSections(machineMap) {
    if (!machineMap || machineMap.applicationMode !== "apl") return {};
    const result = explicitSections(machineMap);
    const installed = installedApplicationStations(machineMap);

    // Three-application machines may use sparse physical stations such as
    // 1/3/5. Preserve their physical order as Neck, Body, Back.
    if (installed.length === 3) {
      ["neck", "body", "back"].forEach((section, index) => {
        const station = installed[index];
        if (station && !result[String(station)]) result[String(station)] = section;
      });
      return result;
    }

    // On conventional paired APL layouts, the label section belongs to the
    // physical station pair—not to the installed wipe hardware. A wipe-down
    // pad in Station 1 or 2 therefore remains a Neck center-tack station.
    installed.forEach((station) => {
      if (!result[String(station)]) result[String(station)] = stationOwnedSection(station);
    });
    return result;
  }

  function singleSidedNeckPadStations(machineMap) {
    const sections = inferSections(machineMap);
    const result = [];
    installedApplicationStations(machineMap).forEach((station) => {
      if (sections[String(station)] !== "neck") return;
      const pads = (machineMap.objects || []).filter((item) => item?.kind === "pad" && Number(item.station) === station);
      if (!pads.length) return;
      const outside = pads.some((item) => item.side !== "inner");
      const inside = pads.some((item) => item.side === "inner");
      if (!outside || !inside) result.push({ station, pads, outside, inside });
    });
    return result;
  }

  function install() {
    if (installed) return true;
    if (typeof window.inferAplStationSections !== "function"
      || typeof window.generatedAplMapDrivenProfile !== "function") return false;

    installed = true;
    const baseGenerate = window.generatedAplMapDrivenProfile;

    window.inferAplStationSections = inferSections;
    // Keep identifier-based calls in older classic scripts synchronized with
    // the replaced global function binding.
    try { inferAplStationSections = inferSections; } catch { /* global property is sufficient */ }

    window.generatedAplMapDrivenProfile = function generatedAplMapDrivenProfileWithNeckPads(machineMap) {
      const singleSided = singleSidedNeckPadStations(machineMap);
      const temporary = [];

      // The legacy pad branch split one physical pad into two virtual halves.
      // For Neck center-tack wiping that is mechanically invalid. Route a
      // single-sided pad through the two-surface branch so only its real side
      // moves and the missing opposite side is reported.
      singleSided.forEach(({ pads }) => {
        pads.forEach((pad) => {
          temporary.push({ pad, kind: pad.kind, wipeSpanDeg: pad.wipeSpanDeg });
          pad.kind = "roller";
          pad.wipeSpanDeg = Math.max(0.1, Number(pad.end) - Number(pad.start));
        });
      });

      try {
        const rows = baseGenerate(machineMap);
        if (state?.motionPlan) {
          state.motionPlan.profileVariant = "apl-neck-pad-center-tack-v1";
          state.motionPlan.stationPlans?.forEach((plan) => {
            if (inferSections(machineMap)[String(plan.station)] === "neck") {
              plan.section = "neck";
              plan.centerTack = true;
              plan.hardwareIndependentSection = true;
            }
          });
          state.motionPlan.issues = (state.motionPlan.issues || []).map((issue) => {
            if (issue?.code !== "apl-neck-roller-side-missing") return issue;
            const missing = singleSided.find((entry) => Number(entry.station) === Number(issue.station));
            if (!missing) return issue;
            return {
              ...issue,
              code: "apl-neck-pad-side-missing",
              message: `Station ${issue.station} is a Neck center-tack station and requires both an outside and inside wipe-down pad. Add the ${missing.outside ? "inside" : "outside"} pad so each label wing is wiped from the center toward its edge using the pad's actual table-contact window.`
            };
          });
        }
        return rows.map((row) => ({
          ...row,
          profileVariant: row.profileVariant || "apl-neck-pad-center-tack-v1"
        }));
      } finally {
        temporary.forEach(({ pad, kind, wipeSpanDeg }) => {
          pad.kind = kind;
          if (wipeSpanDeg === undefined) delete pad.wipeSpanDeg;
          else pad.wipeSpanDeg = wipeSpanDeg;
        });
      }
    };
    try { generatedAplMapDrivenProfile = window.generatedAplMapDrivenProfile; } catch { /* global property is sufficient */ }

    if (typeof renderWipeDownBuilder === "function") renderWipeDownBuilder();
    if (typeof applyGeneratedServoProfile === "function") applyGeneratedServoProfile();
    if (typeof render === "function") render();
    return true;
  }

  function wait() {
    if (install()) return;
    window.setTimeout(wait, RETRY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait, { once: true });
  else wait();
})();
