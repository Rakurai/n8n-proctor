# Implementation Plan: Integration Testing Suite

**Branch**: `010-integration-testing` | **Date**: 2026-04-19 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/010-integration-testing/spec.md`

## Summary

Build an integration test suite that verifies n8n-vet's full pipeline (static analysis, trust tracking, execution, guardrails, diagnostics, MCP tools) against a live n8n instance using real workflow artifacts. The suite consists of a seed script that creates 7 test workflows on n8n and pulls them as n8nac artifacts, 8 scenario scripts exercising distinct pipeline behaviors, shared test utilities (setup, push, assertions, MCP client), and a sequential runner. Tests live in `test/integration/`, run via `tsx` (not vitest), and require a live n8n instance with n8nac configured.

## Technical Context

**Language/Version**: TypeScript (strict mode, ESM) on Node.js 20+
**Primary Dependencies**: n8n-vet library (this project), `@modelcontextprotocol/sdk` (MCP test client), `@n8n-as-code/transformer` (fixture parsing)
**Storage**: `.n8n-vet/trust-state.json` (trust persistence, isolated per test run via temp dirs)
**Testing**: Custom sequential runner via `tsx` — NOT vitest (live dependencies, real latency, side effects)
**Target Platform**: Developer workstation with access to a live n8n instance
**Project Type**: Integration test suite for an existing library
**Performance Goals**: Full suite completes within 10 minutes; seed script under 2 minutes
**Constraints**: Requires live n8n + n8nac; not part of `npm test`; sequential execution only
**Scale/Scope**: 7 fixtures (3-6 nodes each), 8 scenarios, ~15 source files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Fail-Fast, No Fallbacks | PASS | Runner fails fast on prereq check. Scenarios throw on assertion failure. No silent recovery. |
| II. Contract-Driven Boundaries | PASS | Integration context validated at setup. Assertion helpers use typed interfaces from n8n-vet's type system. Zod validation at MCP tool boundaries (already exists in n8n-vet). |
| III. No Over-Engineering | PASS | Simple sequential runner, plain functions for scenarios, typed assertion helpers only where reuse is clear (used across all 8 scenarios). No test framework abstraction. |
| IV. Honest Code Only | PASS | No stubs — every scenario exercises real n8n-vet APIs against a real n8n instance. Fixtures are real server artifacts, not hand-authored approximations. |
| V. Minimal, Meaningful Tests | PASS | 8 scenarios cover 8 distinct integration signals. Each fixture targets one signal. No redundant scenarios — each proves something unit tests cannot. |

No violations. No complexity justification needed.

### Post-Design Re-Check (Phase 1)

All five principles re-confirmed after design phase:

- **I. Fail-Fast**: Setup verifies all 7 prerequisites upfront. Push utility throws on non-OCC errors. Assertion helpers throw with descriptive messages. No silent degradation anywhere.
- **II. Contract-Driven**: IntegrationContext validated at creation. Manifest parsed once and trusted. Library API types flow through naturally — no re-validation inside scenarios.
- **III. No Over-Engineering**: Assertion helpers have 6 functions used across 8 scenarios (well above the two-consumer rule). Push utility shared by runner setup + seed script. MCP client used by scenario 07 only — but it wraps the MCP SDK which would otherwise require boilerplate in the scenario itself.
- **IV. Honest Code**: All test workflows are real server artifacts from `n8nac pull`. No hand-authored fixtures. No mocked external services in integration tests.
- **V. Minimal, Meaningful**: Each scenario proves one thing unit tests cannot. No redundant scenarios. No trivial assertions.

## Project Structure

### Documentation (this feature)

```text
specs/010-integration-testing/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
test/integration/
├── README.md                     # Setup instructions, prerequisites
├── seed.ts                       # Creates test workflows on n8n, pulls as artifacts
├── run.ts                        # Entry point: run all scenarios or pick one
├── fixtures/                     # Pulled n8nac artifacts (committed to repo)
│   ├── manifest.json             # Maps fixture names → n8n workflow IDs
│   ├── happy-path.ts             # Clean workflow, should pass everything
│   ├── broken-wiring.ts          # Disconnected node, static should catch
│   ├── data-loss-passthrough.ts  # Shape-narrowing node, static should warn
│   ├── expression-bug.ts         # Bad expression ref, static + execution
│   ├── credential-failure.ts     # Valid wiring, bad credentials
│   ├── branching-coverage.ts     # If node with true/false paths
│   └── multi-node-change.ts      # Multi-node chain for scope narrowing
├── scenarios/                    # Scenario scripts
│   ├── 01-static-only.ts
│   ├── 02-execution-happy.ts
│   ├── 03-execution-failure.ts
│   ├── 04-trust-lifecycle.ts
│   ├── 05-guardrail-rerun.ts
│   ├── 06-bounded-execution.ts
│   ├── 07-mcp-tools.ts
│   └── 08-full-pipeline.ts
└── lib/                          # Shared test utilities
    ├── setup.ts                  # n8n connection, n8nac config, cleanup
    ├── push.ts                   # n8nac push with OCC conflict handling
    ├── assertions.ts             # Typed assertion helpers for DiagnosticSummary
    ├── deps.ts                   # buildTestDeps() — wraps buildDeps() with isolated dataDir
    └── mcp-client.ts             # MCP client for n8n-vet's MCP server
```

**Structure Decision**: All integration test code lives under `test/integration/` at the repo root, matching the existing `test/` convention. This is a new directory alongside the existing unit test structure. No changes to `src/` are needed — tests import from the built library.

## Complexity Tracking

No violations to justify.
