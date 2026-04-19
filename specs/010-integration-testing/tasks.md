# Tasks: Integration Testing Suite

**Input**: Design documents from `/specs/010-integration-testing/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not applicable — this feature IS the test suite.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Directory structure, dependency, and documentation setup

- [X] T001 Add `tsx` as dev dependency in package.json
- [X] T002 Create directory structure: test/integration/, test/integration/fixtures/, test/integration/scenarios/, test/integration/lib/
- [X] T003 Create test/integration/README.md with prerequisites, setup instructions, and usage examples per quickstart.md

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared test utilities and runner infrastructure that ALL scenarios depend on

**CRITICAL**: No scenario work can begin until this phase is complete

- [X] T004 Implement IntegrationContext type and `setup()` function in test/integration/lib/setup.ts — all 7 prereq checks (n8n reachable via GET /api/v1/workflows, n8nac available via `n8nac --version`, API key configured, n8nac pointed at correct host via `n8nac config`, Node.js 20+ via `node --version`, project built via dist/ existence, manifest exists), temp dir creation for trust/snapshot isolation, manifest loading, cleanup function
- [X] T005 [P] Implement `pushFixture()` in test/integration/lib/push.ts — n8nac push wrapper with OCC conflict retry via `--mode keep-current`, throw on non-OCC errors
- [X] T006 [P] Implement typed assertion helpers in test/integration/lib/assertions.ts — `assertStatus`, `assertFindingPresent`, `assertNoFindings`, `assertTrusted`, `assertUntrusted`, `assertGuardrailAction` per contracts/contracts.md
- [X] T007 [P] Implement `buildTestDeps()` helper in test/integration/lib/deps.ts — wraps `buildDeps()` from src/deps.ts, overrides `loadTrustState`/`persistTrustState`/`loadSnapshot`/`saveSnapshot` to bind `dataDir` to IntegrationContext's temp directories
- [X] T008 Implement test runner in test/integration/run.ts — scenario registry, `--scenario N` flag, `--check` flag, `--verbose` flag, sequential execution with setup/pushAll/run/cleanup lifecycle, pass/fail reporting per scenario with fixture name and diagnostic summary on failure

**Checkpoint**: Foundation ready — seed script and scenario implementation can begin

---

## Phase 3: User Story 2 - Seed and Manage Test Fixtures (Priority: P1) MVP

**Goal**: Create 7 test workflows on a live n8n instance and pull them as committed n8nac artifacts

**Independent Test**: Run seed script against live n8n, verify 7 `.ts` files and manifest.json produced

### Implementation for User Story 2

- [X] T009 [US2] Define WorkflowCreatePayload type and FIXTURES constant with all 7 fixture JSON definitions in test/integration/seed.ts — `happy-path` (Trigger→Set→NoOp), `broken-wiring` (Trigger→Set + orphaned HTTP), `data-loss-passthrough` (Trigger→HTTP→Set→Set with lost field ref), `expression-bug` (Trigger→Set with bad $json ref), `credential-failure` (Trigger→HTTP no creds→Set), `branching-coverage` (Trigger→If→True/False paths), `multi-node-change` (Trigger→A→B→C→D chain)
- [X] T010 [US2] Implement seed script lifecycle in test/integration/seed.ts — for each fixture: create via REST API (POST /api/v1/workflows) or update if exists (PUT), record workflow ID, pull via n8nac, copy to fixtures dir, write manifest.json. Support `--fixture <name>` for single fixture, `--dry-run` for preview. All workflow names prefixed `n8n-vet-test--`

**Checkpoint**: Seed script works — `npx tsx test/integration/seed.ts` creates fixtures on n8n and produces committed artifacts

---

## Phase 4: User Story 1 - Verify Full Pipeline Correctness (Priority: P1)

**Goal**: Core scenarios proving static analysis, execution, and full pipeline work end-to-end

**Independent Test**: Run scenarios 01, 02, 03, 08 against live n8n with seeded fixtures

### Implementation for User Story 1

- [X] T011 [P] [US1] Implement scenario 01 (static-only) in test/integration/scenarios/01-static-only.ts — validate broken-wiring.ts and data-loss-passthrough.ts with layer 'static', assert disconnected-node finding and data-loss-risk finding respectively, assert execution engine was not invoked
- [X] T012 [P] [US1] Implement scenario 02 (execution happy path) in test/integration/scenarios/02-execution-happy.ts — validate happy-path.ts with layer 'both', assert no static findings, execution success, diagnostic status 'pass', trust state updated for all nodes
- [X] T013 [P] [US1] Implement scenario 03 (execution failure classification) in test/integration/scenarios/03-execution-failure.ts — validate credential-failure.ts with layer 'execution', assert execution error, error classification 'credentials', error node identified, diagnostic status 'fail'
- [X] T014 [US1] Implement scenario 08 (full pipeline) in test/integration/scenarios/08-full-pipeline.ts — multi-step: validate expression-bug.ts static (find unresolvable ref), validate execution (confirm null output), fix expression in temp copy, validate both (pass), validate again unchanged (guardrail fires)

**Checkpoint**: Core pipeline scenarios pass — static analysis, execution, error classification, and full edit-validate-diagnose cycle verified

---

## Phase 5: User Story 3 - Trust Lifecycle Validation (Priority: P2)

**Goal**: Verify trust builds, persists, invalidates on change, and narrows validation scope

**Independent Test**: Run scenario 04 against live n8n with multi-node-change fixture

### Implementation for User Story 3

- [X] T015 [US3] Implement scenario 04 (trust lifecycle) in test/integration/scenarios/04-trust-lifecycle.ts — step 1: validate multi-node-change.ts static, assert all nodes trusted via buildTrustStatusReport; step 2: copy fixture to temp, edit node B parameters; step 3: assert node B untrusted, others trusted; step 4: validate again, assert only B and downstream validated (not A)

**Checkpoint**: Trust lifecycle verified — build, persist, invalidate, narrow scope all work end-to-end

---

## Phase 6: User Story 4 - Guardrail Behavior Validation (Priority: P2)

**Goal**: Verify guardrails detect and refuse low-value reruns

**Independent Test**: Run scenario 05 against live n8n with happy-path fixture

### Implementation for User Story 4

- [X] T016 [US4] Implement scenario 05 (guardrail rerun) in test/integration/scenarios/05-guardrail-rerun.ts — step 1: validate happy-path.ts static to build trust; step 2: validate again with no changes, assert guardrail refuse or redirect with explanation; step 3: call buildGuardrailExplanation, assert it reports what guardrail would do without modifying trust state

**Checkpoint**: Guardrail rerun refusal verified — identical rerun detected and explained

---

## Phase 7: User Story 5 - MCP Tool Round-Trip (Priority: P2)

**Goal**: Verify MCP server accepts tool calls and returns well-formed responses

**Independent Test**: Run scenario 07 which spawns MCP server and tests all 3 tools

### Implementation for User Story 5

- [X] T017 [US5] Implement MCP test client in test/integration/lib/mcp-client.ts — spawn `node dist/mcp/serve.js` as child process, connect via @modelcontextprotocol/sdk Client with StdioClientTransport, typed methods for validate/trustStatus/explain, close() to kill child process
- [X] T018 [US5] Implement scenario 07 (MCP tools) in test/integration/scenarios/07-mcp-tools.ts — for each tool (validate, trust_status, explain): send valid input, assert response shape `{ success: true, data }` with correct data type; send invalid input (nonexistent file), assert `{ success: false, error: { type: 'workflow_not_found' } }`

**Checkpoint**: MCP round-trip verified — all 3 tools accept calls and return well-formed JSON

---

## Phase 8: User Story 6 - Bounded Execution (Priority: P3)

**Goal**: Verify destinationNode slices execution to a subgraph

**Independent Test**: Run scenario 06 against live n8n with multi-node-change fixture

### Implementation for User Story 6

- [X] T019 [US6] Implement scenario 06 (bounded execution) in test/integration/scenarios/06-bounded-execution.ts — push multi-node-change.ts, validate with target nodes ['B'], destinationNode 'B', destinationMode 'inclusive', pin data for trigger; assert only trigger→A→B have execution results, C and D have no results

**Checkpoint**: Bounded execution verified — destinationNode correctly limits executed subgraph

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final documentation and validation

- [X] T020 [P] Verify all 8 scenarios registered in run.ts scenario registry and passing
- [X] T021 Validate quickstart.md instructions match actual usage — run through first-time setup flow, verify all commands work

---

## Audit Remediation

> Generated by `/speckit.audit` on 2026-04-19. All items fixed.

- [X] T022 [AR] Fix seed.ts:365 — abort on n8nac pull failure instead of logging and continuing (SF-001)
- [X] T023 [AR] Fix setup.ts:108 — return `null` instead of fake `'(configured-via-n8nac)'` sentinel for API key; update IntegrationContext.apiKey to `string | null` (CV-001)
- [X] T024 [AR] Fix run.ts:140 — always print error message on failure (not only in verbose); add optional fixture context param to assertion helpers (SD-001)
- [X] T025 [AR] Fix run.ts scenario loop — create isolated trust/snapshot dirs per scenario via `createScenarioContext()` to prevent cross-contamination (SD-002)
- [X] T026 [AR] Fix 07-mcp-tools.ts:59-85 — assert `error.type === 'workflow_not_found'` on all invalid-input tests (SD-003)
- [X] T027 [AR] Fix seed.ts — remove single-use `noOp()` and `ifNode()` helpers, inline as object literals (OE-001)
- [X] T028 [AR] Fix 04-trust-lifecycle.ts:55 — use specific regex matching `name:'step', value:'B'` instead of broad `value.*?B` (CQ-001)
- [X] T029 [AR] Fix 08-full-pipeline.ts:63 — add guard verifying string replacement occurred (CQ-002)
- [X] T030 [AR] Fix seed.ts:256 — paginate n8n workflow listing to prevent false duplicates on large instances (SD-004)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all scenarios
- **US2 Seed Script (Phase 3)**: Depends on Phase 2 (needs push utility) — BLOCKS scenarios that need fixtures
- **US1 Core Pipeline (Phase 4)**: Depends on Phase 3 (needs seeded fixtures)
- **US3 Trust (Phase 5)**: Depends on Phase 2 only (uses multi-node-change fixture)
- **US4 Guardrails (Phase 6)**: Depends on Phase 2 only (uses happy-path fixture)
- **US5 MCP (Phase 7)**: Depends on Phase 2 only (spawns MCP server independently)
- **US6 Bounded (Phase 8)**: Depends on Phase 2 only (uses multi-node-change fixture)
- **Polish (Phase 9)**: Depends on all scenarios complete

### User Story Dependencies

- **US2 (Seed Script)**: No dependency on other stories — produces fixtures for US1
- **US1 (Core Pipeline)**: Depends on US2 (needs fixtures and manifest)
- **US3 (Trust)**: Independent — can start after Foundational
- **US4 (Guardrails)**: Independent — can start after Foundational
- **US5 (MCP)**: Independent — can start after Foundational (needs mcp-client.ts built first within its phase)
- **US6 (Bounded)**: Independent — can start after Foundational

### Within Each User Story

- Shared utilities before scenario scripts
- Multi-step scenarios build their own state internally
- Each scenario independently verifiable

### Parallel Opportunities

- T005, T006, T007 can run in parallel (different lib/ files, no dependencies)
- T011, T012, T013 can run in parallel (different scenario files, no dependencies)
- US3, US4, US5, US6 can all run in parallel after Foundational phase (independent stories)

---

## Parallel Example: Foundational Phase

```
# Launch all shared utilities in parallel:
Task: "T005 Implement pushFixture() in test/integration/lib/push.ts"
Task: "T006 Implement typed assertion helpers in test/integration/lib/assertions.ts"
Task: "T007 Implement buildTestDeps() helper in test/integration/lib/deps.ts"

# Then sequentially:
Task: "T004 Implement setup() in test/integration/lib/setup.ts"
Task: "T008 Implement test runner in test/integration/run.ts"
```

## Parallel Example: Core Pipeline Scenarios

```
# Launch first three scenarios in parallel:
Task: "T011 Implement scenario 01 (static-only)"
Task: "T012 Implement scenario 02 (execution happy path)"
Task: "T013 Implement scenario 03 (execution failure classification)"

# Then the multi-step scenario:
Task: "T014 Implement scenario 08 (full pipeline)"
```

---

## Implementation Strategy

### MVP First (US2 + US1)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: US2 Seed Script
4. Complete Phase 4: US1 Core Pipeline Scenarios
5. **STOP and VALIDATE**: Run `npx tsx test/integration/run.ts` — scenarios 01, 02, 03, 08 pass

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US2 (Seed) → Fixtures committed → Foundation for all testing
3. US1 (Core Pipeline) → 4 scenarios passing → MVP!
4. US3 (Trust) → Scenario 04 passing → Trust lifecycle proven
5. US4 (Guardrails) → Scenario 05 passing → Guardrail behavior proven
6. US5 (MCP) → Scenario 07 passing → MCP round-trip proven
7. US6 (Bounded) → Scenario 06 passing → Bounded execution proven
8. Polish → All 8 scenarios passing, documentation validated

### Parallel Team Strategy

With multiple developers after Foundational:

- Developer A: US2 (Seed) → US1 (Core Pipeline)
- Developer B: US3 (Trust) + US4 (Guardrails)
- Developer C: US5 (MCP) + US6 (Bounded)

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- No test tasks generated — this feature IS the integration test suite
- Scenarios should be committed individually as each is completed
- The seed script (US2) must be run against a live n8n instance before US1 scenarios can pass
- All scenarios import from the built library (`dist/`), so `npm run build` must succeed first
