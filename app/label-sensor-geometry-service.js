"use strict";

function signedAngleDifference(value, reference) {
  return ((num(value, 0) - num(reference, 0) + 540) % 360) - 180;
}

function labelSensorInspectionCenter(section, applicationTarget, labelWidthDeg = 0) {
  // Body and back application targets are the leading/left label edge in the
  // workbook servo path. Move half the developed label width to obtain the
  // finished label centerline. The neck target already uses its centerline
  // reference and must not receive the half-width correction.
  return num(applicationTarget, 0) + (section === "body" || section === "back" ? num(labelWidthDeg, 0) / 2 : 0);
}

function labelSensorVisibility(labelCenter, bottleAngle, labelWidthDeg, fieldOfViewDeg = 180) {
  const labelWidth = Math.min(360, Math.max(0.1, num(labelWidthDeg, 0.1)));
  const fieldWidth = Math.min(360, Math.max(0.1, num(fieldOfViewDeg, 180)));
  const distance = Math.abs(signedAngleDifference(bottleAngle, labelCenter));
  const labelHalf = labelWidth / 2;
  const fieldHalf = fieldWidth / 2;
  const overlap = distance <= Math.abs(labelHalf - fieldHalf)
    ? Math.min(labelWidth, fieldWidth)
    : Math.max(0, labelHalf + fieldHalf - distance);
  const overlapPercent = Math.min(100, 100 * overlap / labelWidth);
  // Within a 180-degree bottle face, convert off-center angle to an operator-
  // friendly view percentage. This makes 100% uniquely mean that the label
  // centerline faces the sensor, while values approaching 1% allow an edge view.
  const alignmentPercent = distance <= 0.25
    ? 100
    : Math.max(0, 100 * (1 - distance / Math.max(0.1, fieldHalf)));
  return { overlapDeg: overlap, percent: Math.min(overlapPercent, alignmentPercent), overlapPercent, alignmentPercent, fieldOfViewDeg: fieldWidth };
}

function nearestLabelSensorTarget(currentAngle, labelCenter, labelWidthDeg, requiredPercent = 50, fieldOfViewDeg = 180) {
  const labelWidth = Math.min(360, Math.max(0.1, num(labelWidthDeg, 0.1)));
  const fieldWidth = Math.min(360, Math.max(0.1, num(fieldOfViewDeg, 180)));
  const requiredOverlap = labelWidth * Math.min(100, Math.max(0, num(requiredPercent, 50))) / 100;
  const requestedPercent = Math.min(100, Math.max(1, num(requiredPercent, 50)));
  const overlapMaximumError = Math.max(0, labelWidth / 2 + fieldWidth / 2 - requiredOverlap);
  const alignmentMaximumError = fieldWidth / 2 * (1 - requestedPercent / 100);
  const maximumError = Math.min(overlapMaximumError, alignmentMaximumError);
  const centerEquivalent = num(labelCenter, 0) + 360 * Math.round((num(currentAngle, 0) - num(labelCenter, 0)) / 360);
  const error = num(currentAngle, 0) - centerEquivalent;
  const target = centerEquivalent + Math.max(-maximumError, Math.min(maximumError, error));
  return { target, requiredOverlap, maximumError, visibility: labelSensorVisibility(labelCenter, target, labelWidth, fieldWidth) };
}
