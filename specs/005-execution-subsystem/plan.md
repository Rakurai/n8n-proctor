# Implementation Plan: Execution Subsystem

**Branch**: `005-execution-subsystem` | **Date**: 2026-04-18 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/005-execution-subsystem/spec.md`

## Summary

Implement execution-backed validation for n8n-check: construct pin data from a 4-tier sourcing priority with source traceability, execute bounded subgraphs via the n8n REST API (`POST /workflows/:id/run` with `destinationNode`), execute whole workflows via MCP `test_workflow`, poll for results with two-phase exponential backoff, extract per-node execution data (status, timing, errors, source lineage) without raw output, and detect execution environment capabilities. REST and MCP are independent surfaces — MCP unavailability does not affect REST-based bounded execution.

## Technical Context

**Language/Version**: TypeScript 5.7+ on Node.js 20+ (ESM, `strict: true`)
**Primary Dependencies**: `@n8n-as-code/transformer` (workflow parsing), `@n8n-as-code/skills` (schema discovery), `@modelcontextprotocol/sdk` (MCP client), `zod` (edge validation)
**Storage**: `.n8n-check/` directory for pin data artifact cache (JSON files)
**Testing**: vitest (unit tests with mock HTTP, integration tests gated behind `N8N_TEST_HOST`)
**Target Platform**: Node.js library consumed by orchestrator (Phase 7), MCP server (Phase 8), and CLI (Phase 8)
**Project Type**: Library subsystem within `n8n-check` package
**Performance Goals**: Polling overhead < 500ms per cycle; pin data construction < 100ms for typical workflows (< 50 nodes)
**Constraints**: Serialized execution (one at a time); 5-minute execution timeout; no auto-push; no raw output extraction
**Scale/Scope**: Single n8n instance per session; workflows up to ~200 nodes; subgraphs typically 5-20 nodes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Fail-Fast, No Fallbacks | PASS | Pin data tier 4 raises typed error (no empty stubs). Missing credentials raise typed config error. Unreachable n8n raises infrastructure error. No silent degradation. |
| II. Contract-Driven Boundaries | PASS | Zod validation at REST/MCP response boundaries. Discriminated unions for `ExecutionErrorData` (`contextKind`). Trust types internally after edge validation. |
| III. No Over-Engineering | PASS | REST client and MCP client are distinct (not abstracted behind a shared interface — they serve different operations). No generic "execution backend" abstraction. |
| IV. Honest Code Only | PASS | No stubs. All functions either fully implemented or not created. REST API endpoints verified against n8n source code research. |
| V. Minimal, Meaningful Tests | PASS | Happy-path + error-path tests for public functions. Integration tests opt-in behind `N8N_TEST_HOST`. No trivial tests. |

## Project Structure

### Documentation (this feature)

```text
specs/005-execution-subsystem/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research output
├── data-model.md        # Phase 1 data model
├── quickstart.md        # Phase 1 quickstart guide
├── contracts/           # Phase 1 interface contracts
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
src/
├── types/                     # Existing shared types (Phases 1-2)
│   ├── graph.ts
│   ├── trust.ts
│   ├── diagnostic.ts
│   ├── identity.ts
│   ├── slice.ts
│   ├── target.ts
│   └── guardrail.ts
├── static-analysis/           # Existing (Phase 2)
├── execution/                 # NEW — this phase
│   ├── types.ts               # Internal execution types (PinData, ExecutionResult, etc.)
│   ├── errors.ts              # Typed execution errors (infrastructure, precondition, config)
│   ├── pin-data.ts            # Pin data construction with 4-tier sourcing
│   ├── rest-client.ts         # REST API client (bounded execution, workflow check)
│   ├── mcp-client.ts          # MCP client (smoke test, get_execution, prepare_test_pin_data)
│   ├── poll.ts                # Two-phase polling with exponential backoff
│   ├── results.ts             # Per-node result extraction from IRunExecutionData
│   └── capabilities.ts        # Environment capability detection
└── ...

test/
├── fixtures/
│   └── workflows/             # Existing fixture workflows
├── execution/                 # NEW — this phase
│   ├── pin-data.test.ts       # Pin data 4-tier sourcing, normalization, error on missing
│   ├── poll.test.ts           # Backoff sequence, timeout, phase transitions
│   ├── results.test.ts        # Per-node extraction, error classification, source lineage
│   ├── capabilities.test.ts   # Capability detection with mocked responses
│   ├── rest-client.test.ts    # REST request shaping, auth, error mapping
│   └── mcp-client.test.ts     # MCP tool invocation, response parsing
└── ...
```

**Structure Decision**: Single-project library following the existing `src/<subsystem>/` convention established in Phase 2. The `execution/` directory is a peer of `static-analysis/` under `src/`. Tests mirror the source structure under `test/execution/`.

## Constitution Re-Check (Post Phase 1 Design)

| Principle | Status | Design Verification |
|-----------|--------|-------------------|
| I. Fail-Fast, No Fallbacks | PASS | `constructPinData` throws `ExecutionPreconditionError` on missing pin data — no empty stubs. `resolveCredentials` throws `ExecutionConfigError` — no default credentials. `detectCapabilities` throws on unreachable n8n — no silent degradation to static-only. REST/MCP capability selection is based on detected state, not try/catch fallback. |
| II. Contract-Driven Boundaries | PASS | `contracts/execution.md` defines typed preconditions, errors, and guarantees for all 7 public functions. Zod validation at REST response edge and MCP response edge. `ExecutionErrorData` uses discriminated union on `contextKind`. Internal code trusts types after edge validation. |
| III. No Over-Engineering | PASS | REST client and MCP client remain distinct modules (different operations, different protocols). No shared `ExecutionBackend` interface. `CapabilityLevel` is a simple string union, not a class hierarchy. Pin data caching uses flat JSON files, not a generic storage abstraction. |
| IV. Honest Code Only | PASS | All 7 contract functions have concrete behavior specifications. REST API payload shape verified against n8n source research (R1). MCP tool interfaces verified against research (R2). No placeholder implementations in the design. |
| V. Minimal, Meaningful Tests | PASS | 6 test files, each covering a distinct module. Pin data tests cover all 4 tiers + error case. Poll tests verify backoff sequence and timeout. No tests that merely assert constructor field assignment. Integration tests opt-in only. |

## Complexity Tracking

No violations to justify. All files have clear single responsibilities. No abstractions beyond what the current requirements demand.
