"use strict";

function signedAngleDifference(value, reference) {
  return ((num(value, 0) - num(reference, 0) + 540) % 360) - 180;
}

function labelSensorInspectionCenter(section, applicationTarget, labelWidthDeg = 0) {
  // ServoForge plate-angle convention:
  // the red bottle centerline is the label centerline at the instant the label
  // is applied. Therefore the application plate angle itself is the finished
  // label centerline for neck, body, and back labels. Do not shift body/back
  // labels by half of their developed width.
  void section;
  void labelWidthDeg;
  return num(applicationTarget, 0);
}

function labelSensorVisibility(labelCenter, sensorViewAngle, labelWidthDeg, fieldOfViewDeg = 180) {
  const labelWidth = Math.min(360, Math.max(0.1, num(labelWidthDeg, 0.1)));
  const fieldWidth = Math.min(360, Math.max(0.1, num(fieldOfViewDeg, 180)));
  const distance = Math.abs(signedAngleDifference(sensorViewAngle, labelCenter));
  const labelHalf = labelWidth / 2;
  const fieldHalf = fieldWidth / 2;

  // Treat the bottle as a cylindrical surface. The sensor can physically see
  // one hemisphere (180 degrees when pointed at the bottle center). Visibility
  // is the fraction of the developed label arc that overlaps that hemisphere.
  const overlap = distance <= Math.abs(labelHalf - fieldHalf)
    ? Math.min(labelWidth, fieldWidth)
    : Math.max(0, labelHalf + fieldHalf - distance);
  const overlapPercent = Math.min(100, Math.max(0, 100 * overlap / labelWidth));

  return {
    overlapDeg: overlap,
    percent: overlapPercent,
    overlapPercent,
    fieldOfViewDeg: fieldWidth,
    centerErrorDeg: distance
  };
}

function nearestLabelSensorTarget(currentAngle, labelCenter, labelWidthDeg, requiredPercent = 50, fieldOfViewDeg = 180) {
  const labelWidth = Math.min(360, Math.max(0.1, num(labelWidthDeg, 0.1)));
  const fieldWidth = Math.min(360, Math.max(0.1, num(fieldOfViewDeg, 180)));
  const requestedPercent = Math.min(100, Math.max(0, num(requiredPercent, 50)));
  const requiredOverlap = labelWidth * requestedPercent / 100;

  // For two centered arcs, the greatest centerline error that still provides
  // the requested overlap is half(label) + half(view) - required overlap.
  // Clamp to 180 degrees because signedAngleDifference uses the nearest
  // equivalent bottle orientation.
  const maximumError = Math.min(
    180,
    Math.max(0, labelWidth / 2 + fieldWidth / 2 - requiredOverlap)
  );
  const centerEquivalent = num(labelCenter, 0)
    + 360 * Math.round((num(currentAngle, 0) - num(labelCenter, 0)) / 360);
  const error = num(currentAngle, 0) - centerEquivalent;
  const target = centerEquivalent + Math.max(-maximumError, Math.min(maximumError, error));

  return {
    target,
    requiredOverlap,
    maximumError,
    visibility: labelSensorVisibility(labelCenter, target, labelWidth, fieldWidth)
  };
}
