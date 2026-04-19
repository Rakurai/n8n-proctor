# Implementation Plan: Execution Backend Revision

**Branch**: `012-execution-backend-revision` | **Date**: 2026-04-19 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/012-execution-backend-revision/spec.md`

## Summary

Remove non-functional REST-based execution triggering (`executeBounded`, `destinationNode`, `--destination`) and consolidate on MCP `test_workflow` as the sole execution backend. Simplify capability detection to `'mcp' | 'static-only'`, rename `restAvailable` to `restReadable`, remove `partial`/`partialExecution` fields, and update all tests and documentation.

## Technical Context

**Language/Version**: TypeScript 5.7+ on Node.js >=20.0.0  
**Primary Dependencies**: `@modelcontextprotocol/sdk ^1.12.1`, `zod ^3.24.0`, `@n8n-as-code/transformer ^1.2.0`  
**Storage**: File-based (trust state, pin data cache, snapshots)  
**Testing**: Vitest 3.1.0 (strict TypeScript mode)  
**Target Platform**: Node.js CLI / MCP server  
**Project Type**: Library + CLI + MCP server  
**Performance Goals**: N/A (refactoring, no new performance surfaces)  
**Constraints**: All TypeScript strict flags enabled, Biome linting, no unused locals/parameters  
**Scale/Scope**: ~54 source files, ~75 test files; this revision touches ~15 source files and ~8 test files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Fail-Fast, No Fallbacks | PASS | Removing REST execution fallback paths aligns with this principle. When MCP is unavailable, the tool reports static-only — no silent degradation to REST execution. |
| II. Contract-Driven Boundaries | PASS | Renaming `restAvailable` → `restReadable` and `restApi` → `restReadable` makes contracts honest. Zod schemas updated at boundaries. |
| III. No Over-Engineering | PASS | Removing `partial` field (always false), dead capability levels, and unused branching logic reduces complexity. Keeping poll.ts (small, backend-agnostic) avoids premature removal. |
| IV. Honest Code Only | PASS | This entire revision is driven by principle IV — removing `executeBounded` which claims to work but cannot. Removing `'full'` and `'rest-only'` levels that overstate REST capability. |
| V. Minimal, Meaningful Tests | PASS | Removing REST execution mocks and `destinationNode` test inputs. Preserving MCP execution path coverage. No new ceremony tests. |

**Post-Phase 1 re-check**: No violations introduced. Data model changes (data-model.md) are strictly subtractive (removing fields/values) plus one rename (`restAvailable` → `restReadable`). No new abstractions.

## Project Structure

### Documentation (this feature)

```text
specs/012-execution-backend-revision/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research decisions
├── data-model.md        # Entity change documentation
├── quickstart.md        # Developer quickstart
├── contracts/
│   ├── mcp-validate-tool.md   # Updated MCP tool contract
│   └── cli-validate-command.md # Updated CLI contract
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (from /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── cli/
│   └── index.ts                 # MODIFY: remove --destination flag
├── execution/
│   ├── rest-client.ts           # MODIFY: remove executeBounded, TriggerExecutionResponseSchema
│   ├── capabilities.ts          # MODIFY: new CapabilityLevel, restReadable, detection logic
│   ├── types.ts                 # MODIFY: CapabilityLevel, DetectedCapabilities, ExecutionResult
│   ├── lock.ts                  # MODIFY: update comment only
│   ├── poll.ts                  # KEEP: backend-agnostic, useful for future async path
│   ├── mcp-client.ts            # KEEP: already correct
│   ├── pin-data.ts              # KEEP: backend-agnostic
│   └── results.ts               # KEEP: backend-agnostic
├── orchestrator/
│   ├── types.ts                 # MODIFY: remove destinationNode/Mode from request/deps
│   └── interpret.ts             # MODIFY: remove 3-way branch, single MCP execution path
├── mcp/
│   └── server.ts                # MODIFY: remove destinationNode/Mode from schema
├── types/
│   └── diagnostic.ts            # MODIFY: restApi→restReadable, remove partialExecution
├── surface.ts                   # MODIFY: update capability mapping
├── deps.ts                      # MODIFY: remove executeBounded import/wiring
└── index.ts                     # MODIFY: remove executeBounded export

test/
├── execution/
│   ├── rest-client.test.ts      # MODIFY: remove executeBounded tests
│   └── capabilities.test.ts     # MODIFY: update capability level expectations
├── orchestrator/
│   └── interpret.test.ts        # MODIFY: remove executeBounded mocks, destinationNode inputs
├── mcp/
│   └── server.test.ts           # MODIFY: remove destinationNode from test inputs
├── cli/
│   └── commands.test.ts         # MODIFY: remove --destination test cases
└── integration/                 # MODIFY: update any scenarios using destinationNode/executeBounded
```

**Structure Decision**: No structural changes. All modifications are within existing files — removing code and updating types/schemas.

## Implementation Phases

### Phase 1: Type Foundation (types-first, enables all downstream phases)

Remove/modify type definitions that everything depends on. This phase makes the codebase temporarily non-compilable until consumers are updated.

**Files**:
1. `src/execution/types.ts` — Change `CapabilityLevel` to `'mcp' | 'static-only'`. Rename `restAvailable` to `restReadable` in `DetectedCapabilities`. Remove `partial` from `ExecutionResult`.
2. `src/types/diagnostic.ts` — Rename `restApi` to `restReadable` in `AvailableCapabilities`. Remove `partialExecution` from `ValidationMeta`.

**Dependency**: None. This is the foundation.

### Phase 2: Execution Subsystem Cleanup

Remove REST execution triggering code and update capability detection to match new types.

**Files**:
1. `src/execution/rest-client.ts` — Remove `executeBounded()` function and `TriggerExecutionResponseSchema`. Keep `resolveCredentials()`, `getExecutionStatus()`, `getExecutionData()`, and their schemas.
2. `src/execution/capabilities.ts` — Update `detectCapabilities()` level determination: `mcpAvailable ? 'mcp' : 'static-only'`. Rename `restAvailable` to `restReadable` throughout. Update `toAvailableCapabilities()` mapping.
3. `src/execution/lock.ts` — Update comment referencing REST execution (cosmetic).

**Dependency**: Phase 1 (types must be updated first).

### Phase 3: Orchestrator Simplification

Remove the 3-way execution branch and consolidate on a single MCP path.

**Files**:
1. `src/orchestrator/types.ts` — Remove `destinationNode` and `destinationMode` from `ValidationRequest`. Remove `executeBounded` from `OrchestratorDeps`. Update `ValidationRequestSchema` (Zod).
2. `src/orchestrator/interpret.ts` — Replace the 3-way branch (lines ~199-226) with a single path: if MCP available + execution requested → `executeSmoke`. Remove `findFurthestDownstream` call for REST fallback. Update execution data retrieval to work without REST (use MCP `getExecution` when REST not readable). Remove `partial` from `ExecutionResult` construction. Update `restAvailable` references to `restReadable`.

**Dependency**: Phase 1 + Phase 2.

### Phase 4: Interface Cleanup

Remove `destinationNode` from external-facing interfaces.

**Files**:
1. `src/mcp/server.ts` — Remove `destinationNode` and `destinationMode` from validate tool input schema and request construction.
2. `src/cli/index.ts` — Remove `--destination` flag from argument parsing and options type.
3. `src/surface.ts` — Update capability mapping to use `restReadable`.

**Dependency**: Phase 3 (orchestrator types must be updated first).

### Phase 5: Wiring & Exports

Update dependency injection and barrel exports.

**Files**:
1. `src/deps.ts` — Remove `executeBounded` import and property from OrchestratorDeps construction.
2. `src/index.ts` — Remove `executeBounded` from public exports (if exported).

**Dependency**: Phase 2 + Phase 3.

### Phase 6: Test Updates

Update all test files to match the new types and removed functionality.

**Files**:
1. `test/execution/rest-client.test.ts` — Remove all `executeBounded` test cases and `TriggerExecutionResponseSchema` tests.
2. `test/execution/capabilities.test.ts` — Update expectations: `'full'` → `'mcp'` where MCP available, remove `'rest-only'` expectations, update `restAvailable` → `restReadable`.
3. `test/orchestrator/interpret.test.ts` — Remove `executeBounded` mocks from deps. Remove `destinationNode`/`destinationMode` from test request inputs. Update execution branching tests to verify single MCP path.
4. `test/mcp/server.test.ts` — Remove `destinationNode`/`destinationMode` from test tool inputs and schema assertions.
5. `test/cli/commands.test.ts` — Remove `--destination` flag test cases (if any).
6. `test/integration/` — Update any integration scenarios using `destinationNode`, `executeBounded`, or old capability levels.

**Dependency**: Phases 1-5 (all source changes complete).

### Phase 7: Documentation Updates

Update design and reference documentation.

**Files**:
1. `docs/reference/execution.md` — Rewrite bounded execution section, promote MCP as primary, add scoped pin data concept.
2. `docs/STRATEGY.md` — Note bounded execution deferral under principle 5.
3. `docs/research/execution_feasibility.md` — Add errata: `POST /workflows/:id/run` is internal API.
4. `docs/RELEASE-PLAN.md` — Add bounded execution to "NOT in v0.1.0" and opportunistic trust harvesting to deferred.
5. `CLAUDE.md` — Update execution backend description.

**Dependency**: Phase 6 (code must be correct before documenting).

## Complexity Tracking

No constitution violations requiring justification. All changes are subtractive (removing dead code) or corrective (renaming misleading fields). No new abstractions introduced.
