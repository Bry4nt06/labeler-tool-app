# Refactor Phase 22 — Servo Program and Simulation Presentation Ownership

Date: 2026-08-02

## Objective

Continue the physical rendering cleanup by separating Servo Program and Simulation presentation from mutation, persistence, profile-library actions, and render-cycle ownership.

This phase builds on:

- the render-cycle coordinator;
- the delegated setup/event controller boundary;
- the focused Specs renderer;
- the focused Build Inputs renderer.

## Previous ownership

`app/table-rendering.js` still combined:

- Autocol command-control markup;
- Servo Program table construction;
- Servo Program row mutation;
- simulation table construction;
- simulation row mutation;
- saved simulation-profile markup;
- saved simulation-profile create/load/delete behavior.

The same function that created a row also attached closures that mutated application state. This made presentation dependent on event-binding timing and prevented the shared controller boundary from being authoritative.

## Shared command presentation

### `app/servo-command-presentation.js`

Owns:

- active-machine Autocol command detection;
- Autocol command labels;
- CMD input/select markup;
- optional delegated-event metadata on generated controls.

The public compatibility names remain:

- `activeMachineUsesAutocolCommands()`
- `autocolCommandLabel()`
- `servoCommandControl()`

## Servo Program controller

### `app/controllers/servo-program-controller.js`

Owns:

- generated-program command edits;
- table-angle override edits;
- bottle-angle override edits;
- action-text edits.

Angle overrides continue to use the existing `setServoAngleOverride()` service and profile key. This phase does not change override storage or generated-profile calculations.

## Simulation editor controller

### `app/controllers/simulation-editor-controller.js`

Owns:

- simulation command changes;
- custom table and plate angles;
- simulation action text;
- line deletion;
- Autocol line insertion before End curve;
- custom simulation profile creation;
- saved-profile selection;
- saved-profile loading;
- saved-profile deletion.

Existing simulation helpers remain authoritative for command normalization, line insertion/deletion, and Autocol boundaries.

## Servo Program renderer

### `app/servo-program-table-renderer.js`

Owns the active Servo Program table presentation:

- HMI and PLC columns;
- generated angles;
- override controls;
- travel and encoder values;
- fault and speed status;
- active-row metadata;
- action controls.

The renderer attaches no listeners and performs no persistence.

## Simulation renderer

### `app/simulation-table-renderer.js`

Owns:

- custom simulation library presentation;
- saved-profile details;
- simulation summary;
- Autocol command presentation;
- simulation lines and line controls;
- travel, encoder, status, and speed cells.

Stable control IDs and classes are preserved so the delegated controller can route browser events without compatibility translation.

## Delegated event flow

The setup-event integration now routes:

```text
Servo Program control
    ↓
LabelerServoProgramController
    ↓
existing override/profile services
    ↓
render coordinator
```

and:

```text
Simulation control
    ↓
LabelerSimulationEditorController
    ↓
existing simulation engine
    ↓
render coordinator or targeted map refresh
```

Capture-phase handling prevents the older bubble-phase row listeners in `table-rendering.js` from running.

## Load order

Bootstrap controller order:

1. existing Simulation controller;
2. Servo Program controller;
3. Simulation editor controller;
4. Application controller;
5. delegated setup-event integration.

Feature rendering order:

1. Specs renderer;
2. Build Inputs renderer;
3. shared command presentation;
4. Servo Program renderer;
5. Simulation renderer;
6. render coordinator;
7. validation diagnostics.

## Transitional source fallback

The former Servo Program, Simulation, Specs, and Build Inputs implementations still exist inside `app/table-rendering.js` during this browser-verification phase.

They are superseded before application initialization. The next physical cleanup can remove those fallback bodies and the obsolete source-level `render()` function after staging confirmation.

## Compatibility preserved

This phase does not change:

- Servo Program row schema;
- simulation state schema;
- saved simulation-profile schema;
- command grammar;
- Autocol start/end boundary rules;
- servo override keys;
- generated profile formulas;
- encoder calculations;
- speed thresholds;
- diagnostics;
- map geometry;
- stored direction values.

## Offline behavior

The new bootstrap controllers and feature renderers use the existing same-origin network-first service worker path. Each successful online response is cached automatically for subsequent offline use.

## Regression coverage

`tests/servo-simulation-presentation-boundaries.test.js` verifies:

- presentation modules contain no listener, persistence, or recursive-render ownership;
- stable delegated-event metadata and control IDs;
- controller APIs and basic state mutations;
- override delegation;
- controller bootstrap ordering;
- renderer feature ordering;
- diagnostics remains the final feature stage.
