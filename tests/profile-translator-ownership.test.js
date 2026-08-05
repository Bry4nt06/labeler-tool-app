"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const service = read("app/profile-translation-service.js");
const validation = read("app/profile-translator-validation.js");
const ui = read("app/profile-translator-integration.js");
const loader = read("app/profile-generation.js");
const serviceWorker = read("service-worker.js");

assert.match(service, /function selectedProfile\(/);
assert.match(service, /function machineProfile\(/);
assert.match(service, /function syncTranslatedRows\(/);
assert.match(service, /function buildAndTranslateProgram\(/);
assert.match(service, /applyGeneratedServoProfileWithTranslationService/);
assert.match(service, /servoforge:profile-translated/);

assert.match(validation, /function installTranslatorAwareCommandValidation\(/);
assert.match(validation, /function installTranslatedResultValidation\(/);
assert.match(validation, /translatorAwareValidation/);
assert.match(validation, /validateWithTranslation/);
assert.doesNotMatch(validation, /buildAndTranslateProgram|syncTranslatedRows|applyGeneratedServoProfileWithTranslation/);

assert.match(ui, /function persistMotionProfileSelection\(/);
assert.match(ui, /function refreshTranslatorWorkbench\(/);
assert.match(ui, /ServoForgeProfileGenerationReady/);
assert.match(ui, /servoforge:profile-translated/);
assert.doesNotMatch(ui, /function buildAndTranslateProgram\(/);
assert.doesNotMatch(ui, /function syncTranslatedRows\(/);
assert.doesNotMatch(ui, /applyGeneratedServoProfileWithTranslation/);
assert.doesNotMatch(ui, /TRANSLATOR_RELEASE_VERSION|application-version|updateCheckStatus/);
assert.doesNotMatch(ui, /translatorAwareValidation|validateWithTranslation/);

const combined = [service, validation, ui].join("\n");
assert.equal((combined.match(/function buildAndTranslateProgram\(/g) || []).length, 1);
assert.equal((combined.match(/function syncTranslatedRows\(/g) || []).length, 1);
assert.equal((combined.match(/applyGeneratedServoProfileWithTranslationService/g) || []).length, 1);

assert.match(loader, /app\/profile-translation-service\.js/);
assert.match(loader, /app\/profile-translator-validation\.js/);
assert.ok(loader.indexOf("app/profile-translation-service.js") < loader.indexOf("app/profile-translator-validation.js"));
assert.match(serviceWorker, /app\/profile-translation-service\.js/);
assert.match(serviceWorker, /app\/profile-translator-validation\.js/);
assert.match(serviceWorker, /profile-translation-ownership-v1/);

console.log("Profile translator ownership regression passed.");
