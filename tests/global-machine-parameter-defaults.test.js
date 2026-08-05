"use strict";

const assert = require("node:assert/strict");

global.window = global;
global.state = {
  buildInputs: {
    neckSpenderPlateDeg: 60,
    neckApplication: "Leading Edge",
    plateStartPositionDeg: 0,
    neckContactMm: 4.4,
    bodyContactMm: 5,
    backContactMm: 5,
    bodyOverWipeDeg: 10
  }
};

require("../app/global-machine-parameter-defaults-integration.js");

const service = global.LabelerGlobalMachineParameterDefaults;
assert.deepEqual(service.DEFAULT_BUILD_INPUTS, {
  neckSpenderPlateDeg: 75,
  neckApplication: "Center",
  plateStartPositionDeg: 15,
  neckContactMm: 0,
  bodyContactMm: 0,
  backContactMm: 0
});
assert.equal(state.buildInputs.neckSpenderPlateDeg, 75);
assert.equal(state.buildInputs.neckApplication, "Center");
assert.equal(state.buildInputs.plateStartPositionDeg, 15);
assert.equal(state.buildInputs.neckContactMm, 0);
assert.equal(state.buildInputs.bodyContactMm, 0);
assert.equal(state.buildInputs.backContactMm, 0);
assert.equal(state.buildInputs.bodyOverWipeDeg, 10, "Unrelated build inputs must be preserved.");

const centerLineFront = -(90 - state.buildInputs.neckSpenderPlateDeg)
  + state.buildInputs.plateStartPositionDeg;
assert.equal(centerLineFront, 0, "The default front centerline must resolve to zero degrees.");

const untouchedLegacyState = {
  buildInputs: {
    neckSpenderPlateDeg: 75,
    neckApplication: "Center",
    plateStartPositionDeg: 0,
    neckContactMm: 4.4,
    bodyContactMm: 5,
    backContactMm: 5,
    bodyOverWipeDeg: 12
  }
};
assert.equal(service.migrateUntouchedLegacyDefaults(untouchedLegacyState), true);
assert.equal(untouchedLegacyState.buildInputs.plateStartPositionDeg, 15);
assert.equal(untouchedLegacyState.buildInputs.neckContactMm, 0);
assert.equal(untouchedLegacyState.buildInputs.bodyContactMm, 0);
assert.equal(untouchedLegacyState.buildInputs.backContactMm, 0);
assert.equal(untouchedLegacyState.buildInputs.bodyOverWipeDeg, 12);

const userChangedState = {
  buildInputs: {
    neckSpenderPlateDeg: 82,
    neckApplication: "Center",
    plateStartPositionDeg: 0,
    neckContactMm: 4.4,
    bodyContactMm: 5,
    backContactMm: 5
  }
};
assert.equal(service.migrateUntouchedLegacyDefaults(userChangedState), false);
assert.equal(userChangedState.buildInputs.neckSpenderPlateDeg, 82);
assert.equal(userChangedState.buildInputs.bodyContactMm, 5);

console.log("Global machine parameter defaults regression passed.");
