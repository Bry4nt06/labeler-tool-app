# Refactor Phase 19 — Setup and Event Controllers

Date: 2026-08-02

## Objective

Separate setup and workspace event handling from direct state mutation, profile regeneration, persistence, and rendering.

The affected event surface includes:

- settings
- bottle and label specifications
- Build Inputs
- workspace tabs
- map interaction
- application changes
- import and export
- simulation controls

## Previous behavior

Setup behavior was distributed across:

- `app/setup-bindings.js`
- `app/global-actions.js`
- dynamic handlers inside `app/table-rendering.js`
- application changes inside `app/map-builder-controller.js`

Individual handlers commonly performed several responsibilities together:

1. read a DOM value
2. mutate `state`
3. synchronize the active machine map
4. regenerate the servo profile
5. save browser settings
6. render one or more workspaces

That made seemingly small UI changes difficult to test independently and made side-effect order dependent on the handler that happened to own the control.

## Shared action service

### `app/controllers/workspace-action-service.js`

The action service owns the common side-effect sequence:

```text
controller mutation
    ↓
map or assembly synchronization
    ↓
optional profile regeneration
    ↓
persistence
    ↓
targeted presentation refresh
```

It exposes:

- `execute(options)`
- `render(targets)`
- `call(name, ...args)`
- numeric input normalization

The service intentionally calls the existing application services and renderers. This phase does not replace profile generation, persistence, map runtime, or presentation implementations.

## Small controllers

### Settings controller

`app/controllers/settings-controller.js`

Owns:

- theme and workspace view changes
- machine geometry settings
- depth settings
- map overlays
- assembly geometry settings
- general persisted map settings

### Map controller

`app/controllers/map-controller.js`

Owns:

- Map Builder drawer visibility
- labeler-map reference visibility
- map lock state
- reset and zoom
- preview table and bottle angles
- direction changes
- map undo
- map pan, rotator drag, and object drag lifecycle

### Specs controller

`app/controllers/specs-controller.js`

Owns:

- bottle-spec creation, editing, renaming, and deletion
- label-spec creation, editing, application assignment, and deletion
- selected bottle and label-reference reconciliation

### Build Inputs controller

`app/controllers/build-inputs-controller.js`

Owns:

- zone and site selection
- brand and bottle selection
- direct Build Input fields
- geometry conversions between millimeters and degrees
- centerline calculations
- head-pitch, table-scale, encoder, and speed-threshold changes

### Tabs controller

`app/controllers/tabs-controller.js`

Owns active workspace selection and tab/panel presentation state.

### Transfer controller

`app/controllers/transfer-controller.js`

Owns UI commands for:

- JSON export
- CSV export
- portable settings export and import
- fault configuration import
- manual settings save
- update checks
- selected map export

The controller delegates file generation, downloads, parsing, storage, and update checks to existing services.

### Simulation controller

`app/controllers/simulation-controller.js`

Owns:

- play and pause
- animation speed
- loading generated turns
- clearing custom turns
- inserting simulation command pairs

`app/animation-runtime.js` now exposes `resetClock()` so playback timing remains owned by the animation service rather than a UI handler.

### Application controller

`app/controllers/application-controller.js`

Owns:

- APL and Cold Glue mode changes
- active map selection
- application-specific object normalization
- selected-brand reconciliation
- runtime map loading

## Delegated event boundary

### `app/controllers/setup-event-controller-integration.js`

One capture-phase delegated boundary translates browser events into controller calls.

It handles static and dynamically rendered controls without adding stateful closures to every rendered row.

The boundary covers:

- `change`
- `input`
- `focusin`
- `submit`
- `click`
- `wheel`
- pointer down, move, up, and cancel

For controlled events it stops the older bubble-phase handler from executing. This prevents duplicate mutation, persistence, regeneration, or rendering while retaining the previous binding code as a compatibility fallback.

## Load order

The bootstrap module sequence is now:

```text
export service
    ↓
workspace action service
    ↓
settings / map / specs / Build Inputs controllers
    ↓
tabs / transfer / simulation / application controllers
    ↓
delegated setup-event integration
    ↓
legacy global action definitions
    ↓
animation runtime
    ↓
startup runtime
```

The controller integration is installed before `initializeLabelerApp()` calls the existing binding functions.

## Compatibility preserved

This phase does not change:

- DOM IDs or rendered table structure
- settings storage schema
- portable settings format
- exported JSON or CSV columns
- map-library schema
- bottle-spec or label-spec schema
- Build Input property names
- application mode values
- simulation state schema
- profile generation rules
- map rendering geometry
- validation rules

## Transitional compatibility code

`bindSetup()`, `bindGlobalActions()`, and dynamic table-rendering handlers still exist.

They currently provide initialization and a fallback implementation. For events owned by the delegated controller boundary, their bubble-phase listeners are prevented from running.

A later cleanup phase can physically remove the superseded handler bodies after browser acceptance confirms:

- settings persistence
- spec editing
- Build Input regeneration
- tab changes
- map pan, zoom, and object drag
- APL / Cold Glue switching
- import and export
- simulation playback and custom-turn controls

## Regression coverage

`tests/setup-event-controllers.test.js` covers:

- loading every controller in dependency order
- controller API registration
- shared action-service render targeting
- settings synchronization and persistence
- bottle rename propagation into label references
- Build Input mutation
- application-mode map loading
- generated-turn simulation loading
- delegated event-type registration
- bootstrap ordering before startup

## Offline and version behavior

The controller modules use the same application version query as the other bootstrap modules. This preserves release-readiness version alignment.

Because the controller files are new paths, they cannot collide with an older cached response. The service worker's same-origin network-first strategy caches each successful controller response after the first online staging load.