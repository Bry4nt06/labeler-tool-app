# Refactor Phase 14 — Modular Map Builder Runtime

Date: 2026-08-02

## Objective

Physically remove the schema, migration, runtime synchronization, rendering, controller, and history implementations from the former `app/wipe-down-builder.js` monolith.

Browser-accepted staging baseline before this phase:

- `2341d94869525e32d210caf538f2126a0dae6c2d`

## Previous structure

`app/wipe-down-builder.js` previously contained approximately 1,359 lines covering:

- map schema constants and defaults
- map-object normalization
- aggregate and station rules
- saved-map migration
- Blank APL repair
- Stella 330 calibration
- map-library location filtering
- active-map runtime synchronization
- Cold Glue map optimization
- Map Builder controls
- undo and redo history
- renderer generation
- event binding and controller actions

Schema and migration drivers had become the active owners in earlier phases, but source-level fallback copies still remained in the monolith.

## New entrypoint

`app/wipe-down-builder.js` is now a deterministic module loader.

It exposes:

- `window.ServoForgeMapBuilderModules`
- `window.ServoForgeMapBuilderReady`

The application startup path waits for `ServoForgeMapBuilderReady` before calling `initializeLabelerApp`.

## Module order

```text
map.schema
    ↓
map.migration
    ↓
map defaults
    ↓
map library/location service
    ↓
map schema browser adapter
    ↓
map runtime service
    ↓
map migration service
    ↓
Cold Glue map optimization
    ↓
Map Builder controls
    ↓
Map Builder history
    ↓
Map Builder renderer
    ↓
Map Builder controller
```

## Ownership

### `drivers/map/map-schema-driver.js`

Owns pure schema and normalization behavior:

- schema constants
- object normalization
- enabled slot rules
- station inference
- aggregate and station angles
- map creation
- missing APL station restoration

### `drivers/map/map-migration-driver.js`

Owns pure saved-map migration behavior:

- current-schema record preservation
- legacy record reconstruction
- retired Cold Glue record removal
- Blank APL repair
- Stella 330 calibration
- active-map recovery

### `app/map-defaults-service.js`

Owns browser-derived APL defaults:

- default map objects
- default aggregate angles
- default station angles

### `app/map-library-service.js`

Owns map location and library filtering:

- `mapLocationFor`
- `mapLocationLabel`
- `mapLibraryLocation`
- `mapsForMapLibraryLocation`

### `app/map-schema-adapter-integration.js`

Adapts the pure schema driver to ServoForge browser state and preserves the existing global helper API.

### `app/map-runtime-service.js`

Owns map-to-runtime and runtime-to-map synchronization:

- `activeMachineMap`
- `editableMachineMap`
- `activeBuilderMap`
- `loadMachineMapIntoRuntime`
- `syncApplicationMapToLegacyState`
- current runtime map identity

The runtime map ID is private to the service and exposed through diagnostics rather than a global mutable variable.

### `app/map-migration-service.js`

Owns browser migration execution and installs the active `ensurePersistentApplicationMaps` function.

Migration no longer executes immediately when the module loads. It waits until application initialization or another caller requests persistent maps. This prevents an empty pre-settings state from creating a replacement default library before saved settings are restored.

### `app/map-cold-glue-optimization-service.js`

Owns:

- `optimizeColdGlueMapExample`
- `initializeStella660ColdGlueExample`

The existing channel-spacing, wipe-coverage, station, and label-section calculations are preserved.

### `app/map-builder-controls.js`

Owns:

- object-type controls
- aggregate-angle controls
- station and aggregate toggles
- map-library control rendering

### `app/map-builder-history-service.js`

Owns:

- map-object selection routing
- undo history
- redo history
- post-edit refresh and delayed persistence
- shared expanded-station UI state

### `app/map-builder-renderer.js`

Owns the configured station and object editor renderer.

It preserves:

- sensor controls and visibility status
- APL roller contact-span controls
- Cold Glue brush roles and coverage
- brush hold settings
- object duplication and removal
- station duplication
- label-use selection

### `app/map-builder-controller.js`

Owns:

- map save and export
- guided setup
- map selection and creation
- Zone/Site selection
- map deletion
- object creation
- application and machine-setting changes
- Map Builder event binding

## Physical duplicate removal

The following functions no longer exist in `app/wipe-down-builder.js`:

- `normalizeBuilderObject`
- `normalizeEnabledSlots`
- `normalizeAggregateAngles`
- `normalizeStationAngles`
- `createMachineMap`
- `ensurePersistentApplicationMaps`
- `loadMachineMapIntoRuntime`
- `syncApplicationMapToLegacyState`
- `renderWipeDownBuilder`
- `bindWipeDownBuilder`

The loader contains no machine formulas, migration rules, runtime synchronization, renderer markup, or event-controller logic.

## Secondary feature manifest

`app/simulation-collapsible-integration.js` no longer loads:

- `drivers/map/map-schema-driver.js`
- `drivers/map/map-migration-driver.js`
- `app/map-schema-adapter-integration.js`
- `app/map-migration-service.js`

Those modules now have one loader owner: `app/wipe-down-builder.js`.

Map Builder feature integrations that modify or extend the completed runtime remain in the feature manifest.

## Compatibility preserved

### Stored direction

Stored direction values remain unchanged:

- `cw`
- `ccw`

No physical-direction reinterpretation was added. The established historical mapping remains intact.

### Map format

This phase does not change:

- machine-map schema version 11
- exported map version
- map IDs
- map names
- object property names
- sensor fields
- coder objects
- APL `wipeSpanDeg`
- brush hold properties
- Zone/Site fields

### Saved settings startup

Saved settings remain authoritative. Map migration is deferred until the application requests persistent maps after its normal settings-loading path begins.

### UI behavior

The renderer, controls, history, and controller code were moved by responsibility without intentionally changing Map Builder interaction behavior.

## Offline support

`service-worker.js` caches all Map Builder modules under:

- `servoforge-labeler-staging-v0.9.2-map-builder-modules-v1`

## Regression coverage

### `tests/map-builder-module-boundaries.test.js`

Guards:

- complete ordered module list
- startup readiness gate
- absence of implementation code from the loader
- one loader owner for schema and migration modules
- offline coverage
- controls, history, renderer, and controller ownership

### `tests/map-runtime-service.test.js`

Covers:

- map-to-runtime loading
- runtime-to-map synchronization
- runtime map identity
- APL object routing
- stored `cw` preservation
- stored `ccw` preservation
- render suppression when requested

### Updated `tests/map-migration-service.test.js`

Covers:

- deferred migration startup
- active function installation
- matching runtime-map reload suppression
- changed runtime-map reload behavior

### Updated `tests/map-schema-ownership.test.js`

Requires:

- schema → migration → adapter → runtime → migration-service order
- one source owner for schema functions
- one source owner for migration
- one source owner for runtime synchronization
- no fallback copies in Map Builder UI modules
- direction compatibility
- offline coverage

## Local validation completed

- JavaScript syntax checks for every new and modified runtime file
- Map Builder module boundary regression
- map runtime behavior regression
- deferred migration service regression
- map schema ownership regression
- map schema behavior regression
- map schema adapter regression
- map migration driver regression
- committed blob integrity comparison against locally tested sources

## Browser validation targets

Verify:

- clean startup without a blank screen
- all saved maps remain listed
- active map selection survives refresh
- Blank APL remains blank and editable
- object add, edit, duplicate, and remove
- station duplication
- station enable and default-object restoration
- undo and redo
- map creation, save, delete, export, and import
- Zone/Site filtering
- 45H TopModul three-label generation
- Bud Light Lime back sensor and coder sequence
- Cold Glue brush and channel editing
- 60H CG MAB1 calibration and optimization
- stored direction after refresh

## Next cleanup target

The next large mixed subsystem is `app/geometry-and-planning.js`.

A safe decomposition should separate:

1. circular/SVG geometry helpers
2. product and specification lookup
3. sensor visibility calculations
4. wipe/contact analysis
5. station and inactive-object planning
6. workbook and summary presentation
