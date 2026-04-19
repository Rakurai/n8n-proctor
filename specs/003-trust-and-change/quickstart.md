# Quickstart: Trust & Change Subsystem

**Feature**: 003-trust-and-change
**Date**: 2026-04-18

## Prerequisites

- Node.js 20+
- `npm install` in project root (installs existing dependencies)
- New dependency: `npm install json-stable-stringify` + `npm install -D @types/json-stable-stringify`

## Development Workflow

### 1. Build and test

```bash
npm run build        # TypeScript compilation
npm test             # Run all tests (vitest)
npm run lint         # Biome lint/format check
```

### 2. Run trust subsystem tests only

```bash
npx vitest run test/trust/
```

### 3. Implementation order

The trust subsystem has internal dependencies. Implement in this order:

1. **`src/trust/errors.ts`** — Error classes (no dependencies)
2. **`src/trust/hash.ts`** — Content hashing (depends on `json-stable-stringify`, `crypto`)
3. **`src/trust/change.ts`** — Change detection (depends on `hash.ts`)
4. **`src/trust/trust.ts`** — Trust derivation, invalidation, queries (depends on `hash.ts`, shared types)
5. **`src/trust/persistence.ts`** — Read/write trust state (depends on `zod`, `trust.ts`)
6. **`src/index.ts`** — Add trust exports to public API

### 4. Key files to understand first

| File | Why |
|------|-----|
| `src/types/trust.ts` | All shared trust types — TrustState, NodeChangeSet, etc. |
| `src/types/graph.ts` | WorkflowGraph, GraphNode, Edge — the input data structure |
| `src/types/identity.ts` | NodeIdentity branded type and constructor |
| `src/static-analysis/graph.ts` | How WorkflowGraph is built (upstream dependency) |

### 5. Test fixtures

Existing workflow fixtures in `test/fixtures/workflows/` can be reused for trust tests:
- `linear-simple.ts` — simple A→B→C chain (good for invalidation BFS tests)
- `branching-if.ts` — If/Switch branching (good for selective invalidation)
- `code-node-opaque.ts` — Code node (good for opaque boundary trust)
- `data-loss-bug.ts` — Shape-replacing pattern (good for change classification)

New fixtures may be needed for:
- Two-snapshot pairs (previous and current versions of the same workflow)
- Rename detection scenarios (removed+added with identical content)
- Connection-only changes (same nodes, different edges)
