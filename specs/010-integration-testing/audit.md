# Implementation Audit: Integration Testing Suite

**Date**: 2026-04-19
**Branch**: `010-integration-testing`
**Base**: `main` (merge-base `2a178b0`)
**Files audited**: 15 (all untracked implementation files under `test/integration/`)

---

## Findings

| ID | Category | Severity | Location | Description | Quoted Evidence |
|----|----------|----------|----------|-------------|-----------------|
| SF-001 | Silent Failure | HIGH | `seed.ts:365-373` | Pull failure is caught and logged but does not abort the seed run. The manifest is written with the workflow ID even though the fixture file was never pulled — subsequent test runs will reference a missing `.ts` file. | `catch (err) { console.error(\`    ⚠ Pull failed for ${name}: ...\`); console.error(\`      You may need to pull manually: ...\`); }` |
| CV-001 | Constitution Violation | HIGH | `setup.ts:108-114` | `checkApiKey()` silently swallows exception from `n8nac config` and falls through to the throw. This is fine structurally, but the regex check `if (/api.?key/i.test(output)) return '(configured-via-n8nac)';` returns a sentinel string that pretends to be an API key. The `IntegrationContext.apiKey` field then holds a non-key string. This violates Principle IV (Honest Code) — the return value claims to be an API key but isn't one. | `if (/api.?key/i.test(output)) return '(configured-via-n8nac)';` |
| SD-001 | Spec Drift | HIGH | `run.ts:140-149` | FR-011 requires failure output to include "fixture name, expected outcome, actual outcome, and diagnostic summary." The runner only prints the error message string. It does not include the fixture name or diagnostic summary in failure output. | `console.log(\`  FAIL  ${scenario.name} (${durationMs}ms)\`); if (args.verbose) { console.log(\`        ${errorMsg}\`); }` |
| SD-002 | Spec Drift | MEDIUM | `run.ts:33-51` | FR-009 requires scenario independence. The runner creates ONE set of temp dirs (via single `setup()` call) and shares them across all scenarios. Scenarios that write trust state pollute the same `trustDir`/`snapshotDir`. Each scenario calls `buildTestDeps(ctx.trustDir, ctx.snapshotDir)` pointing to the shared dirs. | `const scenarios = await loadScenarios(...); for (const scenario of scenarios) { await scenario.run(ctx); }` — single `ctx` with shared `trustDir` |
| SD-003 | Spec Drift | MEDIUM | `07-mcp-tools.ts:59-70` | US5 acceptance criterion 2 requires the error response to match `{ success: false, error: { type: 'workflow_not_found' } }`. Scenario 07 only checks `invalidResult.success === false` and `invalidResult.error` exists — it does not assert `error.type === 'workflow_not_found'`. | `if (invalidResult.success) { throw ... } if (!invalidResult.error) { throw ... }` — no assertion on `error.type` |
| OE-001 | Over-Engineering | MEDIUM | `seed.ts:45-106` | Five single-use helper functions (`trigger`, `setNode`, `noOp`, `httpRequest`, `ifNode`) are each called 1-4 times only within the FIXTURES constant. Constitution Principle III requires at least two concrete consumers. These could be inline object literals. | `function trigger(id: string, name: string, pos: [number, number]): WorkflowNode { ... }` called 7 times total across all fixtures, but `noOp` called once, `ifNode` called once, `httpRequest` called 3 times |
| CQ-001 | Code Quality | MEDIUM | `04-trust-lifecycle.ts:55-57` | Fragile regex `value.*?['"]B['"]` will match the first occurrence of `value...'B'` in the file, which could be any node's value containing `B`, not necessarily node B's value parameter. The `multi-node-change` fixture has node A with `value: 'A'`, node B with `value: 'B'`, etc. — if file serialization order changes, this regex could match wrong content. | `const modified = content.replace(/value.*?['"]B['"]/, "value: 'B-modified'");` |
| CQ-002 | Code Quality | MEDIUM | `08-full-pipeline.ts:63-67` | String replacement `'$json.nonexistent.deep.path'` → `'$json.greeting'` assumes the seed fixture's serialized `.ts` content preserves the exact string. The fixture is pulled from n8n via `n8nac pull`, so the actual file content is server-generated. The expression may be serialized differently (e.g., escaped, quoted differently) and the replace would silently produce no change. No guard like scenario 04's `if (modified === content)` check exists. | `const fixed = content.replace('$json.nonexistent.deep.path', '$json.greeting');` — no verification that replacement actually occurred |
| SD-004 | Spec Drift | LOW | `seed.ts:256-263` | `findExistingWorkflow` fetches ALL workflows from n8n's API to find one by name. The n8n v1 API paginates — a large instance could return only the first page, missing the target workflow and incorrectly creating a duplicate. FR-002 requires idempotency. | `const response = await fetch(\`${N8N_BASE_URL}/api/v1/workflows\`, { headers });` — no pagination handling |

---

## Requirement Traceability

| Requirement | Status | Implementing Code | Notes |
|-------------|--------|-------------------|-------|
| FR-001 | IMPLEMENTED | `seed.ts:112-222` (FIXTURES), `seed.ts:266-280` (createWorkflow) | 7 fixtures defined, REST API creation |
| FR-002 | PARTIAL | `seed.ts:349-355` (findExistingWorkflow + update) | Idempotency works for small instances; no pagination handling (SD-004) |
| FR-003 | IMPLEMENTED | `seed.ts:376-378` (manifest write) | Manifest written as JSON |
| FR-004 | IMPLEMENTED | `run.ts:33-51,90-168` | Sequential runner with lifecycle |
| FR-005 | IMPLEMENTED | `setup.ts:36-73` | All 7 prerequisites checked |
| FR-006 | PARTIAL | `setup.ts:58-63` | Temp dirs created per run but shared across scenarios (SD-002) |
| FR-007 | IMPLEMENTED | `run.ts:69-70` | `--scenario N` flag |
| FR-008 | IMPLEMENTED | `run.ts:105-109` | `--check` flag |
| FR-009 | DEVIATED | `run.ts:90-168` | Shared trust/snapshot dirs across scenarios (SD-002) |
| FR-010 | IMPLEMENTED | All scenario files | Import from `src/` directly, MCP in scenario 07 |
| FR-011 | DEVIATED | `run.ts:140-149` | Missing fixture name and diagnostic summary in failure output (SD-001) |
| FR-012 | IMPLEMENTED | `push.ts:19-42` | OCC retry with `--mode keep-current` |
| FR-013 | IMPLEMENTED | `assertions.ts:1-74` | 6 typed assertion helpers |
| FR-014 | IMPLEMENTED | `mcp-client.ts:1-75` | MCP client via stdio transport |
| FR-015 | IMPLEMENTED | `seed.ts:112-222` | Each fixture 2-5 nodes, targeting one signal |
| FR-016 | IMPLEMENTED | `seed.ts:43` | `PREFIX = 'n8n-vet-test--'` |
| FR-017 | IMPLEMENTED | `04-trust-lifecycle.ts:50-62`, `08-full-pipeline.ts:59-67` | Copies to temp before editing |

---

## Architecture Compliance Summary

No `docs/architecture/` directory exists in this project. Architecture rule checks (H1-H10) are not applicable. The implementation follows the project's established patterns (library imports from `src/`, dependency injection via `OrchestratorDeps`, `buildDeps()` composition).

Architecture compliance: all applicable checks passed.

---

## Metrics

- **Files audited**: 15
- **Findings**: 0 critical, 3 high, 4 medium, 1 low
- **Spec coverage**: 15 / 17 requirements fully implemented (2 partial/deviated)
- **Constitution compliance**: 1 violation across 5 principles checked

---

## Remediation Decisions

For each item below, choose an action:
- **fix**: Create a remediation task to fix the implementation
- **spec**: Update the spec to match the implementation (if the implementation is actually correct)
- **skip**: Accept the finding and take no action
- **split**: Fix part in implementation, update part in spec (explain which)

### 1. [SF-001] Seed script continues after n8nac pull failure
**Location**: `seed.ts:365-373`
**Spec says**: Seed script creates fixtures and produces committed artifacts (FR-001)
**Code does**: Logs a warning and continues, writing the manifest with a workflow ID whose `.ts` file was never pulled. Subsequent test runs will fail with confusing errors about missing fixture files.

Action: fix / spec / skip / split

### 2. [CV-001] `checkApiKey()` returns fake API key sentinel
**Location**: `setup.ts:108-114`
**Constitution says**: Principle IV — No phantom implementations; return values must match their stated contract
**Code does**: Returns `'(configured-via-n8nac)'` as an API key string when the key is in n8nac's config. This value propagates to `IntegrationContext.apiKey` where callers would expect a real key.

Action: fix / spec / skip / split

### 3. [SD-001] Failure output missing fixture name and diagnostic summary
**Location**: `run.ts:140-149`
**Spec says**: FR-011 — failure output MUST include fixture name, expected outcome, actual outcome, and diagnostic summary
**Code does**: Prints scenario name and error message only. No fixture name. No diagnostic summary.

Action: fix / spec / skip / split

### MEDIUM / LOW Summary

- **SD-002** (MEDIUM): Shared trust/snapshot dirs violate FR-009 scenario independence. Each scenario writes to the same dirs — trust state from scenario 01 leaks into scenario 02.
- **SD-003** (MEDIUM): Scenario 07 doesn't assert `error.type === 'workflow_not_found'` per US5 acceptance criterion 2.
- **OE-001** (MEDIUM): Single-use node builder helpers (`noOp`, `ifNode`) in seed.ts violate Constitution III. Only `trigger` and `setNode` have enough uses to justify.
- **CQ-001** (MEDIUM): Fragile regex in scenario 04 for modifying node B — positional match could break.
- **CQ-002** (MEDIUM): Scenario 08 string replace has no guard verifying the replacement actually occurred (scenario 04 has this guard; 08 doesn't).
- **SD-004** (LOW): `findExistingWorkflow` doesn't paginate — could duplicate workflows on large instances.

Would you like to promote any MEDIUM/LOW findings to remediation tasks?
