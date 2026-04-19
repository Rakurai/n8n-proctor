# Tasks: Request Interpretation

**Input**: Design documents from `/specs/007-request-interpretation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included — the PRD and acceptance criteria require integration tests wiring all subsystems with mocked interfaces.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Orchestrator types, schemas, and project structure

- [X] T001 Define ValidationRequest, InterpretedRequest, OrchestratorDeps, and snapshot types with Zod schemas in src/orchestrator/types.ts — include ValidationRequestSchema for edge validation, deriveWorkflowId helper, and all type exports. ValidationRequest fields: workflowPath (string), target (AgentTarget), layer (ValidationLayer), force (boolean), pinData (PinData | null), destinationNode (string | null), destinationMode ('inclusive' | 'exclusive'). OrchestratorDeps must include all subsystem function signatures from data-model.md (parseWorkflowFile, buildGraph, loadTrustState, persistTrustState, computeChangeSet, invalidateTrust, recordValidation, evaluate, traceExpressions, detectDataLoss, checkSchemas, validateNodeParams, executeBounded, executeSmoke, getExecutionData, constructPinData, synthesize, loadSnapshot, saveSnapshot, detectCapabilities). WorkflowSnapshot type for serialized graph storage.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core modules that ALL user stories depend on — snapshot persistence, target resolution, and path selection

**CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 [P] Implement snapshot persistence in src/orchestrator/snapshots.ts — loadSnapshot(workflowId) reads `.n8n-vet/snapshots/{workflowId}.json` and reconstructs a WorkflowGraph (nodes Map, forward/backward adjacency), returns null if file missing or unreadable. saveSnapshot(workflowId, graph) serializes the graph's nodes and adjacency (excluding raw AST) to the same path. Use deriveWorkflowId from types.ts for consistent path generation. Create `.n8n-vet/snapshots/` directory on first save.
- [X] T003 [P] Implement target resolution in src/orchestrator/resolve.ts — resolveTarget(target, graph, changeSet, trustState) function handling all three AgentTarget kinds. `nodes`: verify each name exists in graph.nodes, return error diagnostic data for missing nodes, return error for empty list; for valid nodes, build SliceDefinition by forward-propagating from named nodes through graph.forward to exits and backward-walking through graph.backward to entry points (triggers or trusted boundaries), populating nodes, seedNodes (the named nodes), entryPoints, and exitPoints. `changed`: implement RTS/TIA heuristic — start with trust-breaking changes (modified + added from changeSet), forward-propagate through graph.forward until trusted boundary or exit, backward-walk through graph.backward to nearest trigger or trusted boundary. Build SliceDefinition with nodes, seedNodes, entryPoints, exitPoints. `workflow`: return all nodes in graph. Also implement approximate change detection from trust state content hashes when changeSet is null but trust state exists.
- [X] T004 [P] Implement path selection in src/orchestrator/path.ts — selectPaths(slice, graph, changeSet, trustState) function. DFS-based path enumeration from slice.entryPoints to slice.exitPoints with visited-set cycle detection. Path enumeration cap: if >20 candidates, apply quick heuristic (fewest error outputs, then fewest total nodes) to keep top 20. 4-tier lexicographic ranking: (1) prefer all isError:false edges, (2) prefer output index 0 on branching nodes, (3) count of changed nodes covered (more is better), (4) count of untrusted boundaries crossed (more is better). Select highest-ranked path. Record selectionReason string for each path. Return PathDefinition[].

**Checkpoint**: Foundation ready — all building blocks for the pipeline exist

---

## Phase 3: User Story 1 — Agent validates changed nodes (Priority: P1) MVP

**Goal**: End-to-end pipeline for change-driven validation with static-only layer

**Independent Test**: Submit a ValidationRequest with `target: { kind: 'changed' }, layer: 'static'` against two workflow snapshots (before/after edit) and verify correct diagnostic summary

- [X] T005 [US1] Implement the 10-step orchestration pipeline in src/orchestrator/interpret.ts — interpret(request, deps) async function. Step 1: validate request via Zod schema, parse workflow via deps.parseWorkflowFile + deps.buildGraph. On parse error, return DiagnosticSummary with status:'error'. Step 2: derive workflowId, load trust via deps.loadTrustState. Step 3: load snapshot via deps.loadSnapshot, if available compute changeSet via deps.computeChangeSet + deps.invalidateTrust; if no snapshot but trust state has hashes, use approximate detection from resolve.ts. Step 4: resolve target via resolveTarget(). On missing nodes, return status:'error'. Step 5: build EvaluationInput by computing currentHashes from graph node content hashes, running deps.traceExpressions for expressionRefs, setting priorSummary to null (cached summary support deferred), deriving fixtureHash from request.pinData via hashing, and setting llmValidationRequested to false; call deps.evaluate. Route on guardrail action — refuse: skip to synthesis with status:'skipped'; narrow: replace target, re-run selectPaths; redirect: change effectiveLayer; warn/proceed: continue. Step 6a: if layer is 'static' or 'both', run all 4 static checks (traceExpressions, detectDataLoss, checkSchemas, validateNodeParams), collect StaticFinding[]. Step 7: call deps.synthesize with all evidence. Step 8: if status is 'pass', call deps.recordValidation for validated nodes, deps.persistTrustState. Step 9: if status is 'pass', call deps.saveSnapshot. Step 10: return DiagnosticSummary.
- [X] T006 [US1] Write unit tests for target resolution in test/orchestrator/resolve.test.ts — test resolveTarget for `changed` kind: single modified node with downstream propagation, multiple modified nodes, backward walk to trigger, no previous snapshot (null changeSet), empty change set. Test approximate detection path. Use fixture WorkflowGraphs with known topology (linear chain, branching).
- [X] T007 [US1] Write integration test for changed-target static-only pipeline in test/orchestrator/interpret.test.ts — mock all OrchestratorDeps subsystems. Provide two graph snapshots differing by one node. Call interpret with target:{kind:'changed'}, layer:'static'. Verify: changeSet computed correctly, target resolved to affected slice, guardrails consulted, static analysis called with correct nodes, synthesize called, trust updated on pass, snapshot saved. Include a timing assertion: end-to-end pipeline for a 50-node workflow fixture completes within 5 seconds (SC-001).

**Checkpoint**: Change-driven static validation works end-to-end. This is the MVP.

---

## Phase 4: User Story 2 — Agent validates specific named nodes (Priority: P1)

**Goal**: Named-node target resolution with existence verification and error diagnostics

**Independent Test**: Submit `target: { kind: 'nodes', nodes: ['B','C'] }` and verify slice computation. Submit with missing node names and verify status:'error'.

- [X] T008 [US2] Write unit tests for nodes-kind resolution in test/orchestrator/resolve.test.ts — test resolveTarget for `nodes` kind: valid node names produce correct slice with upstream/downstream context, missing node returns error data, empty node list returns error data. Use fixture graph with 4+ nodes.
- [X] T009 [US2] Write integration test for nodes-target pipeline in test/orchestrator/interpret.test.ts — mock deps. Call interpret with target:{kind:'nodes', nodes:['B','C']}, layer:'static'. Verify slice scoped to B, C and their context. Test error case: request with nonexistent node returns DiagnosticSummary with status:'error'. Test error case: empty nodes list returns status:'error'.

**Checkpoint**: Both P1 stories (changed + nodes) work independently

---

## Phase 5: User Story 3 — Agent validates entire workflow (Priority: P2)

**Goal**: Workflow-scoped target with guardrail narrowing interaction

**Independent Test**: Submit `target: { kind: 'workflow' }` and verify guardrails narrow or warn about breadth

- [X] T010 [US3] Write unit test for workflow-kind resolution in test/orchestrator/resolve.test.ts — test resolveTarget for `workflow` kind: returns all graph nodes, entry/exit points are triggers and terminal nodes.
- [X] T011 [US3] Write integration test for workflow-target pipeline in test/orchestrator/interpret.test.ts — mock deps with guardrails returning 'narrow' (20-node workflow, 3 changed). Verify target replaced with narrowed slice, paths re-selected on narrowed scope, summary includes narrowing action. Test with force:true overriding narrowing.

**Checkpoint**: All three target kinds work

---

## Phase 6: User Story 4 — Guardrail routing shapes validation (Priority: P2)

**Goal**: Each guardrail action (refuse, narrow, redirect, warn, proceed) correctly alters pipeline behavior

**Independent Test**: Simulate each guardrail action and verify orchestrator routing

- [X] T012 [US4] Write integration tests for all 5 guardrail action routings in test/orchestrator/interpret.test.ts — five test cases with mocked evaluate() returning each action. Refuse: verify synthesis called with status:'skipped', no static/execution runs. Narrow: verify target replaced, paths re-selected. Redirect: verify effectiveLayer changed to 'static', no execution. Warn: verify warning included in summary, validation proceeds normally. Proceed: verify no changes to target or layer. Test force flag: when evaluate returns overridable refusal and force is true, verify validation proceeds.
- [X] T013 [US4] Add execution integration to the pipeline in src/orchestrator/interpret.ts — Step 6b: if effectiveLayer is 'execution' or 'both' and not redirected to 'static': call deps.detectCapabilities, call deps.constructPinData for trusted boundaries, select execution strategy (destinationNode set → executeBounded, workflow target → executeSmoke, slice → compute furthest downstream node as destination → executeBounded), call execution function, retrieve results via deps.getExecutionData, extract ExecutionData. When layer is 'both', static runs first; static errors do not prevent execution. Pass executionData to synthesize.
- [X] T014 [US4] Write integration test for execution-backed validation in test/orchestrator/interpret.test.ts — mock deps including executeBounded/executeSmoke/getExecutionData. Test layer:'both' (static + execution). Test layer:'execution' (execution only, no static). Test redirect from 'both' to 'static' (no execution). Test destinationNode set (bounded REST) with both inclusive mode (destination node executes) and exclusive mode (stops before destination). Test slice target (computed destination). Test execution failure returns status:'error'.

**Checkpoint**: Full guardrail routing + execution integration complete

---

## Phase 7: User Story 5 — Trust state persists across validations (Priority: P2)

**Goal**: Trust updates on pass, snapshot persistence, trust reuse on subsequent validation

**Independent Test**: Run two sequential validations — first passes, second reuses trust for unchanged nodes

- [X] T015 [US5] Write integration test for trust persistence across runs in test/orchestrator/interpret.test.ts — run interpret() with mocked deps, first call returns pass → verify deps.recordValidation called for validated nodes (not mocked, not skipped), deps.persistTrustState called, deps.saveSnapshot called. Second call with one node changed → verify changeSet computed from saved snapshot, unchanged nodes retain trust, validation focuses on changed slice. Test failure case: status:'fail' → verify recordValidation NOT called, persistTrustState NOT called, saveSnapshot NOT called. Test skipped case: guardrail refusal → verify no trust/snapshot updates.
- [X] T016 [P] [US5] Write snapshot round-trip tests in test/orchestrator/snapshots.test.ts — test saveSnapshot writes valid JSON, loadSnapshot reconstructs equivalent WorkflowGraph (nodes Map, forward/backward adjacency). Test loadSnapshot returns null for missing file. Test loadSnapshot returns null for corrupt JSON. Test deriveWorkflowId produces consistent results for same absolute path.

**Checkpoint**: Trust persists correctly across validation runs

---

## Phase 8: User Story 6 — Multi-path validation (Priority: P3)

**Goal**: Additional-greedy path selection covers distinct paths through branching workflows

**Independent Test**: Provide branching workflow fixture, verify multiple paths selected covering different changed nodes

- [X] T017 [US6] Add additional-greedy multi-path selection to src/orchestrator/path.ts — after selecting first path, update covered elements (changed nodes, untrusted boundaries). Re-rank remaining candidates by newly covered elements. Select next path if it covers at least 1 new changed node OR 1 new untrusted boundary. Repeat until no remaining path adds new coverage.
- [X] T018 [US6] Add sequential multi-path validation to src/orchestrator/interpret.ts — when selectPaths returns multiple paths, validate each sequentially with independent static analysis and execution passes. Aggregate StaticFinding[] and ExecutionData across paths for synthesis.
- [X] T019 [US6] Write unit tests for multi-path selection in test/orchestrator/path.test.ts — test with branching fixture: path A covers changed {X,Y}, path B covers {Y,Z} → both selected. Path C adds no new coverage → not selected. Test path enumeration cap: >20 candidates → quick heuristic pre-filters to 20.
- [X] T020 [US6] Write integration test for multi-path validation in test/orchestrator/interpret.test.ts — mock deps, provide branching workflow with two paths covering different changed nodes. Verify both paths validated sequentially, static analysis called twice (once per path), results aggregated in final summary.

**Checkpoint**: Multi-path validation covers branching workflows

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Package exports, error condition coverage, documentation

- [X] T021 Export interpret function and orchestrator types from src/index.ts — add interpret, ValidationRequest, InterpretedRequest, OrchestratorDeps to package entry point. Follow existing export pattern (runtime exports, then type re-exports).
- [X] T022 Write error condition tests in test/orchestrator/interpret.test.ts — test all error conditions from spec edge cases: workflow file not found (deps.parseWorkflowFile throws → status:'error'), parse failure (malformed file → status:'error'), execution fails to start (deps.executeBounded throws → status:'error'), static analysis internal error (deps.traceExpressions throws → error propagates, not caught).
- [X] T023 Write unit tests for path selection ranking in test/orchestrator/path.test.ts — test 4-tier lexicographic ordering: tier 1 (non-error output preferred), tier 2 (output index 0 preferred), tier 3 (more changed nodes preferred), tier 4 (more untrusted boundaries preferred). Test determinism: same inputs → same outputs. Test single-node slice (trivial path).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (types) — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — implements the core pipeline
- **US2 (Phase 4)**: Depends on Phase 3 (pipeline exists) — adds nodes-kind tests
- **US3 (Phase 5)**: Depends on Phase 3 (pipeline exists)
- **US4 (Phase 6)**: Depends on Phase 3 (pipeline exists) — adds execution integration
- **US5 (Phase 7)**: Depends on Phase 3 (pipeline exists)
- **US6 (Phase 8)**: Depends on Phase 2 (path.ts) and Phase 3 (pipeline exists) — extends multi-path
- **Polish (Phase 9)**: Depends on Phases 3-8

### User Story Dependencies

- **US1 (P1)**: FIRST — implements the pipeline itself. All other stories extend it.
- **US2 (P1)**: After US1 — pipeline exists, adds nodes-target tests
- **US3 (P2)**: After US1 — adds workflow-target + narrowing tests
- **US4 (P2)**: After US1 — adds execution integration + guardrail routing tests
- **US5 (P2)**: After US1 — adds trust persistence tests
- **US6 (P3)**: After US1 — extends path selection + pipeline for multi-path

### Within Each User Story

- Implementation tasks before their integration tests (where they share a phase)
- Unit tests can parallel with integration tests when testing different files

### Parallel Opportunities

- T002, T003, T004 can all run in parallel (Phase 2 — different files)
- T008-T009 (US2) can run in parallel with T010-T011 (US3) after pipeline exists
- T015 and T016 can run in parallel (US5 — different test files)
- T019 and T020 can run in parallel (US6 — different test files)

---

## Parallel Example: Phase 2 (Foundational)

```
# All three foundational modules target different files:
Task T002: "Implement snapshot persistence in src/orchestrator/snapshots.ts"
Task T003: "Implement target resolution in src/orchestrator/resolve.ts"
Task T004: "Implement path selection in src/orchestrator/path.ts"
```

## Parallel Example: US5

```
# Integration test and unit test target different files:
Task T015: "Integration test for trust persistence in test/orchestrator/interpret.test.ts"
Task T016: "Snapshot round-trip tests in test/orchestrator/snapshots.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (types)
2. Complete Phase 2: Foundational (snapshots, resolve, path)
3. Complete Phase 3: US1 (pipeline + changed-target tests)
4. **STOP and VALIDATE**: Run interpret() with a mocked changed-target request
5. The core validation loop works end-to-end

### Incremental Delivery

1. Setup + Foundational → Building blocks ready
2. Add US1 → Core pipeline works (MVP!)
3. Add US2 → Named-node validation works
4. Add US3+US4 → Guardrail routing + execution integration
5. Add US5 → Trust persists across runs
6. Add US6 → Multi-path covers branching workflows
7. Polish → Exports, error coverage, ranking tests

### Sequential Focus (Recommended)

This subsystem is a single pipeline — user stories extend the same files. Sequential execution (P1 → P2 → P3 → polish) is the natural order. Parallel opportunities exist within phases but not across user stories.

---

## Notes

- All tests mock OrchestratorDeps — no n8n instance needed for any test
- Fixture workflows from existing test/fixtures/ can be reused
- The orchestrator is ~5 source files + ~4 test files
- Each user story adds tests to existing test files (interpret.test.ts, resolve.test.ts, path.test.ts) rather than creating new ones
