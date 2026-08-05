# Refactor Phase 6 — Map Orientation Pipeline Stages

Date: 2026-08-02

## Objective

Move the remaining map-object orientation wrappers into the ordered profile pipeline without changing their row-generation logic, issue handling, command finalization, or motion-plan persistence.

The last browser-verified baseline before this phase was:

- `165266d2652a5e6af355a484322236d1c7964e42`

## Pipeline stages added

### `orientation.map-objects`

Source:

- `app/map-object-servo-orientation-integration.js`

Order:

- `300`

Responsibilities retained by the processor:

- discover active sensor and coder map objects
- resolve their target label sections and table windows
- determine whether an existing transition can be reused
- insert or retarget CMD 7 orientation rows
- insert or reuse CMD 3 orientation holds
- create continuation rows where required
- preserve map-object validation issues and orientation-plan records
- finalize and reindex its output before the next stage

The processor still delegates calculations, row construction, and issue construction to the drivers introduced in Phases 3 and 4.

### `orientation.coder-handoff`

Source:

- `app/map-object-coder-after-wipe-integration.js`

Order:

- `400`

Responsibilities retained by the processor:

- consume physical-wipe overlap issues produced by the map-object stage
- locate the final wipe and its completion Rest
- calculate the safe coder handoff window
- insert the after-wipe CMD 7/CMD 3 sequence when needed
- retarget or insert the continuation after coding
- replace generic wipe-overlap issues with specific coder-handoff results
- preserve coder-handoff plans and final command reindexing

## Complete ordered sequence

```text
Base profile generation and existing family integrations
        ↓
300 — orientation.map-objects
        ↓
400 — orientation.coder-handoff
        ↓
500 — orientation.physical-code-box
        ↓
600 — grammar.coder-rest
        ↓
Final profile rows and pipeline trace
```

## Single-wrapper result

When `profile.pipeline` is available:

- the map-object integration does not wrap `generatedServoProfile`
- the coder-after-wipe integration does not wrap `generatedServoProfile`
- the physical code-box integration does not wrap `generatedServoProfile`
- the coder Rest grammar integration does not wrap `generatedServoProfile`
- `app/profile-pipeline-orchestrator-integration.js` remains the single wrapper for these four stages

This removes four layers of wrapper nesting from the active staging path.

## Rollback compatibility

Both migrated integrations retain `installLegacyWrapper()`.

If `profile.pipeline` is unavailable, each integration restores its previous wrapper behavior. This keeps the verified pre-pipeline execution path available while staging regression continues.

The processors are also exposed for diagnostics:

- `window.LabelerMapObjectOrientationProcessor`
- `window.LabelerCoderAfterWipeProcessor`

## Preserved behavior

This phase does not intentionally change:

- map-object discovery or sorting
- label-section assignment
- orientation target calculations
- physical-wipe overlap detection
- coder handoff timing
- the 0.5-degree transition gap
- the 0.001-degree comparison tolerance
- the 90% coder safety factor
- CMD 3/CMD 7 branch selection
- row action descriptions
- validation issue codes, severity, or wording
- command finalization
- HMI and PLC reindexing
- physical machine-direction mapping
- Rest/Correction grammar reconciliation

## Regression coverage

`tests/profile-pipeline-driver.test.js` now verifies the exact four-stage order:

1. `orientation.map-objects`
2. `orientation.coder-handoff`
3. `orientation.physical-code-box`
4. `grammar.coder-rest`

The test also confirms:

- every stage receives the prior stage output
- the pipeline trace reports the same order
- stage replacement remains deterministic
- the two migrated integrations declare orders 300 and 400
- both migrated integrations retain legacy fallback wrappers
- invalid stages and invalid row returns are rejected

The existing orientation, coder-handoff, row-builder, issue-factory, and Rest-grammar tests remain unchanged and continue to cover their domain behavior.

## Next organization phase

After browser regression confirmation, the next safe step is separating browser-state collection from the two stage processors.

Recommended modules:

- `app/profile-pipeline-context-adapter.js`
- `drivers/profile/map-object-stage-driver.js`
- `drivers/profile/coder-handoff-stage-driver.js`

That phase should pass map, application, label, bottle, geometry, and motion-plan inputs through the pipeline context instead of reading browser globals from inside the processors.
