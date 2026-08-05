# Refactor Phase 25 — Map Rendering Retirement

Date: 2026-08-03

## Objective

Complete rendering ownership by physically removing the remaining mechanical-map, Simulation-map, animation, overlay, bottle-visual, and map-reference implementations from `app/map-rendering.js`.

The former source combined:

- bottle label indicators;
- table quadrant references;
- aggregate-spacing overlays;
- map viewport state;
- complete mechanical SVG scene composition;
- complete Simulation SVG scene composition;
- incremental animation updates;
- application map-point rows;
- permanent map-reference presentation.

Phase 24 created focused owners for bottle visuals, overlays, animation, and reference presentation. Phase 25 extracts both scene builders and retires the monolith.

## Retired compatibility source

`app/map-rendering.js` is now a compact ownership marker. It defines no renderer, event handler, state mutation, or persistence behavior.

The marker identifies six focused owners:

1. `LabelerBottleVisualRenderer`
2. `LabelerMapOverlayRenderer`
3. `LabelerMapReferencePresenter`
4. `LabelerMechanicalMapSceneRenderer`
5. `LabelerSimulationMapSceneRenderer`
6. `LabelerMapAnimationRenderer`

## Mechanical map scene

### `app/mechanical-map-scene-renderer.js`

Owns:

- map viewport and viewBox application;
- active map title;
- table ring and zero-degree reference;
- preview-angle line and drag handle;
- bottle/head placement and rotation;
- legacy roller visuals that are not assembly-owned;
- active-move and all-program-move overlays;
- aggregate markers and spacing display;
- configured assembly rendering;
- center table-angle readout;
- fault overlay;
- animation-segment identity;
- permanent reference-table refresh.

The scene resolves all feature renderers at call time so later wrappers remain authoritative.

## Simulation map scene

### `app/simulation-map-scene-renderer.js`

Owns:

- Simulation SVG table ring;
- zero-degree and preview references;
- bottle/head placement using the Simulation program;
- drag handle;
- active and all-move overlays;
- aggregate and configured assembly presentation;
- center readout;
- fault overlay;
- current Simulation HMI/action text;
- Simulation plate/table position text;
- animation-segment identity.

## Direction compatibility

Both scenes preserve the historical stored-direction transform:

```text
stored cw  → servoSign -1
stored ccw → servoSign +1
```

No stored direction values are rewritten or reinterpreted.

## Load order

The presentation stage now loads:

1. bottle visuals;
2. map overlays;
3. map reference presenter;
4. mechanical scene;
5. Simulation scene;
6. animation renderer.

All six owners exist before workspace integrations, profile integrations, optimization wrappers, the render coordinator, and final diagnostics.

## Event ownership

This phase adds no event listeners. Existing delegated map controllers continue to own:

- zoom and pan;
- preview-angle dragging;
- map-object dragging;
- lock state;
- overlay toggles;
- map-reference opening;
- persistence.

## Production motion profile boundary

The production command reference added in Phase 24 remains preview-only:

```text
Rest (3) → Startup (1) → Continuous (5) → Changeover (6) → Continuous (5) → End (2) → Rest (3)
```

This rendering phase does not change servo generation, command grammar, table/plate setpoints, or machine-family enablement.

## Compatibility preserved

This phase does not change:

- map geometry;
- bottle indicator geometry or colors;
- aggregate positions;
- assembly drawing;
- sensor/coder presentation;
- movement overlays;
- fault overlays;
- map-point schema;
- profile generation;
- Simulation schema;
- stored direction behavior;
- validation or diagnostics.

## Regression coverage

`tests/map-rendering-retirement.test.js` guards:

- physical removal of all active implementations from `map-rendering.js`;
- focused ownership for bottle, overlay, reference, scene, and animation functions;
- presentation modules contain no listeners or persistence calls;
- dependency order before workspace integrations;
- render coordinator and diagnostics ordering;
- stored direction transforms;
- active-move and fault overlays remain present.
