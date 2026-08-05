# Refactor Phase 16 — Assembly Model and Geometry Drivers

Date: 2026-08-02

## Objective

Move assembly normalization, contact geometry, map-point synchronization, status calculations, and assembly display labels behind registered drivers without introducing another asynchronous startup race.

Browser-accepted staging baseline before this phase:

- `b2ea12024b6343af2a857b78fcd6ce40c5620bdc`

## Why this phase is staged

`app/assemblies.js` currently combines four separate responsibilities:

- assembly data normalization
- roller, pad, and brush contact geometry
- assembly editor and object-location UI
- configured-object and aggregate map rendering

The model and geometry functions are called throughout profile generation, persistence, validation, map rendering, and the Map Builder. Replacing all four responsibilities in one pass would create a wide browser-test surface.

This phase establishes authoritative model and geometry drivers first. The existing UI and renderer remain in `app/assemblies.js` temporarily and are physically extracted in the next phase.

## New drivers

### `drivers/assembly/assembly-model-driver.js`

Registered as:

- `assembly.model`

Owns:

- legacy `inner-pads` migration
- valid inner/outer side normalization
- default spender, roller, pad, and brush geometry
- assembly type labels
- assembly position labels
- assembly selector values

### `drivers/assembly/assembly-geometry-driver.js`

Registered as:

- `assembly.geometry`

Depends on:

- `assembly.model`

Owns:

- millimeters-to-table-degrees conversion
- pad leading-edge calculation
- inner/outer pad contact windows
- profile table-angle windows
- roller, pad, and brush angle collection
- contact span
- required plate/table ratio
- servo-limit status classification
- map-point station parsing
- map-point synchronization from assembly state

## Browser adapter

`app/assembly-driver-adapter.js` loads after the two registered drivers and after the legacy `assemblies.js` globals already exist.

It replaces the active global owners for:

- `normalizeAssembly`
- `mmToTableDegrees`
- `padStartAngle`
- `padAnglesForSide`
- `padProfileTableAngles`
- `assemblyAngles`
- `assemblySpan`
- `assemblyRequiredRatio`
- `assemblyStatus`
- `mapPointStation`
- `syncMapPointsFromAssemblies`
- `assemblyTypeLabel`
- `assemblyPositionLabel`
- `assemblySelectValue`

The public global names remain unchanged, so existing callers do not need to change during this phase.

## Load order

The readiness-gated feature manifest loads:

```text
driver registry
    ↓
assembly model driver
    ↓
assembly geometry driver
    ↓
remaining core drivers
    ↓
assembly browser adapter
    ↓
remaining feature integrations
    ↓
application initialization
```

This uses the existing `ServoForgeFeatureIntegrationsReady` startup barrier. No new asynchronous entrypoint or static HTML loader was added.

## Compatibility preserved

This phase does not change:

- assembly property names
- stored station numbers
- stored inner/outer side values
- `inner-pads` legacy migration
- default roller centerlines
- pad-clearance conversion
- inner-pad side offset
- brush start/stop normalization
- `state.maxMoveRatio` threshold behavior
- APL map-point naming
- Cold Glue early-return behavior in map-point synchronization
- assembly editor markup or event handling
- configured map-object drawing
- stored map schema
- stored `cw` and `ccw` direction values

## Transitional duplication

`app/assemblies.js` still contains its original model and geometry function definitions. They are loaded first as compatibility fallbacks, then superseded by `app/assembly-driver-adapter.js` before application initialization.

This duplication is temporary and explicitly guarded. The next phase will physically extract:

- assembly editor/controller
- object-location editor
- application-preset switching
- aggregate and configured-object map renderer

After those modules are active, the duplicated definitions can be removed from `app/assemblies.js`.

## Regression coverage

`tests/assembly-drivers.test.js` covers:

- legacy `inner-pads` migration
- roller default restoration
- pad inner-side offset
- contact-span calculation
- servo-limit status
- driver registration and dependency metadata
- adapter replacement of legacy globals
- map-point synchronization
- station parsing
- feature-manifest dependency order
- explicit retention of the temporary editor compatibility body

## Offline behavior

The assembly drivers and adapter are loaded through the feature integration loader. The service worker's network-first same-origin strategy caches each successful script response automatically after the first online load.
