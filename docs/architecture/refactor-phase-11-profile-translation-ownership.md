# Refactor Phase 11 — Profile Translation Ownership

Date: 2026-08-02

## Objective

Remove the duplicate profile-translation engine from `app/profile-translator-integration.js` and establish one owner for each translation concern.

Last browser-verified staging baseline before this phase:

- `d8c335212728e236c629e85271f40ae0f4fc8760`

## Previous overlap

Before this phase, both of these files implemented the translation engine:

- `app/profile-translation-service.js`
- `app/profile-translator-integration.js`

Both contained versions of:

- selected motion-profile resolution
- machine-profile resolution
- translated-row synchronization
- planner construction
- translator execution
- `state.motionPlan` translation metadata
- `state.motionTranslation` assignment
- `applyGeneratedServoProfile` wrapping

The integration also mixed translated-command validation, settings persistence, regeneration listeners, workbench rendering, and release-version mutation.

That overlap caused the earlier planner metadata race because either wrapper could install first depending on dynamic script timing.

## New ownership

### `app/profile-translation-service.js`

Sole owner of:

- selected motion-profile resolution
- translated machine-profile resolution
- mechanical planner execution
- profile translator execution
- translated-row synchronization
- `motionEventId` and planner metadata preservation
- `state.motionPlan.planner`
- `state.motionPlan.translation`
- `state.motionTranslation`
- the single `applyGeneratedServoProfile` translation wrapper

Public API:

- `selectedProfile()`
- `machineProfile(profile)`
- `buildAndTranslateProgram()`
- `syncTranslatedRows(result, rows)`
- `install()`

After translation, the service emits:

- `servoforge:profile-translated`

The event carries profile ID, machine profile, row count, and fallback count for UI consumers without requiring another generator wrapper.

### `app/profile-translator-validation.js`

Sole owner of:

- translated-command support validation
- advanced-command table-order validation
- translated terminal-Rest validation
- attaching translator result issues to the application validation output

The module retries until the base `validate` function is available, avoiding a load-order assumption.

### `app/profile-translator-integration.js`

Now owns only:

- selected/default motion-profile persistence
- profile-selection regeneration listeners
- motion-profile workbench styling and status rendering
- applied-plan display routing
- UI refresh after `servoforge:profile-translated`

It waits for `ServoForgeProfileGenerationReady` before installation.

It no longer contains:

- `buildAndTranslateProgram`
- `syncTranslatedRows`
- an `applyGeneratedServoProfile` wrapper
- translated-command validation
- a `validate` wrapper
- `TRANSLATOR_RELEASE_VERSION`
- application-version metadata mutation
- update-status text mutation

## Load order

The ordered profile module sequence is now:

```text
APL seed
Cold Glue
map-driven APL
profile routing
machine framing
servo overrides
profile translation service
profile translator validation
ServoForgeProfileGenerationReady
```

The static UI integration waits for this readiness promise before connecting persistence and display behavior.

## Release identity

The obsolete translator-specific version `0.7.96` no longer overwrites the application version.

The application version remains owned by the staging release metadata and update manager:

- `0.9.2`

## Offline support

`service-worker.js` now caches `app/profile-translator-validation.js` and uses cache identity:

- `servoforge-labeler-staging-v0.9.2-profile-translation-ownership-v1`

## Regression coverage

Updated and added tests verify:

- translation service remains the only translation-engine owner
- translated rows retain mechanical event IDs
- translation completion emits `servoforge:profile-translated`
- selected and machine profile resolution remain available through the service
- translated-command validation remains active
- translator result issues remain attached to validation output
- the UI integration contains no translation engine or validation implementation
- the UI integration cannot overwrite release identity
- profile translation service loads before profile translator validation
- both modules are available offline

Local checks completed:

- JavaScript syntax for all modified and new runtime modules
- service-worker syntax
- profile translation readiness behavior
- translated-command validation behavior
- translation ownership boundary regression
- exact committed Git blob hashes against locally tested files

## Preserved behavior targets

Browser validation should confirm:

- planner `motionEventId` alignment remains intact
- Automatic and custom motion-profile selections persist
- changing the motion profile regenerates the program
- motion-profile workbench status still refreshes
- Rest/Correction and advanced command profiles validate normally
- APL, MIC, Cold Glue, Autocol, sensors, and coder behavior remain unchanged

## Next repository-wide cleanup

The next oversized subsystem is `app/wipe-down-builder.js`. The safe decomposition sequence is:

1. map schema and defaults
2. normalization and migration
3. map persistence/library service
4. runtime-state adapter
5. renderer
6. event controller
7. undo/redo history

The extraction should preserve stored map formats and continue loading legacy maps through explicit migration adapters.
