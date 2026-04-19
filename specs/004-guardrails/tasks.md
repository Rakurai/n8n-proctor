# Tasks: Guardrail Evaluation Subsystem

**Input**: Design documents from `/specs/004-guardrails/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Included per CODING.md mandate (happy-path + public error-path tests mandatory).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup

**Purpose**: Internal types, threshold constants, and shared infrastructure

- [x] T001 Define internal types (EvaluationInput, PriorRunContext, EscalationAssessment) and threshold constants (NARROW_MIN_TARGET_NODES=5, NARROW_MAX_CHANGED_RATIO=0.2, BROAD_TARGET_WARN_RATIO=0.7) in src/guardrails/types.ts. EvaluationInput must include llmValidationRequested: boolean field (signals whether the agent explicitly requested LLM/agent output validation — set by the orchestrator, consumed by redirect escalation trigger evaluation).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Evidence assembly and test fixtures that ALL user stories depend on

- [x] T002 [P] Implement assembleEvidence function that populates GuardrailEvidence (changedNodes, trustedNodes, lastValidatedAt, fixtureChanged) from EvaluationInput in src/guardrails/evidence.ts. Use isTrusted() from src/trust/trust.ts and computeContentHash() from src/trust/hash.ts for trust checks. Evidence must never have null/undefined fields.
- [x] T003 [P] Create shared test fixtures in test/guardrails/fixtures.ts — helper functions to build WorkflowGraph (linear 5-node, branching 10-node, large 15-node), TrustState (empty, partial, full), NodeChangeSet (no changes, narrow changes, broad changes), currentHashes maps, and DiagnosticSummary (null, passed, failed with path). Reuse existing workflow fixtures from test/fixtures/workflows/ where possible.

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 - Evaluate a Validation Request (Priority: P1) MVP

**Goal**: Core evaluation pipeline that accepts EvaluationInput and returns GuardrailDecision. Implements force bypass, empty-target refusal, and proceed-with-evidence default. This is the pipeline skeleton that all other stories extend.

**Independent Test**: Pass an EvaluationInput with no special conditions and verify proceed is returned with full evidence. Pass force=true and verify bypass. Pass empty target and verify refusal.

- [x] T004 [US1] Implement evaluate(input: EvaluationInput): GuardrailDecision in src/guardrails/evaluate.ts. Pipeline skeleton: (1) force=true → return proceed with bypass note in explanation, (2) empty targetNodes → return refuse with overridable=false, (3) fall through to proceed with full evidence. Call assembleEvidence() for every decision. Import types from src/guardrails/types.ts and evidence from src/guardrails/evidence.ts.
- [x] T005 [US1] Pipeline tests in test/guardrails/evaluate.test.ts: (a) force=true returns proceed with evidence populated and explanation mentioning force, (b) empty target returns refuse with overridable=false, (c) normal request with no special conditions returns proceed with fully populated evidence (changedNodes, trustedNodes, lastValidatedAt, fixtureChanged all present). Use fixtures from test/guardrails/fixtures.ts.

**Checkpoint**: Core pipeline functional — evaluate() accepts input and returns decisions with evidence

---

## Phase 4: User Story 2 - Narrow Broad Scope to Changed Slice (Priority: P1)

**Goal**: When a broad target has narrow changes (<20% changed, >5 nodes), compute a narrowed target via BFS forward/backward from changed nodes and return a narrow decision.

**Independent Test**: Provide a 15-node graph with 2 changed nodes and verify the narrowed target contains only the changed nodes + their downstream dependents + backward context, intersected with original target.

- [x] T006 [US2] Implement computeNarrowedTarget(input: EvaluationInput): ValidationTarget | null in src/guardrails/narrow.ts. Algorithm: (1) seed = changed nodes with trust-breaking changes within targetNodes, (2) BFS forward through graph.forward from seed, stopping at nodes outside targetNodes or trusted-unchanged nodes (isTrusted + contentHash match), (3) BFS backward through graph.backward from seed, stopping at trigger nodes (no incoming edges), nodes outside targetNodes, or trusted-unchanged nodes, (4) result = union of seed+forward+backward intersected with targetNodes, (5) return null if result.size >= targetNodes.size (no reduction). Return as ValidationTarget with kind='slice' and a SliceDefinition. Use NARROW_MIN_TARGET_NODES and NARROW_MAX_CHANGED_RATIO from types.ts for the precondition check (targetNodes.size > threshold and changedRatio < threshold).
- [x] T007 [US2] Integrate narrowing into evaluate pipeline in src/guardrails/evaluate.ts: after precondition checks, call computeNarrowedTarget() — if non-null, return narrow decision with narrowedTarget, explanation identifying the reduced scope, and evidence.
- [x] T008 [US2] Narrowing tests in test/guardrails/narrow.test.ts: (a) 15-node graph with 2 changed nodes narrows correctly (result is subset of original, contains seed+dependents), (b) 5-node graph with 1 changed node does NOT narrow (threshold: must be MORE than 5), (c) graph where propagation reaches all target nodes returns null (no size reduction), (d) narrowed target never includes nodes outside the original target, (e) narrowed target is always non-empty when changes exist. Add pipeline test in test/guardrails/evaluate.test.ts for narrow scenario.

**Checkpoint**: Narrowing functional — broad requests are automatically scoped down

---

## Phase 5: User Story 3 - Redirect Execution to Static Analysis (Priority: P1)

**Goal**: When execution is requested but all changes are structurally analyzable (no opaque, no shape-replacing with downstream $json dependence, no sub-workflow calls, no LLM validation, no path ambiguity), redirect to static-only.

**Independent Test**: Provide a change set with only shape-preserving node changes and verify redirect to static. Add one shape-opaque node and verify redirect is blocked.

- [x] T009 [US3] Implement assessEscalationTriggers(input: EvaluationInput): EscalationAssessment in src/guardrails/redirect.ts. Check each changed node against 6 escalation triggers: (1) classification === 'shape-opaque' → trigger, (2) classification === 'shape-replacing' AND any downstream node has $json expression reference flowing through it (check expressionRefs where referencedNode is null and the node is downstream of the shape-replacing node via graph.forward BFS) → trigger, (3) type === 'n8n-nodes-base.executeWorkflow' → trigger, (4) input.llmValidationRequested === true → trigger, (5) branching node (type n8n-nodes-base.if or n8n-nodes-base.switch) whose condition parameters reference data from an opaque/shape-replacing source (trace expressionRefs on the branching node, walk backward to check source classifications) → trigger, (6) any modified node has a ChangeKind not in the structurally analyzable set ('parameter', 'expression', 'connection', 'type-version', 'credential') → trigger (e.g. 'execution-setting' requires runtime verification). Also check if layer is 'static' (skip redirect check entirely). Return EscalationAssessment with triggered flag and reasons array.
- [x] T010 [US3] Integrate redirect into evaluate pipeline in src/guardrails/evaluate.ts: after precondition checks and before narrowing, when layer is 'execution' or 'both', call assessEscalationTriggers() — if not triggered, return redirect decision with redirectedLayer='static', explanation, and evidence.
- [x] T011 [US3] Escalation trigger tests in test/guardrails/redirect.test.ts: (a) all shape-preserving changes → not triggered, (b) one shape-opaque change → triggered, (c) shape-replacing with downstream $json reference → triggered, (d) shape-replacing WITHOUT downstream $json reference → not triggered, (e) sub-workflow call node changed → triggered, (f) llmValidationRequested=true → triggered, (g) branching node with runtime-dependent condition → triggered, (h) modified node with 'execution-setting' change kind → triggered, (i) static-only layer request → redirect check skipped. Add pipeline test in test/guardrails/evaluate.test.ts for redirect scenario.

**Checkpoint**: Redirect functional — unnecessary execution is avoided

---

## Phase 6: User Story 5 - Refuse Identical Reruns (Priority: P2)

**Goal**: When all target nodes are trusted, no trust-breaking changes exist, and fixture hashes match, refuse the request with overridable=true.

**Independent Test**: Construct fully-trusted target with matching fixtures and verify refuse. Change one fixture hash and verify no refusal.

- [x] T012 [US5] Add identical-rerun precondition check to evaluate pipeline in src/guardrails/evaluate.ts: after empty-target check (step 3 in pipeline), use getRerunAssessment() from src/trust/trust.ts to check if all target nodes are trusted with matching content and fixture hashes. If isLowValue is true, return refuse with overridable=true and explanation stating rerun would produce no new information.
- [x] T013 [US5] Pipeline tests in test/guardrails/evaluate.test.ts: (a) all trusted + no changes + matching fixture hash → refuse with overridable=true, (b) all trusted but one trust-breaking change → no refusal (proceeds to later checks), (c) all trusted + unchanged but fixture hash differs → no refusal.

**Checkpoint**: Identical reruns refused — completely redundant validation is blocked

---

## Phase 7: User Story 4 - Suppress Low-Value Reruns (Priority: P2)

**Goal**: When a prior run failed and the failing path does not intersect current changes (and failure is not external-service/platform), warn the agent that the rerun may be unrelated.

**Independent Test**: Provide a prior failed summary with a reconstructable path that doesn't intersect changes and verify warn. Provide intersecting changes and verify no warn.

- [x] T014 [US4] Implement extractPriorRunContext(summary: DiagnosticSummary | null): PriorRunContext | null in src/guardrails/rerun.ts. Extract: failed = status === 'fail', failingPath = executedPath mapped to NodeIdentity[] or null, failureClassification = errors[0]?.classification or null. Return null if summary is null. Also implement checkDeFlaker(context: PriorRunContext, changedNodes: Set<NodeIdentity>): boolean that returns true (should warn) when: context.failed, context.failingPath is non-null, no intersection between failingPath and changedNodes, and context.failureClassification is not 'external-service' or 'platform'.
- [x] T015 [US4] Integrate DeFlaker warn into evaluate pipeline in src/guardrails/evaluate.ts: after narrow check (step 6 in pipeline), call extractPriorRunContext() then checkDeFlaker() — if warn is indicated, return warn decision with explanation about prior failure path not intersecting current changes.
- [x] T016 [US4] Pipeline tests in test/guardrails/evaluate.test.ts: (a) prior run failed with reconstructable path not intersecting changes → warn, (b) prior run failed but path is null → no warn (DeFlaker skipped), (c) prior run failed with path intersecting changes → no warn, (d) prior run failed with external-service classification → no warn, (e) no prior summary (null) → no warn.

**Checkpoint**: DeFlaker warns active — unrelated reruns flagged

---

## Phase 8: User Story 6 - Warn on Broad Target (Priority: P3)

**Goal**: When the target covers more than 70% of the workflow's total nodes, warn the agent to consider narrowing.

**Independent Test**: Provide a 10-node workflow with 8-node target and verify warn. Provide 6-node target and verify no warn.

- [x] T017 [US6] Integrate broad-target warn directly into evaluate pipeline in src/guardrails/evaluate.ts: after DeFlaker check (step 7 in pipeline), inline the threshold check (targetNodes.size / graph.nodes.size > BROAD_TARGET_WARN_RATIO from types.ts) — if triggered, return warn decision with explanation suggesting the agent narrow to the changed region. No separate function needed — the check is a single comparison.
- [x] T018 [US6] Pipeline tests in test/guardrails/evaluate.test.ts: (a) 10-node workflow with 8-node target (80%) → warn, (b) 10-node workflow with 6-node target (60%) → no warn (below 70% threshold), (c) target covers exactly 70% → no warn (threshold is strictly greater than).

**Checkpoint**: All guardrail checks implemented — full pipeline operational

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Full pipeline verification and cleanup

- [x] T019 Full pipeline integration test in test/guardrails/evaluate.test.ts exercising all 8 evaluation steps in deterministic order with a single workflow fixture: force bypass → empty target → identical rerun → redirect → narrow → DeFlaker warn → broad-target warn → proceed. Each step must exercise a distinct behavior not covered by the story-level tests.
- [x] T020 Verify typecheck (npm run typecheck) and lint (npm run lint) pass with zero errors across all new files in src/guardrails/ and test/guardrails/

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (types.ts) — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — establishes pipeline skeleton
- **US2 (Phase 4)**: Depends on US1 (pipeline exists to integrate into)
- **US3 (Phase 5)**: Depends on US1 (pipeline exists to integrate into)
- **US5 (Phase 6)**: Depends on US1 (pipeline exists to integrate into)
- **US4 (Phase 7)**: Depends on US1 (pipeline exists to integrate into)
- **US6 (Phase 8)**: Depends on US1 (pipeline exists to integrate into)
- **Polish (Phase 9)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Depends on Foundational only — no other story dependencies
- **US2 (P1)**: Depends on US1 (pipeline skeleton). Independent of US3-US6.
- **US3 (P1)**: Depends on US1 (pipeline skeleton). Independent of US2, US4-US6.
- **US5 (P2)**: Depends on US1 (pipeline skeleton). Independent of US2-US4, US6.
- **US4 (P2)**: Depends on US1 (pipeline skeleton). Independent of US2-US3, US5-US6.
- **US6 (P3)**: Depends on US1 (pipeline skeleton). Independent of US2-US5.

**Key insight**: After US1, all remaining stories (US2-US6) are independent at the module level — each writes to its own source file (narrow.ts, redirect.ts, rerun.ts). However, all stories must integrate into evaluate.ts and add tests to evaluate.test.ts, so those integration steps must be merged sequentially. Module implementation parallelizes; pipeline integration is sequential.

### Within Each User Story

- Implementation before pipeline integration
- Pipeline integration before tests (tests verify the integrated behavior)

### Parallel Opportunities

- T002 and T003 (evidence + fixtures) can run in parallel
- After US1 completes, module implementation for US2-US6 can run in parallel (narrow.ts, redirect.ts, rerun.ts are independent files)
- Pipeline integration steps (T007, T010, T012, T015, T017) and test additions to evaluate.test.ts must be merged sequentially since they all modify the same files

---

## Parallel Example: After US1 Completion

```
# Module implementation can parallelize (independent files):
Agent A: T006 — narrow.ts (narrowing algorithm)
Agent B: T009 — redirect.ts (escalation triggers)
Agent C: T014 — rerun.ts (DeFlaker + broad-target logic)

# Pipeline integration must be sequential (all modify evaluate.ts):
Then: T007 (narrow integration) → T010 (redirect integration) → T012 (identical rerun)
      → T015 (DeFlaker integration) → T017 (broad-target integration)

# Tests can follow each integration step:
After T007: T008 (narrow tests)
After T010: T011 (redirect tests)
After T012: T013 (identical rerun tests)
After T015: T016 (DeFlaker tests)
After T017: T018 (broad-target tests)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (types.ts)
2. Complete Phase 2: Foundational (evidence.ts, fixtures.ts)
3. Complete Phase 3: US1 (evaluate pipeline skeleton)
4. **STOP and VALIDATE**: evaluate() accepts input and returns proceed/refuse with evidence
5. The pipeline is extensible — remaining stories add checks to the existing pipeline

### Incremental Delivery

1. Setup + Foundational → types and evidence ready
2. US1 → Core pipeline operational (MVP)
3. US2 + US3 (P1 stories, in parallel) → narrowing + redirect active
4. US5 + US4 (P2 stories, in parallel) → identical rerun refusal + DeFlaker warn
5. US6 (P3) → broad target warn
6. Polish → full integration test, typecheck, lint

### Notes

- All evaluation is synchronous and pure — no async, no side effects
- Every decision includes fully populated GuardrailEvidence
- Threshold constants are named in types.ts, not magic numbers
- Tests are pipeline scenarios, not isolated per-rule unit tests (except for narrow.test.ts and redirect.test.ts which test algorithm correctness independently)
- Existing upstream APIs: isTrusted(), getRerunAssessment(), computeContentHash(), traceExpressions() — do not reimplement
