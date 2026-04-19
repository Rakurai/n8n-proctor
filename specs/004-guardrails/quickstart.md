# Quickstart: Guardrail Evaluation Subsystem

**Feature**: 004-guardrails

## What This Subsystem Does

The guardrail evaluator gates every validation request through a fixed evaluation pipeline. Given a validation request, trust state, change set, and workflow graph, it returns a decision: proceed, warn, narrow, redirect, or refuse — with evidence explaining why.

## Development Setup

No additional setup required. The guardrails subsystem has no external dependencies. It uses only project-internal types and functions that already exist.

```bash
# Build the project
npm run build

# Run all tests
npm test

# Run guardrail tests only
npx vitest run test/guardrails/

# Type-check
npm run typecheck
```

## Key Files

| File | Purpose |
|------|---------|
| `src/guardrails/evaluate.ts` | Main pipeline — call `evaluate(input)` |
| `src/guardrails/narrow.ts` | Narrowing algorithm |
| `src/guardrails/redirect.ts` | Execution → static redirect logic |
| `src/guardrails/rerun.ts` | DeFlaker warn (prior run context + relevance check) |
| `src/guardrails/evidence.ts` | Evidence assembly |
| `src/guardrails/types.ts` | Internal types + threshold constants |
| `test/guardrails/evaluate.test.ts` | Pipeline scenario tests |

## Usage Example

```typescript
import { evaluate } from './guardrails/evaluate.js';

const decision = evaluate({
  target: { kind: 'workflow' },
  targetNodes: new Set([/* all node identities */]),
  layer: 'both',
  force: false,
  trustState,      // from trust subsystem
  changeSet,       // from change detection
  graph,           // from static analysis
  currentHashes,   // from trust hash computation
  priorSummary,    // cached DiagnosticSummary or null
  expressionRefs,  // from traceExpressions()
  llmValidationRequested: false, // set by orchestrator if agent requests LLM output validation
});

switch (decision.action) {
  case 'proceed':  // run validation as requested
  case 'warn':     // run validation, but note the warning
  case 'narrow':   // use decision.narrowedTarget instead
  case 'redirect': // use decision.redirectedLayer instead
  case 'refuse':   // skip validation, report to agent
}
```

## Upstream Dependencies

| Module | What's Used | Why |
|--------|-------------|-----|
| `src/types/guardrail.ts` | `GuardrailDecision`, `GuardrailEvidence` | Output types |
| `src/types/trust.ts` | `TrustState`, `NodeChangeSet`, `ChangeKind` | Input types |
| `src/types/graph.ts` | `WorkflowGraph`, `GraphNode`, `NodeClassification` | Graph traversal |
| `src/types/target.ts` | `ValidationTarget`, `ValidationLayer` | Target types |
| `src/types/diagnostic.ts` | `DiagnosticSummary`, `ErrorClassification` | Prior run context |
| `src/types/identity.ts` | `NodeIdentity` | Node keys |
| `src/types/slice.ts` | `SliceDefinition` | Narrowed target output |
| `src/static-analysis/expressions.ts` | `traceExpressions()` | Expression reference data |
| `src/trust/trust.ts` | `isTrusted()`, `getRerunAssessment()` | Trust queries |
| `src/trust/hash.ts` | `computeContentHash()` | Content hash computation |

## Testing Approach

Tests are organized as pipeline scenarios, not isolated per-rule unit tests. Each test exercises a distinct behavior through the full `evaluate()` function:

1. **Force bypass** — force=true returns proceed regardless of conditions
2. **Empty target** — zero nodes returns refuse (non-overridable)
3. **Identical rerun** — all trusted + unchanged + matching fixture → refuse (overridable)
4. **Redirect** — structurally analyzable changes → redirect to static
5. **Redirect blocked** — opaque/shape-replacing node → no redirect
6. **Narrowing** — broad target with narrow changes → narrowed target
7. **DeFlaker warn** — prior failure on unrelated path → warn
8. **Broad target warn** — target covers >70% of workflow → warn
9. **Proceed** — no guardrail triggered → proceed with full evidence

Test fixtures reuse existing workflow fixtures from `test/fixtures/workflows/` and build trust states and change sets programmatically.
