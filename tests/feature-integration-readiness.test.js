"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function run() {
  const source = fs.readFileSync(path.join(__dirname, "../app/simulation-collapsible-integration.js"), "utf8");
  const appSource = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
  const geometry = deferred();
  const profile = deferred();
  const mapBuilder = deferred();
  const appended = [];
  const scripts = [];

  function createScript() {
    const listeners = new Map();
    return {
      dataset: {},
      src: "",
      async: true,
      addEventListener(type, callback) {
        listeners.set(type, callback);
      },
      dispatch(type) {
        listeners.get(type)?.();
      }
    };
  }

  const sandbox = {
    console,
    URL,
    Promise,
    queueMicrotask,
    setTimeout,
    clearTimeout,
    document: {
      scripts,
      createElement(tag) {
        assert.equal(tag, "script");
        return createScript();
      },
      body: {
        appendChild(script) {
          scripts.push(script);
          appended.push(script.src);
          queueMicrotask(() => script.dispatch("load"));
          return script;
        }
      }
    }
  };
  sandbox.window = sandbox;
  sandbox.location = { href: "https://example.test/labeler/index.html" };
  sandbox.ServoForgeGeometryPlanningReady = geometry.promise;
  sandbox.ServoForgeProfileGenerationReady = profile.promise;
  sandbox.ServoForgeMapBuilderReady = mapBuilder.promise;

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);

  await Promise.resolve();
  assert.equal(appended.length, 0, "feature modules must not load before runtime owners are ready");

  geometry.resolve();
  profile.resolve();
  await Promise.resolve();
  assert.equal(appended.length, 0, "all runtime owners must be ready before feature loading begins");

  mapBuilder.resolve();
  await sandbox.ServoForgeFeatureIntegrationsReady;

  assert.ok(appended.length > 30, "the complete feature manifest should load");
  assert.equal(appended.length, sandbox.LabelerIntegrationFeatureManifest.orderedModules.length);
  assert.match(appended[0], /drivers\/core\/driver-registry\.js/);
  assert.match(appended.at(-1), /optimizer-brush-channel-expansion-integration\.js/);

  const featureIndex = appSource.indexOf("ServoForgeFeatureIntegrationsReady");
  const mapIndex = appSource.indexOf("ServoForgeMapBuilderReady");
  const bootstrapIndex = appSource.indexOf("ServoForgeBootstrapReady");
  assert.ok(featureIndex > mapIndex, "startup must wait for Map Builder before feature integrations");
  assert.ok(featureIndex < bootstrapIndex, "feature integrations must finish before application bootstrap");

  console.log("Feature integration readiness regression passed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
