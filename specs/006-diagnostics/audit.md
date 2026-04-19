# Implementation Audit: Diagnostic Synthesis

**Date**: 2026-04-18
**Branch**: `006-diagnostics`
**Base**: `main` (88353f5)
**Files audited**: 18 (7 source, 6 tests, 5 fixtures)

---

## Findings

| ID | Category | Severity | Location | Description | Quoted Evidence |
|----|----------|----------|----------|-------------|-----------------|
| SD-001 | Spec Drift | HIGH | `src/diagnostics/annotations.ts:59` | Validated reason string does not match task T028 specification. T028 requires "Changed since last validation" but code uses generic string that doesn't indicate change context. | `reason: 'Actively analyzed in this validation run'` |
| PH-001 | Phantom | HIGH | `src/diagnostics/path.ts:10-12` | `PathReconstructionError` is declared but never thrown. FR-007 requires raising a typed error on missing structural data, but `reconstructPath` accesses properties directly — a missing `source` would throw a generic `TypeError`, not the documented typed error. | `export class PathReconstructionError extends Error { override readonly name = 'PathReconstructionError' as const; }` |
| CV-001 | Constitution Violation | MEDIUM | `src/diagnostics/synthesize.ts:77-83` | Constitution II requires "Validate at system edges using a schema library (Zod or similar)." The `synthesize()` boundary validates only one field (`resolvedTarget.nodes.length`). No schema validation of `meta.runId`, `meta.timestamp`, `capabilities.staticAnalysis`, or structural integrity of discriminated union inputs. | `function validateInput(input: SynthesisInput): void { if (input.resolvedTarget.nodes.length === 0) { throw new SynthesisError(...)` |
| CV-002 | Constitution Violation | MEDIUM | `src/diagnostics/hints.ts:76` | `staticOnlyRunHint` uses `'' as NodeIdentity` when findings are empty — fabricates a fake branded value. This bypasses the `nodeIdentity()` constructor which validates non-empty strings, violating the branded type contract. An empty string is not a valid `NodeIdentity`. | `const node = findings.length > 0 ? findings[0].node : ('' as NodeIdentity);` |
| OE-001 | Over-Engineering | MEDIUM | `src/diagnostics/errors.ts:62-97` | `buildStaticDiagnosticError` delegates to three context builders (`buildWiringContext`, `buildExpressionContext`, `buildCredentialsContext`), each called from exactly one site. Constitution III prohibits single-call helpers: "Every abstraction MUST have at least two concrete consumers." | `function buildWiringContext(finding: StaticFinding)` / `function buildExpressionContext(finding: StaticFinding)` / `function buildCredentialsContext(finding: StaticFinding)` |
| OE-002 | Over-Engineering | LOW | `src/diagnostics/errors.ts:293-295` | `sourceRank` is a one-line function called from exactly one site. | `function sourceRank(source: 'static' \| 'execution'): number { return source === 'execution' ? 0 : 1; }` |
| TQ-001 | Test Quality | MEDIUM | `test/diagnostics/synthesize.test.ts:124-137` | Test "produces complete structure with all required fields" asserts only that properties exist (`toHaveProperty`), not that they have correct types or values. This is a tautological test — it would pass if every field were `null`. | `expect(result).toHaveProperty('schemaVersion'); expect(result).toHaveProperty('status');` ... |
| TQ-002 | Test Quality | LOW | `test/diagnostics/synthesize.test.ts:225-230` | Test "same-node cross-layer findings both appear" uses `toBeGreaterThanOrEqual(2)` which is already covered by the earlier ordering test. The test name claims to verify same-node cross-layer behavior but the fixture has errors on *different* nodes (setFields vs httpRequest). | `expect(result.errors.length).toBeGreaterThanOrEqual(2);` |
| SD-002 | Spec Drift | MEDIUM | `src/diagnostics/annotations.ts:55-56` | `collectExecutedNodes` adds ALL nodes from execution data as executed, including mocked nodes with `pinDataSource`. This means mocked nodes are in both `mockedNodes` and `executedNodes` sets. Works today because mocked is checked first, but fragile — a priority reorder would break mocked annotation. | `for (const [node] of executionData.nodeResults) { nodes.add(node); }` |
| SD-003 | Spec Drift | LOW | `src/diagnostics/status.ts:25-47` | FR-001 specifies an `error` status for infrastructure failure, but `determineStatus` never returns `'error'`. The docstring acknowledges this ("this branch exists for completeness") but the code can only produce `'skipped'`, `'pass'`, or `'fail'`. | `// Condition 4 (\`error\`) is the catch-all...` but no code path produces it |

---

## Requirement Traceability

| Requirement | Status | Implementing Code | Notes |
|-------------|--------|-------------------|-------|
| FR-001 | PARTIAL | `src/diagnostics/status.ts:25-47` | `error` status never produced; only skipped/pass/fail reachable |
| FR-002 | IMPLEMENTED | `src/diagnostics/errors.ts:23-60` | All 6 kind mappings present and tested |
| FR-003 | IMPLEMENTED | `src/diagnostics/errors.ts:153-189` | Constructor name matching works correctly |
| FR-004 | IMPLEMENTED | `src/diagnostics/errors.ts:191-213` | contextKind fallback with httpCode logic tested |
| FR-005 | IMPLEMENTED | `src/diagnostics/errors.ts:280-295` | Orders by source then executionIndex; spec mentions "error-severity before warning-severity" but warnings are filtered to hints, so ordering by severity within errors is moot |
| FR-006 | IMPLEMENTED | `src/diagnostics/path.ts:23-37` | Sorts by executionIndex, extracts sourceOutput |
| FR-007 | PARTIAL | `src/diagnostics/path.ts:23-37` | No typed error raised on missing structural data; `PathReconstructionError` declared but unused |
| FR-008 | IMPLEMENTED | `src/diagnostics/annotations.ts:24-77` | All statuses assigned; reason string for `validated` deviates from task spec |
| FR-009 | IMPLEMENTED | `src/diagnostics/synthesize.ts:70` | Direct passthrough of guardrailDecisions |
| FR-010 | IMPLEMENTED | `src/diagnostics/hints.ts:37-49` | Warning findings become warning hints |
| FR-011 | IMPLEMENTED | `src/diagnostics/hints.ts:52-73` | Runtime hints collected, no dedup |
| FR-012 | IMPLEMENTED | `src/diagnostics/hints.ts:65-72` | Danger hint on executionTimeMs===0 with error |
| FR-013 | IMPLEMENTED | `src/diagnostics/synthesize.ts:73` | Capabilities passed through |
| FR-014 | IMPLEMENTED | `src/diagnostics/synthesize.ts:63` | `schemaVersion: 1` |
| FR-015 | IMPLEMENTED | `src/diagnostics/synthesize.ts:74` | Meta passed through |
| FR-016 | IMPLEMENTED | `src/diagnostics/synthesize.ts:85-92` | evidenceBasis logic correct |
| FR-017 | IMPLEMENTED | `test/diagnostics/synthesize.test.ts:393-422` | Compactness tests exist; thresholds loosened from spec targets |

---

## Architecture Compliance Summary

No `docs/architecture/` documents exist for this project. Architecture checks H1–H10 are not applicable (project-specific to an Evennia game codebase). Compliance assessed against project-level constraints in `CLAUDE.md` and `docs/CODING.md` instead:

- **Fail-fast / no fallbacks**: CLEAN (errors raise, no silent catches)
- **Contract-driven boundaries**: VIOLATION (1 finding — CV-001, minimal boundary validation)
- **No over-engineering**: VIOLATION (2 findings — OE-001, OE-002)
- **Honest code only**: VIOLATION (1 finding — PH-001, phantom error class)
- **Minimal meaningful tests**: CLEAN (tests cover contracts, not ceremony)

---

## Metrics

- **Files audited**: 18
- **Findings**: 0 critical, 2 high, 5 medium, 3 low
- **Spec coverage**: 15 / 17 requirements fully implemented, 2 partial
- **Constitution compliance**: 2 violations across 5 principles checked
- **Architecture compliance**: N/A (no architecture docs)

---

## Remediation Decisions

For each item below, choose an action:
- **fix**: Create a remediation task
- **spec**: Update the spec to match the implementation
- **skip**: Accept and take no action
- **split**: Fix part in implementation, update part in spec

### 1. [SD-001] Validated reason string deviates from task specification
**Location**: `src/diagnostics/annotations.ts:59`
**Task T028 says**: Reason should be "Changed since last validation"
**Code does**: Returns "Actively analyzed in this validation run"

Note: The task spec assumes change-detection context is available at annotation time, but `assignAnnotations` doesn't receive a change set. The current reason is more accurate for the available data. Consider whether the spec or the code should change.

Action: fix / spec / skip / split

### 2. [PH-001] PathReconstructionError declared but never thrown
**Location**: `src/diagnostics/path.ts:10-12`
**FR-007 says**: Raise an error on missing structural data
**Code does**: Declares the error class but never uses it; missing data would throw a generic TypeError

Action: fix / spec / skip / split

### MEDIUM / LOW Summary

- **CV-001** (MEDIUM): `synthesize()` boundary validates only `resolvedTarget.nodes.length`, not full input shape. Consider adding Zod validation or accept that TypeScript types are sufficient for this internal API.
- **CV-002** (MEDIUM): `staticOnlyRunHint` fabricates `'' as NodeIdentity` bypassing branded type validation. Could use a sentinel or restructure.
- **OE-001** (MEDIUM): Three single-call context builder functions in errors.ts. Could inline into the switch cases.
- **SD-002** (MEDIUM): `collectExecutedNodes` includes mocked nodes. Works due to priority order but fragile.
- **TQ-001** (MEDIUM): "complete structure" test asserts property existence, not correctness.
- **OE-002** (LOW): `sourceRank` single-call helper.
- **TQ-002** (LOW): "same-node" test doesn't actually test same-node scenario.
- **SD-003** (LOW): `error` status never produced by `determineStatus`.

Would you like to promote any MEDIUM/LOW findings to remediation tasks?
