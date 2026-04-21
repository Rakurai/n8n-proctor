# Data Model: 018-exec-ownership-deps-reshape

**Date**: 2026-04-20

This feature is a structural refactoring — no new persistent data entities are introduced. The changes affect in-memory type definitions and function signatures. This document captures the reshaped type contracts.

## Changed Entities

### OrchestratorDeps (reshaped from flat to grouped)

**Before**: Single flat interface with 17 methods.

**After**: Composite interface with 7 subsystem groups.

| Group | Fields | Owner Subsystem |
| ----- | ------ | --------------- |
| `parsing` | `parseWorkflowFile`, `buildGraph` | `src/static-analysis/` |
| `trust` | `loadTrustState`, `persistTrustState`, `computeChangeSet`, `invalidateTrust`, `recordValidation` | `src/trust/` |
| `guardrails` | `evaluate` | `src/guardrails/` |
| `analysis` | `traceExpressions`, `detectDataLoss`, `checkSchemas`, `validateNodeParams` | `src/static-analysis/` |
| `execution` | `prepareExecution` | `src/execution/` |
| `diagnostics` | `synthesize` | `src/diagnostics/` |
| `snapshots` | `loadSnapshot`, `saveSnapshot` | `src/orchestrator/` |

**Note**: The execution group collapses from 3 individual functions (`executeSmoke`, `constructPinData`, `detectCapabilities`) to 1 preparation function (`prepareExecution`). The individual functions become internal execution-subsystem implementation details, injected via `ExecutionInternalDeps` (see below).

### ExecutionInternalDeps (new — internal to execution subsystem)

Internal dependency type for `prepareExecution()`. Distinct from the orchestrator-facing `ExecutionDeps` (which exposes only `prepareExecution`). Injected for testability.

| Field | Type | Source Module |
| ----- | ---- | ------------- |
| `constructPinData` | `(graph, boundaries, fixtures?, priorArtifacts?, mcpPinData?) => PinDataResult` | `src/execution/pin-data.ts` |
| `executeSmoke` | `(workflowId, pinData, callTool, triggerNodeName?) => Promise<ExecutionResult>` | `src/execution/mcp-client.ts` |
| `detectCapabilities` | `(options?) => Promise<DetectedCapabilities>` | `src/execution/capabilities.ts` |
| `readCachedPinData` | `(workflowId, nodeContentHash) => Promise<PinDataItem[] \| undefined>` | `src/execution/pin-data.ts` |
| `writeCachedPinData` | `(workflowId, nodeContentHash, items) => Promise<void>` | `src/execution/pin-data.ts` |
| `preparePinData` | `(workflowId, callTool) => Promise<PreparePinDataResult>` | `src/execution/mcp-client.ts` |
| `getExecution` | `(workflowId, executionId, callTool, options?) => Promise<...>` | `src/execution/mcp-client.ts` |
| `generateSampleFromSchema` | `(schema) => Record<string, unknown>` | `src/execution/pin-data.ts` |

### ValidationRequest (dead fields removed)

**Removed fields**:
- `n8nHost?: string` — never consumed by orchestrator
- `n8nApiKey?: string` — never consumed by orchestrator

**Retained fields**: `workflowPath`, `target`, `tool`, `force`, `pinData`, `callTool`

### ExecutionPreparationInput (new)

| Field | Type | Source |
| ----- | ---- | ------ |
| `graph` | `WorkflowGraph` | Orchestrator step 1 |
| `trustState` | `TrustState` | Orchestrator step 2-3 |
| `resolvedTarget` | `ResolvedTarget` | Orchestrator step 4 |
| `n8nWorkflowId` | `string` | From parsed `graph.ast.metadata.id` |
| `callTool` | `McpToolCaller \| undefined` | From `ValidationRequest.callTool` |
| `pinData` | `PinData \| null` | From `ValidationRequest.pinData` |
| `workflowId` | `string` | From `deriveWorkflowId()` |

### ExecutionPreparationResult (new)

| Field | Type | Consumed By |
| ----- | ---- | ----------- |
| `executionData` | `ExecutionData \| null` | Diagnostics synthesis |
| `executionErrors` | `Array<{type, message, description, node, classification, context}>` | Diagnostics synthesis |
| `usedPinData` | `PinData \| null` | Trust update (pin data caching) |
| `capabilities` | `AvailableCapabilities` | Diagnostics synthesis |
| `executionId` | `string \| null` | Diagnostics meta |

### SnapshotAST (new subset type)

Minimal stub type for deserialized snapshots. Replaces the `as unknown as WorkflowAST` double-cast.

| Field | Type | Notes |
| ----- | ---- | ----- |
| `nodes` | `Array<{ propertyName: string; position: [number, number]; retryOnFail: boolean; executeOnce: boolean; onError: string \| null }>` | Only fields accessed by `computeContentHash` and `executionSettingsChanged` |
| `connections` | `[]` | Always empty for snapshot-reconstructed graphs |

`WorkflowGraph.ast` type widens to `WorkflowAST | SnapshotAST`.

## No Persistent Storage Changes

- Trust state files: unchanged format
- Snapshot files: unchanged format
- Pin data cache files: unchanged format
- No migration needed
