# Refactor Phase 3 — Map Orientation and Coder Handoff

Date: 2026-08-02

## Objective

Separate map-object orientation decisions and coder-after-wipe planning from browser integration wrappers without changing generated servo row sequencing.

## New drivers

### `profile.mapObjectOrientation`

File: `drivers/profile/map-object-orientation-driver.js`

Responsibilities:

- resolve the target label section for sensor and coding objects
- determine whether an object requests servo orientation
- normalize sensor/coder table windows across the 360-degree boundary
- locate the active label application reference
- calculate sensor label-center and coder code-box targets
- use nearest-equivalent bottle angles
- identify physical wipe/contact transitions
- match a physical transition to its completion Rest
- calculate continuation rotation and ratio values

Dependencies:

- `profile.coderOrientation`

### `profile.coderHandoff`

File: `drivers/profile/coder-handoff-driver.js`

Responsibilities:

- locate the final physical wipe before a coder window
- locate the matching wipe-completion Rest
- calculate safe handoff timing using the configured servo ratio
- detect an intervening servo row inside the required orientation span
- plan whether the post-coder continuation should be retargeted, inserted or left unchanged

Dependencies:

- `profile.mapObjectOrientation`

## Integration responsibilities after extraction

### `app/map-object-servo-orientation-integration.js`

Retains:

- application-state and specification collection
- existing-row replacement rules
- row insertion and ordering
- issue wording
- motion-plan persistence
- browser installation lifecycle

Delegates domain decisions to `profile.mapObjectOrientation`.

### `app/map-object-coder-after-wipe-integration.js`

Retains:

- overlap-issue routing
- row creation and insertion
- issue wording
- motion-plan persistence
- browser installation lifecycle

Delegates target decisions to `profile.mapObjectOrientation` and handoff discovery/timing to `profile.coderHandoff`.

## Preserved behavior

- no change to the 0.5-degree transition gap
- no change to the 0.001-degree comparison tolerance
- no change to the 90% servo safety factor
- no change to generated CMD 3/CMD 7 insertion branches
- no change to issue codes or user-facing capacity messages
- no change to final command normalization or HMI/PLC reindexing

## Regression coverage

`tests/map-object-orientation-drivers.test.js` verifies:

- station-based sensor section resolution
- automatic coder section resolution
- coder window normalization
- physical wipe classification
- wipe-turn to wipe-hold matching
- a 208-degree code-box target
- final-wipe discovery
- safe handoff timing
- interference detection
- continuation retargeting and ratio calculation

## Next extraction

The next safe structural phase is to separate map-object row construction from the integration wrapper:

- `profile.mapObjectRowBuilder`
- `profile.orientationIssueFactory`
- a single profile pipeline orchestrator that runs normalize → plan → orient → handoff → grammar → validate

Do not remove the current integrations until browser regression confirms equivalent output for LandShark, generic body/back, sensor-assisted APL and MIC control programs.
