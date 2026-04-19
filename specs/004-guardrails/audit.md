# Implementation Audit: Guardrail Evaluation Subsystem

**Date**: 2026-04-19
**Branch**: `004-guardrails`
**Base**: `main` (merge-base: 5111888)
**Files audited**: 10 (6 src, 4 test)

---

## Findings

| ID | Category | Severity | Location | Description | Quoted Evidence |
|----|----------|----------|----------|-------------|-----------------|
| SD-001 | Spec Drift | HIGH | `specs/004-guardrails/contracts/evaluate-api.md` | Contract's EvaluationInput table omits `fixtureHash` field. Implementation uses it for identical-rerun checks (FR-005). Consumer integrating against the contract will miss a required field. | Contract table lists 11 fields; `src/guardrails/types.ts:62` defines `fixtureHash: string \| null` which is consumed by `evaluate.ts:62` via `getRerunAssessment()`. |
| CV-001 | Constitution Violation | HIGH | `src/guardrails/redirect.ts:43` | Silent skip when graph node lookup fails. Constitution I mandates fail-fast: "If a required value is absent, the caller receives a typed error, not a degraded result." A changed node missing from the graph is a data inconsistency that should surface, not be swallowed. | `const graphNode = graph.nodes.get(nodeId); if (!graphNode) continue;` |
| CV-002 | Constitution Violation | HIGH | `src/guardrails/redirect.ts:76` | Same silent-skip pattern on the branching-node loop. | `const graphNode = graph.nodes.get(nodeId); if (!graphNode || !BRANCHING_TYPES.has(graphNode.type)) continue;` |
| TQ-001 | Test Quality | MEDIUM | `test/guardrails/evaluate.test.ts` | No test for `platform` classification exclusion in DeFlaker. FR-009 and `rerun.ts:46` both exclude `platform`, but only `external-service` has a test (line 172). A regression removing the `platform` guard would go undetected. | Only test: `failedSummary([...], 'external-service')` at line 184. No corresponding test with `'platform'`. |
| OE-001 | Over-Engineering | MEDIUM | `src/guardrails/redirect.ts:113-116` | Complex conditional type extraction for the STRUCTURALLY_ANALYZABLE_KINDS membership check. A simple `STRUCTURALLY_ANALYZABLE_KINDS.has(kind as string)` or a typed helper would be clearer. | `!STRUCTURALLY_ANALYZABLE_KINDS.has(kind as typeof STRUCTURALLY_ANALYZABLE_KINDS extends Set<infer T> ? T : never)` |
| CQ-001 | Code Quality | LOW | `test/guardrails/fixtures.ts:374` | Dishonest type cast — `classification` parameter accepts any `ErrorClassification` but is cast to the literal `'expression'` to satisfy the `DiagnosticError` type. Runtime behavior is correct but the type system is being lied to. | `classification: classification as 'expression',` |
| TQ-002 | Test Quality | LOW | `test/guardrails/evaluate.test.ts:29-33` | Force-bypass test asserts evidence fields with `toBeDefined()` rather than concrete values. The proceed-default test (line 288-291) checks actual values. Consistency would improve confidence. | `expect(decision.evidence.changedNodes).toBeDefined(); expect(decision.evidence.trustedNodes).toBeDefined();` |

---

## Requirement Traceability

| Requirement | Status | Implementing Code | Notes |
|-------------|--------|-------------------|-------|
| FR-001 | IMPLEMENTED | `src/guardrails/evaluate.ts:33`, `src/guardrails/types.ts:38-63` | EvaluationInput accepts all required fields; evaluate() returns GuardrailDecision |
| FR-002 | IMPLEMENTED | `src/guardrails/evaluate.ts:33-131` | Fixed 8-step order: force, empty, rerun, redirect, narrow, DeFlaker, broad, proceed |
| FR-003 | IMPLEMENTED | `src/guardrails/evaluate.ts:37-44` | force=true returns proceed with "Force flag set" explanation |
| FR-004 | IMPLEMENTED | `src/guardrails/evaluate.ts:47-53` | Empty target returns refuse with overridable=false |
| FR-005 | IMPLEMENTED | `src/guardrails/evaluate.ts:57-69` | Uses getRerunAssessment(); refuses when isLowValue |
| FR-006 | IMPLEMENTED | `src/guardrails/redirect.ts:28-128`, `evaluate.ts:73-85` | 6 escalation triggers; redirect when none fire and layer != 'static' |
| FR-007 | IMPLEMENTED | `src/guardrails/narrow.ts:24-35` | Preconditions: >5 nodes, <20% changed, result smaller than original |
| FR-008 | IMPLEMENTED | `src/guardrails/narrow.ts:40-96` | BFS forward + backward from seed, intersected with target, stops at trusted/boundary |
| FR-009 | IMPLEMENTED | `src/guardrails/rerun.ts:42-51`, `evaluate.ts:100-112` | checkDeFlaker: failed, path non-null, no intersection, not external-service/platform |
| FR-010 | IMPLEMENTED | `src/guardrails/evaluate.ts:115-122` | Inline check: targetNodes.size / graph.nodes.size > 0.7 |
| FR-011 | IMPLEMENTED | `src/guardrails/evaluate.ts:34` | assembleEvidence() called at top; evidence included in every return |
| FR-012 | IMPLEMENTED | `src/guardrails/types.ts:18-24` | NARROW_MIN_TARGET_NODES=5, NARROW_MAX_CHANGED_RATIO=0.2, BROAD_TARGET_WARN_RATIO=0.7 |
| FR-013 | IMPLEMENTED | `src/guardrails/rerun.ts:19-30`, `evaluate.ts:100-101` | extractPriorRunContext returns null when summary is null; DeFlaker skipped |
| FR-014 | IMPLEMENTED | `src/guardrails/redirect.ts:28-128` | Inspects classifications, downstream $json, sub-workflow type, branching conditions, change kinds |
| FR-015 | IMPLEMENTED | `src/guardrails/narrow.ts:38,114-122` | Seed always in result; returns kind='slice' with SliceDefinition |

---

## Metrics

- **Files audited**: 10
- **Findings**: 0 critical, 3 high, 2 medium, 2 low
- **Spec coverage**: 15 / 15 requirements implemented
- **Constitution compliance**: 2 violations across 5 principles checked (Principle I: fail-fast)

---

## Remediation Decisions

### 1. [SD-001] Contract missing `fixtureHash` from EvaluationInput
**Location**: `specs/004-guardrails/contracts/evaluate-api.md`
**Spec says**: Contract documents the public API surface for Phase 7 consumers
**Code does**: `types.ts` defines `fixtureHash: string | null` consumed by `evaluate.ts:62`

Action: fix / spec / skip / split

---

### 2. [CV-001] Silent skip on missing graph node (redirect.ts:43)
**Location**: `src/guardrails/redirect.ts:43`
**Constitution says**: Principle I — fail-fast, no degraded results on missing required values
**Code does**: `if (!graphNode) continue;` silently skips the node instead of throwing

Action: fix / spec / skip / split

---

### 3. [CV-002] Silent skip on missing graph node (redirect.ts:76)
**Location**: `src/guardrails/redirect.ts:76`
**Constitution says**: Same as CV-001
**Code does**: `if (!graphNode || ...) continue;` silently skips

Action: fix / spec / skip / split

---

### MEDIUM / LOW Summary

- **TQ-001** (MEDIUM): Add a test for `platform` classification exclusion in DeFlaker (rerun.ts:46 is implemented but untested)
- **OE-001** (MEDIUM): Simplify the type assertion in redirect.ts:113-116 to a plain `as string` cast
- **CQ-001** (LOW): Fix the dishonest `classification as 'expression'` cast in fixtures.ts:374
- **TQ-002** (LOW): Strengthen force-bypass test assertions from `toBeDefined()` to concrete values

Would you like to promote any MEDIUM/LOW findings to remediation tasks?

---

## Proposed Spec Changes

No spec changes needed — all findings resolved via code fixes.

---

## Remediation Tasks

> Generated by `/speckit.audit` on 2026-04-19. All remediation tasks completed inline.

- [x] T021 [AR] Add `fixtureHash` field to EvaluationInput table in `contracts/evaluate-api.md` — SD-001
- [x] T022 [AR] Replace silent `if (!graphNode) continue` with thrown Error at `redirect.ts:43` and `redirect.ts:76` — CV-001/CV-002
- [x] T023 [AR] Simplify type assertion at `redirect.ts:121` from conditional type to `ReadonlySet<string>` cast — OE-001
- [x] T024 [AR] Add `platform` classification exclusion test in `evaluate.test.ts` — TQ-001
- [x] T025 [AR] Fix dishonest `classification as 'expression'` cast in `fixtures.ts:374` with proper discriminated union switch — CQ-001
- [x] T026 [AR] Strengthen force-bypass test assertions from `toBeDefined()` to concrete values — TQ-002
