# Tasks: Execution Subsystem

**Input**: Design documents from `/specs/005-execution-subsystem/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Included per spec acceptance criteria SC-009 and SC-010.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Create execution subsystem directory structure and foundational types

- [x] T001 Create directory structure: `src/execution/` and `test/execution/`
- [x] T002 [P] Define internal execution types (PinData, PinDataItem, PinDataSource, PinDataSourceMap, PinDataResult, ExecutionStatus, ExecutionResult, ExecutionErrorDataBase, ExecutionErrorData, ExecutionData, NodeExecutionResult, SourceInfo, ExecutionHint, CapabilityLevel, DetectedCapabilities) in `src/execution/types.ts` per data-model.md
- [x] T003 [P] Define typed error classes (ExecutionInfrastructureError with reason union, ExecutionPreconditionError with reason union, ExecutionConfigError) extending a common base in `src/execution/errors.ts` per research R6

---

## Phase 2: Foundational (Credential Resolution)

**Purpose**: Credential resolution is a blocking prerequisite — REST client, MCP client, and capability detection all depend on resolved credentials

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Implement `resolveCredentials()` in `src/execution/rest-client.ts` — 4-level config cascade (explicit > env vars > n8nac project config > global credential store) per research R3 and contracts. Read `n8nac-config.json` and `~/.config/n8nac/credentials.json`. Throw `ExecutionConfigError` identifying the specific missing credential when resolution fails.
- [x] T005 Add Zod schemas for REST API response validation in `src/execution/rest-client.ts` — validate at edge boundaries per constitution principle II. MCP response Zod schemas are added in Phase 5 (T018) alongside the MCP client implementation.

**Checkpoint**: Credential resolution working — execution modules can now authenticate

---

## Phase 3: User Story 1 - Bounded Execution of a Changed Slice (Priority: P1) MVP

**Goal**: Execute a bounded subgraph via REST API with `destinationNode` and return per-node results

**Independent Test**: Provide a workflow ID, destination node, and pin data. Verify correct REST request payload, polling sequence, and structured per-node execution data returned.

### Tests for User Story 1

- [x] T006 [P] [US1] Write unit tests for REST client request shaping (payload shape per research R1: `{ destinationNode: { nodeName, mode }, pinData }`, auth header, error mapping for 404/401/unreachable) in `test/execution/rest-client.test.ts`
- [x] T007 [P] [US1] Write unit tests for per-node result extraction (success node, error node with each contextKind, source lineage, hints, no raw output data in result) in `test/execution/results.test.ts`
- [x] T008 [P] [US1] Write unit tests for polling (backoff sequence 1s/2s/4s/8s/15s/15s, timeout returns canceled result not thrown error, phase transition from status-only to data retrieval) in `test/execution/poll.test.ts`

### Implementation for User Story 1

- [x] T009 [US1] Implement REST API client `executeBounded()` in `src/execution/rest-client.ts`
- [x] T010 [US1] Implement per-node result extraction `extractExecutionData()` in `src/execution/results.ts`
- [x] T011 [US1] Implement two-phase polling `pollForCompletion()` in `src/execution/poll.ts`

**Checkpoint**: Bounded execution works end-to-end — trigger via REST, poll with backoff, extract per-node results

---

## Phase 4: User Story 2 - Pin Data Construction with Source Traceability (Priority: P1) MVP

**Goal**: Construct pin data from 4-tier sourcing priority with traceability for every mocked node

**Independent Test**: Provide a graph, trusted boundaries, and varying combinations of fixtures/artifacts to verify tier priority, source map correctness, normalization, and error on missing data.

### Tests for User Story 2

- [x] T012 [P] [US2] Write unit tests for pin data construction in `test/execution/pin-data.test.ts`

### Implementation for User Story 2

- [x] T013 [US2] Implement `constructPinData()` in `src/execution/pin-data.ts`
- [x] T014 [US2] Implement `normalizePinData()` in `src/execution/pin-data.ts`
- [x] T015 [US2] Implement pin data artifact caching in `src/execution/pin-data.ts`

**Checkpoint**: Pin data construction works with all 4 tiers, produces traceable source maps, no empty stubs

---

## Phase 5: User Story 3 - Whole-Workflow Smoke Test (Priority: P2)

**Goal**: Execute entire workflow via MCP `test_workflow` with pin data and optional trigger override

**Independent Test**: Verify MCP tool invocation with correct parameters, timeout handling, and follow-up `get_execution` data retrieval.

### Tests for User Story 3

- [x] T016 [P] [US3] Write unit tests for MCP client in `test/execution/mcp-client.test.ts`

### Implementation for User Story 3

- [x] T017 [US3] Implement MCP client `executeSmoke()` in `src/execution/mcp-client.ts`
- [x] T018 [US3] Implement MCP client `getExecution()` in `src/execution/mcp-client.ts`
- [x] T019 [US3] Implement MCP client `preparePinData()` in `src/execution/mcp-client.ts`

**Checkpoint**: Whole-workflow smoke tests work via MCP, result retrieval supports node filtering

---

## Phase 6: User Story 4 - Capability Detection (Priority: P2)

**Goal**: Probe n8n environment and report available execution capabilities before attempting execution

**Independent Test**: Mock health check, auth, MCP discovery, and workflow check endpoints. Verify correct capability-level reporting and actionable error messages.

### Tests for User Story 4

- [x] T020 [P] [US4] Write unit tests for capability detection in `test/execution/capabilities.test.ts`

### Implementation for User Story 4

- [x] T021 [US4] Implement `detectCapabilities()` and `toAvailableCapabilities()` in `src/execution/capabilities.ts`

**Checkpoint**: Capability detection correctly reports environment state before execution attempts

---

## Phase 7: User Story 5 - Execution Result Retrieval with Polling (Priority: P2)

**Goal**: Two-phase polling strategy — lightweight status polling with exponential backoff, then filtered data retrieval

**Independent Test**: Mock HTTP sequences simulating immediate completion, gradual backoff, and timeout. Verify backoff timing, data retrieval filtering, and timeout behavior.

Note: The core polling implementation is in T011 (US1). This phase adds the REST-only polling path for when MCP is unavailable.

- [x] T022 [US5] Implement REST-based polling strategy `createRestPollingStrategy()` in `src/execution/rest-client.ts`

**Checkpoint**: Polling works in both MCP-available and REST-only modes

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Integration validation and cross-story consistency

- [x] T023 Verify all typed errors include actionable messages
- [x] T024 Verify serialized execution constraint (FR-016) — added `src/execution/lock.ts` with `withExecutionLock()` covering both entry points
- [x] T025 Run `npm run typecheck` and `npm test` — all 161 tests pass, zero type errors
- [x] T026 Run quickstart.md validation — documented usage flow verified against implementation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 types and errors — BLOCKS all user stories
- **US1 Bounded Execution (Phase 3)**: Depends on Phase 2. Core MVP.
- **US2 Pin Data (Phase 4)**: Depends on Phase 2. Can run in parallel with US1 (different files).
- **US3 Smoke Test (Phase 5)**: Depends on Phase 2. Can run in parallel with US1/US2 (different files).
- **US4 Capability Detection (Phase 6)**: Depends on Phase 2 (credentials). Can run in parallel with US1/US2/US3.
- **US5 REST Polling (Phase 7)**: Depends on US1 (T011 polling core). Adds REST-only path.
- **Polish (Phase 8)**: Depends on all user stories being complete.

### User Story Dependencies

- **US1 (P1)**: After Foundational — no dependencies on other stories
- **US2 (P1)**: After Foundational — no dependencies on other stories. Uses MCP client from US3 for tier 3 if available; when MCP client is not yet implemented, tier 3 is skipped and unresolved nodes proceed to tier 4 (typed error)
- **US3 (P2)**: After Foundational — no dependencies on other stories
- **US4 (P2)**: After Foundational — uses REST client from US1 and MCP client from US3 for probing, but can be implemented with direct HTTP calls if those aren't ready
- **US5 (P2)**: After US1 (extends polling with REST-only path)

### Within Each User Story

- Tests written first, verified to compile (may not run until implementation exists)
- Types and errors already available from Phase 1
- Implementation follows contract definitions from `contracts/execution.md`
- Story complete when its checkpoint passes

### Parallel Opportunities

- T002 and T003 can run in parallel (different files)
- T006, T007, T008 can all run in parallel (different test files)
- US1, US2, US3, US4 can all start in parallel after Phase 2 (different source files)
- T012 can run in parallel with T006/T007/T008 (different test file)
- T016 can run in parallel with T012/T006/T007/T008 (different test file)
- T020 can run in parallel with all other test tasks (different test file)

---

## Parallel Example: All User Story Tests

```
# Launch all test-writing tasks together (all different files):
T006: REST client tests in test/execution/rest-client.test.ts
T007: Result extraction tests in test/execution/results.test.ts
T008: Polling tests in test/execution/poll.test.ts
T012: Pin data tests in test/execution/pin-data.test.ts
T016: MCP client tests in test/execution/mcp-client.test.ts
T020: Capability detection tests in test/execution/capabilities.test.ts
```

## Parallel Example: All User Story Implementations

```
# After Phase 2, launch core implementations in parallel (different files):
T009: REST client executeBounded in src/execution/rest-client.ts
T013: Pin data constructPinData in src/execution/pin-data.ts
T017: MCP client executeSmoke in src/execution/mcp-client.ts
T021: Capability detection in src/execution/capabilities.ts
```

---

## Implementation Strategy

### MVP First (US1 + US2 = Bounded Execution with Pin Data)

1. Complete Phase 1: Setup (types + errors)
2. Complete Phase 2: Foundational (credential resolution)
3. Complete Phase 3: US1 — Bounded execution via REST
4. Complete Phase 4: US2 — Pin data construction
5. **STOP and VALIDATE**: Execute a bounded slice with constructed pin data and verify per-node results

### Incremental Delivery

1. Setup + Foundational → Types, errors, credentials ready
2. US1 (Bounded Execution) → Core execution capability (MVP!)
3. US2 (Pin Data) → Automated pin data sourcing with traceability
4. US3 (Smoke Test) → Whole-workflow MCP execution
5. US4 (Capability Detection) → Environment probing before execution
6. US5 (REST Polling) → REST-only polling path for MCP-unavailable environments
7. Polish → Error messages, serialization lock, type-check, quickstart validation

### Parallel Agent Strategy

With multiple agents after Phase 2:

- Agent A: US1 (REST client + results + polling)
- Agent B: US2 (Pin data construction + caching)
- Agent C: US3 (MCP client)
- Agent D: US4 (Capability detection)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Tests are written first per spec acceptance criteria SC-009/SC-010
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Integration tests (requiring live n8n) are NOT in task list — they are opt-in per `N8N_TEST_HOST`

---

## Audit Remediation

> Generated by `/speckit.audit` on 2026-04-18. Address before next `/speckit.implement` run.

- [x] T027 [AR] Fix phantom `discoverMcpTools()` in `src/execution/capabilities.ts:138-154` — actually probe MCP tool availability via callTool instead of unconditionally returning all tools (PH-001)
- [x] T028 [AR] Fix silent catch in `readCachedPinData` in `src/execution/pin-data.ts:131-138` — distinguish file-not-found (return undefined) from JSON parse errors (throw) (CV-001)
- [x] T029 [P] [AR] Remove `as any` type assertions in `src/execution/rest-client.ts:433` and `src/execution/mcp-client.ts:199` — align RawResultData interface with Zod schema output types (CV-002)
- [x] T030 [AR] Wire execution lock into `executeBounded()` in `src/execution/rest-client.ts:260` and `executeSmoke()` in `src/execution/mcp-client.ts:103` via `withExecutionLock()` (SD-001)
- [x] T031 [AR] Add tests for `pollForCompletion()` in `test/execution/poll.test.ts` — status loop, timeout behavior, phase transition from status-only to data retrieval (TQ-001)
- [x] T032 [AR] Add tests for `executeBounded()` in `test/execution/rest-client.test.ts` — request shaping, auth headers, error mapping for 404/401/network (TQ-002)
- [x] T033 [P] [AR] Add tests for `detectCapabilities()` in `test/execution/capabilities.test.ts` — unreachable, auth failure, workflow not found scenarios (TQ-003)
- [x] T034 [P] [AR] Add tests for `executeSmoke()`, `getExecution()`, `preparePinData()` in `test/execution/mcp-client.test.ts` (TQ-004)
- [x] T035 [AR] Remove 5 trivial constant-value assertions in `test/execution/poll.test.ts:48-68` (TQ-005)
- [x] T036 [AR] Use `isTerminalStatus()` from `types.ts` in `createMcpPollingStrategy` in `src/execution/mcp-client.ts:224` instead of hardcoded array (CQ-001)
- [x] T037 [AR] Fix silent return in `checkWorkflow` in `src/execution/capabilities.ts:170-173` — log or propagate network errors after reachability confirmed (SF-001)
- [x] T038 [AR] Run `npm run typecheck` and `npm test` — verify all remediation passes
