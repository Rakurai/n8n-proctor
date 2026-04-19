# Tasks: Shared Cross-Subsystem Types

**Input**: Design documents from `/specs/001-shared-types/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: Included — spec FR-012 explicitly requires type-level tests for discriminated union narrowing and branded type safety.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `test/` at repository root

---

## Phase 1: Setup

**Purpose**: Create directory structure for type files and tests

- [x] T001 Create type source directory at src/types/
- [x] T002 Create type test directory at test/types/

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: NodeIdentity branded type — used by every other type file as a cross-cutting dependency

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Define NodeIdentity branded type and nodeIdentity() factory function in src/types/identity.ts

**Details for T003**:
- Branded type: `type NodeIdentity = string & { readonly __brand: 'NodeIdentity' }`
- Factory: `function nodeIdentity(name: string): NodeIdentity` — validates non-empty, then casts to branded type. Throws a typed error on empty string (per FR-004, constitution principle I).
- Module-level doc comment explaining purpose (stable graph key from n8nac propertyName)
- Use `import type` for type-only imports, `.js` extensions for ESM imports
- No barrel file — this file is imported directly by other type files

**Checkpoint**: NodeIdentity compiles and can be imported by other type files

---

## Phase 3: User Story 1 - Subsystem Developer Imports Shared Types (Priority: P1) MVP

**Goal**: All cross-subsystem types from INDEX.md exist as TypeScript source, importable by every downstream subsystem

**Independent Test**: Import each type into a test file, construct values of each type, verify the project compiles with `npm run typecheck`

### Implementation for User Story 1

- [x] T004 [P] [US1] Define WorkflowGraph, GraphNode, Edge, and NodeClassification types in src/types/graph.ts
- [x] T005 [P] [US1] Define SliceDefinition, PathDefinition, and PathEdge types in src/types/slice.ts
- [x] T006 [P] [US1] Define AgentTarget, ValidationTarget, and ValidationLayer types in src/types/target.ts
- [x] T007 [P] [US1] Define TrustState, NodeTrustRecord, NodeChangeSet, NodeModification, and ChangeKind types in src/types/trust.ts
- [x] T008 [P] [US1] Define GuardrailDecision, GuardrailDecisionBase, GuardrailAction, and GuardrailEvidence types in src/types/guardrail.ts
- [x] T009 [P] [US1] Define DiagnosticSummary and all sub-types in src/types/diagnostic.ts
- [x] T010 [US1] Re-export public type API from package entry point in src/index.ts

**Details for T004**:
- Import `WorkflowAST` from `@n8n-as-code/transformer` using `import type`
- Import `NodeIdentity` from `./identity.js` using `import type`
- `WorkflowGraph`: `nodes: Map<string, GraphNode>`, `forward/backward: Map<string, Edge[]>`, `ast: WorkflowAST`
- `GraphNode`: `name`, `displayName`, `type`, `typeVersion`, `parameters: Record<string, unknown>`, `credentials: Record<string, unknown> | null`, `disabled`, `classification: NodeClassification`
- `NodeClassification`: string union `'shape-preserving' | 'shape-augmenting' | 'shape-replacing' | 'shape-opaque'`
- `Edge`: `from`, `fromOutput`, `isError`, `to`, `toInput`
- Module-level and interface doc comments per CODING.md

**Details for T005**:
- Import `NodeIdentity` from `./identity.js` using `import type`
- `SliceDefinition`: `nodes: Set<NodeIdentity>`, `seedNodes: Set<NodeIdentity>`, `entryPoints: NodeIdentity[]`, `exitPoints: NodeIdentity[]`
- `PathDefinition`: `nodes: NodeIdentity[]`, `edges: PathEdge[]`, `usesErrorOutput`, `selectionReason`
- `PathEdge`: `from: NodeIdentity`, `fromOutput`, `to: NodeIdentity`, `toInput`, `isError`

**Details for T006**:
- Import `NodeIdentity` from `./identity.js`, `SliceDefinition`/`PathDefinition` from `./slice.js` using `import type`
- `AgentTarget`: discriminated union on `kind` with variants `'nodes'`, `'changed'`, `'workflow'`
- `ValidationTarget`: extends AgentTarget variants plus `'slice'` and `'path'`
- `ValidationLayer`: string union `'static' | 'execution' | 'both'`

**Details for T007**:
- Import `NodeIdentity` from `./identity.js`, `ValidationLayer` from `./target.js` using `import type`
- `TrustState`: `workflowId`, `nodes: Map<NodeIdentity, NodeTrustRecord>`, `connectionsHash`
- `NodeTrustRecord`: `contentHash`, `validatedBy`, `validatedAt`, `validationLayer`, `fixtureHash: string | null`
- `NodeChangeSet`: `added`, `removed`, `modified: NodeModification[]`, `unchanged`
- `NodeModification`: `node: NodeIdentity`, `changes: ChangeKind[]`
- `ChangeKind`: string union with 8 variants

**Details for T008**:
- Import `NodeIdentity` from `./identity.js`, `ValidationTarget` from `./target.js`, `ValidationLayer` from `./target.js` using `import type`
- `GuardrailDecisionBase`: `explanation`, `evidence: GuardrailEvidence`, `overridable`
- `GuardrailDecision`: discriminated union on `action` with 5 variants extending base. `'narrow'` adds `narrowedTarget: ValidationTarget`, `'redirect'` adds `redirectedLayer: ValidationLayer`
- `GuardrailAction`: derived type `GuardrailDecision['action']`
- `GuardrailEvidence`: `changedNodes`, `trustedNodes`, `lastValidatedAt: string | null`, `fixtureChanged`

**Details for T009**:
- Import `NodeIdentity` from `./identity.js`, `ValidationLayer` from `./target.js`, `GuardrailDecision` from `./guardrail.js` using `import type`
- `DiagnosticSummary`: all fields from INDEX.md including `schemaVersion: 1` literal type
- `DiagnosticErrorBase`: `type`, `message`, `description: string | null`, `node: NodeIdentity | null`
- `DiagnosticError`: discriminated union on `classification` with 7 variants extending base, each with typed `context`
- `ErrorClassification`: derived type `DiagnosticError['classification']`
- `ResolvedTarget`, `PathNode`, `NodeAnnotation`, `NodeAnnotationStatus`, `DiagnosticHint`, `AvailableCapabilities`, `ValidationMeta`

**Details for T010**:
- Re-export all public types from `src/index.ts` (the one allowed barrel per CODING.md)
- Use `export type { ... } from './types/graph.js'` pattern for each type file
- Export the `nodeIdentity` factory as a runtime export
- This is for external package consumers; internal code imports directly from source files

**Checkpoint**: `npm run typecheck` passes with zero errors. All types importable from their source files.

---

## Phase 4: User Story 2 - Discriminated Unions Narrow Correctly (Priority: P1)

**Goal**: TypeScript's control-flow narrowing works correctly on all discriminated union types

**Independent Test**: Type-level assertion tests verify that narrowing on the discriminant field produces the expected type shape in each branch

### Tests for User Story 2

- [x] T011 [US2] Create type-level narrowing tests for all discriminated unions in test/types/narrowing.test-d.ts

**Details for T011**:
- Use vitest `expectTypeOf` for type-level assertions
- Test `GuardrailDecision` narrowing: verify each of 5 `action` variants narrows to correct shape (e.g., `action === 'narrow'` → `narrowedTarget` exists)
- Test `DiagnosticError` narrowing: verify each of 7 `classification` variants narrows to correct `context` shape
- Test `ValidationTarget` narrowing: verify each of 5 `kind` variants narrows correctly (e.g., `kind === 'slice'` → `slice: SliceDefinition`)
- Test `AgentTarget` narrowing: verify each of 3 `kind` variants
- Test derived types: `GuardrailAction` equals the union of action literals, `ErrorClassification` equals the union of classification literals
- Use `.test-d.ts` extension (vitest convention for type-check-only tests)
- No runtime execution needed — these are compile-time checks

**Checkpoint**: `npm test` passes, confirming all discriminated unions narrow correctly

---

## Phase 5: User Story 3 - Branded NodeIdentity Prevents Accidental String Assignment (Priority: P2)

**Goal**: Plain strings cannot be assigned to `NodeIdentity` without explicit conversion via the factory function

**Independent Test**: Type-level assertion that `string` is not assignable to `NodeIdentity`, plus runtime test for the factory function

### Tests for User Story 3

- [x] T012 [P] [US3] Create type-level branding tests for NodeIdentity in test/types/identity.test-d.ts
- [x] T013 [P] [US3] Create runtime tests for nodeIdentity() factory function in test/types/identity.test.ts

**Details for T012**:
- Use vitest `expectTypeOf` for type-level assertions
- Verify `string` is NOT assignable to `NodeIdentity`
- Verify `NodeIdentity` IS assignable to `string` (structural compatibility in consuming direction)
- Use `.test-d.ts` extension

**Details for T013**:
- Test that `nodeIdentity('validName')` returns a value that equals the input string at runtime
- Test that `nodeIdentity('')` throws a typed error (FR-004 fail-fast requirement)
- Keep tests minimal — no trivial assertions per constitution principle V

**Checkpoint**: `npm test` passes, confirming branded type safety works at compile time and factory works at runtime

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final verification across all user stories

- [x] T014 Verify full build succeeds with `npm run build` producing dist/ output
- [x] T015 Run quickstart.md validation — verify import patterns from specs/001-shared-types/quickstart.md work

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational (NodeIdentity must exist first)
- **US2 (Phase 4)**: Depends on US1 (types must exist before narrowing tests)
- **US3 (Phase 5)**: Depends on Foundational (NodeIdentity must exist first) — can run in parallel with US1/US2
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Phase 2 (NodeIdentity). No dependencies on other stories.
- **User Story 2 (P1)**: Depends on Phase 3 (US1 — types must exist to test narrowing). Cannot run in parallel with US1.
- **User Story 3 (P2)**: Depends on Phase 2 (NodeIdentity). Can run in parallel with US1.

### Within Each User Story

- T004–T009 (type files) can all run in parallel — they are independent files
- T010 (entry point re-exports) depends on all type files being complete
- T012 and T013 (US3 tests) can run in parallel with each other

### Parallel Opportunities

Within Phase 3 (US1), all six type files (T004–T009) can be written simultaneously:
```
Agent 1: T004 — src/types/graph.ts
Agent 2: T005 — src/types/slice.ts
Agent 3: T006 — src/types/target.ts
Agent 4: T007 — src/types/trust.ts
Agent 5: T008 — src/types/guardrail.ts
Agent 6: T009 — src/types/diagnostic.ts
```

US3 tests (T012 + T013) can run in parallel with each other.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T002)
2. Complete Phase 2: Foundational — NodeIdentity (T003)
3. Complete Phase 3: US1 — All type files (T004–T010)
4. **STOP and VALIDATE**: `npm run typecheck` passes with zero errors
5. Types are immediately usable by downstream subsystems

### Incremental Delivery

1. Setup + Foundational → NodeIdentity ready
2. Add US1 → All types compile → MVP complete
3. Add US2 → Narrowing tests confirm discriminated unions work
4. Add US3 → Branding tests confirm NodeIdentity safety
5. Polish → Build verification, quickstart validation

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- All type definitions transcribed from `docs/reference/INDEX.md` — use as canonical source
- CODING.md rules: no barrel files (except package entry point), string unions not enums, `import type` for types, `.js` extensions in imports
- Commit after each phase completion
