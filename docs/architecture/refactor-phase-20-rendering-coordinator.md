# Refactor Phase 20 — Final Assembly Ownership and Rendering Coordinator

Date: 2026-08-02

## Objective

Complete assembly ownership by removing the remaining model and geometry fallback implementations from `app/assemblies.js`, then begin rendering ownership with one authoritative render-cycle coordinator.

Current staging baseline before this phase:

- `cd6ce04da1792d10ab36e5238279890546eb02ed`

That baseline includes the completed validation/diagnostics boundary and the setup/event-controller phase. Both remain unchanged.

## Assembly completion

`app/assemblies.js` is now a small compatibility marker only. It no longer defines assembly model, geometry, synchronization, status, label, or selector functions.

The only physical owners are now:

- `drivers/assembly/assembly-model-driver.js`
- `drivers/assembly/assembly-geometry-driver.js`
- `app/assembly-driver-adapter.js`
- `app/assembly-editor-controller.js`
- `app/assembly-map-renderer.js`

The public function names remain unchanged because the adapter installs the driver implementations before application initialization.

## Rendering ownership problem

The existing global `render()` function combines two different responsibilities:

1. preparing authoritative application state and regenerating the servo profile;
2. presenting every workspace and table.

That makes rendering order implicit and allows UI files to become accidental owners of state normalization or profile generation.

## New render-cycle driver

`drivers/rendering/render-cycle-driver.js` registers:

- `render.cycle`

It owns the explicit stage order.

### Preparation stages

1. persistent map reconciliation
2. valid brand selection
3. label-length station rules
4. active-map synchronization
5. assembly-to-map-point synchronization
6. generated servo profile application

### Presentation stages

1. mechanical map
2. map-point table when present
3. bottle specifications
4. label specifications
5. build inputs
6. servo program
7. simulation
8. head table
9. validation
10. top controls

The driver does not know browser state or DOM elements. It only executes supplied stage handlers in the declared order.

## Browser coordinator

`app/rendering-coordinator-integration.js` installs the authoritative `render()` function after feature integrations and optimization stages are available, but before validation diagnostics completes application initialization.

The coordinator resolves each dependency at call time. This preserves later wrappers such as the final validation diagnostics renderer rather than capturing an earlier function reference.

Station rendering remains conditional when its workspace element is absent.

## Transitional boundary

`app/table-rendering.js` still contains the old render function as a source-level fallback for this phase. It is superseded before application initialization by the rendering coordinator.

The next rendering phase will physically remove that fallback and divide presentation ownership into focused modules for:

- specification tables
- build-input presentation
- servo-program and simulation tables
- wipe telemetry
- map scene and animation

## Compatibility preserved

This phase does not change:

- map or settings persistence
- setup/event controller behavior
- label and bottle calculations
- assembly geometry
- station activation rules
- profile generation
- stored direction values
- sensor or coder calculations
- servo thresholds
- validation or diagnostic decisions
- rendering order

## Offline behavior

The render-cycle driver and coordinator load through the feature manifest. The service worker's network-first same-origin fetch path caches both scripts after their first successful online load.

## Regression coverage

`tests/rendering-coordinator.test.js` verifies:

- `render.cycle` registration
- exact preparation and presentation order
- conditional station rendering
- authoritative render replacement
- final assembly fallback removal
- coordinator-before-diagnostics feature ordering

The assembly boundary regressions now require `app/assemblies.js` to contain no assembly function implementation.
