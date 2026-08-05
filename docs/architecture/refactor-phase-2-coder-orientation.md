# Refactor Phase 2 — Coder Orientation Driver

**Date:** 2026-08-02

## Purpose

Move physical machine-direction translation and code-box target geometry out of runtime correction scripts and into one reusable domain driver.

## New driver

`drivers/profile/coder-orientation-driver.js` owns these pure calculations:

- normalization of legacy stored direction values;
- translation from stored direction to physical direction;
- direction-selector labels;
- nearest equivalent bottle angle;
- automatic coder label-section selection;
- finished-label center calculation;
- printed-label left-edge offset calculation;
- direction-correct code-box target calculation.

The driver is registered as `profile.coderOrientation` in `LabelerDriverRegistry` and remains available as `window.LabelerCoderOrientationDriver` during migration.

## First migrated consumer

`app/clockwise-code-box-orientation-integration.js` now resolves `profile.coderOrientation` and delegates all physical direction and code-box target calculations to it.

The integration still owns temporary runtime responsibilities that are not yet domain-driver concerns:

- locating the selected map and coding object;
- reading selected label and bottle data;
- finding the application reference row;
- identifying coding hold rows;
- updating the preceding CMD 7 and continuation rows;
- refreshing direction controls and generated output.

Row insertion, row detection, and command sequencing were intentionally preserved in this phase.

## Regression test

`tests/coder-orientation-driver.test.js` verifies:

- legacy `cw` maps resolve to physical counter-clockwise;
- legacy `ccw` maps resolve to physical clockwise;
- automatic label-section selection prefers back, then body, then neck;
- a 100° label with a 20° code-box offset produces targets of 80° and 20° in opposite physical directions;
- nearest-equivalent targeting preserves continuous bottle-angle travel.

## Remaining migrations

The following files still contain legacy copies of coder geometry and should be migrated in subsequent passes:

- `app/map-object-servo-orientation-integration.js`;
- `app/map-object-coder-after-wipe-integration.js`;
- `app/profile-generation.js`.

After all three use `profile.coderOrientation`, the final direction-correction integration can be reduced to orchestration and eventually absorbed into the profile pipeline.

## Testing focus

Verify the existing 45H TopModul APL LandShark scenarios in both physical directions, including:

- coder target angle;
- coder-after-wipe handoff;
- CMD 3 Rest grammar;
- mechanical-map agreement;
- validator output;
- direction-selector labels;
- page refresh and offline cache loading.
