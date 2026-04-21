# Data Model: Slice Semantics Consolidation and Orchestrator Decompression

**Feature**: 017-slice-orchestrator-refactor  
**Date**: 2026-04-20

## Overview

This feature introduces no new data entities. It refactors existing code structure by extracting shared functions and decomposing a large function. The "data model" here describes the function signatures and their relationships.

## Shared Traversal Primitives

### `traverse()`

The core directional graph walk with configurable stopping.

**Inputs**:
- `startNodes: NodeIdentity[]` — seed nodes to begin traversal from
- `graph: WorkflowGraph` — the workflow graph to walk
- `direction: 'forward' | 'backward'` — which edge map to follow
- `shouldStop: (node: NodeIdentity) => boolean` — predicate controlling when to stop propagating (node is added to result but not expanded further)

**Outputs**:
- `visited: Set<NodeIdentity>` — all nodes reached during traversal (including seeds and boundary stops)
- `boundaryNodes: NodeIdentity[]` — nodes where traversal stopped (either by predicate or graph terminal)

**Behavior**:
- Stack-based DFS (matching current resolve.ts behavior)
- Cycle-safe via visited set
- Stops expanding (but includes) nodes where `shouldStop` returns true
- Stops expanding (and includes) nodes with no edges in the given direction (graph terminals)

### `classifyBoundaries()`

Derives entry and exit points from a node set within a graph.

**Inputs**:
- `nodes: Set<NodeIdentity>` — the node set to classify
- `graph: WorkflowGraph` — the workflow graph for edge lookup

**Outputs**:
- `entryPoints: NodeIdentity[]` — nodes with no incoming edges from within the set, or with no incoming edges at all
- `exitPoints: NodeIdentity[]` — nodes with no outgoing edges, or with at least one outgoing edge to a node outside the set

**Behavior**:
- Single pass over the node set
- Uses `graph.forward` and `graph.backward` for edge lookup
- No deduplication needed (each node classified exactly once)

## Phase Helper Signatures

### `runStaticAnalysis()`

**Inputs**:
- `graph: WorkflowGraph`
- `paths: PathDefinition[]`
- `resolvedTarget: ResolvedTarget`
- `expressionRefs: ExpressionReference[]`
- `deps: Pick<OrchestratorDeps, 'detectDataLoss' | 'checkSchemas' | 'validateNodeParams' | 'traceExpressions'>`

**Output**: `StaticFinding[]` (deduplicated)

### `runExecution()`

**Inputs**:
- `n8nWorkflowId: string`
- `workflowId: string`
- `graph: WorkflowGraph`
- `resolvedTarget: ResolvedTarget`
- `activeTrust: TrustState`
- `request: Pick<ValidationRequest, 'callTool' | 'pinData'>`
- `deps: Pick<OrchestratorDeps, 'detectCapabilities' | 'constructPinData' | 'executeSmoke'>`

**Output**: `{ executionData: ExecutionData | null, executionErrors: ExecutionError[], executionId: string | null, capabilities: AvailableCapabilities, usedPinData: PinData | null }`

### `buildSynthesis()`

**Inputs**:
- `staticFindings: StaticFinding[]`
- `executionData: ExecutionData | null`
- `executionErrors: ExecutionError[]`
- `activeTrust: TrustState`
- `guardrailDecisions: GuardrailDecision[]`
- `resolvedTarget: ResolvedTarget`
- `capabilities: AvailableCapabilities`
- `meta: ValidationMeta`
- `deps: Pick<OrchestratorDeps, 'synthesize'>`

**Output**: `DiagnosticSummary`

### `persistResults()`

**Inputs**:
- `summary: DiagnosticSummary`
- `activeTrust: TrustState`
- `graph: WorkflowGraph`
- `workflowId: string`
- `tool: 'validate' | 'test'`
- `runId: string`
- `fixtureHash: string | null`
- `paths: PathDefinition[]`
- `resolvedTarget: ResolvedTarget`
- `usedPinData: PinData | null`
- `deps: Pick<OrchestratorDeps, 'recordValidation' | 'persistTrustState' | 'saveSnapshot'>`

**Output**: `void` (side effects: writes trust state, snapshot, cached pin data)

## Relationships

```
interpret() ──calls──→ resolveTarget()     ──uses──→ traverse(), classifyBoundaries()
           ──calls──→ evaluate()           ──uses──→ computeNarrowedTarget() ──uses──→ traverse(), classifyBoundaries()
           ──calls──→ runStaticAnalysis()
           ──calls──→ runExecution()
           ──calls──→ buildSynthesis()
           ──calls──→ persistResults()
```

## Unchanged Types

No modifications to any types in `src/types/`. The refactor changes function boundaries, not data shapes. `SliceDefinition`, `PathDefinition`, `WorkflowGraph`, `DiagnosticSummary`, `EvaluationInput`, `OrchestratorDeps`, and `ValidationRequest` all remain exactly as they are.
