# Tasks: Execution Backend Revision

**Input**: Design documents from `/specs/012-execution-backend-revision/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Test update tasks are included because the feature requires modifying existing tests to remove dead mocks and update expectations. No new test ceremony is added.

**Organization**: This is a refactoring/removal feature where user stories are deeply intertwined (removing REST execution enables correct capability detection and MCP-only execution). Tasks are organized by dependency layer within each logical story group.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1=MCP execution, US2=capability detection, US3=dead code removal, US4=documentation)
- Exact file paths included in descriptions

---

## Phase 1: Foundational Type Changes

**Purpose**: Update type definitions that all downstream code depends on. This phase makes the codebase temporarily non-compilable until consumers are updated in Phase 2+.

**CRITICAL**: These changes block ALL subsequent phases.

- [x] T001 Update `CapabilityLevel` from `'full' | 'rest-only' | 'static-only'` to `'mcp' | 'static-only'` in `src/execution/types.ts`
- [x] T002 Rename `restAvailable` to `restReadable` in `DetectedCapabilities` interface in `src/execution/types.ts`
- [x] T003 Remove `partial: boolean` from `ExecutionResult` interface in `src/execution/types.ts`
- [x] T004 [P] Rename `restApi` to `restReadable` in `AvailableCapabilities` interface in `src/types/diagnostic.ts`
- [x] T005 [P] Remove `partialExecution: boolean` from `ValidationMeta` interface in `src/types/diagnostic.ts`

**Checkpoint**: Type definitions updated. Codebase will have type errors in consumers — expected until Phase 2-4 complete.

---

## Phase 2: US3 — Remove REST Execution Triggering (Priority: P2)

**Goal**: Remove all non-functional REST execution code from the execution subsystem.

**Independent Test**: Search codebase for `executeBounded` — zero matches in `src/execution/`.

- [x] T006 [US3] Remove `executeBounded()` function from `src/execution/rest-client.ts` — keep `resolveCredentials()`, `getExecutionStatus()`, `getExecutionData()`, and their Zod schemas
- [x] T007 [US3] Remove `TriggerExecutionResponseSchema` Zod schema from `src/execution/rest-client.ts`
- [x] T008 [US3] Remove `createRestPollingStrategy()` function from `src/execution/rest-client.ts` — only referenced within this file, safe to remove

**Checkpoint**: REST client retains read-only capabilities. No execution triggering code remains in `src/execution/rest-client.ts`.

---

## Phase 3: US2 — Capability Detection Revision (Priority: P1)

**Goal**: Capability detection accurately reports MCP as the sole execution surface and REST as read-only.

**Independent Test**: Call `detectCapabilities()` with MCP available → returns `level: 'mcp'`. With only REST → returns `level: 'static-only'`.

- [x] T009 [US2] Update `detectCapabilities()` level determination in `src/execution/capabilities.ts` — replace 3-way logic with `mcpAvailable ? 'mcp' : 'static-only'`
- [x] T010 [US2] Rename all `restAvailable` references to `restReadable` in `src/execution/capabilities.ts`
- [x] T011 [US2] Update `toAvailableCapabilities()` mapping in `src/execution/capabilities.ts` — map `restReadable` to `restReadable` (was `restAvailable` → `restApi`)

**Checkpoint**: Capability detection produces only `'mcp'` or `'static-only'` levels. `restReadable` correctly indicates read-only REST.

---

## Phase 4: US1 — Orchestrator Simplification (Priority: P1)

**Goal**: Single MCP execution path. No bounded vs. smoke branching.

**Independent Test**: Requesting execution-backed validation routes through `executeSmoke` exclusively — no `executeBounded` call path exists.

- [x] T012 [US3] Remove `destinationNode` and `destinationMode` from `ValidationRequest` type and `ValidationRequestSchema` in `src/orchestrator/types.ts`
- [x] T013 [US3] Remove `executeBounded` from `OrchestratorDeps` interface in `src/orchestrator/types.ts`
- [x] T014 [US1] Replace 3-way execution branch (lines ~199-226) in `src/orchestrator/interpret.ts` with single path: if MCP available + execution requested → `executeSmoke` with pin data
- [x] T015 [US1] Update execution data retrieval in `src/orchestrator/interpret.ts` — prefer MCP `getExecution` when MCP available, use REST `getExecutionData` only when REST readable and MCP data retrieval unavailable (FR-013)
- [x] T016 [US1] Remove `findFurthestDownstream` function from `src/orchestrator/interpret.ts` — only used for REST bounded fallback, no other callers
- [x] T017 [US1] Update all `restAvailable` references to `restReadable` in `src/orchestrator/interpret.ts`
- [x] T018 [US1] Remove `partial` field from any `ExecutionResult` construction in `src/orchestrator/interpret.ts`

**Checkpoint**: Orchestrator has a single execution path via MCP. No `destinationNode` branching. Type-checks against updated types.

---

## Phase 5: US3 — Interface & Wiring Cleanup (Priority: P2)

**Goal**: Remove `destinationNode` from all external interfaces. Update dependency injection and exports.

**Independent Test**: `destinationNode` does not appear in MCP tool schemas or CLI help. `executeBounded` not in deps or exports.

- [x] T019 [P] [US3] Remove `destinationNode` and `destinationMode` from validate tool input schema and request construction in `src/mcp/server.ts`
- [x] T020 [P] [US3] Remove `--destination` flag from argument parsing and options in `src/cli/index.ts`
- [x] T021 [P] [US3] Update capability mapping in `src/surface.ts` — rename `restAvailable`/`restApi` references to `restReadable`
- [x] T022 [P] [US3] Remove `executeBounded` import and wiring from `src/deps.ts`
- [x] T023 [P] [US3] Remove `executeBounded` from public exports in `src/index.ts` (if exported)
- [x] T024 [US3] Update comment in `src/execution/lock.ts` — remove reference to REST execution

**Checkpoint**: All source code changes complete. `npm run typecheck` should pass.

---

## Phase 6: Test Updates

**Purpose**: Update all test files to match new types, removed functionality, and simplified execution model.

- [x] T025 [P] Remove `executeBounded` test cases and `TriggerExecutionResponseSchema` tests from `test/execution/rest-client.test.ts`
- [x] T026 [P] Update capability level expectations in `test/execution/capabilities.test.ts` — `'full'` → `'mcp'`, remove `'rest-only'` cases, `restAvailable` → `restReadable`
- [x] T027 [P] Remove `executeBounded` mocks from deps and `destinationNode`/`destinationMode` from test inputs in `test/orchestrator/interpret.test.ts` — update execution branching tests to verify single MCP path; verify MCP error propagation coverage for mid-execution connection drops
- [x] T028 [P] Remove `destinationNode`/`destinationMode` from test tool inputs and schema assertions in `test/mcp/server.test.ts`
- [x] T029 [P] Remove `--destination` flag test cases from `test/cli/commands.test.ts` (if any exist)
- [x] T030 Update integration test scenarios in `test/integration/` that use `destinationNode`, `executeBounded`, or old capability levels
- [x] T031 Run full verification: `npm run typecheck`, `npm test`, `npm run lint` — all must pass clean

**Checkpoint**: All automated checks pass. Zero type errors, zero test failures, zero lint warnings.

---

## Phase 7: US4 — Documentation Updates (Priority: P3)

**Goal**: Documentation accurately reflects MCP-only execution model.

**Independent Test**: Review each doc file — no references to REST-based execution triggering as a current capability.

- [x] T032 [P] [US4] Rewrite bounded execution section in `docs/reference/execution.md` — note deferral, promote MCP as primary, add scoped pin data concept
- [x] T033 [P] [US4] Add note under principle 5 in `docs/STRATEGY.md` — bounded execution deferred, pin data placement is v0.1.0 scoping mechanism
- [x] T034 [P] [US4] Add errata to `docs/research/execution_feasibility.md` — `POST /workflows/:id/run` is internal API, REST public API is read-only
- [x] T035 [P] [US4] Update `docs/RELEASE-PLAN.md` — add bounded execution to "NOT in v0.1.0", add opportunistic trust harvesting to deferred
- [x] T036 [P] [US4] Update execution backend section in `CLAUDE.md` — MCP primary for triggering, REST read-only

**Checkpoint**: All documentation reflects current execution model. Feature complete.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Foundational)**: No dependencies — start immediately
- **Phase 2 (REST removal)**: Depends on Phase 1 (T001-T003 for type changes in types.ts)
- **Phase 3 (Capability detection)**: Depends on Phase 1 (T001-T002) and Phase 2 (T006-T007)
- **Phase 4 (Orchestrator)**: Depends on Phases 1-3 (types + execution subsystem updated)
- **Phase 5 (Interfaces/Wiring)**: Depends on Phases 1-4 (all source types settled)
- **Phase 6 (Tests)**: Depends on Phases 1-5 (all source changes complete)
- **Phase 7 (Docs)**: Depends on Phase 6 (code verified correct before documenting)

### User Story Dependencies

- **US1 (MCP execution)** and **US2 (capability detection)**: Deeply coupled — both require type changes and REST removal first. US2 tasks (Phase 3) should complete before US1 tasks (Phase 4).
- **US3 (dead code removal)**: Tasks distributed across Phases 2, 4, 5. Foundation for US1/US2.
- **US4 (documentation)**: Fully independent of other stories. Can proceed after Phase 6 verification.

### Within Phases

- Phase 1: T001-T003 sequential (same file), T004-T005 sequential (same file), but the two groups can run in parallel
- Phase 2: Sequential within rest-client.ts (same file)
- Phase 3: Sequential within capabilities.ts (same file)
- Phase 4: Sequential (type changes then consumer changes in interpret.ts)
- Phase 5: T019-T023 are [P] (different files), T024 is independent
- Phase 6: T025-T029 are [P] (different test files), T030-T031 sequential
- Phase 7: All tasks are [P] (different doc files)

### Parallel Opportunities

**Phase 5** has the most parallelism — 5 tasks across 5 different files.
**Phase 6** has 5 parallel test file updates.
**Phase 7** has 5 parallel doc updates.

---

## Parallel Example: Phase 5

```
# Launch all interface/wiring cleanup tasks together:
Task: "Remove destinationNode from MCP server schema in src/mcp/server.ts"
Task: "Remove --destination from CLI in src/cli/index.ts"
Task: "Update capability mapping in src/surface.ts"
Task: "Remove executeBounded from src/deps.ts"
Task: "Remove executeBounded from src/index.ts"
```

## Parallel Example: Phase 6

```
# Launch all test updates together:
Task: "Update rest-client.test.ts"
Task: "Update capabilities.test.ts"
Task: "Update interpret.test.ts"
Task: "Update server.test.ts"
Task: "Update commands.test.ts"
```

---

## Implementation Strategy

### Sequential Execution (Single Developer)

1. Complete Phase 1 (types) → Codebase temporarily broken
2. Complete Phase 2 (REST removal) → Execution subsystem clean
3. Complete Phase 3 (capabilities) → Detection correct
4. Complete Phase 4 (orchestrator) → Core logic correct
5. Complete Phase 5 (interfaces/wiring) → `npm run typecheck` passes
6. Complete Phase 6 (tests) → `npm test` passes
7. Complete Phase 7 (docs) → Feature complete

### MVP Scope

**Phases 1-6** constitute the MVP — code is correct and verified. Phase 7 (docs) can be deferred if needed but should not be skipped for v0.1.0 release.

---

## Notes

- T001-T003 modify the same file (`src/execution/types.ts`) — execute sequentially within the file
- T004-T005 modify the same file (`src/types/diagnostic.ts`) — execute sequentially within the file
- The codebase will have type errors after Phase 1 until consumers are updated — this is expected and intentional (types-first approach)

---

## Audit Remediation

> Generated by `/speckit.audit` on 2026-04-19. Address before next `/speckit.implement` run.

- [x] T037 [AR] Replace raw `callTool('get_execution', ...)` with validated `getExecution()` from `mcp-client.ts` in `src/orchestrator/interpret.ts` -- fixes CV-001 (silent catch), SD-001 (raw callTool), SD-002 (redundant guard)
- [x] T038 [AR] Remove stale docstring referencing removed polling strategy in `src/execution/rest-client.ts` -- fixes CQ-001
- [x] T039 [AR] Update test mocks in `test/orchestrator/interpret.test.ts` to provide valid `GetExecutionResponseSchema` response for `callTool` mock
