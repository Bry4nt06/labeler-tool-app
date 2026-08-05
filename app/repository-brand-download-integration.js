"use strict";

(function installRepositoryBrandDownload(global) {
  if (global.LabelerRepositoryBrandDownload?.installed) return;

  const SOURCE = "./config/default-programs/label-specs.json";
  const BUTTON_ID = "downloadRepositoryBrands";
  const STATUS_ID = "repositoryBrandDownloadStatus";
  const key = (value) => String(value ?? "").trim().toLowerCase();
  const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
  const identity = (spec) => `${key(spec?.applicationMode || "apl")}|${key(spec?.brand)}`;

  function nextAvailableId(usedIds, startAt = 1) {
    let candidate = Math.max(1, Number(startAt) || 1);
    while (usedIds.has(candidate)) candidate += 1;
    usedIds.add(candidate);
    return candidate;
  }

  function mergeBrands(current, incoming) {
    const result = (Array.isArray(current) ? current : []).map(clone);
    const source = (Array.isArray(incoming) ? incoming : [])
      .filter((spec) => key(spec?.brand));
    const byIdentity = new Map(result.map((spec, index) => [identity(spec), index]));
    const usedIds = new Set(result.map((spec) => Number(spec?.id)).filter(Number.isInteger));
    let nextId = Math.max(0, ...usedIds) + 1;
    let added = 0;
    let updated = 0;

    source.forEach((raw) => {
      const entry = clone(raw);
      const brandIdentity = identity(entry);
      const existingIndex = byIdentity.get(brandIdentity);
      if (Number.isInteger(existingIndex)) {
        const existing = result[existingIndex];
        result[existingIndex] = {
          ...entry,
          id: Number.isInteger(Number(existing?.id)) ? Number(existing.id) : Number(entry.id),
          repositoryBrand: true,
          repositoryBrandSource: SOURCE
        };
        updated += 1;
        return;
      }

      const requestedId = Number(entry.id);
      let id;
      if (Number.isInteger(requestedId) && requestedId > 0 && !usedIds.has(requestedId)) {
        id = requestedId;
        usedIds.add(id);
      } else {
        id = nextAvailableId(usedIds, nextId);
        nextId = id + 1;
      }
      result.push({
        ...entry,
        id,
        repositoryBrand: true,
        repositoryBrandSource: SOURCE
      });
      byIdentity.set(brandIdentity, result.length - 1);
      added += 1;
    });

    return {
      items: result,
      added,
      updated,
      downloaded: source.length,
      total: result.length
    };
  }

  async function fetchRepositoryBrands() {
    const url = new URL(SOURCE, global.location?.href || "http://localhost/");
    url.searchParams.set("download", String(Date.now()));
    const response = await global.fetch(url.href, { cache: "no-store" });
    if (!response.ok) throw new Error(`Brand catalog returned ${response.status}.`);
    const brands = await response.json();
    if (!Array.isArray(brands)) throw new Error("The repository brand catalog is not a JSON array.");
    return brands;
  }

  async function downloadBrands() {
    if (typeof state === "undefined") throw new Error("ServoForge state is unavailable.");
    const brands = await fetchRepositoryBrands();
    const result = mergeBrands(state.labelSpecs, brands);
    state.labelSpecs = result.items;

    if (!state.labelSpecs.some((spec) => String(spec?.brand || "") === String(state.selectedBrand || ""))) {
      state.selectedBrand = brands[0]?.brand || state.labelSpecs[0]?.brand || "";
    }

    if (typeof global.saveCurrentSettings === "function") global.saveCurrentSettings();
    if (typeof global.applyGeneratedServoProfile === "function" && state.selectedBrand) {
      global.applyGeneratedServoProfile();
    }
    if (typeof global.render === "function") global.render();
    global.dispatchEvent?.(new CustomEvent("servoforge:repository-brands-downloaded", { detail: result }));
    return result;
  }

  function setStatus(message, stateName = "idle") {
    const status = global.document?.getElementById(STATUS_ID);
    if (!status) return;
    status.textContent = message;
    status.dataset.state = stateName;
  }

  function createControls() {
    const document = global.document;
    if (!document || document.getElementById(BUTTON_ID)) return true;
    const panel = document.querySelector(".top-settings-panel");
    if (!panel) return false;

    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.className = "secondary-button";
    button.textContent = "Download Brands";
    button.title = "Download every brand currently stored in the repository catalog.";

    const status = document.createElement("output");
    status.id = STATUS_ID;
    status.className = "update-check-status";
    status.setAttribute("aria-live", "polite");
    status.textContent = "Downloads and updates the repository brand catalog without removing local custom brands.";

    const importLabel = document.getElementById("importSettings")?.closest(".file-action");
    const insertBefore = importLabel?.nextSibling || document.getElementById("exportJson") || null;
    panel.insertBefore(button, insertBefore);
    panel.insertBefore(status, button.nextSibling);

    button.addEventListener("click", async () => {
      if (button.disabled) return;
      button.disabled = true;
      button.textContent = "Downloading Brands…";
      setStatus("Connecting to the repository brand catalog…", "working");
      try {
        const result = await downloadBrands();
        setStatus(
          `Downloaded ${result.downloaded} brands: ${result.added} added and ${result.updated} updated.`,
          "success"
        );
      } catch (error) {
        console.error("Unable to download repository brands.", error);
        setStatus(`Brand download failed: ${error.message}`, "error");
      } finally {
        button.disabled = false;
        button.textContent = "Download Brands";
      }
    });
    return true;
  }

  function installControls() {
    if (createControls()) return;
    global.setTimeout(installControls, 50);
  }

  global.LabelerRepositoryBrandDownload = Object.freeze({
    installed: true,
    SOURCE,
    BUTTON_ID,
    STATUS_ID,
    identity,
    mergeBrands,
    fetchRepositoryBrands,
    downloadBrands,
    createControls
  });

  if (global.document?.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", installControls, { once: true });
  } else installControls();
})(typeof window !== "undefined" ? window : globalThis);
