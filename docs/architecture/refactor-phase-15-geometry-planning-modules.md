# Refactor Phase 15 — Geometry and Planning Modules

Date: 2026-08-02

## Objective

Physically split `app/geometry-and-planning.js` into focused runtime services without changing its public global function names, geometry formulas, station rules, sensor calculations, wipe accounting, summary output, or Cold Glue map behavior.

Browser-accepted staging baseline before this phase:

- `ccd9ced0b146db9349a330aab92890f98b573173`

## Previous structure

`app/geometry-and-planning.js` contained approximately 519 lines spanning unrelated responsibilities:

- map drawing geometry
- label and bottle specification selection
- application-mode filtering
- station-to-label assignment
- inactive-station planning
- sensor visibility geometry
- wipe requirement calculation
- generated-program wipe analysis
- workbook-style program summaries
- Cold Glue map normalization and map rows

## New entrypoint

`app/geometry-and-planning.js` is now a small deterministic loader.

It exposes:

- `window.ServoForgeGeometryPlanningModules`
- `window.ServoForgeGeometryPlanningReady`

`app.js` waits for `ServoForgeGeometryPlanningReady` before application initialization.

## Module order

```text
geometry primitives
    ↓
label specification service
    ↓
label station planning service
    ↓
label sensor geometry service
    ↓
wipe analysis service
    ↓
program summary service
    ↓
Cold Glue map service
```

## Ownership

### `app/geometry-primitives.js`

Owns:

- `fmt`
- `norm`
- `angleToXY`
- `angleToSvgRotation`
- `arcPath`
- `bodyDiameter`
- `bodyCircumference`

Stored direction behavior is preserved exactly. The established historical mapping remains:

- stored `cw` uses the legacy clockwise-coordinate transform
- stored `ccw` uses the legacy counter-clockwise-coordinate transform

No saved direction values are rewritten or reinterpreted.

### `app/label-specification-service.js`

Owns:

- selected bottle lookup
- selected label lookup
- application-mode normalization
- application-specific label filtering
- bottle-reference repair
- selected-brand fallback

The public helpers remain:

- `selectedBottleSpec`
- `selectedLabelSpec`
- `normalizeLabelApplicationMode`
- `labelSpecMatchesApplication`
- `labelSpecsForApplication`
- `bottleTypeExists`
- `ensureBottleReferenceForLabel`
- `ensureSelectedBrandForApplication`

### `app/label-station-planning-service.js`

Owns:

- available label-section detection
- label-length station disabling and restoration
- station-to-label-section routing
- station operational status
- inactive waypoint flattening
- inactive movement-row explanations

The APL profile driver's existing station window definitions remain authoritative.

### `app/label-sensor-geometry-service.js`

Owns:

- signed circular angle difference
- finished-label inspection center
- sensor visibility percentage
- nearest sensor-compliant bottle target

Body and back labels continue to use half the developed label width to convert the application edge target into the finished-label centerline. Neck targets remain centerline-based and receive no half-width correction.

### `app/wipe-analysis-service.js`

Owns:

- section wipe-plan construction
- section wipe requirements
- station contact windows
- generated-program wipe accounting

Preserved behavior includes:

- neck physical length fallback when Neck Curve Bottom is zero
- center-tack two-stage mode for Cold Glue labels
- center-tack two-stage neck rollers
- two-stage APL outside/inside pads
- station-identity matching instead of fixed program-row indexes
- separate contact and outside-contact rotation totals

### `app/program-summary-service.js`

Owns:

- millimeter-to-degree conversion
- next-row ID calculation
- workbook-style program summary output

The summary retains its existing 26 rows and workbook reference descriptions.

### `app/cold-glue-map-service.js`

Owns:

- Cold Glue object normalization
- legacy `wipe` to `brush` conversion
- working Cold Glue map access
- reset behavior
- editable map-point row generation
- map-point lookup
- half-degree finish-angle rounding

## Physical duplicate removal

The following functions no longer exist in `app/geometry-and-planning.js`:

- `angleToXY`
- `selectedLabelSpec`
- `selectedLabelApplicationState`
- `labelSensorVisibility`
- `stationWipeAnalysis`
- `buildProgramSummary`
- `normalizeColdGlueMap`

The entrypoint contains no geometry formulas, label-selection rules, sensor formulas, wipe analysis, summary construction, or Cold Glue normalization.

## Compatibility preserved

This phase does not change:

- stored `cw` and `ccw` values
- zero-angle handling
- map SVG sweep direction
- label and bottle specification field names
- APL or Cold Glue application identifiers
- station label-section names
- sensor visibility fields
- wipe-plan mode names
- program action matching
- Cold Glue object property names
- program-summary row labels

All existing downstream code continues to call the same global function names.

## Offline behavior

The service worker already uses a network-first same-origin fetch strategy and caches every successful script response through `cacheResponse`.

The geometry/planning modules are therefore cached automatically when the loader requests them. No duplicate hardcoded module manifest was added to the service worker.

## Regression coverage

### `tests/geometry-planning-module-boundaries.test.js`

Guards:

- ordered module loading
- small loader size
- startup readiness gate
- absence of implementation code from the loader
- single ownership for each responsibility
- network-first service-worker module caching

### `tests/geometry-planning-services.test.js`

Covers:

- angle normalization
- stored `cw` geometry
- stored `ccw` geometry
- application-mode normalization
- label and bottle selection
- sensor inspection-center behavior
- sensor visibility and target selection
- station section routing
- operational-station detection
- two-stage neck wipe accounting
- program summary row count
- legacy Cold Glue `wipe` normalization
- Cold Glue map-row creation
- finish-angle rounding

## Browser validation targets

Verify:

- application startup
- map direction in both saved direction settings
- map arcs and object rotations
- label and bottle selectors
- APL neck/body/back station assignment
- absent-label station removal
- sensor visibility and orientation
- 45H TopModul three-label profile
- generic two-label APL profile
- Cold Glue label selection and map editing
- Cold Glue optimization
- validation wipe totals
- program summary output
- offline refresh after one online load

## Next phase

After browser confirmation, continue with the next remaining large runtime file. Highest-value candidates are:

1. `assemblies.js` — assembly normalization, angle derivation, and editor behavior
2. `map-rendering.js` — SVG construction, interaction, and object selection
3. `table-rendering.js` — program, simulation, validation, and summary rendering
