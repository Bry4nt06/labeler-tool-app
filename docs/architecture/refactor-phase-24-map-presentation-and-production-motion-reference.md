# Refactor Phase 24 — Map Presentation Boundaries and Production Motion Reference

Date: 2026-08-03

## Objective

Continue rendering ownership by extracting low-risk responsibilities from `app/map-rendering.js`, and use a supplied production HMI reference to improve the Motion Profile Manager without changing the validated live generator.

## Production HMI evidence

The supplied HMI photograph shows the following drive-command legend:

- CMD 0 — Inactive
- CMD 1 — Startup
- CMD 2 — End
- CMD 3 — Rest
- CMD 4 — Special
- CMD 5 — Continuous
- CMD 6 — Changeover
- CMD 7 — Correction
- CMD 8 — Choice alignment
- CMD 9 — Dynamic alignment
- CMD 10 — Camera

The visible production rows contain two cycles using:

```text
Rest (3)
Startup (1)
Continuous (5)
Changeover (6)
Continuous (5)
End (2)
Rest (3)
```

A later row also shows the existing point-to-point pattern:

```text
Rest (3)
Correction (7)
Rest (3)
```

The photograph supports command identity and observed transition order. It does not establish machine-independent acceleration curves, timing rules, table-angle spacing, or safe automatic conversion from current 3/7 profiles.

## Production motion pattern driver

### `drivers/servo/production-motion-pattern-driver.js`

Registers:

```text
servo.production-pattern
```

It owns:

- the observed continuous speed-change pattern;
- the point-to-point correction pattern;
- supported transition validation;
- intent-to-command validation through the existing Servo command driver.

The verified continuous transition rules are:

```text
Rest       → Rest, Startup or Correction
Startup    → Continuous
Continuous → Continuous, Changeover or End
Changeover → Continuous
End        → Rest
Correction → Rest
```

These rules are intentionally reference-level and are not connected to live profile translation.

## Protected Profile Manager reference

### `app/production-motion-profile-reference-integration.js`

Reconciles one protected profile into the existing Motion Profile Manager storage:

```text
Production Continuous Reference
```

Intent sequence:

```text
Hold, Startup, Continuous, Changeover, Continuous, End, Hold
```

Command preview:

```text
3 → 1 → 5 → 6 → 5 → 2 → 3
```

The profile is marked built-in/read-only so normal custom-profile deletion does not remove it.

Its description explicitly states that it is preview/reference only. Automatic production generation remains on the validated Rest/Correction strategy until machine-specific timing and motion rules are available.

## Bottle visual presentation

### `app/bottle-visual-renderer.js`

Owns:

- bottle-local SVG arc paths;
- neck/body/back indicator definitions;
- active label-application lookup;
- passed-application visibility;
- manual Head 1 bottle-angle preview;
- bottle label indicator drawing.

Existing section colors, dimensions, and stored-direction behavior are unchanged.

## Map overlays

### `app/map-overlay-renderer.js`

Owns:

- optional 90°, 180°, 270°, and 359.9° references;
- aggregate-spacing arc paths;
- direction-aware label-path readability;
- minimum-spacing violation styling.

The existing stored direction mapping is preserved exactly.

## Map animation

### `app/map-animation-renderer.js`

Owns:

- lightweight SVG head updates;
- bottle-plate orientation updates;
- label-indicator visibility updates;
- preview line and rotator-handle updates;
- center-angle readout updates;
- Simulation action and position updates;
- fallback to full mechanical or simulation scene rendering when the active segment changes.

## Map-point and reference presentation

### `app/map-reference-presenter.js`

Owns:

- application map-point row construction;
- APL roller and pad rows;
- custom non-station map points;
- Cold Glue row routing through the existing Cold Glue map service;
- permanent reference-map rows and read-only table presentation.

## Transitional source fallback

`app/map-rendering.js` still owns the two complete scene builders for this browser-verification phase:

- `renderMap()`
- `renderSimulationMap()`

It also retains inactive source fallbacks for the extracted functions. The feature manifest loads the focused presentation owners before feature integrations and before application initialization, making the extracted functions authoritative at runtime.

The next phase can physically remove those fallback bodies and split the mechanical and Simulation scene builders.

## Load order

The feature manifest now loads:

1. the production motion pattern driver with core drivers;
2. focused table presentation;
3. focused map presentation;
4. workspace integrations;
5. profile pipeline and machine integrations;
6. the protected production reference profile;
7. the Motion Profile Manager;
8. the render coordinator;
9. validation diagnostics.

## Compatibility preserved

This phase does not change:

- live generated command output;
- Rest/Correction grammar;
- profile translation;
- table-angle or bottle-angle calculations;
- speed thresholds;
- stored direction values;
- bottle indicator dimensions or colors;
- aggregate-spacing formulas;
- map-point schema;
- map scene composition;
- Simulation scene composition;
- validation or diagnostics.

## Regression coverage

`tests/map-rendering-profile-pattern-boundaries.test.js` guards:

- focused map presentation ownership;
- absence of event and persistence ownership in presentation modules;
- staged scene-builder fallback retention;
- feature load order;
- exact observed command sequence;
- valid and invalid transition cases;
- protected reference-profile identity and wording;
- explicit preview-only safety status.
