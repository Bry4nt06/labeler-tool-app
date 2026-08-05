# Refactor Phase 17 — Validation and Diagnostics Boundary

Date: 2026-08-02

## Objective

Begin separating validation rules, issue creation, result aggregation, and diagnostic presentation without changing the existing mechanical, servo-pipeline, TopModul grammar, speed-envelope, or optimization decisions.

Browser-accepted staging baseline before this phase:

- `28540f6a3fe8825f7baec87838d2741ca62778ef`

## Existing problem

Validation currently arrives through several layers:

- `app/validation.js` mechanical and geometry checks
- motion-validation and command-driver checks
- servo-pipeline validation
- machine-family and TopModul grammar replacement
- terminal-policy checks
- optimizer findings
- integration-specific validation cards and message prefixes

Each layer can create its own issue shape, summarize its own results, decorate messages with prefixes such as `[MOTION]`, `[SPEED]`, or `[PLANNER]`, and render its own diagnostic card.

That allows the same physical condition to appear twice: once as a general application message and again as a prefixed pipeline or planner message.

## New ownership boundary

### `drivers/validation/validation-issue-driver.js`

Registered as:

- `validation.issue`

Owns:

- issue level normalization
- diagnostic-prefix removal
- category normalization and inference
- HMI extraction
- issue-code preservation
- semantic condition keys
- authoritative duplicate selection
- conversion between legacy note arrays and canonical issue objects

The driver intentionally understands a small set of shared conditions that are commonly emitted by multiple layers, including:

- speed-envelope faults and near-limit warnings
- table-angle ordering
- missing table or bottle-plate angles
- terminal Rest policy
- planner row, event, angle, and command alignment
- TopModul leading and trailing reference conditions

When two layers describe the same condition, the issue with stronger metadata, such as a pipeline code, category, HMI, or event ID, is retained. Its display prefix is removed because category is now structured data rather than presentation text.

### `drivers/validation/validation-result-aggregator-driver.js`

Registered as:

- `validation.result`

Depends on:

- `validation.issue`

Owns:

- normalization of legacy notes and structured issues
- semantic deduplication
- PASS / REVIEW / FAIL status
- fault, warning, and successful-check totals
- category totals
- duplicate counts
- conversion back to the legacy note-array contract

The final conversion preserves the current `validate()` return shape so existing rendering and downstream callers remain compatible.

### `app/validation-diagnostics-integration.js`

Loads as the final feature group after optimization.

Owns:

- wrapping the completed validation chain once
- storing the authoritative result at `state.validationResult`
- returning the deduplicated legacy-compatible notes
- rendering one aggregate validation summary card

The adapter does not own mechanical, grammar, motion, speed, planner, or optimization rules. It only owns the boundary after all rules have executed.

## Load order

```text
validation issue driver
    ↓
validation result aggregator
    ↓
existing mechanical / motion / grammar / speed / optimizer rules
    ↓
validation diagnostics integration
    ↓
application initialization
```

The diagnostics adapter is in its own final feature group so later feature modules cannot append another unaggregated validation layer after it.

## Compatibility preserved

This phase does not change:

- `validate()` call sites
- the legacy `[level, message, metadata]` note contract
- mechanical validation thresholds
- servo speed thresholds
- TopModul grammar authority
- terminal Rest policy
- planner alignment decisions
- optimization calculations
- existing pipeline and grammar detail cards
- stored map or servo-program schemas

## Duplicate-warning behavior

The final validation list now deduplicates by semantic condition rather than exact display string.

Examples:

- a general `Move HMI 4 -> 5 will fault...` speed warning and a `[SPEED] HMI 4 requires...` pipeline warning become one structured speed issue
- a prefixed and unprefixed missing-planner message become one planner issue
- separate TopModul leading-reference and trailing-reference faults remain separate because they are different conditions

Prefixes are removed from the final message because category remains available in note metadata.

## Transitional ownership

Existing validators still create issues in their current local formats. Their rule logic is intentionally untouched during this phase.

The next validation phase can migrate individual producers to call `validation.issue` directly, then remove their local:

- issue factories
- dedupe helpers
- summary helpers
- prefix formatting
- diagnostic-card formatting

This staged approach reduces the browser regression surface while establishing one authoritative final result immediately.

## Regression coverage

`tests/validation-diagnostics.test.js` covers:

- driver registration and dependency metadata
- general and `[SPEED]` issue deduplication
- prefixed and unprefixed planner deduplication
- retention of distinct grammar conditions
- authoritative issue selection by metadata quality
- removal of presentation prefixes
- legacy note conversion with stable validation keys
- feature-manifest dependency order
- separation of validation aggregation from diagnostic rendering

## Offline behavior

The new drivers and integration are loaded through the existing feature integration manifest. The service worker's same-origin network-first behavior caches each successfully loaded script after the first online load.
