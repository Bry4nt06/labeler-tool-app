"use strict";

function normalizedZoneSiteName(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9 _-]{0,19}$/.test(normalized) ? normalized : "";
}

function normalizeZoneSiteConfiguration(configuration) {
  const source = configuration && typeof configuration === "object" ? configuration : defaultZoneSiteConfiguration;
  const zones = {};
  Object.entries(source.zones && typeof source.zones === "object" ? source.zones : {}).forEach(([zone, sites]) => {
    const zoneName = normalizedZoneSiteName(zone);
    if (!zoneName || Object.hasOwn(zones, zoneName)) return;
    zones[zoneName] = [...new Set((Array.isArray(sites) ? sites : [])
      .map(normalizedZoneSiteName)
      .filter(Boolean))];
  });
  return { zones };
}

function zoneNames() {
  return Object.keys(normalizeZoneSiteConfiguration(state.zoneSiteConfiguration).zones);
}

function sitesForZone(zone) {
  return normalizeZoneSiteConfiguration(state.zoneSiteConfiguration).zones[normalizedZoneSiteName(zone)] || [];
}

function ensureSelectedZoneAndSite() {
  state.zoneSiteConfiguration = normalizeZoneSiteConfiguration(state.zoneSiteConfiguration);
  const zones = zoneNames();
  if (!zones.includes(state.selectedZone)) state.selectedZone = zones[0] || "";
  const sites = sitesForZone(state.selectedZone);
  if (!sites.includes(state.selectedSite)) state.selectedSite = sites[0] || "";
}

function zoneSiteConfigurationDocument() {
  return {
    format: "labeler-tool-zone-site-configuration",
    version: 1,
    exportedAt: new Date().toISOString(),
    zoneSiteConfiguration: normalizeZoneSiteConfiguration(state.zoneSiteConfiguration)
  };
}

function saveZoneSiteConfiguration() {
  ensureSelectedZoneAndSite();
  saveCurrentSettings();
}

function renderZoneSiteDeveloperMenu() {
  const editor = els.developerZoneSiteEditor;
  if (!editor) return;
  const zones = zoneNames();
  editor.innerHTML = `
    <div class="zone-site-editor-actions"><button id="addZone" type="button">Add Zone</button></div>
    <div class="zone-site-editor-list">${zones.map((zone) => `
      <section class="zone-site-editor-zone">
        <div class="zone-site-editor-zone-head"><strong>${zone}</strong><button type="button" class="secondary-button small-button" data-delete-zone="${zone}">Delete Zone</button></div>
        <div class="zone-site-editor-sites">${sitesForZone(zone).map((site) => `<span class="zone-site-chip">${site}<button type="button" aria-label="Remove ${site} from ${zone}" data-delete-site="${zone}" data-site="${site}">&times;</button></span>`).join("") || '<span class="zone-site-empty">No sites configured</span>'}</div>
        <form class="zone-site-add-site" data-zone="${zone}"><label>Add site <input name="site" maxlength="20" placeholder="Site code" autocomplete="off" /></label><button type="submit" class="secondary-button">Add Site</button></form>
      </section>`).join("") || '<p class="zone-site-empty">No zones configured. Add a zone to begin.</p>'}</div>`;

  editor.querySelector("#addZone")?.addEventListener("click", () => {
    const name = normalizedZoneSiteName(window.prompt("New zone code:"));
    if (!name) return;
    if (Object.hasOwn(state.zoneSiteConfiguration.zones, name)) return window.alert(`${name} already exists.`);
    state.zoneSiteConfiguration.zones[name] = [];
    state.selectedZone = name;
    state.selectedSite = "";
    saveZoneSiteConfiguration();
    renderZoneSiteDeveloperMenu();
    render();
  });
  editor.querySelectorAll("[data-delete-zone]").forEach((button) => button.addEventListener("click", () => {
    const zone = button.dataset.deleteZone;
    if (!window.confirm(`Remove ${zone} and all of its sites?`)) return;
    delete state.zoneSiteConfiguration.zones[zone];
    saveZoneSiteConfiguration();
    renderZoneSiteDeveloperMenu();
    render();
  }));
  editor.querySelectorAll("[data-delete-site]").forEach((button) => button.addEventListener("click", () => {
    const { deleteSite: zone, site } = button.dataset;
    state.zoneSiteConfiguration.zones[zone] = sitesForZone(zone).filter((entry) => entry !== site);
    saveZoneSiteConfiguration();
    renderZoneSiteDeveloperMenu();
    render();
  }));
  editor.querySelectorAll(".zone-site-add-site").forEach((form) => form.addEventListener("submit", (event) => {
    event.preventDefault();
    const zone = form.dataset.zone;
    const site = normalizedZoneSiteName(new FormData(form).get("site"));
    if (!site) return;
    if (sitesForZone(zone).includes(site)) return window.alert(`${site} is already configured for ${zone}.`);
    state.zoneSiteConfiguration.zones[zone].push(site);
    saveZoneSiteConfiguration();
    renderZoneSiteDeveloperMenu();
    render();
  }));
}

function importZoneSiteConfigurationFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const data = JSON.parse(String(reader.result));
      if (data?.format !== "labeler-tool-zone-site-configuration" || Number(data?.version) !== 1) throw new Error("This is not a Zone/Site configuration file.");
      state.zoneSiteConfiguration = normalizeZoneSiteConfiguration(data.zoneSiteConfiguration);
      saveZoneSiteConfiguration();
      renderZoneSiteDeveloperMenu();
      render();
      window.alert("Zone/Site configuration imported.");
    } catch (error) {
      window.alert(`Unable to import Zone/Site configuration: ${error.message}`);
    } finally {
      if (els.importZoneSiteConfig) els.importZoneSiteConfig.value = "";
    }
  });
  reader.readAsText(file);
}

function bindZoneSiteDeveloperMenu() {
  if (!els.developerMenu) return;
  renderZoneSiteDeveloperMenu();
  els.developerMenu.addEventListener("toggle", () => {
    if (els.developerMenu.open) renderZoneSiteDeveloperMenu();
  });
  els.exportZoneSiteConfig?.addEventListener("click", () => {
    download("labeler-zone-site-configuration.json", "application/json", JSON.stringify(zoneSiteConfigurationDocument(), null, 2));
  });
  els.importZoneSiteConfig?.addEventListener("change", () => importZoneSiteConfigurationFile(els.importZoneSiteConfig.files?.[0]));
}
