# ServoForge Repository Cleanup Inventory

Date: 2026-08-02

## Scope

This inventory covers the entire staging application, not one product or one generated program. LandShark remains a regression fixture because it exercises body/back application, coder orientation, handoff, and Rest grammar at the same time. It is not the architectural boundary of the cleanup.

Last browser-verified baseline before this repository-wide pass:

- `cb056a9b368ff67076fd8e8c06c47f53127944b3`

## Classification model

Every application script should ultimately be classified as one of the following:

- **ACTIVE CORE** — required application infrastructure
- **ACTIVE FEATURE** — one feature or machine-family capability
- **COMPATIBILITY ONLY** — temporary migration surface with no new behavior
- **SUPERSEDED** — replaced by a newer implementation
- **DUPLICATED** — repeats logic owned by another active module
- **UNREFERENCED** — not loaded, cached, imported, or called
- **SAFE TO DELETE** — proven superseded or unreferenced

## Cleanup completed in this pass

### Deleted superseded Cold Glue integration

Deleted:

- `app/cold-glue-gripper-sequence-integration.js`

Reason:

- it was the sequence version 1 implementation
- the active loader uses `app/cold-glue-gripper-sequence-integration-v2.js`
- the service-worker asset list uses only v2
- the v2 implementation contains explicit migration support for version 1 maps

Classification:

- v1: **SUPERSEDED / SAFE TO DELETE**
- v2: **ACTIVE FEATURE**

### Consolidated retired Zone/Site behavior

`app/zone-site-configuration.js` is now a passive compatibility API only.

It retains:

- deprecated metadata removal
- no-op functions required by older modules or imported settings
- the retired configuration document shape
- one explicit bind function used by current startup

It no longer owns:

- click interception
- save/delete map behavior
- MutationObserver cleanup
- browser-storage rewriting
- runtime function wrappers

Those active responsibilities remain solely in:

- `app/remove-zone-site-integration.js`

Classification:

- `zone-site-configuration.js`: **COMPATIBILITY ONLY**
- `remove-zone-site-integration.js`: **ACTIVE FEATURE / migration enforcement**

### Grouped the dynamic integration loader

`app/simulation-collapsible-integration.js` now defines named feature groups instead of one anonymous flat module list:

1. `coreDrivers`
2. `workspaceCore`
3. `aplGeneration`
4. `profilePipeline`
5. `coldGlue`
6. `mapBuilder`
7. `catalogs`
8. `finalProfileStages`
9. `optimization`

The previous load order is preserved exactly.

The runtime now exposes:

- `window.LabelerIntegrationFeatureManifest.groups`
- `window.LabelerIntegrationFeatureManifest.features`
- `window.LabelerIntegrationFeatureManifest.orderedModules`

This provides one visible owner for every dynamically loaded script and enables duplicate-load checks.

## Repository-wide status

### Active core infrastructure

| Module | Classification | Current responsibility | Cleanup direction |
|---|---|---|---|
| `app/defaults.js` | ACTIVE CORE | Default state and constants | Separate immutable defaults from migration defaults |
| `app/persistence.js` | ACTIVE CORE | Saved settings and snapshots | Move migrations into versioned migration services |
| `app/bootstrap.js` | ACTIVE CORE / OVERSIZED | Updater, export, actions, animation, startup | Split updater, export service, action binding, animation runtime, startup |
| `app.js` | ACTIVE CORE | Minimal startup shim | Keep minimal |
| `drivers/core/driver-registry.js` | ACTIVE CORE | Driver registration and resolution | Keep |
| `drivers/profile/profile-pipeline-driver.js` | ACTIVE CORE | Ordered profile stages | Expand carefully after family regression |

### Oversized mixed-responsibility modules

| Module | Classification | Known mixed responsibilities | Planned split |
|---|---|---|---|
| `app/profile-generation.js` | ACTIVE CORE / OVERSIZED | APL seeds, compact body/back, Cold Glue, map-driven profiles, coder geometry, machine framing, overrides, routing | Family profile drivers plus orchestrator |
| `app/wipe-down-builder.js` | ACTIVE FEATURE / OVERSIZED | Schema, normalization, migration, persistence, runtime sync, rendering, events, history | Schema, normalizer, library service, runtime adapter, renderer, controller, history |
| `app/geometry-and-planning.js` | ACTIVE CORE / OVERSIZED | SVG geometry, products, sensors, wipe analysis, inactive stations, workbook summaries | Geometry driver, visibility driver, wipe planner, workbook adapter |
| `app/bootstrap.js` | ACTIVE CORE / OVERSIZED | Update service, exports, global actions, animation, startup | Five focused modules |
| `app/simulation-collapsible-integration.js` | ACTIVE CORE | Ordered dynamic feature loading | Feature groups added; later move groups to a static manifest |

### Profile and orientation subsystem

| Module | Classification | Status |
|---|---|---|
| `drivers/profile/coder-orientation-driver.js` | ACTIVE CORE DRIVER | Shared direction and code-box calculations |
| `drivers/profile/map-object-orientation-driver.js` | ACTIVE CORE DRIVER | Shared map-object target and window decisions |
| `drivers/profile/coder-handoff-driver.js` | ACTIVE CORE DRIVER | Shared wipe-to-coder handoff planning |
| `drivers/profile/map-object-row-builder-driver.js` | ACTIVE CORE DRIVER | Shared row construction |
| `drivers/profile/orientation-issue-factory-driver.js` | ACTIVE CORE DRIVER | Shared issue construction |
| `app/map-object-servo-orientation-integration.js` | ACTIVE PIPELINE STAGE | Stage 300 with legacy fallback |
| `app/map-object-coder-after-wipe-integration.js` | ACTIVE PIPELINE STAGE | Stage 400 with legacy fallback |
| `app/clockwise-code-box-orientation-integration.js` | ACTIVE PIPELINE STAGE | Stage 500 with legacy fallback |
| `app/coder-rest-grammar-repair-integration.js` | ACTIVE PIPELINE STAGE | Stage 600 with legacy fallback |

The fallback wrappers are intentional temporary compatibility code. They should be removed only after cross-family browser regression confirms the pipeline path.

### APL feature integrations

The following remain active but should be reviewed for repeated row traversal, action matching, and command finalization:

- `app/map-object-wipe-definition-integration.js`
- `app/apl-neck-pad-center-tack-integration.js`
- `app/apl-single-cycle-transition-guard.js`
- `app/apl-neck-final-pad-completion-integration.js`
- `app/apl-body-back-two-label-transition-integration.js`
- `app/apl-back-wipe-direction-correction-integration.js`
- `app/apl-label-sensor-reference-integration.js`
- `app/apl-continuous-motion-integration.js`

Target architecture:

- one APL profile driver
- one APL mechanical-event planner
- one APL row builder
- one pipeline-stage adapter

### Cold Glue feature integrations

Active:

- `app/cold-glue-label-geometry-fallback-integration.js`
- `app/cold-glue-center-out-brush-integration.js`
- `app/cold-glue-gripper-channel-integration.js`
- `app/cold-glue-parameter-editor-integration.js`
- `app/cold-glue-neck-left-right-integration.js`
- `app/cold-glue-gripper-sequence-integration-v2.js`

Immediate cleanup target:

- separate map normalization from UI decoration in the gripper sequence v2 file
- move nearest-angle, continuity, and section assignment rules into Cold Glue drivers
- retain imported v1 map migration, but remove any remaining v1 runtime branches after fixture verification

### Map builder and catalog integrations

Active:

- `app/map-builder-station-authority-integration.js`
- `app/map-object-builder-selection-integration.js`
- `app/map-object-double-click-open-fix-integration.js`
- `app/label-spec-section-selection-integration.js`
- `app/company-default-programs-integration.js`
- `app/workbook-reference-map-library-integration.js`
- `app/locked-map-brand-selector-integration.js`

Cleanup direction:

- move map mutation into a map service
- keep selection and rendering in UI controllers
- move locked/default catalog data into catalog services
- eliminate direct state mutation from click-specific integrations

## Confirmed stale version identifiers

The following are active, not yet deleted, but contain stale identity values:

- `app/bootstrap.js` contains `STAGING_RELEASE_VERSION = "0.8.3"`
- `app/simulator-milestone.js` contains `SIMULATOR_RELEASE_VERSION = "0.7.99"`
- `index.html`, `update-manifest.json`, and `service-worker.js` identify the application as `0.9.2`

Classification:

- behavior: **ACTIVE**
- embedded version constants: **DUPLICATED / STALE**

Next action:

- make the page application-version metadata the browser runtime source
- stop bootstrap from overwriting it
- make the simulator report the application runtime version rather than maintaining a separate milestone number
- retain one service-worker release identifier synchronized with the release manifest

## Automated cleanup guards

`tests/repository-cleanup-guards.test.js` now verifies:

- Cold Glue gripper sequence v1 is absent
- the dynamic loader references v2, not v1
- every dynamically loaded script has one feature owner
- expected feature groups remain present
- the passive Zone/Site compatibility file does not install click handlers or observers
- the active global-map integration remains the sole runtime owner

## Cross-family regression matrix

Repository cleanup must be tested against all of the following before compatibility code is deleted:

| Fixture | Primary coverage |
|---|---|
| Generic three-label APL | neck/body/back station and wipe sequencing |
| Generic body/back APL | two-label transition and coder path |
| LandShark | complex body/back coder and Rest grammar regression |
| MIC family | alternate family control case |
| Cold Glue three-gripper | gripper ownership, brush entry, and continuity |
| Cold Glue sparse/imported map | v1 migration and station repair |
| Sensor-assisted APL | map-object sensor orientation |
| Clockwise physical machine | direction invariant |
| Counter-clockwise physical machine | direction invariant |
| Blank machine map | creation, persistence, and builder behavior |
| Imported legacy map | compatibility migrations |

## Ordered cleanup backlog

1. Remove superseded and unreferenced files. **Started in this pass.**
2. Consolidate compatibility layers. **Zone/Site started in this pass.**
3. Centralize release and simulator identity.
4. Split `app/profile-generation.js` by machine family.
5. Split `app/wipe-down-builder.js` by data, service, rendering, and controller responsibilities.
6. Split `app/geometry-and-planning.js` into pure drivers and adapters.
7. Split `app/bootstrap.js` into startup, updates, exports, actions, and animation.
8. Move dynamic feature groups into a versioned module manifest.
9. Add fixture snapshots for every machine-family regression case.
10. Remove pipeline fallback wrappers after the regression matrix passes.
11. Re-run reference, loader, service-worker, and imported-setting compatibility checks before every deletion batch.

## Deletion rule

A file is deleted only when all of the following are true:

1. it is not loaded by `index.html` or the feature manifest
2. it is not listed by the service worker
3. no active module imports, injects, or calls it
4. a newer active implementation owns its behavior
5. migration support, when required, exists in the active implementation
6. repository cleanup guards cover its non-return
7. the relevant cross-family fixtures still pass
