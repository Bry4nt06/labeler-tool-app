# Refactor Phase 10 — Physical Profile Family Extraction

Date: 2026-08-02

## Objective

Remove the temporary `app/profile-family-generators-legacy.js` compatibility monolith and establish one active source file for each profile-generation family.

Last browser-verified baseline before this phase:

- `37d7bb103876af1cbb9acf09a043528a3faa1b35`

## Previous transitional structure

Phase 9 reduced `app/profile-generation.js` to a loader and moved routing, machine framing, and servo overrides into dedicated modules. To keep that migration reversible, the verified 1,252-line generator body was temporarily copied into `app/profile-family-generators-legacy.js`.

That compatibility file still contained:

- APL seed generation
- compact two-label APL generation
- Cold Glue generation
- map-driven APL generation
- obsolete duplicate profile routing
- obsolete duplicate Autocol framing
- obsolete duplicate servo override functions

The later modules became the active owners, but the repository still retained duplicate implementations.

## New family ownership

### `app/apl-seed-profile.js`

Owns only:

- `generatedAplSeedProfile`
- `generatedAplTwoLabelProfile`
- APL workbook/template seed geometry
- compact two-label reference timing and coding metadata

Exposes:

- `window.LabelerAplSeedProfileGenerator`

### `app/cold-glue-profile-generation.js`

Owns only:

- `generatedColdGlueFixedProfile`
- Cold Glue aggregate and station routing
- brush and brush-channel allocation
- flow-facing entry orientation
- roller passes
- sensor-assisted orientation
- Cold Glue terminal-row and motion-plan construction

Exposes:

- `window.LabelerColdGlueProfileGenerator`

### `app/apl-map-profile-generation.js`

Owns only:

- `generatedAplMapDrivenProfile`
- map-driven APL station grouping
- pad and roller wipe allocation
- long-neck adaptive wipe allocation
- sensor-assisted APL orientation
- map-driven coder placement and direct shortest-path targeting
- map-driven APL terminal-row and motion-plan construction

Exposes:

- `window.LabelerAplMapProfileGenerator`

## Source-preservation method

The three family modules were reconstructed from exact contiguous source ranges in the browser-verified compatibility blob:

- APL seed and compact two-label: former lines 1–276
- Cold Glue: former lines 278–690
- map-driven APL: former lines 692–1078

No machine formula, row action, issue code, timing constant, direction calculation, brush allocation, sensor rule, coder target, or terminal policy was intentionally rewritten during this extraction.

The committed Git blob hashes were compared against the locally syntax-checked reconstructed sources before the compatibility file was deleted.

## Deleted redundancy

Removed:

- `app/profile-family-generators-legacy.js`

This physically removes the old duplicate definitions of:

- `generatedServoProfile`
- `applyMachineTypeProfileFraming`
- `applyGeneratedServoProfile`
- `servoOverrideProfileKey`
- `setServoAngleOverride`

The active owners remain:

- `app/profile-routing.js`
- `app/machine-profile-framing.js`
- `app/servo-overrides.js`

## Final profile load order

```text
app/apl-seed-profile.js
        ↓
app/cold-glue-profile-generation.js
        ↓
app/apl-map-profile-generation.js
        ↓
app/profile-routing.js
        ↓
app/machine-profile-framing.js
        ↓
app/servo-overrides.js
        ↓
app/profile-translation-service.js
        ↓
ServoForgeProfileGenerationReady
        ↓
application startup
```

This order guarantees that:

- Cold Glue and map-driven APL can call the shared APL seed generator.
- The router sees all family generators.
- machine framing runs after profile selection.
- overrides run after framing.
- planner translation attaches to the final override function and preserves `motionEventId` metadata.

## Offline support

`service-worker.js` now caches all seven profile modules and no longer references the deleted compatibility file.

New cache identity:

- `servoforge-labeler-staging-v0.9.2-profile-family-modules-v1`

The profile translation service is also explicitly cached; it was previously loaded dynamically but omitted from the offline asset list.

## Regression coverage

`tests/profile-generation-module-boundaries.test.js` now verifies:

- all seven modules load in dependency order
- all seven modules are included in offline assets
- application startup waits for profile and bootstrap readiness
- the compatibility monolith remains deleted
- each family file contains only its assigned generator family
- routing, framing, overrides, and translation remain separate owners
- every major profile function has exactly one active definition
- key APL, Cold Glue, long-neck, coder, and translation markers remain present

Local validation completed for:

- JavaScript syntax of all three family modules
- service-worker syntax
- profile boundary regression
- exact committed-versus-tested Git blob hashes

## Preserved behavior targets

Browser validation should cover:

- generic three-label APL
- body-and-back APL
- LandShark body/back and coder sequence
- MIC family
- Cold Glue brush and gripper maps
- sensor-assisted APL and Cold Glue maps
- blank maps
- Autocol framing
- both physical machine directions
- planner event IDs and servo validation alignment

## Next repository-wide cleanup

The next high-value redundancy target is `app/profile-translator-integration.js`. Its profile translation engine is now owned by `app/profile-translation-service.js`, so the integration can be reduced to UI, profile-selection persistence, and display concerns without retaining a second translation implementation.

After that consolidation, the next oversized subsystem is `app/wipe-down-builder.js`, which will be divided into map schema/normalization, map persistence, runtime synchronization, renderer, controller, and history modules.
