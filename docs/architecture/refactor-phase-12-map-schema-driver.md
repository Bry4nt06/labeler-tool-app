# Refactor Phase 12 — Map Schema and Normalization Driver

Date: 2026-08-02

## Objective

Begin decomposing `app/wipe-down-builder.js` by moving the active map schema, object normalization, slot rules, station inference, angle normalization, and map-construction behavior behind a dedicated driver.

Last browser-verified staging baseline before this phase:

- `a281a2451b2d6e939e19c2d01e0147fd4a5b8952`

## Why this phase uses an adapter

`app/wipe-down-builder.js` still mixes approximately 1,300 lines of:

- map schema and constants
- object defaults and normalization
- saved-map migration
- persistent map-library handling
- runtime synchronization
- rendering
- event handling
- history

Physically deleting its first section in one change would also require rewriting the stateful migration and controller sections that call those functions. This phase follows the same staged migration pattern used for profile generation:

1. introduce an authoritative driver
2. route the active global API through a compatibility adapter
3. test imported and newly created maps
4. physically remove the fallback definitions after browser verification

## New driver

### `drivers/map/map-schema-driver.js`

Registered as:

- `map.schema`

Owns:

- machine-map schema version constants
- unique map names and IDs
- map-object station inference
- application-mode classification
- map-object normalization
- APL roller contact-span normalization
- sensor placement and visibility-input bounds
- Cold Glue brush and brush-channel normalization
- active aggregate/station slot normalization
- sparse active-station numbering
- APL object sorting and station repair
- missing APL station object restoration
- Cold Glue aggregate defaults
- aggregate and station angle records
- APL station-to-label inference
- legacy application-mode inference
- machine-map construction

Public APIs include:

- `normalizeBuilderObject`
- `normalizeEnabledSlots`
- `activeSlotNumbers`
- `isAggregateEnabled`
- `isStationEnabled`
- `activeAplStationNumbers`
- `normalizeAggregateAngles`
- `normalizeStationAngles`
- `repairAplStationAssignments`
- `ensureAplObjectsForNewStations`
- `inferAplStationSections`
- `inferredMachineMapApplicationMode`
- `createMachineMap`

## Browser adapter

### `app/map-schema-adapter-integration.js`

The adapter loads after the existing Map Builder script and replaces the active global helper functions with calls to `map.schema`.

It supplies the browser-only dependencies needed by the pure driver:

- current ServoForge state defaults
- default APL assemblies and objects
- map Zone/Site resolution
- deep cloning
- generated IDs

The adapter exposes:

- `window.LabelerMapSchemaAdapter`

The adapter records the installed function list and schema version for diagnostics.

## Preserved compatibility

### Stored direction values

This phase does not reinterpret machine direction.

Stored values remain:

- `cw`
- `ccw`

The existing historical physical-direction mapping remains unchanged.

### Machine-map format

The active schema version remains:

- `11`

No map export version or saved property name was changed.

### Map objects

The driver preserves existing object semantics for:

- APL pads
- APL rollers and `wipeSpanDeg`
- Cold Glue brushes
- shared brush channels
- grippers
- Cold Glue rollers
- coding objects
- label sensors
- sensor servo-assist settings
- required label visibility percentage
- brush hold settings

### Sparse station layouts

Three active stations such as 1, 3, and 5 continue to infer:

- first physical station → neck
- second physical station → body
- third physical station → back

Explicit station label assignments remain authoritative.

### Blank and legacy maps

The existing stateful migration function remains in `wipe-down-builder.js` during this phase. It now calls the driver-backed normalization helpers after the adapter installs.

The following remain preserved:

- blank APL map ID and seed marker
- retired blank Cold Glue map removal
- operator-created Cold Glue maps
- old `wipe` object conversion to `brush`
- missing station restoration
- Stella 330 full-wrap calibration marker
- map record IDs and names

## Module loading

The feature manifest now loads:

```text
drivers/map/map-schema-driver.js
        ↓
existing feature integrations
        ↓
app/map-schema-adapter-integration.js
        ↓
Map Builder integrations
```

The schema driver is listed in `coreDrivers`; the adapter is the first `mapBuilder` feature.

## Offline support

`service-worker.js` now caches:

- `drivers/map/map-schema-driver.js`
- `app/map-schema-adapter-integration.js`

Cache identity:

- `servoforge-labeler-staging-v0.9.2-map-schema-v1`

## Regression coverage

### `tests/map-schema-driver.test.js`

Covers:

- schema version
- slot normalization
- APL roller coverage
- sensor normalization
- brush-channel hold bounds
- sparse three-station section inference
- 45H TopModul map creation
- zero-angle normalization
- direction storage
- Cold Glue map defaults
- restoration of newly enabled APL stations

### `tests/map-schema-adapter.test.js`

Covers:

- replacement of legacy global helpers
- driver-backed map naming
- driver-backed sensor normalization
- driver-backed map creation
- Zone/Site dependency injection
- adapter diagnostics

### `tests/map-schema-ownership.test.js`

Guards:

- driver-before-adapter load order
- offline asset coverage
- driver ownership of major schema functions
- adapter routing of those functions
- no direction reinterpretation
- explicit transitional fallback status

Local validation completed:

- JavaScript syntax checks
- pure schema behavior regression
- browser adapter regression
- service-worker syntax

## Transitional duplication

`app/wipe-down-builder.js` still contains fallback definitions for the functions now routed through `map.schema`.

They remain temporarily so the browser can be tested against existing map libraries before source deletion. The next phase will remove these fallback definitions and reduce the large builder file while retaining:

- stateful map-library migration
- runtime synchronization
- renderer
- controller
- history

## Browser validation targets

Test at minimum:

- open every saved map
- blank APL map
- imported legacy map
- 45H TopModul three-label map
- MIC map
- Cold Glue brush map
- Cold Glue brush-channel map
- add/edit/duplicate/remove a sensor
- add/edit/duplicate/remove a pad or roller
- enable a previously disabled station
- switch sparse station layouts
- create a new map from current
- change direction and reload
- export and re-import a map
- confirm sensor and coder output remain unchanged

## Next phase

After browser confirmation:

1. remove the driver-owned fallback definitions from `wipe-down-builder.js`
2. extract persistent map-library migration into `drivers/map/map-migration-driver.js`
3. extract runtime synchronization into `app/map-runtime-adapter.js`
4. leave rendering and event handling for subsequent phases
