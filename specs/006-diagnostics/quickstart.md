# Quickstart: Diagnostic Synthesis

## What this subsystem does

The diagnostics subsystem takes evidence from all other subsystems (static findings, execution results, trust state, guardrail decisions) and produces a single `DiagnosticSummary` — the canonical output of every validation run.

## Key entry point

```typescript
import { synthesize } from './diagnostics/synthesize.js';

const summary = synthesize({
  staticFindings,    // StaticFinding[] from static analysis
  executionData,     // ExecutionData | null from execution
  trustState,        // TrustState from trust subsystem
  guardrailDecisions, // GuardrailDecision[] from guardrails
  resolvedTarget,    // ResolvedTarget describing what's in scope
  capabilities,      // AvailableCapabilities
  meta,              // ValidationMeta (runId, timestamp, etc.)
});
```

## Internal modules

| Module | Purpose |
|--------|---------|
| `status.ts` | Determines top-level status: pass/fail/error/skipped |
| `errors.ts` | Extracts and classifies errors from static findings and execution data |
| `annotations.ts` | Assigns per-node annotations (validated/trusted/mocked/skipped) |
| `path.ts` | Reconstructs execution path from execution data |
| `hints.ts` | Collects hints from warnings, runtime hints, and redacted data |
| `synthesize.ts` | Assembles everything into DiagnosticSummary |
| `types.ts` | Internal types (SynthesisInput, ClassifiedError, ExecutionData interfaces) |

## Running tests

```bash
npm test -- test/diagnostics/
```

All tests use fixture data. No n8n instance required.
