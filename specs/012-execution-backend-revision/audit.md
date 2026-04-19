# Implementation Audit: Execution Backend Revision

**Date**: 2026-04-19
**Branch**: `012-execution-backend-revision`
**Base**: `main` (6e0bfbc)
**Files audited**: 39 (20 source, 19 test/integration)

---

## Findings

| ID | Category | Severity | Location | Description | Quoted Evidence |
|----|----------|----------|----------|-------------|-----------------|
| CV-001 | Constitution Violation | HIGH | `src/orchestrator/interpret.ts:225-227` | Silent catch swallows all MCP `get_execution` errors and falls through to REST — violates Constitution I (Fail-Fast, No Fallbacks). The word "fallback" is in the comment. | `catch { // MCP data retrieval failed — fall through to REST }` |
| SD-001 | Spec Drift | HIGH | `src/orchestrator/interpret.ts:210` | MCP data retrieval uses raw `request.callTool('get_execution', ...)` instead of the existing `getExecution()` function from `mcp-client.ts:161` which has proper Zod validation, typed error handling, and `includeData` support. Bypasses the validated boundary. | `const mcpResult = await request.callTool('get_execution', { executionId: execResult.executionId });` |
| SD-002 | Spec Drift | MEDIUM | `src/orchestrator/interpret.ts:208` | Redundant `request.callTool` check — line 177 already gates on `detected.mcpAvailable && request.callTool`, so line 208's `if (request.callTool)` is always true inside this block. Dead branch. | `if (request.callTool) {` |
| CQ-001 | Code Quality | LOW | `src/execution/rest-client.ts:259` | Stale docstring references removed polling strategy. `createRestPollingStrategy` was deleted but the comment persists. | `* Used as the REST-only polling strategy.` |

---

## Requirement Traceability

| Requirement | Status | Implementing Code | Notes |
|-------------|--------|-------------------|-------|
| FR-001 | IMPLEMENTED | `src/orchestrator/interpret.ts:198` | All execution routes through `deps.executeSmoke()` |
| FR-002 | IMPLEMENTED | `src/execution/rest-client.ts` (removed), `src/deps.ts`, `src/index.ts` | Zero matches for `executeBounded` in `src/` |
| FR-003 | IMPLEMENTED | `src/orchestrator/types.ts:39-47`, `src/mcp/server.ts:23-51`, `src/cli/index.ts` | Zero matches for `destinationNode` in `src/` |
| FR-004 | IMPLEMENTED | `src/cli/index.ts:93-98` | `--destination` removed from `parseArgs` options |
| FR-005 | IMPLEMENTED | `src/execution/types.ts:138` | `type CapabilityLevel = 'mcp' \| 'static-only'` |
| FR-006 | IMPLEMENTED | `src/execution/types.ts:143`, `src/execution/capabilities.ts` | `restReadable` throughout |
| FR-007 | IMPLEMENTED | `src/orchestrator/interpret.ts:177-247` | Single MCP path, no branching |
| FR-008 | IMPLEMENTED | `src/execution/rest-client.ts` | `resolveCredentials`, `getExecutionStatus`, `getExecutionData` all preserved |
| FR-009 | IMPLEMENTED | `src/execution/types.ts:71-74`, `src/types/diagnostic.ts:101-110` | `partial` and `partialExecution` removed |
| FR-010 | IMPLEMENTED | `src/execution/rest-client.ts` | `TriggerExecutionResponseSchema` removed |
| FR-011 | IMPLEMENTED | All test files updated | 538 tests pass |
| FR-012 | IMPLEMENTED | `docs/reference/execution.md`, `docs/STRATEGY.md`, etc. | All 5 doc files updated |
| FR-013 | PARTIAL | `src/orchestrator/interpret.ts:206-245` | MCP preferred, REST fallback present, but MCP path uses raw `callTool` instead of validated `getExecution()` (see SD-001) |

---

## Metrics

- **Files audited**: 39
- **Findings**: 0 critical, 2 high, 1 medium, 1 low
- **Spec coverage**: 13 / 13 requirements implemented (1 partial)
- **Constitution compliance**: 1 violation across 5 principles checked

---

## Remediation Decisions

For each item below, choose an action:
- **fix**: Create a remediation task
- **spec**: Update the spec to match the implementation
- **skip**: Accept the finding and take no action
- **split**: Fix part in implementation, update part in spec

### 1. [CV-001] Silent catch swallows MCP data retrieval errors (HIGH)
**Location**: `src/orchestrator/interpret.ts:225-227`
**Constitution says**: "No silent catches, no log-and-continue, no default-value recovery on error paths. The word and practice of 'fallback' are prohibited."
**Code does**: Catches all exceptions from MCP `get_execution` and silently falls through to REST data retrieval. The comment literally contains the word "fallback."

**Proposed fix**: Remove the try/catch. Let MCP data retrieval errors propagate. If MCP execution succeeded (line 198), MCP data retrieval should also succeed — a failure here is an infrastructure error that should surface, not be silently recovered. The REST "fallback" path (lines 230-245) should only be reached when `request.callTool` is absent (which can't happen in this code path) or explicitly when the caller opts for REST retrieval.

Action: fix / spec / skip / split

### 2. [SD-001] Raw callTool bypasses validated getExecution boundary (HIGH)
**Location**: `src/orchestrator/interpret.ts:210`
**Spec says**: FR-013 requires preferring MCP `get_execution` for data retrieval.
**Code does**: Calls `request.callTool('get_execution', ...)` directly instead of the existing `getExecution()` function from `src/execution/mcp-client.ts:161` which provides Zod response validation, typed error mapping to `ExecutionInfrastructureError`, and proper `includeData`/`nodeNames`/`truncateData` parameter support.

**Proposed fix**: Replace the raw `callTool` with `getExecution(workflowId, execResult.executionId, request.callTool, { includeData: true })` from `mcp-client.ts`, wire through deps if needed. This also resolves CV-001 since `getExecution` throws typed errors instead of requiring a catch.

Action: fix / spec / skip / split

### MEDIUM / LOW Summary

- **[SD-002] MEDIUM**: Redundant `request.callTool` guard at `interpret.ts:208` — always true in this code path. Harmless but adds noise.
- **[CQ-001] LOW**: Stale comment at `rest-client.ts:259` referencing removed polling strategy.

Would you like to promote any of these to remediation tasks?

---

## Proposed Spec Changes

None.

---

## Remediation Tasks

> Generated by `/speckit.audit` on 2026-04-19. All remediated.

- [x] T037 [AR] Replace raw `callTool('get_execution', ...)` with validated `getExecution()` from `mcp-client.ts` in `src/orchestrator/interpret.ts:209-213` -- fixes CV-001, SD-001, SD-002
- [x] T038 [AR] Remove stale docstring referencing removed polling strategy in `src/execution/rest-client.ts:259` -- fixes CQ-001
- [x] T039 [AR] Update test mocks in `test/orchestrator/interpret.test.ts:550-553,580-583` to provide valid `GetExecutionResponseSchema` response for `callTool`

**Verification**: 538 tests pass, zero type errors, lint clean.
