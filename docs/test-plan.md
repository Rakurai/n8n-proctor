# Integration Test Plan

> Authoritative planning document for n8n-vet integration test work.
> For the historical evaluation (rounds 1–2), see `integration-test-plan.md`.

## Current State

15 scenarios. 14 pass, 1 documented skip.

```
PASS  01-static-only
PASS  02-execution-happy
PASS  03-execution-failure
PASS  04-trust-lifecycle
PASS  05-guardrail-rerun
PASS  06-branching-execution
PASS  07-mcp-tools
PASS  08-full-pipeline
PASS  09-nodes-target
PASS  10-test-refusal
PASS  11-independent-trust
PASS  12-error-envelope-types
PASS  13-pin-data
SKIP  14-expression-classification  (SP3)
PASS  15-validate-test-lifecycle
```

---

## Structural Decisions

### SP1: Validate→test lifecycle was broken

**Problem:** Static validation doesn't produce cached pin data. When all nodes are trusted from static, execution fails with "Pin data unavailable" because `constructPinData` has no data for the trusted boundary nodes.

**Resolution:** Tier-3 pin data sourcing via MCP `prepare_test_pin_data` schemas. Trusted boundary computation fixed: only pin nodes adjacent to untrusted region. When ALL target nodes are trusted, skip pinning entirely — execute normally. Scenario 15 proves the lifecycle works end-to-end.

### SP2: `precondition_error` was unreachable

**Problem:** `interpret()` caught missing `metadata.id` internally and returned a diagnostic with `status: 'error'` and `platform` classification. `ExecutionPreconditionError` was never thrown, so the `precondition_error` MCP envelope type was dead code.

**Resolution:** `interpret()` now throws `ExecutionPreconditionError` for missing `metadata.id`. MCP server and CLI catch blocks map it to the correct envelope via `mapToMcpError()`. Scenario 07 test 8 asserts the envelope.

### SP3: Expression classification not integration-testable

**Problem:** n8n v2.16's expression engine swallows all attempted expression errors in Set node contexts. `JSON.parse("{invalid")`, `$json.nonexistent.deep.path`, `$("NonExistentNode").item.json.value` — all evaluate without error. The `expression` classification cannot be triggered from any known fixture.

**Resolution:** Scenario 14 is a documented skip. The classification logic is unit-tested in `test/diagnostics/errors.test.ts`. Revisit when n8n upgrades its expression engine or a node type that reliably surfaces `ExpressionError` is found.

---

## Phases

### Phase A — Fix structural gaps ✓

All complete. 523 unit tests, 15 integration tests passing.

| Item | Description | Status |
|------|-------------|--------|
| A1 | Fix `precondition_error` architecture (SP2) | Done |
| A2 | Convert scenario 14 to documented skip (SP3) | Done |
| A3 | Wire tier-3 pin data + lifecycle test (SP1) | Done |

### Phase B — Fill critical SKILL.md contract gaps

Coverage matrix gaps from the honesty evaluation (see `integration-test-plan.md`).

| Item | Description | Fixture | MCP? |
|------|-------------|---------|------|
| B1 | Test `credentials` error classification | New fixture with invalid credential ref | Yes |
| B2 | Test `narrow` guardrail action | Existing large fixture or new multi-branch | No |
| B3 | Assert `nodeAnnotations[]` in existing scenarios | No new fixture | No |
| B4 | Assert `hints[]` in data-loss passthrough scenario | Existing `data-loss` fixture | No |
| B5 | Test `configuration_error` envelope | Extend scenario 12 | Via MCP server |
| B6 | Test `infrastructure_error` envelope | Mock/poison MCP callTool | Via MCP server |
| B7 | Test `trust_error` envelope | Corrupt trust store | No |

### Phase C — Strengthen existing scenarios

| Item | Description |
|------|-------------|
| C1 | Test `test` tool through MCP server transport (not just `interpret()`) |
| C2 | Add static-only fallback for scenario 03 when `!ctx.callTool` |
| C3 | Tighten scenario 05: assert explanation mentions specific guardrail rationale |
| C4 | Assert specific `validatedWith` values in trust scenarios |

### Phase D — Aspirational

| Item | Description |
|------|-------------|
| D1 | Find a node type that triggers `ExpressionError` at runtime (unblock scenario 14) |
| D2 | Test concurrent trust access from parallel validate calls |
| D3 | Performance test: large workflow (50+ nodes) stays under time budget |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-20 | SP1 resolved: tier-3 + boundary fix | All-trusted = no pinning is simpler and correct |
| 2026-04-20 | SP2 resolved: throw from interpret() | Keeps error mapping at boundary, interpret() stays pure |
| 2026-04-20 | SP3 resolved: skip scenario 14 | Unit coverage sufficient; no integration fixture can trigger it |
| 2026-04-20 | Phase A complete | 523 unit + 15 integration tests green |
| 2026-04-20 | Replaced shell scripts with dotenv-cli | Standard TS practice; `npm run test:integration` loads `.env` automatically |
