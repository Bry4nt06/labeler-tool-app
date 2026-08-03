"use strict";

(function installMapLibraryService(global) {
  function mapLocationFor(map) {
    ensureSelectedZoneAndSite();
    const zone = zoneNames().includes(normalizedZoneSiteName(map?.zone))
      ? normalizedZoneSiteName(map.zone)
      : state.selectedZone;
    const sites = sitesForZone(zone);
    const site = sites.includes(normalizedZoneSiteName(map?.site))
      ? normalizedZoneSiteName(map.site)
      : sites[0] || "";
    return { zone, site };
  }

  function mapLocationLabel(map) {
    const { zone, site } = mapLocationFor(map);
    return `${zone || "No Zone"} / ${site || "No Site"}`;
  }

  function mapLibraryLocation() {
    ensureSelectedZoneAndSite();
    const active = state.mapLibrary.find((map) => map.id === state.activeMapId) || state.mapLibrary[0];
    const fallback = mapLocationFor(active);
    const requestedZone = normalizedZoneSiteName(state.mapLibraryZone);
    const zone = requestedZone === "ALL" || zoneNames().includes(requestedZone)
      ? normalizedZoneSiteName(state.mapLibraryZone)
      : fallback.zone;
    if (zone === "ALL") {
      state.mapLibraryZone = "ALL";
      state.mapLibrarySite = "";
      return { zone: "ALL", site: "" };
    }
    const sites = sitesForZone(zone);
    const site = sites.includes(normalizedZoneSiteName(state.mapLibrarySite))
      ? normalizedZoneSiteName(state.mapLibrarySite)
      : (sites.includes(fallback.site) ? fallback.site : sites[0] || "");
    state.mapLibraryZone = zone;
    state.mapLibrarySite = site;
    return { zone, site };
  }

  function mapsForMapLibraryLocation() {
    const location = mapLibraryLocation();
    if (location.zone === "ALL") return [...state.mapLibrary];
    return state.mapLibrary.filter((entry) => {
      const entryLocation = mapLocationFor(entry);
      return entryLocation.zone === location.zone && entryLocation.site === location.site;
    });
  }

  global.mapLocationFor = mapLocationFor;
  global.mapLocationLabel = mapLocationLabel;
  global.mapLibraryLocation = mapLibraryLocation;
  global.mapsForMapLibraryLocation = mapsForMapLibraryLocation;
  global.LabelerMapLibraryService = Object.freeze({
    mapLocationFor,
    mapLocationLabel,
    mapLibraryLocation,
    mapsForMapLibraryLocation
  });
})(typeof window !== "undefined" ? window : globalThis);
