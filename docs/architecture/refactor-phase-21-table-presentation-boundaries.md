# Refactor Phase 21 — Specification and Build Input Presentation Boundaries

Date: 2026-08-02

## Objective

Continue rendering ownership by separating Bottle Specs, Label Specs, and Build Inputs presentation from `app/table-rendering.js` without changing their DOM contracts, calculations, controller behavior, persistence, or profile regeneration.

Current staging baseline before this phase:

- `9a0d649cc44976c17342bab5dc8b30a80f855557`

That baseline includes completed assembly ownership, the render-cycle coordinator, validation/diagnostics ownership, and the setup/event-controller boundary.

## Previous state

`app/table-rendering.js` rendered the specification and Build Inputs workspaces and also attached row-level event listeners that directly mutated state, persisted settings, and triggered the full application render.

The setup-controller phase already established authoritative controllers for those changes:

- `app/controllers/specs-controller.js`
- `app/controllers/build-inputs-controller.js`
- `app/controllers/setup-event-controller-integration.js`

The old dynamically attached handlers remained as bubble-phase fallbacks.

## New presentation ownership

### `app/specification-table-renderer.js`

Owns active presentation for:

- Bottle Specs table structure
- bottle type and geometry input rows
- calculated bottle diameter and circumference cells
- Label Specs table structure
- application selectors
- label geometry input rows
- add and delete button markup

It preserves the existing IDs, row order, field order, classes, button classes, information tips, and table columns.

It attaches no event listeners and performs no persistence or render recursion.

### `app/build-inputs-renderer.js`

Owns active presentation for:

- Zone and Site selectors
- Brand and Bottle selectors
- label and bottle geometry fields
- APL-specific parameters
- Cold Glue-specific parameters
- contact and over-wipe fields
- coder position field
- machine feed fields
- workbook feed summary

It preserves all existing input IDs used by the delegated controller boundary.

It attaches no event listeners and performs no persistence or render recursion.

## Event ownership

Mutation remains with the setup controllers:

```text
presentation control
    ↓
capture-phase delegated event integration
    ↓
Specs or Build Inputs controller
    ↓
workspace action service
    ↓
map synchronization / profile regeneration / persistence
    ↓
render coordinator
```

This removes duplicate row-level event ownership from the active renderer path.

## Load order

The rendering feature group now loads:

```text
specification table renderer
    ↓
Build Inputs renderer
    ↓
rendering coordinator
    ↓
validation diagnostics
```

The coordinator resolves the active renderer functions at call time.

## Transitional fallback

`app/table-rendering.js` still contains its previous `renderBottleSpecs`, `renderLabelSpecs`, and `renderBuildInputs` definitions for this browser-verification phase.

Those definitions load earlier but are superseded by the focused presentation modules before application initialization.

After browser confirmation, the next table-rendering phase can physically remove those fallback bodies and continue extracting:

- servo-program presentation
- simulation presentation and saved-profile display
- machine data tables
- wipe telemetry
- the obsolete source-level `render()` implementation

## Compatibility preserved

No changes were made to:

- specification schemas
- catalog reconciliation
- official or custom records
- Build Input property names
- DOM IDs or table field order
- Zone/Site values
- APL or Cold Glue filtering
- brand-to-bottle associations
- geometry conversions
- centerline calculations
- coder-position calculations
- head-pitch or encoder calculations
- persistence behavior
- profile regeneration
- render-cycle order
- validation or diagnostics

## Offline behavior

The focused renderers load through the existing feature manifest. The service worker's network-first same-origin strategy caches both successful script responses after the first online staging load.

## Regression coverage

`tests/table-rendering-presentation-boundaries.test.js` verifies:

- focused renderer ownership
- no event listeners in presentation modules
- no persistence or recursive render calls in presentation modules
- stable Specs and Build Inputs control IDs
- continued controller ownership
- focused-renderer-before-coordinator load order
- diagnostics remaining the final feature stage
- temporary fallback presence for this acceptance phase
- focused module-size ceilings
