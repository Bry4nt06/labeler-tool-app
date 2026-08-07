"use strict";

function signedAngleDifference(value, reference) {
  return ((num(value, 0) - num(reference, 0) + 540) % 360) - 180;
}

function labelSensorInspectionCenter(section, finishedLabelCenterline, labelWidthDeg = 0) {
  // Application/tack position and finished label centerline are separate
  // concepts. The application-reference policy resolves Leading Edge or Center
  // Tack into the finished physical label centerline before this geometry
  // service is called. Sensors always inspect that finished label position.
  void section;
  void labelWidthDeg;
  return num(finishedLabelCenterline, 0);
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
