"use strict";

(function installDriverRegistry(global) {
  if (global.LabelerDriverRegistry) return;

  const records = new Map();

  function normalizeName(name) {
    const value = String(name || "").trim();
    if (!value) throw new TypeError("Driver name is required.");
    return value;
  }

  function register(name, driver, options = {}) {
    const key = normalizeName(name);
    if (!driver) throw new TypeError(`Driver ${key} cannot be empty.`);
    const dependencies = [...new Set(Array.isArray(options.dependencies) ? options.dependencies.map(normalizeName) : [])];
    const previous = records.get(key);
    if (previous && previous.driver !== driver && options.replace !== true) {
      throw new Error(`Driver ${key} is already registered.`);
    }
    records.set(key, {
      name: key,
      driver,
      dependencies,
      source: String(options.source || previous?.source || "runtime"),
      legacyGlobal: String(options.legacyGlobal || previous?.legacyGlobal || ""),
      registeredAt: new Date().toISOString()
    });
    return driver;
  }

  function adopt(name, legacyGlobal, options = {}) {
    const driver = global[String(legacyGlobal || "")];
    if (!driver) return null;
    return register(name, driver, {
      ...options,
      replace: options.replace !== false,
      source: options.source || "legacy-global-bridge",
      legacyGlobal
    });
  }

  function has(name) {
    return records.has(String(name || "").trim());
  }

  function resolve(name) {
    return records.get(String(name || "").trim())?.driver || null;
  }

  function requireDriver(name) {
    const key = normalizeName(name);
    const record = records.get(key);
    if (!record) throw new Error(`Required driver ${key} is not registered.`);
    const missing = record.dependencies.filter((dependency) => !records.has(dependency));
    if (missing.length) throw new Error(`Driver ${key} is missing dependencies: ${missing.join(", ")}.`);
    return record.driver;
  }

  function describe(name) {
    const record = records.get(String(name || "").trim());
    return record ? { ...record, driver: undefined, available: true } : null;
  }

  function list() {
    return [...records.values()].map((record) => ({
      name: record.name,
      dependencies: [...record.dependencies],
      source: record.source,
      legacyGlobal: record.legacyGlobal,
      registeredAt: record.registeredAt,
      available: true,
      missingDependencies: record.dependencies.filter((dependency) => !records.has(dependency))
    })).sort((left, right) => left.name.localeCompare(right.name));
  }

  function dependencyGraph() {
    return Object.fromEntries(list().map((record) => [record.name, [...record.dependencies]]));
  }

  global.LabelerDriverRegistry = Object.freeze({
    register,
    adopt,
    has,
    resolve,
    require: requireDriver,
    describe,
    list,
    dependencyGraph
  });
})(window);
