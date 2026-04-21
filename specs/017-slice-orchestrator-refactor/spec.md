# Feature Specification: Slice Semantics Consolidation and Orchestrator Decompression

**Feature Branch**: `017-slice-orchestrator-refactor`  
**Created**: 2026-04-20  
**Status**: Draft  
**Input**: User description: "read docs/CODING.md, test/TESTING.md, docs/internal/prd-b.md and spec the work. use number 017"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Shared traversal primitives replace duplicated graph walks (Priority: P1)

A developer modifying slice growth rules (e.g., changing trust boundary stopping behavior or adding a new traversal direction) makes the change in one place and both target resolution and guardrail narrowing honor the new behavior consistently.

**Why this priority**: Duplicated traversal is the highest-risk internal liability. Semantic drift between resolve and narrow is the most likely source of future bugs. Centralizing traversal is the prerequisite for all other work in this spec.

**Independent Test**: Can be fully tested by running the existing unit and integration test suites after replacing duplicated traversal with shared primitives. Slice construction results must be identical before and after the refactor.

**Acceptance Scenarios**:

1. **Given** a workflow with changed nodes and trusted boundaries, **When** target resolution builds a slice via `resolveChanged`, **Then** the resulting slice (nodes, entries, exits) is identical to the pre-refactor result.
2. **Given** the same workflow, **When** guardrail narrowing computes a reduced scope via `computeNarrowedTarget`, **Then** the narrowed slice uses the same boundary classification rules as target resolution.
3. **Given** a new traversal rule is added (e.g., stop at a new boundary type), **When** the rule is implemented in the shared traversal primitive, **Then** both resolve and narrow honor it without separate changes.

---

### User Story 2 - Pinning tests capture current slice semantics before refactor (Priority: P1)

Before any traversal logic moves, a dedicated test suite pins the current slicing behavior so that any accidental semantic drift during the refactor is immediately visible as a test failure.

**Why this priority**: Equal to P1 because the pinning tests are a prerequisite for safe refactoring. Without them, the refactor cannot be verified as behavior-preserving.

**Independent Test**: Can be tested independently by running the pinning test suite against the current (pre-refactor) codebase. All tests must pass before any traversal code changes.

**Acceptance Scenarios**:

1. **Given** a linear workflow with one changed node and trust on surrounding nodes, **When** `resolveChanged` builds the slice, **Then** the pinning test asserts exact node membership, entry points, and exit points.
2. **Given** a named-node target on a branching workflow, **When** `resolveNodes` builds the slice, **Then** the pinning test asserts forward and backward propagation stopped at the correct trust boundaries.
3. **Given** a workflow meeting narrowing preconditions (>5 nodes, <20% changed), **When** `computeNarrowedTarget` runs, **Then** the pinning test asserts the narrowed set, entry points, and exit points match the current behavior.
4. **Given** a workflow where all nodes are trusted, **When** `resolveChanged` runs with an empty change set, **Then** the pinning test asserts an empty slice with no entries or exits.

---

### User Story 3 - Orchestrator delegates to explicit phase helpers (Priority: P2)

A developer working on execution preparation (e.g., changing pin-data tiering) edits a focused phase helper rather than modifying the 450-line `interpret()` function. Changes to synthesis, persistence, or guardrail routing happen in their own phase helpers without competing with unrelated logic.

**Why this priority**: Orchestrator decompression is high-value but depends on P1 (shared traversal) being complete first. The traversal refactor changes resolve and narrow, which are called from interpret() — decompressing interpret() in parallel would create merge conflicts and moving targets.

**Independent Test**: Can be tested by running the full orchestrator test suite and all integration scenarios. `interpret()` must produce identical `DiagnosticSummary` outputs for every existing test case.

**Acceptance Scenarios**:

1. **Given** a validate request on a broken workflow, **When** `interpret()` runs, **Then** it delegates static analysis to a phase helper and the DiagnosticSummary is identical to pre-refactor output.
2. **Given** a test request with MCP available, **When** `interpret()` runs, **Then** execution preparation (capability detection, pin-data construction, smoke execution, result retrieval) happens in a dedicated phase helper.
3. **Given** a passing validation, **When** `interpret()` reaches the persistence phase, **Then** trust recording, snapshot saving, and pin-data caching are handled by a persistence phase helper, not inline in interpret().
4. **Given** a guardrail refuse decision without force, **When** `interpret()` runs, **Then** it returns the skipped diagnostic without entering the validation or persistence phases.

---

### User Story 4 - Shared boundary classification for entries and exits (Priority: P2)

Entry and exit point derivation uses a single reusable definition rather than being reimplemented separately in target resolution and guardrail narrowing.

**Why this priority**: Boundary classification is a sub-component of the traversal consolidation. It can be extracted as part of or immediately after the shared traversal work.

**Independent Test**: Can be tested by asserting that entry/exit classification produces identical results when called from resolve and from narrow on the same graph and trust state.

**Acceptance Scenarios**:

1. **Given** a set of nodes forming a subgraph, **When** entry points are classified, **Then** nodes with no incoming edges from within the set or with all incoming edges from outside the set are marked as entries.
2. **Given** the same subgraph, **When** exit points are classified, **Then** nodes with no outgoing edges or with at least one outgoing edge to a node outside the set are marked as exits.

---

### Edge Cases

- What happens when a traversal encounters a cycle in the workflow graph? The shared primitive must handle cycles (visited-set tracking) identically to the current implementations.
- What happens when trust state is empty (first validation)? All nodes are untrusted; traversal should not stop at any trust boundary. Current behavior must be preserved.
- What happens when narrowing reduces the scope to a single node? The narrowed slice must still have valid entry/exit classification.
- What happens when `interpret()` phase helpers are called with partial or invalid intermediate state? Phase helpers receive validated intermediate data from the coordinator — invalid state is a programming error, not a handled case (per project's fail-fast philosophy).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide shared graph traversal primitives that support directional movement (forward/backward), stopping at trust boundaries, stopping at graph roots/terminals, and bounded traversal within a target node set.
- **FR-002**: The system MUST provide shared boundary classification that derives entry and exit points from a set of nodes within a graph, reusable by both target resolution and guardrail narrowing.
- **FR-003**: Target resolution (`resolveNodes`, `resolveChanged`) MUST use the shared traversal primitives instead of owning private propagation functions.
- **FR-004**: Guardrail narrowing (`computeNarrowedTarget`) MUST use the shared traversal primitives instead of owning private BFS implementations.
- **FR-005**: Pinning tests MUST capture current slice semantics before any traversal code is modified, covering: changed-target slice construction, named-node slice construction, trust-boundary stopping, entry/exit derivation, and narrowing behavior.
- **FR-006**: The `interpret()` function MUST be decomposed into explicit phase helpers covering at minimum: (a) validation or execution-preparation, (b) synthesis, (c) pass-only persistence. Target and guardrail resolution remain in `interpret()` as coordination logic that determines which phases run.
- **FR-007**: The refactor MUST preserve all existing validation behavior — no public boundary behavior changes, no semantic differences in slice construction, no changes to DiagnosticSummary output for any existing test case.
- **FR-008**: Resolve and narrow MUST share the same boundary classification rules unless an intentional override is documented with its rationale.

### Key Entities

- **Traversal Primitive**: A reusable function or set of functions representing directional graph walks with configurable stopping conditions (trust boundary, graph terminal, target boundary). Replaces the private `propagateForward`/`propagateBackward` in resolve.ts and the inline BFS in narrow.ts.
- **Boundary Classifier**: A reusable function that derives entry and exit points from a node set within a graph. Replaces the duplicated entry/exit derivation in resolve.ts and narrow.ts.
- **Phase Helper**: A focused function owning one coarse phase of the orchestration pipeline (target resolution, validation, synthesis, persistence). Called by `interpret()` as a coordinator.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Graph traversal logic exists in exactly one location — no duplicated forward/backward propagation functions across resolve and narrow.
- **SC-002**: Entry/exit boundary classification exists in exactly one location — no duplicated derivation logic across resolve and narrow.
- **SC-003**: All 523+ existing unit tests pass without modification to test assertions (test setup may change if module boundaries move, but expected outputs must not change).
- **SC-004**: All 15 integration scenarios pass without modification.
- **SC-005**: `interpret()` function body is reduced to coordination calls between phase helpers — no inline static analysis dispatch, execution preparation, or persistence logic.
- **SC-006**: Pinning tests for slice semantics exist and pass both before and after the refactor, covering all specified behaviors and edge cases: changed-target slice construction, named-node slice construction, trust-boundary stopping, entry/exit derivation, narrowing, and empty change set handling.
- **SC-007**: Adding a new traversal stopping condition requires changes in one file rather than coordinated changes across resolve.ts and narrow.ts.
