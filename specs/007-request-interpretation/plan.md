# Implementation Plan: Request Interpretation

**Branch**: `007-request-interpretation` | **Date**: 2026-04-19 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/007-request-interpretation/spec.md`

## Summary

Implement the orchestrator subsystem (`src/orchestrator/`) — the system's control center that receives a `ValidationRequest`, resolves the target to concrete nodes, consults guardrails, orchestrates static analysis and execution subsystems, synthesizes a diagnostic summary, updates trust state, and manages workflow snapshots. This is the last internal subsystem before the MCP/CLI surface layer (Phase 8). All five upstream subsystems (static analysis, trust & change, guardrails, execution, diagnostics) already exist with stable public interfaces.

## Technical Context

**Language/Version**: TypeScript (strict mode, ESM) on Node.js 20+
**Primary Dependencies**: All internal subsystems (static-analysis, trust, guardrails, execution, diagnostics), `@n8n-as-code/transformer` (workflow parsing), `zod` (edge validation)
**Storage**: `.n8n-vet/trust-state.json` (trust persistence, handled by trust subsystem), `.n8n-vet/snapshots/` (workflow graph snapshots, new in this phase)
**Testing**: vitest
**Target Platform**: Node.js library (consumed by MCP server + CLI)
**Project Type**: Library subsystem within a standalone package
**Performance Goals**: <5s for static-only validation of a 50-node workflow (SC-001)
**Constraints**: Sequential pipeline (no concurrent subsystem calls within a single request), deterministic path selection (SC-004)
**Scale/Scope**: Workflows up to ~100 nodes with up to ~20 candidate paths per slice

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Fail-Fast, No Fallbacks | PASS | Pipeline errors produce `status: 'error'` diagnostics or raise. No silent recovery. Missing trust → empty trust (spec-defined behavior, not a fallback). |
| II. Contract-Driven Boundaries | PASS | `ValidationRequest` validated at entry (Zod). All subsystem calls use typed interfaces. Internal code trusts validated types. |
| III. No Over-Engineering | PASS | Orchestrator is a direct pipeline — no abstract base classes, no plugin system, no factory patterns. Each function has one clear responsibility. |
| IV. Honest Code Only | PASS | All subsystem interfaces already exist. No stubs, no phantom implementations. |
| V. Minimal, Meaningful Tests | PASS | Integration tests wiring subsystems with mocked interfaces. Happy-path + error-path mandatory. No trivial tests. |

## Project Structure

### Documentation (this feature)

```text
specs/007-request-interpretation/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── interpret.md     # interpret() contract
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── orchestrator/
│   ├── types.ts         # ValidationRequest, InterpretedRequest, snapshot types
│   ├── resolve.ts       # Target resolution: nodes, changed, workflow → SliceDefinition
│   ├── path.ts          # Path enumeration, 4-tier ranking, additional-greedy selection
│   ├── interpret.ts     # 10-step pipeline orchestration (the main entry point)
│   └── snapshots.ts     # Snapshot persistence: save/load workflow graphs
├── types/               # (existing — no changes expected)
└── index.ts             # (add orchestrator exports)

test/
├── orchestrator/
│   ├── resolve.test.ts  # Target resolution unit tests
│   ├── path.test.ts     # Path selection unit tests
│   ├── interpret.test.ts # Integration: full pipeline with mocked subsystems
│   └── snapshots.test.ts # Snapshot round-trip tests
└── fixtures/            # (existing workflow fixtures)
```

**Structure Decision**: Single `src/orchestrator/` directory following the same flat structure used by all existing subsystems (`src/trust/`, `src/guardrails/`, etc.). No subdirectories — the subsystem is ~4-5 files.

## Complexity Tracking

No violations to justify. The orchestrator follows the same patterns as existing subsystems.
