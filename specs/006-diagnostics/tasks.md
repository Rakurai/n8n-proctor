# Tasks: Diagnostic Synthesis

**Input**: Design documents from `/specs/006-diagnostics/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Tests are included per the spec's acceptance criteria and SC-006. All tests use fixture data.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Internal types and test fixtures shared across all user stories

- [x] T001 Define internal diagnostics types (SynthesisInput, ClassifiedError, ExecutionData, NodeExecutionResult, ExecutionErrorData, NodeExecutionHint, StaticKindClassificationMap) in src/diagnostics/types.ts
- [x] T002 [P] Create static finding fixtures (pass, fail, warning, opaque-boundary warning, mixed) in test/fixtures/diagnostics/static-findings.ts
- [x] T003 [P] Create execution data fixtures (success run, single error, multi-node path, redacted node, cancelled) in test/fixtures/diagnostics/execution-data.ts
- [x] T004 [P] Create trust state fixtures (empty, partial trust, full trust) in test/fixtures/diagnostics/trust-state.ts
- [x] T005 [P] Create guardrail decision fixtures (proceed, warn, narrow, redirect, refuse) in test/fixtures/diagnostics/guardrail-decisions.ts
- [x] T006 [P] Create resolved target and capabilities fixtures in test/fixtures/diagnostics/targets.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Error classification and status determination — required by all user stories

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T007 Implement static finding classification map and classifyStaticFindings function in src/diagnostics/errors.ts — map 6 error-eligible kinds to ErrorClassification, raise on opaque-boundary with error severity, route warnings to null (filtered out by caller)
- [x] T008 Implement execution error classification (two-tier: constructor name then contextKind fallback) in src/diagnostics/errors.ts — classifyExecutionErrors function with full n8n error hierarchy and contextKind discriminant logic
- [x] T009 Implement error ordering function (orderErrors) in src/diagnostics/errors.ts — sort by source (execution first), severity (error first), executionIndex (ascending)
- [x] T010 Implement status determination function in src/diagnostics/status.ts — evaluate conditions in priority order: refuse → pass → fail → error
- [x] T011 Write tests for static finding classification in test/diagnostics/errors.test.ts — test each kind mapping, warning filtering, opaque-boundary error rejection
- [x] T012 Write tests for execution error classification in test/diagnostics/errors.test.ts — test constructor name path, contextKind fallback path, httpCode logic for api context, missing httpCode → external-service
- [x] T013 Write tests for error ordering in test/diagnostics/errors.test.ts — test execution-before-static, severity ordering, executionIndex ordering
- [x] T014 [P] Write tests for status determination in test/diagnostics/status.test.ts — test refuse→skipped, no-errors→pass, errors→fail, infrastructure→error

**Checkpoint**: Error classification and status determination are verified and ready for integration

---

## Phase 3: User Story 1 - Static-Only Validation Summary (Priority: P1) MVP

**Goal**: Produce a correct DiagnosticSummary from static findings alone — the most common validation path

**Independent Test**: Provide fixture static findings + trust state → verify summary has correct status, errors, annotations, hints, and structure

### Implementation for User Story 1

- [x] T015 [US1] Implement hint collection from static warnings in src/diagnostics/hints.ts — convert warning-severity findings to DiagnosticHint with severity 'warning', add static-only run hint when executionData is null
- [x] T016 [US1] Implement node annotation assignment in src/diagnostics/annotations.ts — assign validated/trusted/mocked/skipped per priority order using trust state and resolved target
- [x] T017 [US1] Implement synthesize function for static-only path in src/diagnostics/synthesize.ts — assemble DiagnosticSummary with schemaVersion 1, evidenceBasis 'static', null executedPath, capabilities, and meta
- [x] T018 [US1] Write tests for hint collection from static warnings in test/diagnostics/hints.test.ts — test warning→hint conversion, static-only hint present when executionData is null, empty findings produces no warning hints
- [x] T019 [P] [US1] Write tests for node annotation assignment in test/diagnostics/annotations.test.ts — test validated (changed node), trusted (unchanged with record), skipped (out of scope), priority ordering
- [x] T020 [US1] Write tests for static-only synthesis in test/diagnostics/synthesize.test.ts — test pass (no errors), fail (one error), warnings as hints, schemaVersion, evidenceBasis, complete structure

**Checkpoint**: Static-only validation produces correct DiagnosticSummary — MVP complete

---

## Phase 4: User Story 2 - Execution-Backed Validation Summary (Priority: P1)

**Goal**: Extend synthesis to handle execution data — classify execution errors, reconstruct executed path, combine both evidence layers

**Independent Test**: Provide fixture execution data + static findings → verify execution errors classified correctly, path reconstructed, errors ordered (execution first), evidenceBasis 'both'

### Implementation for User Story 2

- [x] T021 [US2] Implement path reconstruction in src/diagnostics/path.ts — sort nodeResults by executionIndex, emit PathNode[] with sourceOutput, raise on missing structural data, return null when executionData is null
- [x] T022 [US2] Implement hint collection from execution runtime hints in src/diagnostics/hints.ts — collect NodeExecutionHint entries as DiagnosticHint with severity 'info', no deduplication
- [x] T023 [US2] Extend synthesize function for execution-backed path in src/diagnostics/synthesize.ts — integrate path reconstruction, execution error classification, evidenceBasis 'both'/'execution', populate executedPath
- [x] T024 [US2] Write tests for path reconstruction in test/diagnostics/path.test.ts — test sorting by executionIndex, sourceOutput extraction, null for no execution data, error on missing structural data
- [x] T025 [P] [US2] Write tests for execution hint collection in test/diagnostics/hints.test.ts — test runtime hints converted to info-severity hints
- [x] T026 [US2] Write tests for execution-backed synthesis in test/diagnostics/synthesize.test.ts — test combined errors ordering, executedPath populated, evidenceBasis 'both', same-node cross-layer findings both appear

**Checkpoint**: Execution-backed validation produces correct DiagnosticSummary with path and classified errors

---

## Phase 5: User Story 3 - Node Annotation Assignment (Priority: P2)

**Goal**: Ensure annotations correctly distinguish validated, trusted, mocked, and skipped nodes with informative reason strings

**Independent Test**: Provide various node states (changed, trusted, mocked with pin data, out of scope) → verify each gets the correct annotation status and reason

### Implementation for User Story 3

- [x] T027 [US3] Extend annotation logic for mocked nodes in src/diagnostics/annotations.ts — detect pin data source from execution data, assign 'mocked' with source-specific reason string (agent/execution-history/schema/stub)
- [x] T028 [US3] Add reason string templates for all annotation statuses in src/diagnostics/annotations.ts — "Changed since last validation", "Unchanged since validation at [timestamp]", "Pin data provided from [source]", "Outside validation scope"
- [x] T029 [US3] Write tests for mocked node annotations in test/diagnostics/annotations.test.ts — test pin data detection, source-specific reason strings, priority over trusted status
- [x] T030 [US3] Write tests for complete annotation coverage in test/diagnostics/annotations.test.ts — verify every node in resolvedTarget.nodes gets exactly one annotation, no omissions, no duplicates

**Checkpoint**: All node annotation statuses correctly assigned with informative reason strings

---

## Phase 6: User Story 4 - Guardrail Action Reporting (Priority: P2)

**Goal**: Include guardrail decisions in the diagnostic summary with full transparency — narrowed targets report both original and narrowed scope, refused requests set status to skipped

**Independent Test**: Provide guardrail decisions with narrow/refuse actions → verify they appear in guardrailActions, status reflects refuse, narrowed target details present

### Implementation for User Story 4

- [x] T031 [US4] Implement guardrail decision passthrough in src/diagnostics/synthesize.ts — include all GuardrailDecision entries in guardrailActions array; narrowed decisions carry narrowedTarget on the decision itself, pre-narrowing scope conveyed via evidence and explanation fields
- [x] T032 [US4] Write tests for guardrail action reporting in test/diagnostics/synthesize.test.ts — test proceed/warn/narrow/redirect/refuse all appear, refuse sets status to skipped, narrow includes both targets

**Checkpoint**: Guardrail decisions fully transparent in diagnostic output

---

## Phase 7: User Story 5 - Redacted Data Hints & contextKind Edge Cases (Priority: P3)

**Goal**: Add redacted execution data hints and comprehensive test coverage for contextKind classification edge cases (contextKind classification itself is already implemented in T008)

**Independent Test**: Provide fixture execution errors with each contextKind variant and redacted nodes → verify correct classification and danger-severity hints

### Implementation for User Story 5

- [x] T033 [US5] Implement redacted execution data hint in src/diagnostics/hints.ts — emit DiagnosticHint with severity 'danger' per node with redacted data, classify using contextKind
- [x] T034 [US5] Write tests for contextKind classification edge cases in test/diagnostics/errors.test.ts — test api with 401→credentials, api with 5xx→external-service, api without httpCode→external-service, cancellation→cancelled, expression→expression, other→unknown
- [x] T035 [US5] Write tests for redacted execution data hints in test/diagnostics/hints.test.ts — test danger-severity hint emitted per redacted node

**Checkpoint**: contextKind classification edge cases and redacted data hints fully tested

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Integration validation, compactness verification, and export

- [x] T036 [P] Write integration test for full synthesis pipeline in test/diagnostics/synthesize.test.ts — end-to-end test with realistic fixture data combining static findings, execution data, trust state, guardrail decisions, and all annotation types
- [x] T037 [P] Write compactness verification test in test/diagnostics/synthesize.test.ts — serialize typical summaries to JSON, verify line counts match targets (~30-40 for static-only 5 nodes, ~80-100 for execution-backed 8 nodes)
- [x] T038 Export synthesize function from src/index.ts — add to package entry point
- [x] T039 Run full test suite and verify all tests pass with `npm test -- test/diagnostics/`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on T001 (types) — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational completion
- **User Story 2 (Phase 4)**: Depends on Foundational completion — can run in parallel with US1
- **User Story 3 (Phase 5)**: Depends on US1 (extends annotations.ts)
- **User Story 4 (Phase 6)**: Depends on US1 (extends synthesize.ts) — can run in parallel with US3
- **User Story 5 (Phase 7)**: Depends on Foundational (errors.ts already handles contextKind) — can run in parallel with US3/US4
- **Polish (Phase 8)**: Depends on all user stories complete

### User Story Dependencies

- **US1 (Static-Only Summary)**: After Foundational — no other story dependencies
- **US2 (Execution-Backed Summary)**: After Foundational — no dependency on US1 (different code paths)
- **US3 (Annotations)**: After US1 — extends annotations.ts with mocked logic
- **US4 (Guardrail Reporting)**: After US1 — extends synthesize.ts
- **US5 (contextKind Classification)**: After Foundational — extends errors.ts and hints.ts

### Within Each User Story

- Implementation before tests where tasks depend on each other
- Tests marked [P] can run in parallel with independent implementation tasks
- Story complete before moving to next priority (unless parallelizing)

### Parallel Opportunities

- T002-T006 (all fixtures) can run in parallel
- T011-T014 (foundational tests) can run in parallel after T007-T010
- US1 and US2 can start in parallel after Foundational
- US3, US4, and US5 can run in parallel after their dependencies
- T036-T037 (polish tests) can run in parallel

---

## Parallel Example: Setup Phase

```
Task: "Create static finding fixtures in test/fixtures/diagnostics/static-findings.ts"
Task: "Create execution data fixtures in test/fixtures/diagnostics/execution-data.ts"
Task: "Create trust state fixtures in test/fixtures/diagnostics/trust-state.ts"
Task: "Create guardrail decision fixtures in test/fixtures/diagnostics/guardrail-decisions.ts"
Task: "Create resolved target fixtures in test/fixtures/diagnostics/targets.ts"
```

## Parallel Example: User Stories After Foundational

```
# These can proceed in parallel:
US1: "Implement hint collection from static warnings in src/diagnostics/hints.ts"
US2: "Implement path reconstruction in src/diagnostics/path.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (types + fixtures)
2. Complete Phase 2: Foundational (error classification + status determination)
3. Complete Phase 3: User Story 1 (static-only synthesis)
4. **STOP and VALIDATE**: `npm test -- test/diagnostics/` — static-only summaries correct
5. The system can now produce valid DiagnosticSummary output for the most common case

### Incremental Delivery

1. Setup + Foundational → Classification and status working
2. Add US1 → Static-only summaries (MVP!)
3. Add US2 → Execution-backed summaries
4. Add US3 → Rich node annotations
5. Add US4 → Guardrail transparency
6. Add US5 → Full error classification coverage
7. Polish → Integration tests, compactness validation, export

---

## Notes

- All tests use fixture data — no n8n instance required
- Execution data types defined locally in diagnostics until Phase 5 lands
- The synthesize() function is the only public export from src/diagnostics/
- Classification maps are static lookup tables — no configuration or strategy patterns

---

## Audit Remediation

> Generated by `/speckit.audit` on 2026-04-18. All items resolved.

- [x] T040 [AR] Fix SD-001: Update validated reason string in `src/diagnostics/annotations.ts:59` — change to "Changed since last validation" per T028
- [x] T041 [AR] Fix PH-001: Use PathReconstructionError in `src/diagnostics/path.ts` — add guard for missing structural data per FR-007
- [x] T042 [AR] Fix CV-001: Add Zod boundary validation in `src/diagnostics/synthesize.ts:77-83` — validate full SynthesisInput shape per Constitution II
- [x] T043 [AR] Fix CV-002: Remove `'' as NodeIdentity` cast in `src/diagnostics/hints.ts:76` — change DiagnosticHint.node to `NodeIdentity | null`, use null for run-level hints
- [x] T044 [AR] Fix OE-001: Inline single-call context builders in `src/diagnostics/errors.ts:62-97` — inline buildWiringContext, buildExpressionContext, buildCredentialsContext into switch cases
- [x] T045 [AR] Fix SD-002: Exclude mocked nodes from executedNodes set in `src/diagnostics/annotations.ts:93-101` — skip nodes with pinDataSource
- [x] T046 [AR] Fix TQ-001: Strengthen "complete structure" test in `test/diagnostics/synthesize.test.ts:124-137` — replace toHaveProperty with value/type assertions
- [x] T047 [AR] Fix OE-002: Inline sourceRank into orderErrors in `src/diagnostics/errors.ts:293-295`
- [x] T048 [AR] Fix TQ-002: Rewrite "same-node" test in `test/diagnostics/synthesize.test.ts:225-230` — use fixture where both layers error on setFields
- [x] T049 [AR] Fix SD-003: Implement error status in `src/diagnostics/status.ts:25-47` — add infrastructure failure path per FR-001
