# Refactor Phase 4 — Row Builder and Orientation Issue Factory

Date: 2026-08-02

## Objective

Remove repeated servo-row construction and validation-message construction from the map-object orientation integrations while preserving their existing orchestration branches and generated behavior.

## New drivers

### `profile.mapObjectRowBuilder`

File: `drivers/profile/map-object-row-builder-driver.js`

Responsibilities:

- create shared map-object metadata
- construct CMD 7 orientation rows
- construct CMD 3 orientation-hold rows
- retarget an existing CMD 7 transition
- mark an existing row as already satisfying the object orientation
- construct or retarget continuation rows
- construct map-object orientation plan records
- construct coder-after-wipe handoff plan records
- apply the existing application angle formatter without owning browser state

Dependencies:

- `profile.mapObjectOrientation`
- `profile.coderHandoff`

### `profile.orientationIssueFactory`

File: `drivers/profile/orientation-issue-factory-driver.js`

Responsibilities:

- construct map-object issue records with consistent object, station and section identity
- preserve all existing issue codes
- preserve existing issue severity
- preserve inherited details when replacing an overlap issue with a coder-handoff issue
- centralize the existing user-facing messages for:
  - inactive label sections
  - objects positioned before application
  - missing servo references
  - overlapping object windows
  - physical-wipe overlap
  - insufficient turn windows
  - missing exit windows
  - orientation ratio capacity
  - coder window unavailability
  - coder handoff capacity
  - successful or delayed coder handoff

Dependencies:

- `profile.mapObjectOrientation`
- `profile.coderHandoff`

## Integration responsibilities after extraction

### `app/map-object-servo-orientation-integration.js`

Retains:

- browser/application state collection
- label and bottle geometry collection
- existing-row replacement decisions
- branch selection for reuse, insertion or satisfied orientation
- row ordering
- motion-plan persistence
- installation lifecycle

Delegates:

- servo row creation to `profile.mapObjectRowBuilder`
- issue creation to `profile.orientationIssueFactory`

### `app/map-object-coder-after-wipe-integration.js`

Retains:

- overlap-issue routing
- coder target input collection
- handoff branch selection
- insertion order
- motion-plan persistence
- installation lifecycle

Delegates:

- servo row and plan creation to `profile.mapObjectRowBuilder`
- issue replacement and status messages to `profile.orientationIssueFactory`

## Preserved behavior

- the 0.5-degree transition gap remains unchanged
- the 0.001-degree comparison tolerance remains unchanged
- the 90% coder-handoff safety factor remains unchanged
- CMD 3 and CMD 7 branch selection remains in the integrations
- existing action descriptions remain unchanged
- existing issue codes and user-facing wording remain unchanged
- existing HMI and PLC reindexing remains unchanged
- command finalization remains controlled by `LabelerServoCommandDriver`
- no production repository files were changed

## Regression coverage

`tests/map-object-row-and-issue-drivers.test.js` verifies:

- coding and sensor metadata construction
- CMD 7 orientation rows
- CMD 3 orientation-hold rows
- continuation marker selection
- coder-handoff plan metadata
- physical-wipe overlap issue construction
- orientation-capacity wording and numeric formatting
- preservation of inherited issue details during coder-handoff replacement

The previous Phase 3 driver tests continue to cover target calculation, wipe matching, handoff timing, interference detection and continuation planning.

## Current dependency chain

```text
profile.coderOrientation
        ↓
profile.mapObjectOrientation
        ↓
profile.coderHandoff
        ↓
profile.mapObjectRowBuilder
profile.orientationIssueFactory
        ↓
map-object browser integrations
```

## Next extraction

After browser regression confirmation, introduce a single ordered profile pipeline driver with explicit stages:

1. normalize source rows
2. plan map-object orientation
3. build orientation rows
4. apply coder handoff
5. reconcile Rest/Correction grammar
6. finalize commands
7. validate and publish the motion plan

The current wrapper chain must remain available as the rollback path until the pipeline produces identical LandShark, generic body/back, sensor-assisted APL and MIC control output.
