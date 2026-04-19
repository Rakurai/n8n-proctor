# Implementation Audit: Request Interpretation

**Date**: 2026-04-19
**Branch**: 007-request-interpretation
**Base**: main (a6bbf3b)
**Files audited**: 9 (5 source, 4 test)

---

## Findings

| ID | Category | Severity | Location | Description | Quoted Evidence |
|----|----------|----------|----------|-------------|-----------------|
| SF-001 | Silent Failure | HIGH | `src/orchestrator/snapshots.ts:29` | `loadSnapshot` silently returns `null` on read errors (permission denied, disk full), violating Fail-Fast | `catch { return null; }` |
| SF-002 | Silent Failure | HIGH | `src/orchestrator/snapshots.ts:36` | `loadSnapshot` silently returns `null` on JSON parse errors, masking corrupt state files | `catch { return null; }` |
| SD-001 | Spec Drift | HIGH | `src/orchestrator/interpret.ts:78` | Trust state mutation via `Object.assign` modifies the value returned by `loadTrustState`. Spec says invalidation produces a NEW state; mutating the original breaks caller expectations | `Object.assign(trustState, invalidatedTrust);` |
| PH-001 | Phantom | HIGH | `src/orchestrator/interpret.ts:210-213` | `executeSmoke` is called with a throwing lambda as `callTool`, meaning MCP smoke execution always throws at runtime — phantom implementation | `(() => { throw new Error('MCP callTool not available in orchestrator'); }) as never` |
| SD-002 | Spec Drift | HIGH | `src/orchestrator/interpret.ts:208` | Workflow-target execution strategy selects based on string comparison `resolvedTarget.description === 'Entire workflow'` — brittle coupling to a human-readable label that could change | `resolvedTarget.description === 'Entire workflow'` |
| SD-003 | Spec Drift | MEDIUM | `src/orchestrator/interpret.ts:91-93` | `traceExpressions` is called before guardrails (step 5) AND again during static analysis (step 6a) for the same nodes, resulting in redundant work | `const expressionRefs = deps.traceExpressions(graph, resolvedTarget.nodes);` (line 91) and `const refs = deps.traceExpressions(graph, resolvedTarget.nodes);` (line 160) |
| SD-004 | Spec Drift | MEDIUM | `src/orchestrator/interpret.ts:233-235` | `getExecutionData` result is discarded — called but return value not stored in `executionData`, so synthesize always receives `null` for execution evidence | `await deps.getExecutionData(execResult.executionId, creds);` (result unused) |
| CV-001 | Constitution Violation | MEDIUM | `src/orchestrator/interpret.ts:316-323` | `resolveExecCredentials` uses `process.env` with fallback defaults (`??` operator) — environment-dependent behavior with silent defaults contradicts Fail-Fast | `host: process.env['N8N_HOST'] ?? 'http://localhost:5678', apiKey: process.env['N8N_API_KEY'] ?? ''` |
| SD-005 | Spec Drift | MEDIUM | `src/orchestrator/interpret.ts:148` | `executionData` is always `null` when passed to `synthesize` — never assigned from execution results | `let executionData: ExecutionData \| null = null;` (never reassigned) |
| OE-001 | Over-Engineering | MEDIUM | `src/orchestrator/interpret.ts:312-314` | `toFixtures` is a one-line type cast helper called from exactly one site | `function toFixtures(pinData: PinData): Record<string, PinDataItem[]> { return pinData as Record<string, PinDataItem[]>; }` |
| TQ-001 | Test Quality | MEDIUM | `test/orchestrator/interpret.test.ts:290-298` | Timing assertion (`< 5000ms`) with fully mocked deps tests nothing meaningful — mocked functions return instantly, so this will always pass regardless of pipeline performance | `expect(elapsed).toBeLessThan(5000);` |
| TQ-002 | Test Quality | MEDIUM | `test/orchestrator/interpret.test.ts:823-829` | Multi-path test asserts `traceCallCount >= 2` but `traceExpressions` is also called in step 5 (guardrail input), so >=2 would pass even with single-path static analysis | `expect(traceCallCount).toBeGreaterThanOrEqual(2);` |
| CQ-001 | Code Quality | LOW | `src/orchestrator/interpret.ts:328-330` | `findFurthestDownstream` takes `_graph` parameter but never uses it | `_graph: WorkflowGraph` |
| CQ-002 | Code Quality | LOW | `src/orchestrator/snapshots.ts:137` | `require('node:fs')` used in test file within ESM project — inconsistent with ESM import style | `const { writeFileSync } = require('node:fs') as typeof import('node:fs');` |

---

## Requirement Traceability

| Requirement | Status | Implementing Code | Notes |
|-------------|--------|-------------------|-------|
| FR-001 | IMPLEMENTED | `interpret.ts:37-287` | 10-step pipeline present, though execution evidence (step 6b) not wired to synthesis |
| FR-002 | IMPLEMENTED | `types.ts:79-80` (deps interface) | Delegates to injected `parseWorkflowFile` + `buildGraph` |
| FR-003 | IMPLEMENTED | `interpret.ts:67-68` | Loads trust, empty trust on missing entry |
| FR-004 | IMPLEMENTED | `interpret.ts:71-79` | Change set + forward invalidation |
| FR-005 | IMPLEMENTED | `resolve.ts:176-198` | Approximate detection via trust state hashes |
| FR-006 | IMPLEMENTED | `resolve.ts:47-99` | Verifies existence, returns error for missing |
| FR-007 | IMPLEMENTED | `resolve.ts:103-168` | RTS/TIA with forward propagation and backward walk |
| FR-008 | IMPLEMENTED | `resolve.ts:202-235` | All nodes, correct entry/exit detection |
| FR-009 | IMPLEMENTED | `path.ts:216-248` | 4-tier lexicographic ranking |
| FR-010 | IMPLEMENTED | `path.ts:42-44`, `path.ts:190-201` | 20-cap with quick heuristic |
| FR-011 | IMPLEMENTED | `path.ts:57-92` | Additional-greedy multi-path |
| FR-012 | PARTIAL | `interpret.ts:119-144` | All 5 actions routed, but `narrow` does not check `overridable` field — force flag check present but `overridable` on the decision itself is ignored |
| FR-013 | IMPLEMENTED | `interpret.ts:119,128,142` | `force` flag bypasses refuse/narrow/redirect |
| FR-014 | IMPLEMENTED | `interpret.ts:157-176,179-246` | Static before execution, static errors don't prevent execution |
| FR-015 | PARTIAL | `interpret.ts:198-228` | Strategy selection present but MCP smoke is phantom (PH-001) and execution data not consumed (SD-004/SD-005) |
| FR-016 | PARTIAL | `interpret.ts:269-279` | Records on pass only, but records ALL resolved target nodes — spec says "only for validated nodes (not mocked, not skipped)" — no filtering |
| FR-017 | IMPLEMENTED | `interpret.ts:282-284` | Saves snapshot on pass |
| FR-018 | IMPLEMENTED | `interpret.ts:158-175` | Multi-path sequential static; execution is NOT per-path though (runs once) |
| FR-019 | IMPLEMENTED | `interpret.ts:198-207` | Destination mode passed to `executeBounded` |
| FR-020 | IMPLEMENTED | `path.ts:65,83` | Selection reason recorded per path |

---

## Architecture Compliance Summary

This project does not have `docs/architecture/` docs (the audit template references Evennia-specific architecture). The applicable architectural authority is CLAUDE.md + constitution. Checking against those:

| Rule Area | Status | Finding Count | Worst Severity |
|-----------|--------|---------------|----------------|
| Fail-Fast | VIOLATION | 3 | HIGH |
| Contract-Driven | CLEAN | 0 | — |
| No Over-Engineering | VIOLATION | 1 | MEDIUM |
| Honest Code Only | VIOLATION | 1 | HIGH |
| Minimal Tests | VIOLATION | 2 | MEDIUM |

---

## Metrics

- **Files audited**: 9
- **Findings**: 0 critical, 4 high, 6 medium, 2 low
- **Spec coverage**: 16 / 20 requirements fully implemented, 4 partial
- **Constitution compliance**: 4 violations across 5 principles checked

---

## Remediation Decisions

For each item below, choose an action:
- **fix**: Create a remediation task to fix the implementation
- **spec**: Update the spec to match the implementation (if the implementation is actually correct)
- **skip**: Accept the finding and take no action
- **split**: Fix part in implementation, update part in spec

### 1. [SF-001 / SF-002] loadSnapshot silently returns null on read/parse errors
**Location**: `src/orchestrator/snapshots.ts:29,36`
**Constitution says**: Fail-Fast, No Fallbacks — errors propagate visibly
**Code does**: Bare `catch { return null; }` for both file read and JSON parse
**Note**: Returning `null` for "file missing" is spec-defined behavior (FR-003 analogy). But read errors (permission denied) and corrupt JSON are distinct failure modes that should be surfaced.

Action: fix / skip / split

### 2. [SD-001] Trust state mutation via Object.assign
**Location**: `src/orchestrator/interpret.ts:78`
**Spec says**: Invalidation produces new state to "use going forward"
**Code does**: Mutates the trust state object in-place with `Object.assign(trustState, invalidatedTrust)`
**Risk**: If `loadTrustState` returns a cached or shared reference, this corrupts it

Action: fix / skip

### 3. [PH-001] executeSmoke called with throwing lambda
**Location**: `src/orchestrator/interpret.ts:210-213`
**Constitution says**: No phantom implementations
**Code does**: Passes a lambda that always throws as the `callTool` argument, making MCP execution unreachable at runtime

Action: fix / skip

### 4. [SD-004 / SD-005] Execution data never reaches synthesize
**Location**: `src/orchestrator/interpret.ts:233-235, 148`
**Spec says**: FR-001 step 7 — synthesize with all evidence including execution data
**Code does**: `getExecutionData` return value is discarded; `executionData` variable stays `null`

Action: fix / skip

---

### MEDIUM / LOW Summary

- **SD-002** (MEDIUM): Execution strategy uses string comparison `=== 'Entire workflow'` — should use request target kind instead
- **SD-003** (MEDIUM): `traceExpressions` called redundantly (step 5 and step 6a for same nodes)
- **CV-001** (MEDIUM): `resolveExecCredentials` uses env vars with silent defaults
- **OE-001** (MEDIUM): `toFixtures` one-call type cast helper
- **TQ-001** (MEDIUM): Performance timing test with all mocked deps is tautological
- **TQ-002** (MEDIUM): Multi-path assertion threshold too low to distinguish single-path from multi-path
- **CQ-001** (LOW): Unused `_graph` parameter in `findFurthestDownstream`
- **CQ-002** (LOW): `require()` in ESM test file (`snapshots.test.ts:137`)

Would you like to promote any MEDIUM/LOW findings to remediation tasks?
