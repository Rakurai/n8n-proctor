# Implementation Plan: Diagnostic Synthesis

**Branch**: `006-diagnostics` | **Date**: 2026-04-18 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/006-diagnostics/spec.md`

## Summary

Implement the diagnostic synthesis subsystem (`src/diagnostics/`) that assembles the canonical `DiagnosticSummary` output from evidence produced by static analysis, execution, trust, and guardrail subsystems. The subsystem is a pure data transformation layer — no external calls, no side effects — that classifies errors, reconstructs execution paths, assigns node annotations, and enforces compact output. All inputs arrive as function arguments; all outputs are structured data conforming to the shared types in `src/types/diagnostic.ts`.

## Technical Context

**Language/Version**: TypeScript 5.7+ on Node.js 20+  
**Primary Dependencies**: None beyond project types (pure transformation layer); `zod` for edge validation if needed  
**Storage**: N/A (stateless — no persistence)  
**Testing**: vitest 3.1  
**Target Platform**: Node.js library (ESM)  
**Project Type**: Library subsystem within `n8n-check`  
**Performance Goals**: Synthesis is a synchronous in-memory transformation; sub-millisecond for typical inputs  
**Constraints**: Output compactness (~30-150 JSON lines depending on scenario)  
**Scale/Scope**: Typical inputs: 5-20 nodes, 0-10 findings, 0-8 execution results

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Fail-Fast, No Fallbacks | PASS | Missing structural data in path reconstruction raises an error. No default values on error paths. No fallback classifications. |
| II. Contract-Driven Boundaries | PASS | All inputs are typed via shared types. `synthesize()` is the public boundary — inputs validated there, trusted internally. Discriminated unions for StaticFinding and DiagnosticError. |
| III. No Over-Engineering | PASS | Each module has a single concrete purpose. No abstractions beyond what the spec requires. Classification maps are plain lookup tables, not configurable strategies. |
| IV. Honest Code Only | PASS | No stubs or placeholders planned. Execution input types are defined by what the PRD specifies, not invented. |
| V. Minimal, Meaningful Tests | PASS | Tests use fixture data. Happy-path + error-path mandatory per spec. No trivial constructor tests. |

No violations. No complexity justification needed.

## Project Structure

### Documentation (this feature)

```text
specs/006-diagnostics/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── synthesize.md    # Public API contract
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── diagnostics/
│   ├── status.ts          # Status determination from combined evidence
│   ├── errors.ts          # Error extraction and classification (static + execution)
│   ├── annotations.ts     # Node annotation assignment
│   ├── path.ts            # Path reconstruction from execution data
│   ├── hints.ts           # Hint collection from static warnings and execution hints
│   ├── synthesize.ts      # Top-level synthesis function (public API)
│   └── types.ts           # Internal types (ClassifiedError, StaticKindClassificationMap)

test/
├── diagnostics/
│   ├── status.test.ts
│   ├── errors.test.ts
│   ├── annotations.test.ts
│   ├── path.test.ts
│   ├── hints.test.ts
│   └── synthesize.test.ts
└── fixtures/
    └── diagnostics/       # Fixture evidence data for diagnostic tests
        ├── static-findings.ts
        ├── execution-data.ts
        └── trust-state.ts
```

**Structure Decision**: Follows the existing `src/static-analysis/` pattern — one module per concern within the subsystem directory, internal types in a local `types.ts`, public API as the top-level `synthesize.ts`. No barrel file; consumers import `synthesize` directly.

## Phase 0: Research

### Research findings

#### 1. Execution Data Input Shape

**Decision**: Define a minimal `ExecutionData` interface and `NodeExecutionResult` locally in `src/diagnostics/types.ts` as the input contract for this subsystem. When Phase 5 (Execution) is implemented, the types will be defined in `src/execution/types.ts` and diagnostics will import from there.

**Rationale**: The diagnostics subsystem does not depend on Phase 5 implementation — it depends on the *shape* of execution data. The PRD and INDEX.md define this shape precisely. Defining the input interface now enables development and testing without waiting for Phase 5.

**Alternatives considered**:
- Wait for Phase 5 to implement: Rejected — diagnostics can be built and tested independently with fixtures.
- Import from a shared types file: The execution types are subsystem-internal per INDEX.md ("Types not defined here: `ExecutionData` — execution spec"). For now, define the minimal subset diagnostics needs. When Phase 5 lands, refactor to import from there.

#### 2. Error Classification Strategy

**Decision**: Use a static lookup map (`Record<StaticFindingKind, ErrorClassification>`) for static findings. Use a two-tier function for execution errors: first try constructor name matching, then fall back to `contextKind` discriminant matching.

**Rationale**: The classification tables in the PRD are exhaustive and deterministic. A static map for static findings is the simplest correct implementation. The two-tier approach for execution errors matches the PRD's explicit specification: "When the constructor name is available... When the constructor name is unavailable..."

**Alternatives considered**:
- Single classification function for both sources: Rejected — static and execution classification have fundamentally different input shapes and logic.
- Pattern-matching library: Rejected — the switch/map is ~30 lines; a library adds dependency for no benefit.

#### 3. Handling `opaque-boundary` Static Finding Kind

**Decision**: `opaque-boundary` findings are expected to always have `severity: 'warning'` (they signal reduced confidence, not an error). They follow the standard warning path: reported as `DiagnosticHint` entries, not classified as errors. No entry in the static-to-error classification map is needed.

**Rationale**: The PRD's classification table maps 6 of 7 finding kinds to error classifications, omitting `opaque-boundary`. The PRD explicitly states "Static findings with `severity: 'warning'` are reported as `DiagnosticHint` entries (severity `'warning'`), not as errors." The `opaque-boundary` kind signals an analysis confidence limit, which is inherently a warning — not a structural error. If an `opaque-boundary` finding ever arrives with `severity: 'error'`, the classification function will raise an error (fail-fast; no silent handling of unexpected input).

**Alternatives considered**:
- Add `opaque-boundary` to the error classification map: Rejected — there's no sensible error classification for it, and the PRD omits it from the table.
- Silently skip it: Rejected — violates fail-fast principle.

#### 4. Execution Data Interface for Diagnostics

**Decision**: The minimal execution data interface diagnostics needs:

```typescript
interface ExecutionData {
  status: 'success' | 'error' | 'cancelled';
  lastNodeExecuted: string | null;
  error: ExecutionErrorData | null;
  nodeResults: Map<NodeIdentity, NodeExecutionResult>;
}

interface NodeExecutionResult {
  executionIndex: number;
  status: 'success' | 'error';
  executionTimeMs: number;
  error: ExecutionErrorData | null;
  source: { previousNodeOutput: number | null };
  hints: NodeExecutionHint[];
}

interface NodeExecutionHint {
  message: string;
}

type ExecutionErrorData =
  | { contextKind: 'api'; type: string; message: string; description: string | null; node: string | null; httpCode?: number; errorCode?: string }
  | { contextKind: 'cancellation'; type: string; message: string; description: string | null; node: string | null; reason?: string }
  | { contextKind: 'expression'; type: string; message: string; description: string | null; node: string | null; expression?: string; parameter?: string; itemIndex?: number }
  | { contextKind: 'other'; type: string; message: string; description: string | null; node: string | null };
```

**Rationale**: Derived directly from the PRD's "Upstream Interface Summary" section and INDEX.md's `ExecutionErrorData` definition. Includes only fields diagnostics actually reads.

## Phase 1: Design & Contracts

### Data Model

See [data-model.md](data-model.md) for the complete data model.

### Contracts

See [contracts/synthesize.md](contracts/synthesize.md) for the public API contract.

### Module Design

#### `status.ts` — Status Determination

Evaluates conditions in priority order (first match wins):
1. Any guardrail decision has `action: 'refuse'` → `'skipped'`
2. No error-severity findings from any layer → `'pass'`
3. At least one error-severity finding or execution error → `'fail'`
4. Infrastructure failure → `'error'`

Input: static findings, execution data, guardrail decisions.
Output: `DiagnosticSummary['status']`.

#### `errors.ts` — Error Extraction & Classification

Two functions:
- `classifyStaticFindings(findings: StaticFinding[]): ClassifiedError[]` — maps error-severity static findings through the kind→classification lookup.
- `classifyExecutionErrors(data: ExecutionData): ClassifiedError[]` — two-tier classification: constructor name first, then contextKind fallback.

One ordering function:
- `orderErrors(errors: ClassifiedError[]): DiagnosticError[]` — sorts by source (execution first), then severity, then executionIndex.

Raises on `opaque-boundary` findings with `severity: 'error'` (unexpected input).

#### `annotations.ts` — Node Annotation Assignment

For each node in `ResolvedTarget.nodes`:
1. If node has execution data with pin data source → `'mocked'` *(deferred to US3; US1 implements validated/trusted/skipped only)*
2. If node was actively analyzed/executed in this run → `'validated'`
3. If node is in `TrustState.nodes` and unchanged → `'trusted'`
4. Otherwise → `'skipped'`

Input: resolved target, trust state, execution data, change set (optional).
Output: `NodeAnnotation[]`.

#### `path.ts` — Path Reconstruction

Collects `(nodeName, NodeExecutionResult)` pairs from execution data, sorts by `executionIndex`, emits `PathNode[]`. Raises if structural data is missing. Returns `null` when execution data is null.

#### `hints.ts` — Hint Collection

Collects:
- Static findings with `severity: 'warning'` → `DiagnosticHint` with `severity: 'warning'`
- Execution runtime hints → `DiagnosticHint` with `severity: 'info'`
- Redacted execution nodes → `DiagnosticHint` with `severity: 'danger'`
- Static-only run hint → single info hint noting execution may catch additional issues

No deduplication.

#### `synthesize.ts` — Top-Level Synthesis

The public API. Assembles all sub-components:

```
synthesize(input: SynthesisInput): DiagnosticSummary
```

Calls status, errors, path, annotations, and hints modules in sequence. Sets `evidenceBasis` based on which layers provided data. Attaches `schemaVersion: 1`, capabilities, and metadata.

This is the only function exported from the diagnostics subsystem. All other modules are internal.
