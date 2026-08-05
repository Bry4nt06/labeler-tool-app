# Refactor Phase 26 — Setup Bindings Retirement

Date: 2026-08-03

## Objective

Retire the original `app/setup-bindings.js` event monolith after the delegated controller boundary and focused map/settings controllers became authoritative.

## Previous transitional state

The application already loaded:

- `LabelerSettingsController`;
- `LabelerMapController`;
- `LabelerSimulationController`;
- the delegated capture-phase setup event boundary.

However, startup still called `bindSetup()`. That function attached a second set of direct listeners for settings, map movement, builder visibility, overlays, playback, direction, and lock state.

The capture-phase boundary normally prevented those bubble-phase listeners from running, but the duplicate implementations remained a maintenance and regression risk.

## New setup state owner

### `app/controllers/setup-state-controller.js`

This controller performs startup hydration only. It restores:

- theme and workspace presentation;
- machine geometry controls;
- preview table and bottle angles;
- animation speed and threshold controls;
- equipment depth fields;
- direction;
- map geometry settings;
- quadrant and move-overlay checkboxes;
- builder visibility;
- lock-state presentation.

It attaches no listeners, performs no persistence, and triggers no application render.

## Event ownership

All setup events remain routed through `app/controllers/setup-event-controller-integration.js`.

The event boundary owns:

- settings and geometry changes;
- map zoom and pointer interaction;
- rotator movement;
- editable map-object movement;
- map locking and reset;
- builder and reference-map controls;
- overlay toggles;
- stored-direction changes;
- playback and preview controls.

The underlying behavior remains in `LabelerMapController`, `LabelerSettingsController`, and `LabelerSimulationController`.

## Startup sequence

Startup now performs:

1. restore saved settings;
2. reconcile company defaults;
3. ensure application maps;
4. initialize any required company example;
5. hydrate setup controls through `LabelerSetupStateController.initialize()`;
6. bind Map Builder-specific controls;
7. bind remaining global actions;
8. run the authoritative render cycle;
9. start animation and update services.

`bindSetup()` is no longer called.

## Retired source

`app/setup-bindings.js` is now a compatibility marker identifying:

- setup state owner;
- delegated event owner;
- map controller owner;
- settings controller owner.

It contains no listeners, state mutation, persistence, or rendering.

## Compatibility preserved

This phase does not change:

- stored direction values or transforms;
- map-object angle calculations;
- brush-channel movement;
- sensor and coder movement spans;
- map zoom limits;
- builder history behavior;
- lock semantics;
- overlay exclusivity;
- animation speed limits;
- profile generation;
- catalog data;
- diagnostics.

## Regression coverage

`tests/setup-bindings-retirement.test.js` verifies:

- the legacy binding function is absent;
- the compatibility marker contains no listeners, persistence, or render ownership;
- the state initializer attaches no listeners;
- startup uses the state initializer rather than `bindSetup()`;
- controller load order is deterministic;
- map interactions remain owned by the map controller and delegated boundary;
- startup hydration restores representative controls and lock presentation.
