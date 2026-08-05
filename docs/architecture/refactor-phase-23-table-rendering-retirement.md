# Refactor Phase 23 — Table Rendering Retirement

Date: 2026-08-02

## Objective

Complete the `table-rendering.js` refactor by physically removing every rendering, telemetry, event-binding, and render-cycle implementation from the former monolith.

The file previously contained approximately 930 lines spanning:

- station and head tables;
- shared select-option markup;
- Bottle and Label Specs;
- Build Inputs;
- Servo Program presentation and editing;
- Simulation presentation, editing, and saved profiles;
- active Servo row highlighting;
- validation presentation;
- wipe telemetry calculations and graphics;
- animation-frame rendering;
- the legacy application `render()` cycle.

## Retired compatibility source

`app/table-rendering.js` is now a compact compatibility marker. It defines no rendering functions, attaches no listeners, mutates no state, and owns no persistence.

The marker identifies the focused presentation owners and the `render.cycle` driver.

## Presentation core

The feature manifest now installs a `presentationCore` stage immediately after core drivers and before any feature integration that may decorate or wrap a renderer.

Ordered owners:

1. `app/table-presentation-helpers.js`
2. `app/specification-table-renderer.js`
3. `app/build-inputs-renderer.js`
4. `app/machine-data-table-renderer.js`
5. `app/servo-command-presentation.js`
6. `app/servo-program-active-row-renderer.js`
7. `app/servo-program-table-renderer.js`
8. `app/simulation-table-renderer.js`
9. `app/wipe-telemetry-service.js`
10. `app/wipe-telemetry-renderer.js`
11. `app/workspace-status-renderer.js`

The render coordinator remains later in the manifest so all feature-specific wrappers are installed before the authoritative application render cycle begins.

## Machine-data tables

### `app/machine-data-table-renderer.js`

Owns:

- application map-point rows;
- nearest-head calculations;
- table-angle and Cartesian readouts;
- head home/current table angles;
- current bottle-plate angle per head.

The station table uses stable row and field metadata and attaches no listeners.

### `app/controllers/station-table-controller.js`

Owns:

- editable custom map-point names;
- editable map-point angles;
- assembly/map-point synchronization;
- full render and assembly-editor refresh after an angle change.

Fixed, fixed-name, and station-owned rows remain protected exactly as before.

## Active Servo row presentation

### `app/servo-program-active-row-renderer.js`

Owns:

- action-key normalization;
- active HMI row highlighting;
- paired Rest/Correction row highlighting;
- active-row accessibility metadata and tooltips.

The existing program renderer calls this owner after rebuilding the table, and animation-frame rendering calls it while the preview advances.

## Wipe telemetry

### `app/wipe-telemetry-service.js`

Owns all wipe telemetry calculations:

- section inference;
- label-length selection;
- map-object contact detection;
- Cold Glue brush-channel expansion;
- physical-side matching;
- interval merging;
- contacted label coverage;
- center-tack versus leading-edge visualization state;
- active wipe context and telemetry result creation.

Stored direction behavior is preserved:

- stored `cw` produces the existing left-to-right telemetry presentation;
- stored `ccw` produces the existing right-to-left telemetry presentation.

No stored values are rewritten.

### `app/wipe-telemetry-renderer.js`

Owns the wipe panel DOM updates, progress fills, tack/backspin indicators, labels, and accessibility description.

## Workspace status presentation

### `app/workspace-status-renderer.js`

Owns:

- base validation detail and issue markup;
- top simulation-action visibility;
- lightweight animation-frame rendering.

The completed validation-diagnostics integration still wraps `renderValidation()` as the final feature stage and remains the authoritative diagnostics summary owner.

Validation-card navigation moved to the delegated setup-event controller, removing the final listener from status presentation.

## Event ownership

The delegated setup-event boundary now routes:

```text
Station table control
    ↓
LabelerStationTableController
    ↓
map/assembly synchronization
    ↓
render coordinator
```

It also owns validation-card navigation through the existing `selectMapBuilderObject()` action.

## Render ownership

The only application-wide `render()` owner is:

- `drivers/rendering/render-cycle-driver.js`
- `app/rendering-coordinator-integration.js`

The old source-level `render()` implementation has been physically removed.

## Compatibility preserved

This phase does not change:

- render preparation order;
- render presentation order;
- map-point calculations;
- head calculations;
- Servo Program schema;
- Simulation schema;
- saved simulation-profile schema;
- servo override keys;
- speed thresholds;
- validation rules or diagnostics aggregation;
- wipe coverage formulas;
- map geometry;
- stored direction values.

## Offline behavior

The new same-origin modules use the existing network-first service-worker path. Each module is cached automatically after its first successful online request, matching the current dynamic feature-loader strategy.

## Regression coverage

Updated:

- `tests/table-rendering-presentation-boundaries.test.js`
- `tests/rendering-coordinator.test.js`

Added:

- `tests/table-rendering-retirement.test.js`

The tests guard:

- physical removal of every legacy implementation;
- focused ownership of machine tables, Servo highlighting, wipe telemetry, validation, and animation rendering;
- presentation modules contain no listeners or persistence calls;
- station and validation events route through the delegated controller;
- presentation owners load before wrapper integrations;
- coordinator and diagnostics ordering;
- stored-direction telemetry presentation;
- station name and angle controller behavior.
