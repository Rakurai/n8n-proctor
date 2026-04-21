# Research: 018-exec-ownership-deps-reshape

**Date**: 2026-04-20

## R1: Execution Preparation Extraction Boundary

**Decision**: Extract lines 178-286 of `interpret.ts` into a new `src/execution/prepare.ts` module that exposes a single `prepareExecution()` function.

**Rationale**: The orchestrator currently owns ~100 lines of execution mechanics: capability detection, trusted boundary calculation, cached pin data loading, MCP tier-3 preparation, `constructPinData` assembly, `executeSmoke` invocation, and `getExecution` data retrieval. This logic belongs to the execution subsystem. The extraction boundary is clean: the orchestrator provides context (graph, trust state, resolved target, request), and the execution subsystem returns an execution result with data.

**Alternatives considered**:
- **Keep in orchestrator, just simplify**: Rejected — the PRD explicitly requires execution subsystem ownership, not just code tidying.
- **Create an ExecutionService class**: Rejected — a plain function with injected dependencies is simpler and consistent with the existing module pattern (constitution III: no over-engineering).
- **Split into multiple smaller functions in execution/**: Rejected — the orchestrator still needs a single entry point. Multiple functions would fragment the preparation flow without improving testability.

## R2: Subsystem Dependency Grouping Shape

**Decision**: Replace the flat `OrchestratorDeps` interface with a composite type containing 7 subsystem groups:

```
OrchestratorDeps = {
  parsing: ParsingDeps;     // parseWorkflowFile, buildGraph
  trust: TrustDeps;         // loadTrustState, persistTrustState, computeChangeSet, invalidateTrust, recordValidation
  guardrails: GuardrailDeps; // evaluate
  analysis: AnalysisDeps;   // traceExpressions, detectDataLoss, checkSchemas, validateNodeParams
  execution: ExecutionDeps;  // prepareExecution (replaces executeSmoke + constructPinData + detectCapabilities)
  diagnostics: DiagnosticsDeps; // synthesize
  snapshots: SnapshotDeps;  // loadSnapshot, saveSnapshot
}
```

**Internal deps (not on OrchestratorDeps)**: `prepareExecution()` takes its own `ExecutionInternalDeps` parameter for testability. This is a separate type from the orchestrator-facing `ExecutionDeps`:

```
ExecutionInternalDeps = {
  constructPinData, executeSmoke, detectCapabilities,
  readCachedPinData, writeCachedPinData,
  preparePinData, getExecution, generateSampleFromSchema
}
```

**Rationale**: Grouping mirrors the 7 subsystem boundaries already documented in `CLAUDE.md`. The orchestrator already organizes its steps by subsystem (comments in `interpret.ts`). Grouped contracts make it possible to mock one subsystem without constructing the full bag. 7 groups (not 5) because parsing and snapshots are distinct subsystem responsibilities.

**Alternatives considered**:
- **5 groups as PRD suggested (trust, analysis, execution, diagnostics, snapshots)**: Rejected — parsing is its own subsystem, and guardrails is distinct from analysis. 7 matches the actual architecture.
- **Keep flat interface, just rename fields**: Rejected — doesn't achieve the goal of subsystem-scoped doubles in tests.
- **Use DI container (tsyringe, inversify)**: Rejected — adds a dependency for a problem solved by plain types (constitution: dependency sprawl).

## R3: Execution Preparation API Input/Output Shape

**Decision**: The new `prepareExecution()` function takes an `ExecutionPreparationInput` and returns a `Promise<ExecutionPreparationResult>`:

**Input**:
- `graph: WorkflowGraph` — the parsed workflow graph
- `trustState: TrustState` — active trust state after invalidation
- `resolvedTarget: ResolvedTarget` — resolved target nodes
- `request: { n8nWorkflowId: string; callTool?: McpToolCaller; pinData: PinData | null; workflowId: string }` — execution-specific request fields
- `internalDeps: ExecutionInternalDeps` — internal execution subsystem dependencies (constructPinData, executeSmoke, detectCapabilities, readCachedPinData, preparePinData, getExecution, generateSampleFromSchema). This is distinct from the orchestrator-facing `ExecutionDeps` which exposes only `prepareExecution`.

**Output**:
- `executionData: ExecutionData | null`
- `executionErrors: ExecutionError[]`
- `usedPinData: PinData | null`
- `capabilities: AvailableCapabilities`
- `executionId: string | null`

**Rationale**: The input is everything the execution subsystem needs from the orchestrator's resolved state. The output is everything the orchestrator needs to continue to synthesis and trust update. This boundary is minimal — no excess data flows in either direction.

**Alternatives considered**:
- **Pass the full `ValidationRequest`**: Rejected — leaks orchestrator concerns into execution (e.g., `workflowPath`, `target`, `tool`). The execution subsystem should only see execution-relevant data.
- **Return a `DiagnosticSummary` directly**: Rejected — execution doesn't own synthesis. Diagnostics is a separate subsystem.

## R4: Structured Equality for Trust Change Classification

**Decision**: Create a `structuredEqual(a: unknown, b: unknown): boolean` helper in `src/trust/change.ts` (private, not exported). Replace the 3 `JSON.stringify(x) !== JSON.stringify(y)` comparisons in `classifyChanges()` and `executionSettingsChanged()`.

**Rationale**: `JSON.stringify` comparisons are order-dependent for object keys, which means `{a:1, b:2}` !== `{b:2, a:1}`. While this hasn't caused bugs (n8n serialization is stable), the project already imports `json-stable-stringify` for the pin data hashing in `interpret.ts`. A local structured equality function using the existing `json-stable-stringify` dependency provides deterministic comparison without a new dependency. However, since the comparison objects are small and their key order is controlled by n8n serialization, a simpler approach is a thin wrapper: `(a, b) => stringify(a) === stringify(b)` using the existing `json-stable-stringify` import.

**Alternatives considered**:
- **Use `node:util.isDeepStrictEqual()`**: Considered — built-in, no dependency. But it doesn't handle `undefined` vs missing keys the same way as JSON serialization, which could change behavior.
- **Use `structuredClone` + comparison**: Rejected — more complex, no benefit.
- **Keep `JSON.stringify`**: Rejected — PRD explicitly identifies this as a confirmed finding to fix.

## R5: Snapshot Double-Cast Replacement

**Decision**: Create a lightweight `SnapshotAST` type that captures only the fields needed by deserialized snapshots (`nodes` with execution settings, `connections` as empty array). The `deserializeGraph()` function returns a `WorkflowGraph` where `ast` uses this explicit type instead of `as unknown as WorkflowAST`.

**Rationale**: The double-cast `{ nodes: astNodes, connections: [] } as unknown as WorkflowAST` exists because deserialized snapshots don't have the full AST — they only need a subset for `computeContentHash` and `executionSettingsChanged`. An explicit stub type makes the contract honest. The `WorkflowGraph.ast` field type needs to accommodate both full ASTs (from parsing) and snapshot stubs. A union type `WorkflowAST | SnapshotAST` or a broader shared type solves this.

**Alternatives considered**:
- **Make `WorkflowGraph.ast` optional**: Rejected — would require null checks throughout, adding defensive code.
- **Reconstruct full `WorkflowAST` from snapshot data**: Rejected — the snapshot intentionally excludes full AST data to stay lightweight; reconstructing it would add complexity with no benefit.
- **Use a type predicate to narrow at usage sites**: Rejected — adds runtime checks for a compile-time problem.

**Implementation note**: The `WorkflowAST` type comes from `@n8n-as-code/transformer` (external dependency). We cannot modify it. The solution is to widen `WorkflowGraph.ast` to accept a minimal subset type. Since `computeContentHash` and other consumers only access `ast.nodes[].propertyName`, `.retryOnFail`, `.executeOnce`, `.onError`, the subset type needs only those fields.

## R6: Dead Field Removal Impact

**Decision**: Remove `n8nHost` and `n8nApiKey` from `ValidationRequest`. Pass these as direct parameters to `createServer()` only (where they're actually used for the availableInMCP workaround).

**Rationale**: Grep confirms these fields are:
- Defined in `orchestrator/types.ts:57-59`
- Set in `mcp/server.ts:154-155` when constructing `ValidationRequest`
- Never read in `orchestrator/interpret.ts`
- Never read in `cli/`

The MCP server already receives them as `createServer()` parameters. They flow onto `ValidationRequest` unnecessarily. After removal, if the availableInMCP pre-flight fix needs them, it already has them from `createServer()`'s closure.

**Alternatives considered**:
- **Move to execution subsystem input**: Rejected — the execution subsystem doesn't use them either; they're for a pre-flight REST API call in the MCP server layer.
- **Keep but mark deprecated**: Rejected — constitution says no compatibility shims.

## R7: TRUST_PRESERVING Constant Consolidation

**Decision**: Create `src/trust/constants.ts` with the canonical `TRUST_PRESERVING` definition. Import it in both `src/trust/trust.ts` and `src/guardrails/evidence.ts`.

**Rationale**: The constant is identical in both files (`new Set(['metadata-only'])`). A shared constants file in the trust subsystem is the natural home since it defines trust semantics. The guardrails subsystem imports it because evidence assembly needs to know which changes are trust-preserving.

**Alternatives considered**:
- **Put in `src/types/trust.ts`**: Rejected — it's a runtime value, not a type. Types files should contain only type definitions.
- **Put in `src/guardrails/evidence.ts` and import in trust**: Rejected — trust owns the concept of trust-preserving changes.
- **Inline in both files with a comment "must match"**: Rejected — the PRD explicitly flags this as duplication to eliminate.
