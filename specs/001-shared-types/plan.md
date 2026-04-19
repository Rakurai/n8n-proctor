# Implementation Plan: Shared Cross-Subsystem Types

**Branch**: `001-shared-types` | **Date**: 2026-04-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-shared-types/spec.md`

## Summary

Transcribe all cross-subsystem type definitions from `docs/reference/INDEX.md` into TypeScript source files under `src/types/`. This is a pure type-definition phase with no runtime code except a `NodeIdentity` factory function. All types must compile under strict TypeScript, discriminated unions must narrow correctly, and the branded `NodeIdentity` type must reject plain string assignment. Types are imported directly from their source files (no barrel re-exports per CODING.md).

## Technical Context

**Language/Version**: TypeScript 5.7+, Node.js 20+, ESM (`"type": "module"`)
**Primary Dependencies**: `@n8n-as-code/transformer` (provides `WorkflowAST`, `NodeAST`, `ConnectionAST`)
**Storage**: N/A (pure type definitions)
**Testing**: vitest (type-level assertion tests only)
**Target Platform**: Node.js library (ESM)
**Project Type**: Library (standalone package)
**Performance Goals**: N/A (compile-time only)
**Constraints**: `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`
**Scale/Scope**: ~30 type definitions across 7 source files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Fail-Fast, No Fallbacks | Pass | NodeIdentity factory throws a typed error on empty string (spec FR-004). No fallback behavior. |
| II. Contract-Driven Boundaries | Pass | Types ARE the contracts. Discriminated unions over optional fields per spec. |
| III. No Over-Engineering | Pass | No abstractions — direct type transcription from INDEX.md. No single-implementor interfaces. |
| IV. Honest Code Only | Pass | No stubs or placeholder implementations. Types are complete or absent. |
| V. Minimal, Meaningful Tests | Pass | Type-level assertion tests only. No trivial tests. Tests verify narrowing and branding. |

**CODING.md key constraints for this phase:**
- No barrel files / `index.ts` re-exports (import directly from source files)
- String union types, not enums
- `import type` for type-only imports
- No `any` in production paths
- Module-level doc comments required
- Class/interface doc comments required

## Project Structure

### Documentation (this feature)

```text
specs/001-shared-types/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── index.ts                    # Package entry point (already exists, will re-export public API)
└── types/
    ├── graph.ts                # WorkflowGraph, GraphNode, Edge, NodeClassification
    ├── identity.ts             # NodeIdentity branded type + factory function
    ├── slice.ts                # SliceDefinition, PathDefinition, PathEdge
    ├── target.ts               # AgentTarget, ValidationTarget, ValidationLayer
    ├── trust.ts                # TrustState, NodeTrustRecord, NodeChangeSet, NodeModification, ChangeKind
    ├── guardrail.ts            # GuardrailDecision, GuardrailDecisionBase, GuardrailAction, GuardrailEvidence
    └── diagnostic.ts           # DiagnosticSummary, DiagnosticError, ErrorClassification,
                                # ResolvedTarget, PathNode, NodeAnnotation, DiagnosticHint,
                                # AvailableCapabilities, ValidationMeta, NodeAnnotationStatus,
                                # DiagnosticErrorBase

test/
└── types/
    ├── narrowing.test-d.ts     # Type-level tests for discriminated union narrowing
    ├── identity.test-d.ts      # Type-level tests for NodeIdentity branding
    └── identity.test.ts        # Runtime tests for NodeIdentity factory function
```

**Structure Decision**: Files are organized by domain concept (graph, trust, guardrail, diagnostic) matching the subsystem boundaries. Each file contains the types that belong to one logical group. No barrel file — consumers import directly from the file that defines the type (e.g., `import type { WorkflowGraph } from './types/graph.js'`). The package entry point `src/index.ts` re-exports the public API surface only.

**Import pattern note**: Per CODING.md, the only acceptable barrel file is the package entry point (`src/index.ts`). Internal project imports use direct file paths. The `src/index.ts` entry point re-exports types for external package consumers, but internal `src/` code imports directly from `src/types/graph.js`, `src/types/trust.js`, etc.

## Complexity Tracking

No violations. All decisions follow the simplest available approach.
