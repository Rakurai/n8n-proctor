# Quickstart: Execution Subsystem

**Feature**: 005-execution-subsystem

## What This Subsystem Does

The execution subsystem connects n8n-check to a running n8n instance. It constructs pin data to mock trusted/external nodes, triggers bounded or whole-workflow executions, polls for results, and extracts per-node execution data for diagnostic synthesis.

## Key Concepts

- **Pin data**: Mocked output for nodes that should not execute (triggers, trusted boundaries, external API nodes). Sourced from a 4-tier priority: agent fixtures > cached artifacts > execution history > error.
- **Bounded execution**: REST API with `destinationNode` — executes only the subgraph between trigger and destination. Primary validation mode.
- **Smoke test**: MCP `test_workflow` — runs entire workflow with pin data. Secondary validation mode.
- **Two-phase polling**: Status-only checks (lightweight) with exponential backoff, then a single filtered data retrieval call.

## Module Map

| File | Responsibility |
|------|---------------|
| `types.ts` | Internal types: PinData, ExecutionResult, ExecutionData, etc. |
| `errors.ts` | Typed errors: infrastructure, precondition, configuration |
| `pin-data.ts` | Pin data construction with 4-tier sourcing and traceability |
| `rest-client.ts` | REST API client for bounded execution and workflow checks |
| `mcp-client.ts` | MCP client for smoke tests, result retrieval, schema discovery |
| `poll.ts` | Two-phase polling with exponential backoff |
| `results.ts` | Per-node result extraction from raw execution data |
| `capabilities.ts` | Environment capability detection |

## Usage Flow

```
1. detectCapabilities(workflowId)     → know what's available
2. constructPinData(graph, boundaries) → build pin data with traceability
3. executeBounded(id, dest, pinData)   → trigger bounded execution
4. pollForCompletion(execId, wfId, nodes) → poll + retrieve filtered results
```

Or for smoke tests:
```
1. detectCapabilities(workflowId)
2. constructPinData(graph, boundaries)
3. executeSmoke(id, pinData)           → synchronous, returns when done
4. getExecutionResult(execId, nodes)   → retrieve per-node data
```

## Dependencies

- **Upstream**: `WorkflowGraph` and `NodeIdentity` from `src/types/`, trusted boundaries from Phase 3
- **Downstream**: `ExecutionData` consumed by Phase 6 (Diagnostics), orchestrated by Phase 7 (Request Interpretation)
- **External**: n8n REST API (required for bounded execution), n8n MCP tools (required for smoke tests, optional for polling/data retrieval)

## Testing

- Unit tests: mock HTTP/MCP responses. No n8n instance needed.
- Integration tests: gated behind `N8N_TEST_HOST` env var. Require a running n8n instance with test workflows deployed.
