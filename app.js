"use strict";

function removeZoneSiteControls() {
  document.querySelector("#developerMenu")?.remove();
  document.querySelector("#mapZone")?.closest("label")?.remove();
  document.querySelector("#mapSite")?.closest("label")?.remove();
  document.querySelector("#buildInputs .zone-site-selection")?.remove();
}

// The map library is now a single list. Existing Zone/Site values remain in
// saved data only so older settings and exported maps can still be imported.
if (typeof mapsForMapLibraryLocation === "function") {
  mapsForMapLibraryLocation = () => [...state.mapLibrary];
}

// Build Inputs is rebuilt during normal rendering, so remove the obsolete
// location row every time that panel renders.
if (typeof renderBuildInputs === "function") {
  const renderBuildInputsBase = renderBuildInputs;
  renderBuildInputs = function renderBuildInputsWithoutZoneSite(...args) {
    const result = renderBuildInputsBase.apply(this, args);
    document.querySelector("#buildInputs .zone-site-selection")?.remove();
    return result;
  };
}

// Keep all map display switches together in Map Overlays.
const quadrantControl = document.querySelector("#showQuadrantReferences")?.closest("label");
const overlayPanel = document.querySelector(".map-overlay-control");
if (quadrantControl && overlayPanel) overlayPanel.appendChild(quadrantControl);

removeZoneSiteControls();
initializeLabelerApp();
removeZoneSiteControls();
