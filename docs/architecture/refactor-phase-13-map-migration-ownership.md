# Refactor Phase 13 — Persistent Map Migration Ownership

Date: 2026-08-02

## Objective

Extract saved-map and map-library migration behavior from the Map Builder subsystem into a dedicated driver and browser service.

Browser-accepted staging baseline before this phase:

- `b13f36434dafbbe33de251a99debc737aea80ae7`

## Previous ownership

`app/wipe-down-builder.js` previously owned all of the following in one stateful function:

- creating the default APL map when no library exists
- normalizing current-schema maps
- rebuilding maps from older schema records
- retiring obsolete factory Cold Glue maps
- preserving operator-created Cold Glue maps
- converting legacy Cold Glue `wipe` objects to brushes
- applying the Stella 330 full-wrap calibration
- repairing legacy Blank APL map IDs
- creating the canonical Blank APL map
- repairing an invalid active-map selection
- deciding when the active map must be reloaded into runtime state

This behavior was intertwined with rendering, controller, history, and runtime synchronization code.

## New driver

### `drivers/map/map-migration-driver.js`

Registered as:

- `map.migration`

Dependency:

- `map.schema`

The driver is state-independent and receives its browser dependencies explicitly.

It owns:

- current-schema map-record normalization
- older-schema replacement decisions
- retired Cold Glue map identification
- operator-map preservation
- legacy Cold Glue object normalization routing
- canonical Blank APL repair and creation
- active-map recovery
- exact legacy Stella 330 layout detection
- Stella 330 brush-window calibration
- force-reload decisions after migration

Public APIs include:

- `isRetiredColdGlueMap`
- `isLegacyStella330Layout`
- `calibrateStella330Map`
- `normalizeMapRecord`
- `repairBlankAplMap`
- `migrateLibrary`

## Browser service

### `app/map-migration-service.js`

The browser service supplies:

- current `state.mapLibrary`
- current active map ID
- legacy APL map objects
- driver-backed `createMachineMap`
- Zone/Site map location resolution
- aggregate-angle normalization
- Cold Glue object normalization
- runtime map reload handling

It replaces the active global `ensurePersistentApplicationMaps` function with:

- `ensurePersistentApplicationMapsWithMigrationService`

Diagnostics are available through:

- `window.LabelerMapMigrationService`

The implementation has:

- `mapMigrationInstalled = true`
- `driver = "map.migration"`

## Preserved map behavior

### Current map identity

Maps already using schema version 11 are updated in place. Their map record identity is retained so Map Builder controls do not keep references to detached copies.

### Older maps

Older schema records are rebuilt through the authoritative `map.schema` driver while preserving their supplied IDs, names, objects, machine settings, and location values.

### Blank APL map

The canonical editable blank map remains:

- ID: `map-blank-apl`
- Name: `Blank APL Map`
- Head count: 45
- One active aggregate
- One active station
- No default objects
- Schema version: 11
- Blank seed version: 1

Legacy IDs continue to migrate:

- `map-blank-apl-template`
- `map-blank-template`

### Retired Cold Glue maps

The following retired factory records are removed:

- `map-blank-cold-glue`
- `map-blank-cold-glue-template`
- untouched `map-cold-glue-default` named `Cold Glue 3-Aggregate`

An operator-created map is not removed solely because it retains an older factory-style ID.

### Stella 330 calibration

The calibration applies only when all of these conditions match:

- map name is exactly `60H CG MAB1`, case-insensitive
- Station 1 has two brushes at 87°–150°
- Station 3 has two brushes at 159°–205.1°
- Station 5 has two brushes at 237°–279.6°

The proven windows remain:

- Neck process: 161°–174°
- Neck final: 210°–227°
- Body process: 235°–247°
- Body final: 265°–273°
- Back process: 285.8°–298°
- Back final: 300°–314°

The calibration marker remains version 2.

### Direction compatibility

This phase does not reinterpret or rewrite stored machine direction values.

Stored values remain:

- `cw`
- `ccw`

The established historical physical-direction mapping remains unchanged.

## Load order

```text
map.schema
    ↓
map.migration
    ↓
map-schema-adapter-integration
    ↓
map-migration-service
    ↓
remaining Map Builder integrations
```

## Offline support

`service-worker.js` now caches:

- `drivers/map/map-migration-driver.js`
- `app/map-migration-service.js`

Cache identity:

- `servoforge-labeler-staging-v0.9.2-map-migration-v1`

## Regression coverage

### `tests/map-migration-driver.test.js`

Covers:

- schema-11 map record identity
- Blank APL map creation
- legacy Blank APL ID repair
- retired Cold Glue removal
- operator Cold Glue preservation
- legacy `wipe` to brush normalization routing
- Stella 330 exact-layout calibration
- force-reload signaling
- default APL map creation when the library is empty

### `tests/map-migration-service.test.js`

Covers:

- active global function replacement
- driver dependency injection
- state library assignment
- matching runtime-map reload suppression
- changed runtime-map reload behavior

### Updated ownership guard

`tests/map-schema-ownership.test.js` now requires:

- schema driver before migration driver
- migration driver before browser adapters
- schema adapter before migration service
- offline coverage for all four modules
- one active migration-service marker
- explicit transitional fallback tracking

## Transitional fallback

`app/wipe-down-builder.js` still contains the older `ensurePersistentApplicationMaps` implementation as source-level fallback during this browser-validation phase.

After the feature loader finishes, the new service is the active owner.

The next physical deletion pass will remove:

- legacy schema helper definitions already owned by `map.schema`
- the legacy persistent migration implementation now owned by `map.migration`

## Browser validation targets

Verify:

- every saved map remains listed
- active map selection survives refresh
- current map edits remain attached to the active record
- Blank APL remains blank and editable
- legacy/imported maps open normally
- operator Cold Glue maps remain present
- retired factory Cold Glue records do not return
- 60H CG MAB1 retains its calibrated brush windows
- 45H TopModul three-label program remains unchanged
- sensor and coder behavior remain unchanged
- direction remains unchanged after refresh

## Next phase

After browser confirmation:

1. physically remove schema and migration fallback definitions from `wipe-down-builder.js`
2. extract `loadMachineMapIntoRuntime` and `syncApplicationMapToLegacyState` into `app/map-runtime-adapter.js`
3. leave renderer, controller, and history behavior unchanged for their later phases
