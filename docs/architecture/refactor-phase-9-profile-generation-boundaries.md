# Refactor Phase 9 — Profile Generation Boundaries

Date: 2026-08-02

## Objective

Begin physically separating `app/profile-generation.js` by moving cross-family orchestration out of the oversized generator file without changing APL, Cold Glue, map-driven, Autocol, or servo-override behavior.

Last browser-verified baseline before this phase:

- `94bb8e0a69085b278d1cb80d6b2d88f1dfb57978`

## Active entrypoint

`app/profile-generation.js` is now a small ordered loader. It no longer directly owns machine-family algorithms, profile routing, machine framing, or servo overrides.

It loads:

1. `app/profile-family-generators-legacy.js`
2. `app/profile-routing.js`
3. `app/machine-profile-framing.js`
4. `app/servo-overrides.js`

The loader exposes:

- `window.ServoForgeProfileGenerationModules`
- `window.ServoForgeProfileGenerationReady`

`app.js` awaits `ServoForgeProfileGenerationReady` before awaiting the modular bootstrap runtime and starting the application.

## Preserved family generator body

The exact verified blob previously stored at `app/profile-generation.js` is preserved at:

- `app/profile-family-generators-legacy.js`

This preserves the current implementations of:

- `generatedAplSeedProfile`
- `generatedAplTwoLabelProfile`
- `generatedColdGlueFixedProfile`
- `generatedAplMapDrivenProfile`

The copied compatibility file also still contains the old routing, framing, and override functions. Those definitions are intentionally superseded by the later active modules in this phase. They remain only as rollback-compatible source until the family algorithms are physically separated and browser-verified.

## New active ownership

### `app/profile-routing.js`

Owns:

- application-mode routing
- active machine-map routing
- compact APL eligibility
- continuous mechanical profile routing
- motion-plan termination metadata for the routed profile

Exposes:

- compatibility global `generatedServoProfile`
- `window.LabelerProfileRouter`

### `app/machine-profile-framing.js`

Owns:

- machine-type framing dispatch
- Autocol start-shape and start-Rest rows
- Autocol inter-move Rest insertion
- Autocol terminal End of curve row
- HMI/PLC reindexing for framed programs

Exposes:

- compatibility global `applyMachineTypeProfileFraming`
- `window.LabelerMachineProfileFraming`

### `app/servo-overrides.js`

Owns:

- profile-specific override keys
- table-angle and plate-angle override persistence
- generated-versus-overridden row fields
- final assignment to `state.program`

Exposes:

- compatibility globals `applyGeneratedServoProfile`, `servoOverrideProfileKey`, and `setServoAngleOverride`
- `window.LabelerServoOverrideService`

## Load order

```text
Static app/profile-generation.js
        ↓
Verified family generator compatibility body
        ↓
Active profile router
        ↓
Active machine framing
        ↓
Active servo override service
        ↓
ServoForgeProfileGenerationReady
        ↓
Modular bootstrap runtime
        ↓
Application initialization
```

This order ensures the new owners replace the compatibility definitions before any program is generated.

## Offline support

The service worker now caches all four profile-generation modules and uses cache identity:

- `servoforge-labeler-staging-v0.9.2-profile-modules-v1`

## Regression coverage

`tests/profile-generation-module-boundaries.test.js` verifies:

- the active profile entry remains a small loader
- all modules are loaded and cached
- application startup waits for profile readiness and bootstrap readiness
- family generator functions remain present in the preserved body
- routing functions moved to the router module
- Autocol framing moved to the framing module
- override functions moved to the override service
- Cold Glue and active-map routing match the verified implementation
- Autocol framing matches the verified implementation for a representative command sequence
- servo override application matches the verified implementation

## Known transitional duplication

The compatibility body still contains old copies of:

- `generatedServoProfile`
- `applyGeneratedServoProfile`
- `servoOverrideProfileKey`
- `setServoAngleOverride`
- `applyMachineTypeProfileFraming`

They are not the final active owners because the dedicated modules load afterward. They will be physically deleted when the compatibility body is divided into the three family files below.

This transitional duplication is explicit, isolated, and guarded. It is preferable to modifying the family algorithms and orchestration simultaneously without a verified rollback boundary.

## Next extraction

The next phase divides `profile-family-generators-legacy.js` into:

1. `app/apl-seed-profile.js`
   - APL seed geometry
   - compact two-label reference profile
2. `app/cold-glue-profile-generation.js`
   - Cold Glue map planning
   - brush-channel allocation
   - sensor handling
   - Cold Glue row generation
3. `app/apl-map-profile-generation.js`
   - map-driven APL station planning
   - roller/pad wipe allocation
   - map-driven coder planning

After cross-family browser validation, the compatibility file can be deleted and the profile loader can reference only the three family modules plus routing, framing, and overrides.
