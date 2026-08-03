"use strict";

(function installProfilePipelineDriver(global) {
  if (global.LabelerProfilePipelineDriver) return;

  const stages = new Map();

  function normalizedStage(stage = {}) {
    const id = String(stage.id || "").trim();
    if (!id) throw new Error("Profile pipeline stages require an id.");
    const process = stage.process || stage.handler;
    if (typeof process !== "function") {
      throw new Error(`Profile pipeline stage "${id}" requires a process function.`);
    }
    return Object.freeze({
      id,
      phase: String(stage.phase || "transform"),
      order: Number.isFinite(Number(stage.order)) ? Number(stage.order) : 1000,
      process,
      source: String(stage.source || ""),
      description: String(stage.description || ""),
      enabled: stage.enabled !== false
    });
  }

  function registerStage(stage) {
    const normalized = normalizedStage(stage);
    stages.set(normalized.id, normalized);
    return normalized;
  }

  function unregisterStage(id) {
    return stages.delete(String(id || ""));
  }

  function getStage(id) {
    return stages.get(String(id || "")) || null;
  }

  function listStages() {
    return [...stages.values()]
      .filter((stage) => stage.enabled)
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  }

  function run(sourceRows, context = {}) {
    const initial = Array.isArray(sourceRows) ? sourceRows : [];
    let rows = initial;
    const trace = [];

    listStages().forEach((stage) => {
      const beforeCount = Array.isArray(rows) ? rows.length : 0;
      const next = stage.process(rows, {
        ...context,
        stage,
        pipeline: api
      });
      if (!Array.isArray(next)) {
        throw new TypeError(`Profile pipeline stage "${stage.id}" did not return a row array.`);
      }
      rows = next;
      trace.push({
        id: stage.id,
        phase: stage.phase,
        order: stage.order,
        source: stage.source,
        beforeRows: beforeCount,
        afterRows: rows.length
      });
    });

    return {
      rows,
      trace,
      stageIds: trace.map((entry) => entry.id)
    };
  }

  function reset() {
    stages.clear();
  }

  const api = Object.freeze({
    registerStage,
    unregisterStage,
    getStage,
    listStages,
    run,
    reset
  });

  global.LabelerProfilePipelineDriver = api;
  global.LabelerDriverRegistry?.register("profile.pipeline", api, {
    dependencies: [],
    source: "drivers/profile/profile-pipeline-driver.js",
    replace: true
  });

  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
