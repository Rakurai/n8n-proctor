# Implementation Plan: Guardrail Evaluation Subsystem

**Branch**: `004-guardrails` | **Date**: 2026-04-18 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/004-guardrails/spec.md`

## Summary

Implement the guardrail evaluator — a pure, synchronous subsystem that receives a validation request (target, layer, force flag) along with trust state, change set, and workflow graph, and returns a `GuardrailDecision` with evidence. The evaluator runs a fixed two-tier pipeline: precondition checks (force bypass, empty target, identical rerun) followed by guardrail actions (redirect, narrow, DeFlaker warn, broad-target warn, proceed). First non-proceed action wins.

The subsystem lives in `src/guardrails/` and has no external dependencies beyond the shared types and the existing static-analysis expression tracing module. All evaluation is purely in-memory — no network, no filesystem, no n8n instance.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js >= 20, ESM modules  
**Primary Dependencies**: None beyond project internals (shared types from `src/types/`, expression tracing from `src/static-analysis/expressions.ts`, trust queries from `src/trust/trust.ts`)  
**Storage**: N/A — the evaluator is a pure function. Prior run context is sourced from a cached `DiagnosticSummary` passed as an argument.  
**Testing**: vitest  
**Target Platform**: Node.js library (consumed by orchestrator in Phase 7)  
**Project Type**: Library subsystem within the n8n-check package  
**Performance Goals**: Sub-50ms evaluation for workflows up to 100 nodes  
**Constraints**: Pure synchronous functions — no async, no side effects, no filesystem access  
**Scale/Scope**: n8n workflows typically have 5–50 nodes; the evaluator should handle up to ~200 nodes without concern

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Fail-Fast, No Fallbacks | **Pass** | Evaluator raises on missing change set or malformed graph. Empty trust state is valid initialization (not a fallback). Missing prior run context causes the DeFlaker check to be skipped (a defined behavior, not a fallback). |
| II. Contract-Driven Boundaries | **Pass** | Inputs (`ValidationTarget`, `TrustState`, `NodeChangeSet`, `WorkflowGraph`) are already validated at system edges by upstream subsystems. Guardrails trust these types internally. Output is typed `GuardrailDecision` discriminated union. |
| III. No Over-Engineering | **Pass** | Five source files map to five distinct concerns (evaluate pipeline, narrowing, redirect, rerun check, evidence). No abstractions with single consumers. Threshold constants are plain `const` values, not configurable objects. |
| IV. Honest Code Only | **Pass** | Every function in the plan has a concrete implementation path. No stubs, no TODO placeholders. All upstream APIs (`traceExpressions`, `isTrusted`, `getRerunAssessment`) exist in the current codebase. |
| V. Minimal, Meaningful Tests | **Pass** | Tests organized as pipeline scenarios exercising evaluation order in context, not isolated per-rule tests (unless the pipeline tests leave distinct behaviors uncovered). Fixture-based, no mocks of internal functions. |

## Project Structure

### Documentation (this feature)

```text
specs/004-guardrails/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
src/guardrails/
├── evaluate.ts          # Main evaluation pipeline — two-tier fixed-order evaluation
├── narrow.ts            # Narrowing algorithm — seed + forward + backward propagation
├── redirect.ts          # Redirect logic — escalation trigger evaluation
├── rerun.ts             # DeFlaker-style rerun check (prior run context extraction + relevance)
├── evidence.ts          # Evidence assembly for every decision
└── types.ts             # Internal types (PriorRunContext, EscalationAssessment, thresholds)

test/guardrails/
├── evaluate.test.ts     # Pipeline tests — evaluation order scenarios
├── narrow.test.ts       # Narrowing algorithm tests
├── redirect.test.ts     # Escalation trigger tests
└── fixtures.ts          # Shared test fixtures (graphs, trust states, change sets)

test/fixtures/
└── workflows/           # Existing workflow fixtures (reused for guardrail tests)
```

**Structure Decision**: Single-directory subsystem under `src/guardrails/` following the established pattern from `src/trust/`, `src/diagnostics/`, and `src/static-analysis/`. Tests in `test/guardrails/` mirroring the source layout.

## Complexity Tracking

> No constitution violations to justify. All five principles pass.
