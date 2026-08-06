# Validation Identity Stability Update

Date: 2026-08-06

## Purpose

Complete the semantic deduplication boundary introduced in Refactor Phase 17 so one physical validation condition cannot appear twice only because producers assigned different severities or because the result passed through the legacy note adapter more than once.

## Changes

- Validation condition identity no longer includes `bad`, `warn`, or `ok` severity.
- When duplicate producers disagree on severity, the strongest severity is retained.
- Richer pipeline metadata, issue codes, HMI references, categories, and event identifiers remain attached to the authoritative issue.
- Canonical `validationKey` values remain stable across repeated aggregate → note → aggregate conversions.
- Legacy keys such as `explicit|warn|...` are normalized without accumulating repeated `explicit|` prefixes.
- Known semantic conditions take priority over producer-specific keys, preventing prefixed and unprefixed descriptions of the same fault from bypassing deduplication.

## Regression coverage

`tests/validation-diagnostics.test.js` now verifies:

- mixed warning/fault copies collapse to one issue;
- the fault severity wins;
- richer pipeline metadata is preserved;
- validation keys survive repeated aggregation unchanged;
- legacy explicit keys normalize to one stable condition identity.

The `Validate Validation Diagnostics` GitHub Actions workflow runs syntax checks and the regression whenever the validation identity boundary changes.
