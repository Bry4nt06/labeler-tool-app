(function (global) {
  "use strict";

  const LEVELS = Object.freeze({ PASS: "pass", REVIEW: "review", FAIL: "fail" });
  const DEFAULT_TIMEOUT_MS = 8000;
  const DEFAULT_REQUIRED_GLOBALS = Object.freeze([
    "LabelerGeometryDriver",
    "LabelerServoCommandDriver",
    "LabelerMechanicalEventPlannerDriver",
    "LabelerMachineFamilyGrammarDriver",
    "LabelerServoPipelineValidator",
    "LabelerServoReplayDriver",
    "LabelerProgramOptimizerDriver"
  ]);
  const DEFAULT_CRITICAL_ASSETS = Object.freeze([
    "./index.html",
    "./styles.css",
    "./update-manifest.json",
    "./service-worker.js",
    "./manifest.webmanifest",
    "./release-notes.json",
    "./app/defaults.js",
    "./app/persistence.js",
    "./app/profile-generation.js",
    "./app/simulation-engine.js",
    "./app/map-rendering.js",
    "./app/table-rendering.js",
    "./app/bootstrap.js",
    "./app/servo-pipeline-validator-integration.js",
    "./app/machine-family-grammar-integration.js",
    "./app/machine-terminal-policy-integration.js",
    "./app/topmodul-double-correction-integration.js",
    "./app/servo-replay-integration.js",
    "./app/program-optimizer-integration.js",
    "./drivers/validation/machine-family-grammar-driver.js",
    "./drivers/simulation/servo-replay-driver.js",
    "./drivers/optimization/program-optimizer-driver.js",
    "./drivers/quality/release-readiness-driver.js",
    "./app/release-readiness-integration.js",
    "./app.js"
  ]);

  function number(value, fallback = null) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function text(value, fallback = "") {
    const resolved = String(value ?? "").trim();
    return resolved || fallback;
  }

  function clone(value) {
    if (typeof structuredClone === "function") {
      try { return structuredClone(value); } catch { /* fall through */ }
    }
    return JSON.parse(JSON.stringify(value));
  }

  function versionParts(value) {
    return text(value, "0").split(".").map((part) => Number.parseInt(part, 10) || 0);
  }

  function compareVersions(left, right) {
    const a = versionParts(left);
    const b = versionParts(right);
    for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
      const av = a[index] || 0;
      const bv = b[index] || 0;
      if (av !== bv) return av > bv ? 1 : -1;
    }
    return 0;
  }

  function result(id, category, level, message, details = {}) {
    return {
      id,
      category,
      level,
      message,
      ...details
    };
  }

  function summarize(results) {
    const summary = { pass: 0, review: 0, fail: 0, total: 0 };
    const categories = {};
    (Array.isArray(results) ? results : []).forEach((item) => {
      const level = Object.values(LEVELS).includes(item?.level) ? item.level : LEVELS.REVIEW;
      const category = item?.category || "general";
      summary[level] += 1;
      summary.total += 1;
      categories[category] ||= { pass: 0, review: 0, fail: 0, total: 0 };
      categories[category][level] += 1;
      categories[category].total += 1;
    });
    return {
      summary,
      categories,
      status: summary.fail ? "FAIL" : summary.review ? "REVIEW" : "PASS"
    };
  }

  function uniqueDuplicates(values) {
    const seen = new Set();
    const duplicates = new Set();
    values.map((value) => text(value).toLowerCase()).filter(Boolean).forEach((value) => {
      if (seen.has(value)) duplicates.add(value);
      seen.add(value);
    });
    return [...duplicates];
  }

  function currentVersion(options = {}) {
    return text(
      options.expectedVersion
      || global.SERVOFORGE_RELEASE_VERSION
      || document.querySelector('meta[name="application-version"]')?.content,
      "0.0.0"
    );
  }

  function activeMap(options = {}) {
    if (options.map) return options.map;
    if (typeof options.activeMachineMap === "function") return options.activeMachineMap();
    if (typeof global.activeMachineMap === "function") return global.activeMachineMap();
    const state = options.state || global.state;
    return state?.mapLibrary?.find((map) => map.id === state.activeMapId) || state?.mapLibrary?.[0] || null;
  }

  function machineFamily(options = {}, rows = null) {
    const map = activeMap(options);
    const grammar = global.LabelerMachineFamilyGrammarDriver;
    const context = {
      rows: rows || options.state?.program || global.state?.program || [],
      map,
      machineType: map?.machineType || map?.name || "",
      machineProfile: options.machineProfile || "",
      applicationMode: options.state?.applicationMode || global.state?.applicationMode || map?.applicationMode || ""
    };
    if (grammar?.resolveFamily) return text(grammar.resolveFamily(context), "DEFAULT").toUpperCase();
    const machine = text(context.machineType).toUpperCase();
    if (machine.includes("TOPMODUL")) return "TOPMODUL";
    if (machine.includes("AUTOCOL")) return "AUTOCOL";
    if (machine.includes("MULTIMODUL")) return "MULTIMODUL";
    return "DEFAULT";
  }

  function scriptVersionReport(expectedVersion) {
    const sources = [
      ...document.querySelectorAll('script[src*="?v="]'),
      ...document.querySelectorAll('link[rel="stylesheet"][href*="?v="]')
    ].map((node) => node.src || node.href).filter(Boolean);
    const versions = sources.map((source) => {
      try { return new URL(source, location.href).searchParams.get("v") || ""; } catch { return ""; }
    }).filter(Boolean);
    const mismatches = sources.filter((source, index) => versions[index] && versions[index] !== expectedVersion);
    return {
      sources,
      versions: [...new Set(versions)],
      mismatches
    };
  }

  function checkVersionAlignment(options, results) {
    const expected = currentVersion(options);
    const metaVersion = text(document.querySelector('meta[name="application-version"]')?.content);
    const runtimeVersion = text(global.SERVOFORGE_RELEASE_VERSION);
    const report = scriptVersionReport(expected);

    if (metaVersion !== expected) {
      results.push(result("version-meta", "release", LEVELS.FAIL, `Application metadata reports ${metaVersion || "no version"}; expected ${expected}.`, { expected, actual: metaVersion }));
    } else {
      results.push(result("version-meta", "release", LEVELS.PASS, `Application metadata is aligned to ${expected}.`));
    }

    if (runtimeVersion && runtimeVersion !== expected) {
      results.push(result("version-runtime", "release", LEVELS.FAIL, `Runtime release manager reports ${runtimeVersion}; expected ${expected}.`, { expected, actual: runtimeVersion }));
    } else {
      results.push(result("version-runtime", "release", LEVELS.PASS, `Runtime release manager is aligned to ${expected}.`));
    }

    if (report.mismatches.length) {
      results.push(result("version-assets", "release", LEVELS.FAIL, `${report.mismatches.length} loaded asset${report.mismatches.length === 1 ? " is" : "s are"} using a cache version other than ${expected}.`, { expected, mismatches: report.mismatches }));
    } else if (!report.sources.length) {
      results.push(result("version-assets", "release", LEVELS.REVIEW, "No versioned application assets were detected in the current shell."));
    } else {
      results.push(result("version-assets", "release", LEVELS.PASS, `${report.sources.length} loaded versioned assets are aligned to ${expected}.`));
    }
  }

  function checkRequiredRuntime(options, results) {
    const required = options.requiredGlobals || DEFAULT_REQUIRED_GLOBALS;
    const missing = required.filter((name) => !global[name]);
    if (missing.length) {
      results.push(result("runtime-dependencies", "runtime", LEVELS.FAIL, `Missing required runtime module${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`, { missing }));
    } else {
      results.push(result("runtime-dependencies", "runtime", LEVELS.PASS, `${required.length} required runtime modules are available.`));
    }

    const requiredFunctions = [
      "settingsSnapshot",
      "saveCurrentSettings",
      "programSegments",
      "render",
      "renderProgram",
      "renderSimulation",
      "renderValidation"
    ];
    const missingFunctions = requiredFunctions.filter((name) => typeof global[name] !== "function");
    if (missingFunctions.length) {
      results.push(result("runtime-functions", "runtime", LEVELS.FAIL, `Missing required application function${missingFunctions.length === 1 ? "" : "s"}: ${missingFunctions.join(", ")}.`, { missing: missingFunctions }));
    } else {
      results.push(result("runtime-functions", "runtime", LEVELS.PASS, "Core render, persistence, and servo-program functions are available."));
    }

    const startupError = document.querySelector(".startup-error");
    if (startupError) {
      results.push(result("runtime-startup", "runtime", LEVELS.FAIL, `The application reported a startup error: ${text(startupError.textContent, "Unknown startup error")}.`));
    } else {
      results.push(result("runtime-startup", "runtime", LEVELS.PASS, "No startup error is present in the application shell."));
    }
  }

  function checkStorageAndExport(options, results) {
    const state = options.state || global.state;
    const snapshotFunction = options.settingsSnapshot || global.settingsSnapshot;
    if (!state || typeof snapshotFunction !== "function") {
      results.push(result("settings-roundtrip", "persistence", LEVELS.FAIL, "Settings state or settingsSnapshot() is unavailable."));
      return;
    }

    try {
      const snapshot = snapshotFunction();
      const serialized = JSON.stringify(snapshot);
      const restored = JSON.parse(serialized);
      const mapCountMatches = (restored.mapLibrary?.length || 0) === (state.mapLibrary?.length || 0);
      const bottleCountMatches = (restored.bottleSpecs?.length || 0) === (state.bottleSpecs?.length || 0);
      const labelCountMatches = (restored.labelSpecs?.length || 0) === (state.labelSpecs?.length || 0);
      const activeMapMatches = restored.activeMapId === state.activeMapId;
      if (!mapCountMatches || !bottleCountMatches || !labelCountMatches || !activeMapMatches) {
        results.push(result("settings-roundtrip", "persistence", LEVELS.FAIL, "Portable settings JSON does not preserve map/spec counts or the active map reference.", {
          mapCountMatches,
          bottleCountMatches,
          labelCountMatches,
          activeMapMatches
        }));
      } else {
        results.push(result("settings-roundtrip", "persistence", LEVELS.PASS, `Settings export round-trip preserved ${restored.mapLibrary.length} map${restored.mapLibrary.length === 1 ? "" : "s"}, ${restored.bottleSpecs.length} bottle specs, and ${restored.labelSpecs.length} label specs.`));
      }
    } catch (error) {
      results.push(result("settings-roundtrip", "persistence", LEVELS.FAIL, `Settings export could not be serialized and restored: ${error.message}.`));
    }

    const probeKey = `servoforge-readiness-probe-${Date.now()}`;
    try {
      localStorage.setItem(probeKey, "ok");
      const readable = localStorage.getItem(probeKey) === "ok";
      localStorage.removeItem(probeKey);
      results.push(result("storage-write", "persistence", readable ? LEVELS.PASS : LEVELS.FAIL, readable
        ? "Browser storage passed a write/read/delete probe."
        : "Browser storage did not return the value written by the readiness probe."));
    } catch (error) {
      results.push(result("storage-write", "persistence", LEVELS.FAIL, `Browser storage is unavailable: ${error.message}.`));
    }

    const segmentFunction = options.programSegments || global.programSegments;
    const rows = typeof segmentFunction === "function" ? segmentFunction(state.program || []) : (state.program || []);
    try {
      const header = ["HMI", "PLC", "CMD", "Table Angle", "Bottle Angle", "Table Travel", "Bottle Travel", "Action"];
      const csvRows = [header, ...rows.map((row) => [row.hmi, row.plc, row.cmd, row.tableAngle, row.plateAngle, row.tableTravel, row.plateTravel, row.action])];
      const csv = csvRows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
      const lineCount = csv.split("\n").length;
      const valid = lineCount === rows.length + 1 && !/\bundefined\b/.test(csv);
      results.push(result("csv-roundtrip", "persistence", valid ? LEVELS.PASS : LEVELS.FAIL, valid
        ? `CSV export shape is valid for ${rows.length} servo row${rows.length === 1 ? "" : "s"}.`
        : "CSV export shape contains an undefined value or an incorrect row count."));
    } catch (error) {
      results.push(result("csv-roundtrip", "persistence", LEVELS.FAIL, `CSV export validation failed: ${error.message}.`));
    }
  }

  function checkLibraryIntegrity(options, results) {
    const state = options.state || global.state;
    if (!state) return;
    const bottles = Array.isArray(state.bottleSpecs) ? state.bottleSpecs : [];
    const labels = Array.isArray(state.labelSpecs) ? state.labelSpecs : [];

    if (!bottles.length || !labels.length) {
      results.push(result("spec-libraries", "data", LEVELS.FAIL, "Bottle and label specification libraries must both contain at least one record."));
      return;
    }

    const bottleDuplicates = uniqueDuplicates(bottles.map((item) => item.id || item.bottleType));
    const bottleNameDuplicates = uniqueDuplicates(bottles.map((item) => item.bottleType));
    const labelDuplicates = uniqueDuplicates(labels.map((item) => item.id || `${item.brand}|${item.bottleType}|${item.applicationMode}`));
    const labelNameDuplicates = uniqueDuplicates(labels.map((item) => `${item.brand}|${item.bottleType}|${item.applicationMode}`));
    const duplicates = [...bottleDuplicates, ...bottleNameDuplicates, ...labelDuplicates, ...labelNameDuplicates];
    if (duplicates.length) {
      results.push(result("spec-uniqueness", "data", LEVELS.FAIL, `Specification libraries contain duplicate identifiers or names: ${[...new Set(duplicates)].join(", ")}.`, { duplicates: [...new Set(duplicates)] }));
    } else {
      results.push(result("spec-uniqueness", "data", LEVELS.PASS, `${bottles.length} bottle specs and ${labels.length} label specs have unique identities.`));
    }

    const invalidBottle = bottles.find((item) => !text(item?.bottleType) || number(item?.diameterTargetMm) === null || number(item?.diameterTargetMm) <= 0);
    const invalidLabel = labels.find((item) => !text(item?.brand) || !text(item?.bottleType) || !["apl", "cold-glue"].includes(text(item?.applicationMode, "apl")));
    if (invalidBottle || invalidLabel) {
      results.push(result("spec-shape", "data", LEVELS.FAIL, "One or more bottle or label specification records are incomplete or invalid.", { invalidBottle, invalidLabel }));
    } else {
      results.push(result("spec-shape", "data", LEVELS.PASS, "Specification records contain valid names, applications, and bottle geometry."));
    }

    const selectedBottle = bottles.some((item) => item.bottleType === state.selectedBottle);
    const selectedLabel = labels.some((item) => item.brand === state.selectedBrand);
    if (!selectedBottle || !selectedLabel) {
      results.push(result("spec-selection", "data", LEVELS.REVIEW, "The selected bottle or brand no longer exists in the active specification libraries.", { selectedBottle, selectedLabel }));
    } else {
      results.push(result("spec-selection", "data", LEVELS.PASS, "The selected bottle and brand resolve to saved specification records."));
    }
  }

  function checkMapIntegrity(options, results) {
    const state = options.state || global.state;
    const maps = Array.isArray(state?.mapLibrary) ? state.mapLibrary : [];
    if (!maps.length) {
      results.push(result("map-library", "maps", LEVELS.FAIL, "No machine maps are available."));
      return;
    }

    const duplicateIds = uniqueDuplicates(maps.map((map) => map.id));
    if (duplicateIds.length) {
      results.push(result("map-identities", "maps", LEVELS.FAIL, `Machine map IDs are duplicated: ${duplicateIds.join(", ")}.`, { duplicates: duplicateIds }));
    } else {
      results.push(result("map-identities", "maps", LEVELS.PASS, `${maps.length} machine map${maps.length === 1 ? " has" : "s have"} unique IDs.`));
    }

    const active = maps.find((map) => map.id === state.activeMapId) || maps[0];
    if (!active) {
      results.push(result("active-map", "maps", LEVELS.FAIL, "The active map reference does not resolve to a saved machine map."));
    } else {
      results.push(result("active-map", "maps", LEVELS.PASS, `Active map resolves to ${text(active.name, active.id)}.`));
    }

    const expectedSchema = number(global.MACHINE_MAP_SCHEMA_VERSION);
    const invalidMaps = [];
    const staleSchemas = [];
    const duplicateObjectMaps = [];
    const invalidObjects = [];
    const populatedBlankMaps = [];

    maps.forEach((map) => {
      const objects = Array.isArray(map?.objects) ? map.objects : [];
      const name = text(map?.name, map?.id || "Unnamed map");
      if (!text(map?.id) || !text(map?.machineType) || !["apl", "cold-glue"].includes(map?.applicationMode) || number(map?.headCount) === null || map.headCount < 1 || map.headCount > 120) {
        invalidMaps.push(name);
      }
      if (expectedSchema !== null && number(map?.schemaVersion) !== expectedSchema) staleSchemas.push(name);
      const duplicateObjectIds = uniqueDuplicates(objects.map((item) => item.id));
      if (duplicateObjectIds.length) duplicateObjectMaps.push({ name, duplicateObjectIds });
      objects.forEach((item) => {
        const station = number(item?.station);
        if (!text(item?.id) || !text(item?.kind) || (item?.kind !== "coding" && (station === null || station < 1 || station > 6))) {
          invalidObjects.push({ map: name, object: item?.id || item?.name || "Unnamed object" });
        }
      });
      if (/^blank\b/i.test(name) && objects.length) populatedBlankMaps.push(name);
    });

    if (invalidMaps.length || duplicateObjectMaps.length || invalidObjects.length) {
      results.push(result("map-shape", "maps", LEVELS.FAIL, "One or more maps or map objects have invalid schema fields, duplicate object IDs, or invalid station assignments.", { invalidMaps, duplicateObjectMaps, invalidObjects }));
    } else {
      results.push(result("map-shape", "maps", LEVELS.PASS, "Machine maps and objects have valid identities, applications, machine types, head counts, and station assignments."));
    }

    if (staleSchemas.length) {
      results.push(result("map-schema", "maps", LEVELS.REVIEW, `${staleSchemas.length} map${staleSchemas.length === 1 ? " uses" : "s use"} an older schema and should be re-saved after migration.`, { staleSchemas, expectedSchema }));
    } else if (expectedSchema !== null) {
      results.push(result("map-schema", "maps", LEVELS.PASS, `All maps use schema version ${expectedSchema}.`));
    }

    if (populatedBlankMaps.length) {
      results.push(result("blank-map-integrity", "maps", LEVELS.FAIL, `Blank template map${populatedBlankMaps.length === 1 ? " contains" : "s contain"} mechanical objects: ${populatedBlankMaps.join(", ")}.`, { populatedBlankMaps }));
    } else {
      results.push(result("blank-map-integrity", "maps", LEVELS.PASS, "Blank map templates contain no mechanical objects."));
    }
  }

  function programRows(options = {}) {
    const state = options.state || global.state;
    const segmentFunction = options.programSegments || global.programSegments;
    if (typeof segmentFunction === "function") return segmentFunction(state?.program || []);
    return Array.isArray(state?.program) ? state.program : [];
  }

  function checkCurrentProgram(options, results) {
    const state = options.state || global.state;
    const rows = programRows(options);
    if (!rows.length) {
      results.push(result("program-present", "program", LEVELS.REVIEW, "No generated servo program is available for current-setup validation."));
      return;
    }

    const ordered = rows.every((row, index) => index === 0 || number(row.tableAngle, -Infinity) > number(rows[index - 1].tableAngle, Infinity));
    results.push(result("program-table-order", "program", ordered ? LEVELS.PASS : LEVELS.FAIL, ordered
      ? `All ${rows.length} servo rows have strictly increasing table angles.`
      : "The generated servo program contains duplicate or decreasing table angles."));

    const family = machineFamily(options, rows);
    const finalRow = rows.at(-1);
    let terminalValid = false;
    let terminalMessage = "";
    if (family === "AUTOCOL") {
      terminalValid = Number(finalRow?.cmd) === 3
        && (finalRow?.autocolBoundary === "end-curve" || /end\s*(?:of\s*)?curve/i.test(text(finalRow?.action)))
        && Math.abs(number(finalRow?.tableAngle, 359) - 359) <= 0.5;
      terminalMessage = terminalValid
        ? "Autocol finishes with its dedicated CMD 3 End of curve boundary at 359°."
        : "Autocol must finish with its dedicated CMD 3 End of curve boundary at 359°.";
    } else {
      terminalValid = Number(finalRow?.cmd) === 3 && finalRow?.terminalRest === true;
      terminalMessage = terminalValid
        ? `${family} finishes on a terminal CMD 3 Rest reference.`
        : `${family} must finish on a terminal CMD 3 Rest reference.`;
    }
    results.push(result("program-terminal", "program", terminalValid ? LEVELS.PASS : LEVELS.FAIL, terminalMessage, { family, finalRow }));

    const validator = global.LabelerServoPipelineValidator;
    if (validator?.analyze) {
      const validation = validator.analyze({
        rows: state.program || rows,
        plan: state.motionTranslation?.plan || state.motionPlan?.planner || state.plannerPreview || null,
        translation: state.motionTranslation || state.motionPlan?.translation || null,
        machineProfile: family === "TOPMODUL" ? "TOPMODUL" : family === "AUTOCOL" ? "AUTOCOL_FUTURE" : state.motionTranslation?.machineProfile || "DEFAULT",
        profileId: state.motionTranslation?.profileId || state.selectedMotionProfileId || state.defaultMotionProfileId || "rest-correction",
        maxMoveRatio: state.maxMoveRatio,
        tolerance: 0.001
      });
      const faults = validation?.summary?.bad || 0;
      const warnings = validation?.summary?.warn || 0;
      results.push(result("program-validation", "program", faults ? LEVELS.REVIEW : warnings ? LEVELS.REVIEW : LEVELS.PASS, faults
        ? `The current machine setup has ${faults} servo validation fault${faults === 1 ? "" : "s"}; this affects the active configuration but not the release regression suite.`
        : warnings
          ? `The current machine setup has ${warnings} servo validation warning${warnings === 1 ? "" : "s"}.`
          : "The current generated servo program passes the servo pipeline validator.", { validation }));
    } else {
      results.push(result("program-validation", "program", LEVELS.FAIL, "The servo pipeline validator is unavailable."));
    }
  }

  function regressionRows() {
    return {
      topModul: [
        { hmi: 1, plc: 0, cmd: 3, tableAngle: 0, plateAngle: 0, action: "Zero Line" },
        { hmi: 2, plc: 1, cmd: 7, tableAngle: 10, plateAngle: 0, action: "Label Backspin" },
        { hmi: 3, plc: 2, cmd: 7, tableAngle: 20, plateAngle: -20, action: "Wipe Turn" },
        { hmi: 4, plc: 3, cmd: 3, tableAngle: 30, plateAngle: 40, action: "Hold for Coding", terminalRest: true }
      ],
      autocolValid: [
        { hmi: 1, plc: 0, cmd: 3, tableAngle: 0, plateAngle: 0, action: "Spec.-shap. plate corners", autocolProfile: true, autocolBoundary: "start-shape" },
        { hmi: 2, plc: 1, cmd: 7, tableAngle: 10, plateAngle: 0, action: "Correction", autocolProfile: true },
        { hmi: 3, plc: 2, cmd: 3, tableAngle: 20, plateAngle: 30, action: "Rest", autocolProfile: true },
        { hmi: 4, plc: 3, cmd: 7, tableAngle: 30, plateAngle: 30, action: "Correction", autocolProfile: true },
        { hmi: 5, plc: 4, cmd: 3, tableAngle: 359, plateAngle: 0, action: "End of curve", autocolProfile: true, autocolBoundary: "end-curve", terminalRest: true }
      ],
      autocolInvalid: [
        { hmi: 1, plc: 0, cmd: 3, tableAngle: 0, plateAngle: 0, action: "Rest", autocolProfile: true },
        { hmi: 2, plc: 1, cmd: 7, tableAngle: 10, plateAngle: 0, action: "Correction", autocolProfile: true },
        { hmi: 3, plc: 2, cmd: 7, tableAngle: 20, plateAngle: 20, action: "Correction", autocolProfile: true },
        { hmi: 4, plc: 3, cmd: 3, tableAngle: 359, plateAngle: 40, action: "End of curve", autocolProfile: true, autocolBoundary: "end-curve", terminalRest: true }
      ]
    };
  }

  function checkRegressionScenarios(options, results) {
    const grammar = global.LabelerMachineFamilyGrammarDriver;
    const replay = global.LabelerServoReplayDriver;
    const optimizer = global.LabelerProgramOptimizerDriver;
    if (!grammar?.analyze) {
      results.push(result("regression-grammar", "regression", LEVELS.FAIL, "Machine-family grammar driver is unavailable for regression testing."));
      return;
    }

    const scenarios = regressionRows();
    const top = grammar.analyze(scenarios.topModul, { family: "TOPMODUL", machineFamily: "TOPMODUL", machineType: "TopModul", applicationMode: "apl" });
    results.push(result("regression-topmodul-chain", "regression", top?.valid ? LEVELS.PASS : LEVELS.FAIL, top?.valid
      ? "TopModul regression accepts a referenced CMD 3 → CMD 7 → CMD 7 → CMD 3 correction chain."
      : "TopModul regression rejected a valid double-correction chain.", { regression: top }));

    const autocolValid = grammar.analyze(scenarios.autocolValid, { family: "AUTOCOL", machineFamily: "AUTOCOL", machineType: "Autocol", applicationMode: "apl" });
    const autocolInvalid = grammar.analyze(scenarios.autocolInvalid, { family: "AUTOCOL", machineFamily: "AUTOCOL", machineType: "Autocol", applicationMode: "apl" });
    const autocolPass = Boolean(autocolValid?.valid) && !autocolInvalid?.valid;
    results.push(result("regression-autocol-grammar", "regression", autocolPass ? LEVELS.PASS : LEVELS.FAIL, autocolPass
      ? "Autocol regression accepts referenced correction pairs and rejects consecutive CMD 7 moves."
      : "Autocol regression did not preserve its referenced-pair grammar.", { validScenario: autocolValid, invalidScenario: autocolInvalid }));

    if (replay?.buildFrames) {
      const first = replay.buildFrames(scenarios.topModul, {});
      const second = replay.buildFrames(scenarios.topModul, {});
      const signature = (frames) => frames.map((frame) => [frame.hmi, frame.command, frame.tableStart, frame.plateTravel, frame.chainId].join("|")).join(";");
      const deterministic = signature(first) === signature(second) && first.length === scenarios.topModul.length;
      results.push(result("regression-replay", "regression", deterministic ? LEVELS.PASS : LEVELS.FAIL, deterministic
        ? "Servo replay produces deterministic frames for the TopModul regression profile."
        : "Servo replay produced inconsistent frames for the same input profile."));
    } else {
      results.push(result("regression-replay", "regression", LEVELS.FAIL, "Servo replay driver is unavailable for deterministic replay testing."));
    }

    if (optimizer?.analyze) {
      const before = JSON.stringify(scenarios.topModul);
      try {
        optimizer.analyze(scenarios.topModul, { maxMoveRatio: 21, objects: [], plan: null });
        const unchanged = before === JSON.stringify(scenarios.topModul);
        results.push(result("regression-optimizer", "regression", unchanged ? LEVELS.PASS : LEVELS.FAIL, unchanged
          ? "Program diagnostics analyze profiles without mutating generated source rows."
          : "Program diagnostics mutated the source program during analysis."));
      } catch (error) {
        results.push(result("regression-optimizer", "regression", LEVELS.FAIL, `Program diagnostics regression failed: ${error.message}.`));
      }
    } else {
      results.push(result("regression-optimizer", "regression", LEVELS.FAIL, "Program optimizer driver is unavailable for non-destructive analysis testing."));
    }
  }

  async function fetchJson(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}readiness=${Date.now()}`, {
        cache: "no-store",
        signal: controller?.signal,
        headers: { "Cache-Control": "no-cache" }
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim());
      return await response.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function checkManifestAndNotes(options, results) {
    const expected = currentVersion(options);
    const manifestUrl = options.manifestUrl || document.querySelector('meta[name="update-manifest-url"]')?.content || "./update-manifest.json";
    try {
      const manifest = await fetchJson(manifestUrl, options.timeoutMs);
      const aligned = text(manifest?.version) === expected;
      results.push(result("manifest-version", "release", aligned ? LEVELS.PASS : LEVELS.FAIL, aligned
        ? `Update manifest is aligned to ${expected}.`
        : `Update manifest reports ${text(manifest?.version, "no version")}; expected ${expected}.`, { manifest }));
      try {
        const releaseUrl = new URL(manifest?.releaseUrl || manifest?.downloadUrl || "", location.href);
        const sameApp = releaseUrl.origin === location.origin && releaseUrl.pathname.replace(/\/+$/, "/") === new URL("./", location.href).pathname.replace(/\/+$/, "/");
        results.push(result("manifest-destination", "release", sameApp ? LEVELS.PASS : LEVELS.FAIL, sameApp
          ? "Update manifest returns to the same production application path."
          : `Update manifest points outside the current production application path: ${releaseUrl.href}.`));
      } catch (error) {
        results.push(result("manifest-destination", "release", LEVELS.FAIL, `Update manifest release URL is invalid: ${error.message}.`));
      }
    } catch (error) {
      results.push(result("manifest-version", "release", LEVELS.FAIL, `Update manifest could not be loaded: ${error.message}.`));
    }

    const notesUrl = options.releaseNotesUrl || "./release-notes.json";
    try {
      const notes = await fetchJson(notesUrl, options.timeoutMs);
      const currentEntry = Array.isArray(notes?.releases)
        ? notes.releases.find((entry) => text(entry?.version) === expected)
        : null;
      const aligned = text(notes?.currentVersion) === expected && Boolean(currentEntry);
      results.push(result("release-notes", "release", aligned ? LEVELS.PASS : LEVELS.FAIL, aligned
        ? `Consolidated release notes include staging ${expected}.`
        : `Release notes do not identify ${expected} as the current release.`, { notes }));
    } catch (error) {
      results.push(result("release-notes", "release", LEVELS.FAIL, `Release notes could not be loaded: ${error.message}.`));
    }
  }

  function serviceWorkerMessage(type, payload = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    return new Promise(async (resolve, reject) => {
      if (!("serviceWorker" in navigator)) {
        reject(new Error("Service workers are not supported by this browser."));
        return;
      }
      try {
        const registration = await navigator.serviceWorker.getRegistration("./") || await navigator.serviceWorker.getRegistration();
        const worker = navigator.serviceWorker.controller || registration?.active || registration?.waiting || registration?.installing;
        if (!worker) throw new Error("No active staging service worker is available.");
        const channel = new MessageChannel();
        let complete = false;
        const timer = setTimeout(() => {
          if (complete) return;
          complete = true;
          reject(new Error(`Service worker did not answer ${type} within ${timeoutMs} ms.`));
        }, timeoutMs);
        channel.port1.onmessage = (event) => {
          if (complete) return;
          complete = true;
          clearTimeout(timer);
          resolve(event.data);
        };
        worker.postMessage({ type, ...payload }, [channel.port2]);
      } catch (error) {
        reject(error);
      }
    });
  }

  async function checkServiceWorker(options, results) {
    if (location.protocol === "file:") {
      results.push(result("service-worker", "offline", LEVELS.REVIEW, "Service worker and offline startup checks are unavailable from a file:// address."));
      return;
    }
    if (!("serviceWorker" in navigator)) {
      results.push(result("service-worker", "offline", LEVELS.FAIL, "This browser does not support service workers."));
      return;
    }

    try {
      const registration = await navigator.serviceWorker.getRegistration("./") || await navigator.serviceWorker.getRegistration();
      const worker = registration?.active || registration?.waiting || registration?.installing || navigator.serviceWorker.controller;
      results.push(result("service-worker", "offline", worker ? LEVELS.PASS : LEVELS.FAIL, worker
        ? `Staging service worker is ${worker.state || "registered"}.`
        : "No staging service worker registration is active."));
    } catch (error) {
      results.push(result("service-worker", "offline", LEVELS.FAIL, `Service worker registration check failed: ${error.message}.`));
      return;
    }

    try {
      const status = await serviceWorkerMessage("GET_CACHE_STATUS", {}, options.timeoutMs);
      const total = number(status?.total, 0);
      const cached = number(status?.cached, 0);
      const complete = Boolean(status?.complete) && total > 0 && cached === total;
      results.push(result("offline-cache", "offline", complete ? LEVELS.PASS : LEVELS.REVIEW, complete
        ? `Offline startup cache contains all ${total} core application assets.`
        : `Offline startup cache contains ${cached} of ${total || "the expected"} core application assets. Use Prepare Offline to complete it.`, { cacheStatus: status }));
    } catch (error) {
      results.push(result("offline-cache", "offline", LEVELS.REVIEW, `Offline cache status is unavailable until the 0.9.1 service worker takes control: ${error.message}.`));
    }
  }

  async function checkCriticalAssets(options, results) {
    const assets = options.criticalAssets || DEFAULT_CRITICAL_ASSETS;
    const checks = await Promise.all(assets.map(async (asset) => {
      try {
        const response = await fetch(`${asset}${asset.includes("?") ? "&" : "?"}readiness=${Date.now()}`, { cache: "no-store" });
        return { asset, ok: response.ok, status: response.status };
      } catch (error) {
        return { asset, ok: false, error: error.message };
      }
    }));
    const missing = checks.filter((item) => !item.ok);
    results.push(result("critical-assets", "release", missing.length ? LEVELS.FAIL : LEVELS.PASS, missing.length
      ? `${missing.length} critical release asset${missing.length === 1 ? " is" : "s are"} unavailable.`
      : `${checks.length} critical release assets are reachable.`, { checks, missing }));
  }

  async function prepareOffline(options = {}) {
    const response = await serviceWorkerMessage("PREPARE_OFFLINE", {
      version: currentVersion(options),
      assets: options.criticalAssets || DEFAULT_CRITICAL_ASSETS
    }, Math.max(15000, number(options.timeoutMs, DEFAULT_TIMEOUT_MS)));
    return response;
  }

  function synchronousChecks(options = {}) {
    const results = [];
    checkVersionAlignment(options, results);
    checkRequiredRuntime(options, results);
    checkStorageAndExport(options, results);
    checkLibraryIntegrity(options, results);
    checkMapIntegrity(options, results);
    checkCurrentProgram(options, results);
    checkRegressionScenarios(options, results);
    return results;
  }

  async function run(options = {}) {
    const startedAt = new Date().toISOString();
    const results = synchronousChecks(options);
    await checkManifestAndNotes(options, results);
    await checkCriticalAssets(options, results);
    await checkServiceWorker(options, results);
    const aggregate = summarize(results);
    return {
      schemaVersion: 1,
      version: currentVersion(options),
      environment: text(options.environment, "staging"),
      startedAt,
      completedAt: new Date().toISOString(),
      status: aggregate.status,
      summary: aggregate.summary,
      categories: aggregate.categories,
      results
    };
  }

  global.LabelerReleaseReadinessDriver = Object.freeze({
    LEVELS,
    DEFAULT_TIMEOUT_MS,
    DEFAULT_REQUIRED_GLOBALS,
    DEFAULT_CRITICAL_ASSETS,
    versionParts,
    compareVersions,
    summarize,
    regressionRows,
    synchronousChecks,
    serviceWorkerMessage,
    prepareOffline,
    run
  });
})(window);
