# Refactor Phase 5 — Ordered Profile Pipeline

Date: 2026-08-02

## Objective

Replace the final nested `generatedServoProfile` wrappers with one ordered pipeline while retaining the existing processors and a legacy wrapper fallback.

This first pipeline increment migrates the two final transforms:

1. physical machine-direction code-box correction
2. coder Rest/Correction grammar reconciliation

The map-object orientation and coder-after-wipe integrations remain in their existing wrapper positions for this increment. They are the next pipeline migration boundary after browser regression.

## New driver

### `profile.pipeline`

File: `drivers/profile/profile-pipeline-driver.js`

Responsibilities:

- register named profile stages
- replace a stage by identifier without adding duplicate wrappers
- sort stages by explicit numeric order
- execute each stage against the output of the preceding stage
- reject stages that do not return a servo-row array
- produce an execution trace containing stage, phase, order and row counts
- expose stage inspection for diagnostics

Current registered stages:

| Order | Stage | Phase |
| ---: | --- | --- |
| 500 | `orientation.physical-code-box` | orientation |
| 600 | `grammar.coder-rest` | grammar |

## New orchestrator

File: `app/profile-pipeline-orchestrator-integration.js`

The orchestrator is the only new wrapper around `generatedServoProfile`.

It:

- receives the output from the existing profile-generation and map-object wrapper chain
- runs the registered stages in explicit order
- publishes the final row array
- stores the active stage identifiers and row-count trace in `state.motionPlan`
- regenerates and renders after installation

## Migrated integrations

### Physical code-box direction

`app/clockwise-code-box-orientation-integration.js`

The integration still owns:

- map direction control relabeling
- coder-orientation defaults
- direction-change events
- wipe-down builder synchronization
- collection of browser state and label geometry
- the existing physical-direction correction processor

It now registers that processor as `orientation.physical-code-box` instead of wrapping the generator when `profile.pipeline` is available.

### Coder Rest grammar

`app/coder-rest-grammar-repair-integration.js`

The integration still owns:

- coding-hold scoring
- authoritative hold selection
- repair annotation
- motion-plan repair metadata

It now registers the repair processor as `grammar.coder-rest` instead of wrapping the generator when `profile.pipeline` is available.

## Compatibility and rollback

Both migrated integrations retain their prior wrapper installation path when `profile.pipeline` is unavailable. This provides a direct rollback mechanism without restoring deleted code.

The current wrapper boundary is therefore:

```text
existing profile and map wrappers
        ↓
single profile pipeline orchestrator
        ├─ 500 orientation.physical-code-box
        └─ 600 grammar.coder-rest
```

## Preserved behavior

- stored `cw` still represents physical counter-clockwise
- stored `ccw` still represents physical clockwise
- code-box left-edge targeting is unchanged
- the 0.5-degree Rest grammar tolerance is unchanged
- coder-hold scoring and repair strategies are unchanged
- stage processors continue to update the same motion-plan fields
- HMI and PLC reindexing remains inside the existing processors
- no production repository files were changed

## Diagnostics

The final motion plan now exposes:

- `profilePipeline`
- `profilePipelineDriver`
- `profilePipelineStages`
- `profilePipelineTrace`
- `profilePipelineOrientationStage`
- `profilePipelineGrammarStage`

The trace provides the row count entering and leaving each stage, making stage-order and duplicate-row problems visible without inspecting nested closures.

## Regression coverage

`tests/profile-pipeline-driver.test.js` verifies:

- explicit stage ordering
- stage replacement by identifier
- row handoff between stages
- execution traces
- invalid stage rejection
- invalid stage return rejection

## Next migration

After browser confirmation, move these processors into the same pipeline:

1. `orientation.map-objects`
2. `orientation.coder-handoff`

That migration will remove the remaining two map-object generator wrappers and establish the complete ordered chain:

```text
normalize
→ map-object orientation
→ coder handoff
→ physical direction
→ Rest/Correction grammar
→ finalize
→ validate
```
