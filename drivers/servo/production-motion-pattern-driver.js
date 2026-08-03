(function installProductionMotionPatternDriver(global) {
  "use strict";

  const COMMANDS = Object.freeze({
    STARTUP: 1,
    END: 2,
    REST: 3,
    CONTINUOUS: 5,
    CHANGEOVER: 6,
    CORRECTION: 7
  });

  const PATTERNS = Object.freeze({
    CONTINUOUS_SPEED_CHANGE: Object.freeze({
      id: "continuous-speed-change",
      name: "Production Continuous Speed Change",
      source: "Production HMI reference supplied 2026-08-03",
      intents: Object.freeze(["Hold", "Startup", "Continuous", "Changeover", "Continuous", "End", "Hold"]),
      commands: Object.freeze([
        COMMANDS.REST,
        COMMANDS.STARTUP,
        COMMANDS.CONTINUOUS,
        COMMANDS.CHANGEOVER,
        COMMANDS.CONTINUOUS,
        COMMANDS.END,
        COMMANDS.REST
      ])
    }),
    POINT_TO_POINT_CORRECTION: Object.freeze({
      id: "point-to-point-correction",
      name: "Point-to-Point Correction",
      source: "Production HMI reference supplied 2026-08-03",
      intents: Object.freeze(["Hold", "Correction", "Hold"]),
      commands: Object.freeze([COMMANDS.REST, COMMANDS.CORRECTION, COMMANDS.REST])
    })
  });

  const ALLOWED_TRANSITIONS = Object.freeze({
    [COMMANDS.REST]: Object.freeze([COMMANDS.REST, COMMANDS.STARTUP, COMMANDS.CORRECTION]),
    [COMMANDS.STARTUP]: Object.freeze([COMMANDS.CONTINUOUS]),
    [COMMANDS.CONTINUOUS]: Object.freeze([COMMANDS.CONTINUOUS, COMMANDS.CHANGEOVER, COMMANDS.END]),
    [COMMANDS.CHANGEOVER]: Object.freeze([COMMANDS.CONTINUOUS]),
    [COMMANDS.END]: Object.freeze([COMMANDS.REST]),
    [COMMANDS.CORRECTION]: Object.freeze([COMMANDS.REST])
  });

  function normalizeCommands(commands) {
    return (Array.isArray(commands) ? commands : [])
      .map((entry) => Number(entry?.cmd ?? entry))
      .filter(Number.isFinite);
  }

  function validateCommands(commands) {
    const normalized = normalizeCommands(commands);
    const issues = [];
    if (!normalized.length) {
      issues.push({ code: "empty-command-sequence", message: "No motion commands were supplied." });
      return { valid: false, commands: normalized, issues };
    }
    if (normalized[0] !== COMMANDS.REST) {
      issues.push({ code: "sequence-must-start-rest", index: 0, message: "The reference chain starts from Rest (CMD 3)." });
    }
    if (normalized[normalized.length - 1] !== COMMANDS.REST) {
      issues.push({ code: "sequence-must-end-rest", index: normalized.length - 1, message: "The reference chain returns to Rest (CMD 3)." });
    }
    normalized.slice(0, -1).forEach((command, index) => {
      const next = normalized[index + 1];
      const allowed = ALLOWED_TRANSITIONS[command] || [];
      if (!allowed.includes(next)) {
        issues.push({
          code: "unsupported-production-transition",
          index,
          from: command,
          to: next,
          message: `CMD ${command} cannot transition directly to CMD ${next} in the verified production pattern.`
        });
      }
    });
    return { valid: issues.length === 0, commands: normalized, issues };
  }

  function commandsForIntents(intents, profileName = "MULTIMODUL_FUTURE") {
    const driver = global.LabelerServoCommandDriver;
    return (Array.isArray(intents) ? intents : []).map((intent) => driver?.commandForIntent(intent, profileName) ?? null);
  }

  function validateIntents(intents, profileName = "MULTIMODUL_FUTURE") {
    const commands = commandsForIntents(intents, profileName);
    const unsupported = commands
      .map((command, index) => command == null ? index : -1)
      .filter((index) => index >= 0);
    const result = validateCommands(commands.filter((command) => command != null));
    if (unsupported.length) {
      result.valid = false;
      unsupported.forEach((index) => result.issues.push({
        code: "unsupported-motion-intent",
        index,
        message: `Intent ${index + 1} is not supported by ${profileName}.`
      }));
    }
    return result;
  }

  const api = Object.freeze({
    COMMANDS,
    PATTERNS,
    ALLOWED_TRANSITIONS,
    normalizeCommands,
    validateCommands,
    commandsForIntents,
    validateIntents
  });

  global.LabelerProductionMotionPatternDriver = api;
  global.LabelerDriverRegistry?.register?.("servo.production-pattern", api, {
    version: 1,
    responsibilities: ["production-command-patterns", "continuous-transition-validation"]
  });
})(window);
