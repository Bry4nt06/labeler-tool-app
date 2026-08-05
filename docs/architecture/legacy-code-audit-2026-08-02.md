# ServoForge Legacy Code and Modularization Audit

**Date:** 2026-08-02  
**Repository:** `Bry4nt06/labeler-tool-app`  
**Scope:** Browser-loaded runtime, application integrations, drivers, profile generation, map builder, persistence compatibility, validation, and service-worker assets.

## Objective

Reduce legacy compatibility code, split mixed-responsibility modules, and move ServoForge toward explicit driver-to-driver dependencies instead of a long global script chain and repeated runtime wrappers.

The refactor must preserve saved maps, portable settings, generated programs, machine-direction behavior, coder orientation, and existing TopModul, TopMatic, Autocol, MultiModul, APL, and Cold Glue workflows.

## Current Architecture

ServoForge currently uses three overlapping architectural layers:

1. **Core drivers** under `drivers/` expose APIs on `window`, such as geometry, servo commands, motion planning, validation, and replay.
2. **Large application modules** under `app/` combine domain calculations, state access, rendering, persistence, and event binding.
3. **Runtime integration patches** wrap existing global functions after startup to correct behavior or add features.

The driver layer is the correct long-term foundation. The main cleanup goal is to move application logic toward explicit driver contracts and gradually retire compatibility wrappers after their behavior is absorbed into authoritative modules.

## High-Priority Findings

### 1. `app.js` is a legacy staging monolith

`app.js` combines:

- retired Zone/Site control removal;
- motion-profile storage;
- motion-profile rendering and styles;
- event handling;
- a `renderProgram` wrapper;
- application startup.

These responsibilities are unrelated. Zone/Site cleanup is also handled elsewhere, and the motion-profile workbench can be an independent integration. `app.js` should become a minimal entrypoint only.

**Action:** Extract the motion-profile workbench and reduce `app.js` to startup orchestration.

### 2. Zone/Site compatibility exists in multiple places

Location metadata is retired, but compatibility behavior remains in:

- `app/zone-site-configuration.js`;
- `app/remove-zone-site-integration.js`;
- the former `app.js` cleanup block;
- map-builder functions that still accept and calculate Zone/Site values.

This creates duplicate listeners and wrappers around save, delete, export, and persistence paths.

**Action:** Keep one migration boundary temporarily, then remove Zone/Site fields and UI assumptions from the authoritative map library after import regression tests pass.

### 3. `app/profile-generation.js` is a major mixed-responsibility module

The file contains approximately 1,250 lines and combines:

- APL workbook seed generation;
- compact two-label generation;
- map-driven APL planning;
- Cold Glue planning;
- coder geometry;
- machine-family framing;
- profile routing;
- servo override persistence/application.

Changes to one profile family can affect another because they share stateful helpers and one global generation function.

**Target split:**

- `drivers/profile/apl-workbook-profile-driver.js`
- `drivers/profile/apl-map-profile-driver.js`
- `drivers/profile/cold-glue-profile-driver.js`
- `drivers/profile/coder-orientation-driver.js`
- `drivers/profile/machine-framing-driver.js`
- `app/profile-generation-orchestrator.js`
- `app/servo-overrides.js`

### 4. `app/wipe-down-builder.js` is both domain model and UI controller

The file contains approximately 1,360 lines and combines:

- map schema and migrations;
- object normalization;
- station inference;
- default map creation;
- map runtime synchronization;
- map-library persistence;
- builder rendering;
- history/undo;
- every builder event listener.

**Target split:**

- `drivers/map/map-schema-driver.js`
- `drivers/map/map-normalization-driver.js`
- `drivers/map/station-assignment-driver.js`
- `app/map-library-service.js`
- `app/map-runtime-adapter.js`
- `app/map-builder-renderer.js`
- `app/map-builder-controller.js`
- `app/map-builder-history.js`

### 5. `app/geometry-and-planning.js` contains domain and presentation helpers

The file mixes:

- SVG coordinate conversion;
- bottle and label lookup;
- label-section availability;
- label-sensor visibility;
- wipe analysis;
- inactive station optimization;
- workbook/program summary formatting.

**Target split:**

- rendering coordinates remain in the map-rendering layer;
- product geometry moves behind `geometry.label`;
- sensor calculations move to a sensor-orientation driver;
- wipe analysis moves to validation/planning drivers;
- workbook summary becomes a presentation adapter.

### 6. Runtime integration chain is too long

`app/simulation-collapsible-integration.js` sequentially loads more than 30 integration scripts. Many patch or wrap the same functions, including:

- `generatedServoProfile`;
- `renderWipeDownBuilder`;
- `renderProgram`;
- map loading and persistence functions.

Wrapper order is currently part of application behavior but is not expressed as a formal dependency graph. This makes unrelated regressions possible.

**Action:** Introduce a driver registry and dependency metadata immediately. Replace integration wrappers with composed pipeline stages over time.

### 7. Version constants and milestone loaders are stale

Examples include:

- `STAGING_RELEASE_VERSION = "0.8.3"` in bootstrap while the current application is newer;
- simulator milestone version `0.7.99`;
- numerous cache-busting query strings tied to historical milestones.

These values are compatibility artifacts and should eventually come from one build/release manifest.

**Action:** Create one runtime version source after the current structural extraction is stable.

### 8. Superseded integration files remain in the repository

Confirmed example:

- `app/cold-glue-gripper-sequence-integration.js` — sequence version 1;
- `app/cold-glue-gripper-sequence-integration-v2.js` — active sequence version 2.

Version 1 is a removal candidate, but it should not be deleted until repository references, offline assets, saved-state migrations, and regression scenarios are verified.

## First Refactor Applied

### Driver registry

A runtime driver registry provides:

- named driver registration;
- dependency declarations;
- driver resolution and required-dependency checks;
- inventory and dependency-graph diagnostics;
- a compatibility bridge for current `window.Labeler*Driver` APIs.

This allows new modules to request `servo.command`, `geometry.label`, or other named capabilities without directly depending on undeclared globals.

### Motion-profile workbench extraction

The motion-profile UI and storage are moved out of `app.js` into a dedicated integration. It resolves the servo command driver through the new registry first and retains a global fallback during migration.

### Minimal startup entrypoint

`app.js` becomes a small startup shim. Application initialization remains in `app/bootstrap.js`, which is the current authoritative startup module.

## Planned Refactor Sequence

### Phase 1 — Foundation

- Add driver registry and legacy bridge.
- Extract motion-profile workbench.
- Reduce `app.js` to startup only.
- Add architecture audit and dependency inventory.

### Phase 2 — Profile generation

- Extract shared coder-orientation geometry first.
- Move APL map-driven generation into its own driver.
- Move Cold Glue generation into its own driver.
- Retain one profile orchestrator that selects a driver and applies overrides.
- Replace post-generation repair integrations with validation-backed pipeline stages.

### Phase 3 — Map domain

- Extract map schema, normalization, migration, and station inference.
- Separate runtime-state adaptation from saved map records.
- Remove retired Zone/Site values from the authoritative map model.
- Keep a single import migration for older settings.

### Phase 4 — UI controllers

- Split builder rendering from event handling.
- Replace repeated full renders with targeted state events.
- Move inline styles into stylesheet modules.
- Replace mutation observers used for routine UI synchronization with explicit lifecycle events.

### Phase 5 — Legacy removal

Delete compatibility files only after reference and regression checks confirm they are unused. Initial candidates include:

- old gripper sequence version 1;
- duplicated Zone/Site integration layers;
- milestone loaders absorbed into current modules;
- post-generation repair patches whose rules have moved into authoritative drivers.

## Refactor Rules

1. Do not alter generated servo behavior in the same commit that moves code unless a regression test proves equivalence.
2. Keep map and portable-settings migrations forward-compatible.
3. Every new driver must declare its dependencies in the registry.
4. Application/UI modules may orchestrate drivers but should not duplicate domain formulas.
5. Validation should inspect the final composed program, while drivers should reject structurally invalid plans before rendering.
6. Avoid adding another wrapper when an authoritative driver can own the behavior.
7. Remove legacy files only after proving they are not loaded, cached, imported, or referenced by saved data.

## Recommended Regression Matrix

Before each removal or major extraction, verify at minimum:

- 45H TopModul APL with two-label and three-label products;
- clockwise and counter-clockwise maps;
- coder orientation and coder-after-wipe handoff;
- inactive neck/body/back stations;
- 60H APL layouts;
- Cold Glue brush-channel and gripper sequences;
- Autocol command framing;
- MultiModul profile selection;
- settings import/export;
- machine-map import/export;
- offline service-worker loading;
- generated program, validator, mechanical map, and simulator agreement.
