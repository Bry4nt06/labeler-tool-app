# Refactor Phase 8 — Modular Bootstrap Runtime

Date: 2026-08-02

## Objective

Remove unrelated updater, export, UI-event, animation, startup, and simulator-loading responsibilities from `app/bootstrap.js`.

This is a repository-wide infrastructure change. It is not specific to APL, Cold Glue, MIC, LandShark, or any individual product profile.

Last browser-verified baseline before this phase:

- `a78db6ed7804a2e78e4a71742408826473c1ae5b`

## Previous bootstrap responsibilities

The former `app/bootstrap.js` owned all of the following:

- a duplicate browser update implementation
- a stale staging release constant (`0.8.3`)
- file download helpers
- servo JSON and CSV export formatting
- global button and tab event binding
- simulation copy/reset controls
- animation-loop state and scheduling
- startup error rendering
- application initialization
- simulator milestone loading
- a stale simulator query version (`0.7.99`)

The active `app/update-manager.js` already replaces the update functions at runtime, which meant the previous bootstrap carried a second implementation that was not the final owner.

## New module boundaries

### `app/export-service.js`

Owns:

- browser download creation
- one-decimal/half-degree output formatting
- rounded servo export rows

Exposes:

- `window.LabelerExportService`
- compatibility globals `download`, `oneDecimalOutput`, and `roundedServoExportRow`

### `app/global-actions.js`

Owns:

- aggregate-spacing control
- wipe-down popup controls
- geometry input changes
- JSON, settings, and CSV export actions
- settings and fault import actions
- simulator copy/reset actions
- tab switching

Exposes:

- `window.LabelerGlobalActions`
- compatibility global `bindGlobalActions`

### `app/animation-runtime.js`

Owns:

- animation clock state
- animation-frame scheduling
- preview-angle advancement
- start and stop lifecycle

Exposes:

- `window.LabelerAnimationRuntime`
- compatibility globals `startAnimationLoop` and `stopAnimationLoop`

### `app/startup-runtime.js`

Owns:

- startup error rendering
- ordered application initialization
- simulator runtime loading
- runtime release-version lookup

The simulator script query now uses the managed application release value rather than the removed `0.7.99` bootstrap constant.

Exposes:

- `window.LabelerStartupRuntime`
- compatibility globals `initializeLabelerApp`, `showStartupError`, and `loadSimulatorRuntime`

### `app/bootstrap.js`

Now owns only:

- the ordered list of core bootstrap modules
- sequential module loading
- the `window.ServoForgeBootstrapReady` promise

The file is reduced from more than 300 lines to approximately 45 lines.

### `app.js`

The startup shim now waits for `ServoForgeBootstrapReady` before invoking `initializeLabelerApp`.

This creates a reusable core-module loading boundary that the future `profile-generation.js` family split can use without modifying the static HTML script list for every extracted module.

## Startup order

```text
Static core scripts from index.html
        ↓
app/bootstrap.js
        ↓
app/export-service.js
        ↓
app/global-actions.js
        ↓
app/animation-runtime.js
        ↓
app/startup-runtime.js
        ↓
app/update-manager.js
        ↓
app.js waits for ServoForgeBootstrapReady
        ↓
initializeLabelerApp()
        ↓
managed simulator runtime
```

`app/update-manager.js` remains the sole active owner of update checks, service-worker registration, stale-cache removal, and same-window update navigation.

## Preserved behavior

This phase does not intentionally change:

- saved-settings loading
- company default seeding
- persistent map creation
- Cold Glue example initialization
- setup or Map Builder binding
- export file formats
- CSV column ordering
- simulation copy/reset behavior
- tab behavior
- animation speed or angle math
- rendering order
- update-manager behavior
- profile generation or machine-family calculations

## Offline support

`service-worker.js` now caches the four extracted bootstrap modules and uses a new cache identity:

- `servoforge-labeler-staging-v0.9.2-bootstrap-modules-v1`

## Regression coverage

`tests/bootstrap-module-boundaries.test.js` verifies:

- all four modules are declared by the bootstrap loader
- all four modules are included in offline assets
- `app.js` waits for bootstrap readiness
- updater functions and stale constants do not return to `bootstrap.js`
- export functions remain in the export service
- action binding remains in the global-actions module
- animation lifecycle remains in the animation runtime
- startup and simulator loading remain in the startup runtime

## Next phase

With a deterministic pre-initialization module loader now available, the next phase can split `app/profile-generation.js` into:

1. APL seed and compact-profile generation
2. Cold Glue map-driven generation
3. APL map-driven generation
4. profile routing
5. machine-family framing
6. servo override persistence and application

Each extracted file can be loaded before application initialization through the same bootstrap readiness boundary, allowing the original oversized file to shrink rather than leaving duplicate fallback implementations active.
