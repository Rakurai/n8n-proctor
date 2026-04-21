# Feature Specification: Execution Ownership Cleanup and Dependency Contract Reshape

**Feature Branch**: `018-exec-ownership-deps-reshape`  
**Created**: 2026-04-20  
**Status**: Draft  
**Input**: User description: "Remediation PRD C — move execution preparation behind the execution subsystem, replace the flat dependency bag with grouped subsystem contracts, fold in ride-along cleanup"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Execution Preparation is Owned by the Execution Subsystem (Priority: P1)

An agent or developer extending n8n-proctor's execution subsystem can understand and test execution-input preparation in isolation, without reading orchestration code. Pin-data tiering, schema-derived behavior, and execution-ready plan assembly are all owned by the execution subsystem and exposed through a single cohesive preparation API.

**Why this priority**: The blurry execution boundary is the most impactful structural problem in the codebase. Orchestration currently owns execution preparation details (pin-data tiering, MCP-assisted generation), making execution behavior impossible to test without dragging in the orchestrator. This is the foundation the other stories depend on.

**Independent Test**: Can be verified by running execution-preparation tests in isolation and confirming that the orchestrator no longer contains pin-data tiering or schema-derived logic. The orchestrator should delegate to the execution subsystem for all preparation work.

**Acceptance Scenarios**:

1. **Given** a validation request requiring execution, **When** the orchestrator hands off to the execution subsystem, **Then** execution-input preparation (pin-data tiering, schema-derived behavior, execution-ready plan assembly) is performed entirely by execution-side code.
2. **Given** an execution preparation call with tier-3 MCP pin-data sourcing needed, **When** cached artifacts are unavailable, **Then** the execution subsystem handles the MCP schema lookup and pin-data construction without orchestrator involvement.
3. **Given** a test that exercises execution-input preparation, **When** the test mocks only execution-side dependencies, **Then** the test passes without requiring any orchestration doubles.

---

### User Story 2 - Dependency Contracts Reflect Subsystem Ownership (Priority: P2)

A contributor working on one subsystem (trust, analysis, execution, diagnostics, or snapshots) can understand that subsystem's dependency contract in isolation. The dependency boundary groups related capabilities together rather than exposing a flat bag of unrelated functions.

**Why this priority**: The flat dependency bag makes it hard to reason about subsystem ownership, increases test setup cost, and enables accidental coupling. Grouped contracts make boundaries readable from the types alone. This work is more mechanical than Story 1 but equally important for long-term maintainability.

**Independent Test**: Can be verified by inspecting the dependency wiring types and confirming they are grouped by subsystem. Tests should use subsystem-scoped doubles instead of one broad mock bag.

**Acceptance Scenarios**:

1. **Given** the dependency wiring module, **When** a developer reads the type definitions, **Then** dependencies are grouped into coherent subsystem-scoped contracts (trust, analysis, execution, diagnostics, snapshots).
2. **Given** a test for the orchestrator, **When** the test creates dependency doubles, **Then** it constructs subsystem-scoped doubles rather than a single wide mock bag.
3. **Given** the reshaped dependency contracts, **When** the full test suite runs, **Then** all existing tests pass with the new contract shape.

---

### User Story 3 - Abstraction Leaks are Cleaned Up in Touched Files (Priority: P3)

While the execution and dependency files are in motion, several small abstraction leaks are corrected: dead fields are removed, double-cast shortcuts are replaced, equality checks are centralized, and duplicated constants are consolidated.

**Why this priority**: These are ride-along fixes that reduce maintenance drag. They are lower priority because they do not change product behavior, but they are cheapest to fix while the relevant files are already being changed.

**Independent Test**: Can be verified by confirming: dead request fields are absent from types, snapshot reconstruction uses explicit typed modeling, trust change classification uses a shared comparison helper, and the duplicated trust-preserving constant exists in one canonical location.

**Acceptance Scenarios**:

1. **Given** the validation request type, **When** a developer reads its fields, **Then** `n8nHost` and `n8nApiKey` fields that the orchestrator never meaningfully consumed are absent.
2. **Given** the snapshot reconstruction code, **When** it builds a stub workflow representation, **Then** it uses explicit typed modeling rather than a double-cast shortcut.
3. **Given** the trust change classification code, **When** it performs equality checks for classification, **Then** it uses a shared structured comparison helper rather than ad hoc `JSON.stringify()` calls.
4. **Given** the trust-preserving constant, **When** a developer searches for it, **Then** it is defined in exactly one canonical location and imported where needed.

---

### Edge Cases

- What happens when a subsystem-scoped dependency group is partially provided (e.g., missing one function)? The system should fail at initialization with a clear typed error, not at runtime with a confusing missing-method error.
- What happens when existing plugin or integration code depends on the old `OrchestratorDeps` shape? All consumers must be updated; no compatibility shims.
- What happens when a test uses the old broad mock bag pattern? It must be updated to the new subsystem-scoped doubles. No dual-path testing.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The execution subsystem MUST expose a preparation API that owns execution-input assembly end to end, including pin-data tiering, schema-derived behavior, and execution-ready planning.
- **FR-002**: The orchestrator MUST NOT contain pin-data tiering rules or MCP-assisted schema-derived logic; it MUST delegate all execution preparation to the execution subsystem's preparation API.
- **FR-003**: The orchestrator-to-execution handoff MUST reduce to a single function call with typed input/output — the orchestrator passes the validation context and receives an execution-ready result, without managing intermediate preparation steps.
- **FR-004**: The dependency wiring MUST group dependencies into subsystem-scoped contracts rather than exposing a single flat bag.
- **FR-005**: The orchestrator's dependency type MUST reflect subsystem grouping (trust, analysis, execution, diagnostics, snapshots) rather than a wide interface mixing unrelated concerns.
- **FR-006**: Tests that depend on the dependency boundary MUST use subsystem-scoped doubles that match the new contract shape.
- **FR-007**: Dead request fields (`n8nHost`, `n8nApiKey` on `ValidationRequest`) that the orchestrator does not meaningfully consume MUST be removed.
- **FR-008**: Snapshot reconstruction MUST use explicit typed modeling instead of double-cast shortcuts.
- **FR-009**: Trust change classification MUST use a shared structured comparison helper rather than repeated ad hoc `JSON.stringify()` equality checks.
- **FR-010**: The `TRUST_PRESERVING` constant (or equivalent) duplicated across trust and guardrail evidence MUST be consolidated into one canonical definition.
- **FR-011**: All existing tests (523 unit tests, 15 integration scenarios) MUST continue to pass after the refactoring, with no functionality regressions from PRD A or PRD B work.
- **FR-012**: Execution-input preparation MUST be independently testable without orchestration dependencies.

### Key Entities

- **Execution Preparation API**: The cohesive interface the execution subsystem exposes for assembling execution inputs. Receives validation context, returns execution-ready plan including pin data.
- **Subsystem Dependency Contracts**: Grouped type definitions that replace the flat dependency bag. Each contract represents one subsystem's capabilities (trust operations, analysis operations, execution operations, diagnostic operations, snapshot operations).
- **Validation Request**: The request type consumed by the orchestrator. After cleanup, it contains only fields the orchestrator actually uses.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Execution-input preparation can be tested in isolation — execution subsystem tests run without requiring orchestration mocks or doubles.
- **SC-002**: The orchestrator no longer contains any pin-data tiering or schema-derived logic — zero occurrences of those mechanics in orchestration code.
- **SC-003**: Dependency contracts are grouped into at least 4 subsystem-scoped types visible in the wiring module.
- **SC-004**: Tests use subsystem-scoped doubles — no test file creates or references a single wide dependency mock bag for the orchestrator.
- **SC-005**: All 523+ unit tests and 15 integration scenarios pass without regression.
- **SC-006**: Dead request fields are absent from the validation request type.
- **SC-007**: The trust-preserving constant is defined in exactly one location across the codebase.
- **SC-008**: Snapshot reconstruction contains zero type assertion casts (`as unknown as T` or equivalent double-cast patterns).
- **SC-009**: Trust change classification contains zero ad hoc `JSON.stringify()` equality comparisons.

## Assumptions

- PRD A (boundary hardening) and PRD B (slice/orchestrator refactor) have landed and are stable. This spec builds on their outputs.
- The exact type names for subsystem-scoped contracts are flexible; the requirement is coherent grouping, not specific naming.
- "Subsystem-scoped doubles" means test mocks/stubs that match the shape of one subsystem's contract, not a single object satisfying all contracts.
- The `n8nHost` and `n8nApiKey` fields on `ValidationRequest` are confirmed dead — the orchestrator does not meaningfully consume them. If downstream code (MCP server, CLI) needs them, they flow through a different path.
- No dependency version upgrades (Zod, TypeScript, Vitest, Biome) are in scope.
- The grouped subsystem contract types (e.g., `TrustDeps`, `AnalysisDeps`, `ExecutionDeps`) become part of the public API surface exported from `src/index.ts`, since library consumers use them for dependency injection.

## Scope Boundaries

**In scope**:
- Execution preparation API creation and ownership transfer
- Pin-data tiering relocation from orchestrator to execution
- Dependency contract grouping
- Test double modernization for touched tests
- Ride-along cleanup (dead fields, double-cast, equality helpers, constant dedup)

**Out of scope**:
- Revisiting PRD A boundary-hardening policy
- Redoing PRD B traversal/slice semantics
- Dependency version upgrades
- Broad test fixture cleanup not caused by new dependency shapes
- Format-test tightening outside touched tests
- Generic `Error` usage as a repo-wide cleanup target
- `.gitignore` secret pattern expansion
