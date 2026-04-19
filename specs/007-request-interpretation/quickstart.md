# Quickstart: Request Interpretation

**Phase**: 1 — Design & Contracts
**Date**: 2026-04-19

## What This Feature Does

The request interpretation subsystem is the orchestrator — it takes a `ValidationRequest` from the agent (via MCP/CLI) and coordinates all five internal subsystems to produce a `DiagnosticSummary`. It handles target resolution (figuring out which nodes to validate), path selection (choosing execution routes through the workflow), guardrail routing (letting guardrails shape or refuse the request), and trust/snapshot management.

## How to Use It

```typescript
import { interpret } from './orchestrator/interpret.js';
// Production deps factory is created by the MCP/CLI surface (Phase 8).
// For testing, construct OrchestratorDeps manually with mocked subsystems.

const deps: OrchestratorDeps = { /* subsystem functions */ };

const summary = await interpret({
  workflowPath: './workflows/my-workflow.ts',
  target: { kind: 'changed' },
  layer: 'static',
  force: false,
  pinData: null,
  destinationNode: null,
  destinationMode: 'inclusive',
}, deps);

// summary is always a DiagnosticSummary
console.log(summary.status); // 'pass' | 'fail' | 'error' | 'skipped'
```

## Key Design Decisions

1. **Always returns DiagnosticSummary**: Never throws for user-facing errors. Infrastructure failures produce `status: 'error'` diagnostics.
2. **Dependency injection via object**: All subsystem calls are injected, making the pipeline fully testable with mocked subsystems.
3. **Sequential pipeline**: 10 steps in strict order. No concurrent subsystem calls.
4. **Trust updates only on pass**: Failed or skipped validations don't modify trust state or save snapshots.

## File Layout

| File | Responsibility |
|------|---------------|
| `src/orchestrator/types.ts` | `ValidationRequest`, `InterpretedRequest`, `OrchestratorDeps`, snapshot types |
| `src/orchestrator/resolve.ts` | Target resolution: `AgentTarget` → `ResolvedTarget` + `SliceDefinition` |
| `src/orchestrator/path.ts` | Path enumeration, 4-tier ranking, additional-greedy selection |
| `src/orchestrator/interpret.ts` | The 10-step pipeline (main entry point) |
| `src/orchestrator/snapshots.ts` | Snapshot save/load to `.n8n-vet/snapshots/` |

## Testing Strategy

- **Unit tests**: `resolve.test.ts` (target resolution per kind), `path.test.ts` (ranking, enumeration cap, additional-greedy)
- **Integration tests**: `interpret.test.ts` (full pipeline with mocked subsystems — tests each guardrail action, static-only, both-layer, error conditions)
- **Snapshot tests**: `snapshots.test.ts` (round-trip serialization)
- **No n8n instance needed**: Execution subsystem is mocked in all tests
