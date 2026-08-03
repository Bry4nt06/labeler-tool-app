"use strict";

function servoOverrideProfileKey() {
  return [
    state.activeMapId || "no-map",
    state.applicationMode || "apl",
    state.selectedBrand || "no-brand",
    state.selectedBottle || "no-bottle"
  ].join("|");
}

function setServoAngleOverride(row, field, rawValue) {
  if (!state.servoOverrides || typeof state.servoOverrides !== "object") state.servoOverrides = {};
  const profileKey = servoOverrideProfileKey();
  const rowKey = String(row.plc ?? Math.max(0, Number(row.hmi) - 1));
  const profileOverrides = { ...(state.servoOverrides[profileKey] || {}) };
  const rowOverrides = { ...(profileOverrides[rowKey] || {}) };
  if (rawValue === "") delete rowOverrides[field];
  else rowOverrides[field] = num(rawValue, field === "tableAngle" ? row.tableAngle : row.plateAngle);
  if (Object.keys(rowOverrides).length) profileOverrides[rowKey] = rowOverrides;
  else delete profileOverrides[rowKey];
  if (Object.keys(profileOverrides).length) state.servoOverrides[profileKey] = profileOverrides;
  else delete state.servoOverrides[profileKey];
}

function applyGeneratedServoProfile() {
  const generated = applyMachineTypeProfileFraming(generatedServoProfile());
  const profileKey = servoOverrideProfileKey();
  const overrides = state.servoOverrides?.[profileKey] || {};
  state.program = generated.map((row, index) => {
    const override = overrides[String(row.plc ?? index)] || {};
    return {
      ...row,
      generatedTableAngle: row.tableAngle,
      generatedPlateAngle: row.plateAngle,
      tableAngle: Number.isFinite(Number(override.tableAngle)) ? Number(override.tableAngle) : row.tableAngle,
      plateAngle: Number.isFinite(Number(override.plateAngle)) ? Number(override.plateAngle) : row.plateAngle,
      tableAngleOverride: Number.isFinite(Number(override.tableAngle)) ? Number(override.tableAngle) : null,
      plateAngleOverride: Number.isFinite(Number(override.plateAngle)) ? Number(override.plateAngle) : null
    };
  });
}

window.LabelerServoOverrideService = Object.freeze({
  profileKey: servoOverrideProfileKey,
  setAngle: setServoAngleOverride,
  applyGeneratedProfile: applyGeneratedServoProfile
});
