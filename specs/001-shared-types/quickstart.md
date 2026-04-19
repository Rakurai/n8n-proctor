# Quickstart: Shared Cross-Subsystem Types

**Feature**: 001-shared-types | **Date**: 2026-04-18

## What This Phase Delivers

TypeScript type definitions for all cross-subsystem contracts defined in `docs/reference/INDEX.md`. After this phase, every downstream subsystem (static analysis, trust, guardrails, execution, diagnostics, orchestration) can import and build against these types.

## Prerequisites

- Node.js 20+
- `npm install` completed (installs `@n8n-as-code/transformer` and dev dependencies)

## Verify Types Compile

```bash
npm run typecheck
```

Expected: zero errors.

## Import Types

Internal project code imports directly from source files (no barrel):

```typescript
import type { WorkflowGraph, GraphNode, Edge, NodeClassification } from './types/graph.js';
import type { NodeIdentity } from './types/identity.js';
import type { SliceDefinition, PathDefinition } from './types/slice.js';
import type { ValidationTarget, AgentTarget, ValidationLayer } from './types/target.js';
import type { TrustState, NodeChangeSet, ChangeKind } from './types/trust.js';
import type { GuardrailDecision, GuardrailAction } from './types/guardrail.js';
import type { DiagnosticSummary, DiagnosticError } from './types/diagnostic.js';
```

For the `NodeIdentity` factory (runtime import):

```typescript
import { nodeIdentity } from './types/identity.js';

const id = nodeIdentity('myNodeName');
```

## Run Type-Level Tests

```bash
npm test
```

Type-level tests verify discriminated union narrowing and branded type safety.

## File Layout

```
src/types/
├── graph.ts         # WorkflowGraph, GraphNode, Edge, NodeClassification
├── identity.ts      # NodeIdentity branded type + factory
├── slice.ts         # SliceDefinition, PathDefinition, PathEdge
├── target.ts        # AgentTarget, ValidationTarget, ValidationLayer
├── trust.ts         # TrustState, NodeTrustRecord, NodeChangeSet, NodeModification, ChangeKind
├── guardrail.ts     # GuardrailDecision, GuardrailAction, GuardrailEvidence
└── diagnostic.ts    # DiagnosticSummary, DiagnosticError, and all sub-types
```

## Key Design Decisions

1. **No barrel file** in `src/types/` — import from source files directly (per CODING.md)
2. **Branded `NodeIdentity`** — plain strings cannot be assigned without the factory function
3. **Discriminated unions** — narrow on `action`, `classification`, or `kind` fields
4. **`Map` not `Record`** — preserves branded key types and insertion order
5. **`WorkflowAST` imported** — from `@n8n-as-code/transformer`, not redefined locally
