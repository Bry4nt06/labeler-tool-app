"use strict";

(function installProfileTranslatorValidation() {
  const LEGACY_COMMANDS = new Set([3, 7]);
  const RETRY_MS = 25;
  let commandValidationInstalled = false;
  let validationHookInstalled = false;

  function installTranslatorAwareCommandValidation() {
    if (commandValidationInstalled) return true;
    const baseDriver = window.LabelerServoCommandDriver;
    if (!baseDriver) return false;
    if (baseDriver.translatorAwareValidation) {
      commandValidationInstalled = true;
      return true;
    }

    function validateTranslatedReferences(rows, tolerance = 0.001) {
      const sourceRows = Array.isArray(rows) ? rows : [];
      const usesAdvancedCommands = sourceRows.some((row) => !LEGACY_COMMANDS.has(Number(row?.cmd)));
      if (!usesAdvancedCommands) return baseDriver.validateReferences(sourceRows, tolerance);

      const issues = [];
      sourceRows.forEach((row, index) => {
        const command = Number(row?.cmd);
        const definition = baseDriver.moveDefinition(command);
        const machineProfile = String(row?.translatedMachineProfile || state.motionTranslation?.machineProfile || "DEFAULT").toUpperCase();
        if (!definition) {
          issues.push({
            level: "bad",
            code: "unknown-translated-command",
            hmi: row?.hmi ?? index + 1,
            message: `HMI ${row?.hmi ?? index + 1} uses unknown CMD ${row?.cmd}.`
          });
          return;
        }
        if (!baseDriver.profileSupportsMove(machineProfile, command)) {
          issues.push({
            level: "bad",
            code: "unsupported-translated-command",
            hmi: row?.hmi ?? index + 1,
            message: `HMI ${row?.hmi ?? index + 1} uses ${definition.name} (CMD ${command}), which is not enabled for ${machineProfile}.`
          });
        }
        if (index > 0 && Number(row.tableAngle) <= Number(sourceRows[index - 1].tableAngle) + tolerance) {
          issues.push({
            level: "bad",
            code: "translated-table-order",
            hmi: row?.hmi ?? index + 1,
            message: `HMI ${row?.hmi ?? index + 1} must have a table angle greater than the preceding command.`
          });
        }
      });

      const finalRow = sourceRows[sourceRows.length - 1];
      if (sourceRows.length && !(Number(finalRow?.cmd) === 3
        && (finalRow?.terminalRest === true || /end\s*(?:of\s*)?curve|end curve.*rest/i.test(String(finalRow?.action || ""))))) {
        issues.push({
          level: "bad",
          code: "translated-terminal-rest",
          hmi: finalRow?.hmi,
          message: "The translated servo curve must finish with Rest (CMD 3) at End Curve."
        });
      }
      return issues;
    }

    window.LabelerServoCommandDriver = Object.freeze({
      ...baseDriver,
      validateGrammar: validateTranslatedReferences,
      validateReferences: validateTranslatedReferences,
      translatorAwareValidation: true
    });
    commandValidationInstalled = true;
    return true;
  }

  function installTranslatedResultValidation() {
    if (validationHookInstalled) return true;
    if (typeof validate !== "function") return false;
    if (validate.profileTranslationValidationInstalled === true) {
      validationHookInstalled = true;
      return true;
    }

    const validateBeforeTranslation = validate;
    const wrapped = function validateWithTranslation(...args) {
      const notes = validateBeforeTranslation.apply(this, args);
      const translator = window.LabelerProfileTranslatorDriver;
      if (!translator?.validate || !state.motionTranslation) return notes;
      translator.validate(state.motionTranslation).forEach((issue) => {
        notes.push([issue.level, issue.message]);
      });
      return notes;
    };
    wrapped.profileTranslationValidationInstalled = true;
    wrapped.previousValidate = validateBeforeTranslation;
    validate = wrapped;
    window.validate = wrapped;
    validationHookInstalled = true;
    return true;
  }

  function install() {
    const commandReady = installTranslatorAwareCommandValidation();
    const resultReady = installTranslatedResultValidation();
    return commandReady && resultReady;
  }

  function wait() {
    if (!install()) window.setTimeout(wait, RETRY_MS);
  }

  window.LabelerProfileTranslationValidation = Object.freeze({
    install,
    installTranslatorAwareCommandValidation,
    installTranslatedResultValidation
  });
  wait();
})();
