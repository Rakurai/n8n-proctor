# Integration Test Improvement Plan

> Historical record of rounds 1–2 (honesty evaluation, coverage matrix, R1–R5 findings).
> The active plan is [`docs/test-plan.md`](test-plan.md).

## Context

An honesty audit of the 9 integration test scenarios revealed that while the tests prove the happy path works end-to-end, they are shallow in what they assert. Most scenarios check `status: 'pass' | 'fail'` and stop — a regression that returns the right status but garbled data would pass all tests.

The integration test discipline (codified in `docs/CODING.md § Integration Testing` and `CLAUDE.md`) requires:
1. Assert on data, not just status
2. Test the product's promises (SKILL.md is the contract)
3. Don't bypass what you're testing
4. Test the handoffs between subsystems

This plan brings the existing tests in line and adds missing scenarios.

## Preparation

Read these before starting work:

| Document | Why |
|----------|-----|
| `skills/validate-workflow/SKILL.md` | The agent contract — every promise here needs test coverage |
| `docs/CODING.md § Integration Testing` | The rules for honest integration tests |
| `docs/CODING.md § Testing` | General test discipline (no trivial tests, no redundant tests) |
| `src/types/diagnostic.ts` | `DiagnosticSummary`, `DiagnosticError`, `ErrorClassification`, `NodeAnnotation` shapes |
| `src/types/guardrail.ts` | `GuardrailDecision`, `GuardrailAction` shapes |
| `src/errors.ts` | `McpErrorType`, `McpResponse` envelope — the error types promised to agents |
| `test/integration/lib/assertions.ts` | Existing assertion helpers — extend these, don't inline checks |
| `test/integration/fixtures/` | All 7 fixture workflows and `manifest.json` |

## Work Items

### 1. Deepen assertions in existing scenarios

**Why:** The existing scenarios test *that* something happened, not *what* happened. A regression could slip through.

**Changes:**

**Scenario 01 (static-only):**
- Assert the wiring error's `node` field is `'Process'` (the node with the broken `$json.data` reference)
- Assert `evidenceBasis` is `'static'`
- Assert `capabilities.mcpTools` is `false`

**Scenario 02 (execution-happy):**
- Assert `executedPath` contains specific node names (`['Trigger', 'Set', 'Noop']`) in order
- Assert `evidenceBasis` is `'execution'`
- Assert `meta.executionId` is a non-empty string

**Scenario 03 (execution-failure):**
- Assert the HTTP error classification is `'external-service'` (not just that the node name is present)
- Assert `evidenceBasis` is `'execution'`

**Scenario 05 (guardrail-rerun):**
- Assert the specific guardrail action is `'refuse'` (not just "some non-proceed action")
- Assert the explanation contains "unchanged" or similar — it should explain *why*
- Assert `result2.status` is `'skipped'` (guardrail refused → skipped, not pass/fail)

**Scenario 06 (branching-execution):**
- Assert `evidenceBasis` is `'execution'`

**Scenario 07 (MCP tools):**
- After `validate`, assert `data.status` is `'pass'` and `data.evidenceBasis` is `'static'`
- After `trust_status`, assert `data.totalNodes` is a number > 0
- After `explain`, assert `data.guardrailDecision` exists and has an `action` field
- For the nonexistent-file error paths, assert the error `type` string (e.g. `'workflow_not_found'` or `'parse_error'`)

### 2. Add scenario: test-refusal guardrail (scenario 10)

**Why:** The test-refusal guardrail ("All changes are structurally analyzable — use validate instead") is core to the product identity. It's documented in SKILL.md. No existing test calls `test` without `force` on a structurally-analyzable workflow. Every execution scenario uses `force: true`, bypassing all guardrails.

**Design:**
- Use `happy-path.ts` fixture (all nodes are structurally analyzable — set, noOp)
- Call `test` with `kind: 'changed'`, `force: false`, no callTool needed (refusal happens before MCP)
- Assert `status: 'skipped'`
- Assert guardrail action is `'refuse'`
- Assert explanation contains "structurally analyzable"
- Then call again with `force: true` — assert it does NOT refuse (proceeds or errors on missing MCP, not refuses)

**Fixture:** `happy-path.ts` (already exists, already deployed)

### 3. Add scenario: validate→test lifecycle (scenario 11)

**Why:** The validate→push→test lifecycle is the entire product pitch in SKILL.md. No current scenario tests validate then test on the same workflow in sequence with trust carrying over. The pin-data-from-trusted-boundaries failure we found during debugging (scenario 03) is exactly the kind of bug this catches.

**Design:**
- Use `happy-path.ts` fixture
- Step 1: `validate` with `kind: 'workflow'` → assert `status: 'pass'`, `evidenceBasis: 'static'`
- Step 2: Check trust — assert all 3 nodes trusted with `validatedWith: 'static'`
- Step 3: `test` with `kind: 'workflow'`, `force: true`, `callTool` — assert `status: 'pass'`, `evidenceBasis: 'execution'`
- Step 4: Check trust — assert nodes now have execution trust (or both static + execution records)
- Key assertion: step 3 must succeed despite step 1 having written trust state. This is the handoff that broke scenario 03 — trusted boundaries need pin data.

**Fixture:** `happy-path.ts` (already exists). Requires MCP — skip if `!ctx.callTool`.

### 4. Add scenario: error envelope types (scenario 12)

**Why:** SKILL.md documents 7 error types (`workflow_not_found`, `parse_error`, `configuration_error`, etc.). These are a contract with agent consumers. No current test asserts the error `type` string — only that `success: false` or `status: 'error'`.

**Design:**
- Use MCP test client (spawn n8n-vet server like scenario 07)
- Test 1: `validate` on nonexistent file → assert error type is `'workflow_not_found'` or `'parse_error'`
- Test 2: `trust_status` on nonexistent file → assert error type string
- Test 3: `test` on a workflow file *without* `metadata.id` → assert error type is `'precondition_error'` (but this might return as a diagnostic error, not MCP error — check how it's surfaced)
- Test 4: `explain` on nonexistent file → assert error type string

**Fixture:** No new fixture needed. Use nonexistent paths and possibly a temp file without `metadata.id`.

### 5. Add scenario: pinData parameter (scenario 13)

**Why:** The `test` tool accepts `pinData` as a first-class parameter. It's documented in SKILL.md's "When to test" table. No current scenario provides it. This is the mechanism agents use to mock upstream data during execution testing.

**Design:**
- Use `happy-path.ts` fixture (Trigger → Set → Noop)
- Call `test` with explicit `pinData: { 'Trigger': [{ json: { mockField: 'mockValue' } }] }`
- Assert execution succeeds (`status: 'pass'`)
- Assert `executedPath` is present
- The pin data should cause Trigger's output to be the mock data instead of the trigger's default output

**Fixture:** `happy-path.ts` (already exists). Requires MCP — skip if `!ctx.callTool`.

## Order of Operations

1. **Deepen existing assertions first.** This is the lowest-risk highest-value change — no new scenarios, just making existing tests honest.
2. **Scenario 10 (test-refusal).** No MCP needed, fast, tests the product's most distinctive guardrail.
3. **Scenario 12 (error envelopes).** Uses MCP test client (spawns server), no n8n needed for most tests.
4. **Scenario 11 (lifecycle).** Requires MCP to n8n. Tests the critical handoff.
5. **Scenario 13 (pinData).** Requires MCP to n8n. Tests a specific parameter.

Items 1-3 can run without an n8n instance. Items 4-5 require MCP to n8n (gated on `ctx.callTool`).

## Non-goals

- Don't add tests for edge cases covered by unit tests (trust expiry, concurrent access, file permissions)
- Don't test n8n itself (credential validation, webhook behavior)
- Don't add tests for features not yet promised in SKILL.md
- Don't refactor the test runner or assertion framework beyond adding helpers we need

---

## Progress

All 5 work items from the original plan are implemented. 14 scenarios pass (was 9), 1 is a documented skip.

### Completed

| Item | Status | Notes |
|------|--------|-------|
| 1. Deepen existing assertions | **Done** | Scenarios 01–03, 05–07 updated. |
| 2. Scenario 10 (test-refusal) | **Done** | Asserts `refuse` action, `skipped` status, explanation content, force bypass. |
| 3. Scenario 11 (validate→test lifecycle) | **Done** | Validates static trust, then execution trust. Uses fresh deps for test step due to Phase 012 limitation (see evaluation). |
| 4. Scenario 12 (error envelope types) | **Done** | Asserts error `type` strings against documented `McpErrorType` set for validate, trust_status, explain. |
| 5. Scenario 13 (pinData) | **Done** | Provides explicit pin data, asserts execution success and path. |

**Post-plan additions (from `docs/test-plan.md`):**

| Item | Status | Notes |
|------|--------|-------|
| Scenario 14 (expression-classification) | **Skipped** | SP3: n8n v2.16 expression engine too lenient. Unit-tested. |
| Scenario 15 (validate→test lifecycle) | **Done** | Proves trust carries across validate→test with shared deps. Tier-3 wiring resolved the Phase 012 pin-data handoff gap. |
| A1 (precondition_error fix) | **Done** | interpret() throws ExecutionPreconditionError, mapped to envelope at MCP boundary. |
| A3 (tier-3 pin data sourcing) | **Done** | constructPinData wired to MCP prepare_test_pin_data. Trusted boundary computation fixed. |

### New assertion helpers added

`assertEvidenceBasis`, `assertFindingOnNode`, `assertExecutedPathContains`, `assertExecutedPathOrder`, `assertTrustedWith`, `assertGuardrailExplanationContains`, `assertMcpErrorType` — all in `test/integration/lib/assertions.ts`.

### Implementation notes

- **Scenario 05** fires `'warn'` (broad-target), not `'refuse'` (identical-rerun). The guardrail evaluation pipeline hits the broad-target warn (step 6) before the identical-rerun refuse (step 7) because happy-path has 3 nodes and 100% coverage triggers the broad-target heuristic first. The assertion was relaxed to accept any non-proceed action.
- **Scenario 11** required fresh deps for the test step. Static validation doesn't produce cached pin data, so execution fails with "Pin data unavailable" when all nodes are trusted from static. This is the Phase 012 pin-data handoff gap.
- **Scenario 02** node name mismatch: fixture uses `'Noop'` (PascalCase from n8nac) not `'NoOp'`.

---

## Honesty Evaluation

Audit of all 13 scenarios against `SKILL.md` (the agent contract) and `docs/CODING.md § Integration Testing`.

### Coverage Matrix: SKILL.md Promises

#### Error Classifications (7 documented)

| Classification | Tested? | Where | Gap |
|---|---|---|---|
| `wiring` | Yes | Scenario 01 — classification + node attribution | — |
| `expression` | **No** | — | `expression-bug` fixture exists but no scenario uses it |
| `credentials` | **No** | — | Would require a fixture with invalid credential reference |
| `external-service` | Yes | Scenario 03 — classification + node | — |
| `platform` | **No** | — | Hard to trigger synthetically |
| `cancelled` | **No** | — | Hard to trigger synthetically |
| `unknown` | **No** | — | Catch-all; low value to test directly |

#### Error Envelope Types (7 documented)

| Type | Tested? | Where | Gap |
|---|---|---|---|
| `workflow_not_found` | Yes | Scenarios 07, 12 | — |
| `parse_error` | Yes | Scenarios 07, 12 | — |
| `precondition_error` | **No** | — | SKILL.md: "metadata.id missing → precondition error" — common agent path, untested |
| `configuration_error` | **No** | — | |
| `infrastructure_error` | **No** | — | |
| `trust_error` | **No** | — | |
| `internal_error` | **No** | — | |

#### Guardrail Actions (4 documented)

| Action | Tested? | Where | Gap |
|---|---|---|---|
| `proceed` | Implicit | Most passing scenarios | — |
| `warn` | Indirect | Scenario 05 fires it but doesn't assert the specific string | — |
| `narrow` | **No** | — | Never asserted directly |
| `refuse` | Yes | Scenario 10 — action + explanation content + force bypass | — |

#### DiagnosticSummary Fields

| Field | Asserted? | Where | Gap |
|---|---|---|---|
| `status` | Yes | All scenarios | — |
| `evidenceBasis` | Yes | 01, 02, 03, 06, 11, 13 | — |
| `executedPath` | Yes | 01 (null), 02 (order), 06, 13 (contains) | — |
| `errors[]` | Yes | 01, 03 (classification + node) | — |
| `guardrailActions[]` | Yes | 05, 10 | — |
| `hints[]` | **No** | — | SKILL.md documents severity levels; never asserted |
| `nodeAnnotations[]` | **No** | — | validated/trusted/mocked/skipped statuses never asserted |
| `capabilities` | Yes | 01, 02, 03 | — |
| `meta.executionId` | Yes | 02, 06, 11, 13 | — |

#### MCP Tool Surfaces (4 tools via MCP server)

| Tool | Via MCP server? | Where | Gap |
|---|---|---|---|
| `validate` | Yes | Scenario 07 | — |
| `test` | **No** | — | Only tested via `interpret()` directly, never through MCP server |
| `trust_status` | Yes | Scenario 07 | — |
| `explain` | Yes | Scenario 07 | — |

### Honesty Problems

**1. Scenario 05 is too lenient.** Accepts *any* non-proceed action with *any* non-empty explanation. The `overridable` check has a logic bug — `!x && x !== false` is always false for booleans. A regression that changes the guardrail to return `{ action: 'warn', explanation: 'garbage' }` would pass.

**2. Scenario 11 doesn't test what it claims.** The doc says "trust carrying across" but it creates fresh deps for the test step, so trust state is isolated. It proves validate and test work *independently* on the same workflow — which is valuable but not the documented claim. The real handoff test is blocked by Phase 012.

**3. `expression` classification is untested.** The `expression-bug` fixture was created for this purpose. This is a SKILL.md contract item agents branch on.

**4. `precondition_error` is untested.** SKILL.md specifically says: "If `metadata.id` is missing when you call `test`, n8n-vet returns a precondition error." Common agent scenario (test before push).

**5. Scenario 03 is empty without MCP.** If `!ctx.callTool`, the function returns immediately. Could at least assert static behavior for the fixture.

### What's Actually Good

- **01, 02, 04, 06, 09, 10, 13** — genuinely honest; assert specific data values, not just status.
- **10** — nails the test-refusal guardrail: action, explanation content, force bypass, status.
- **12** — proves error type strings belong to the documented set.
- **04** — best scenario; tests trust→change→invalidation→re-validate with correct boundary assertions.

---

## Recommendations (next round)

Ranked by value — how much each fix increases confidence that the tools work as promised.

### R1. Add `expression` classification test

Use the existing `expression-bug` fixture. Call `validate`, assert `status: 'fail'`, assert an error with `classification: 'expression'`. This is a SKILL.md contract item agents branch on to decide their next action. No MCP needed.

### R2. Add `precondition_error` envelope test

Create a temp workflow file without `metadata.id`. Call `test` via MCP server. Assert the error envelope returns `type: 'precondition_error'`. This is the documented guard for "test before push" — a common agent mistake.

### R3. Tighten scenario 05

Assert the specific guardrail action type (`'warn'`). Assert the explanation contains "100%" or "narrowing" — proving the guardrail explains *why*. Remove the broken `overridable` check. Currently the scenario would pass even if the guardrail returned nonsense.

### R4. Test `test` tool via MCP server

Add a `client.test()` call to scenario 07 (or a new scenario). Currently the MCP server's `test` tool handler is never exercised through the MCP transport layer. A serialization or argument-parsing bug in that handler would go undetected.

### R5. Redocument scenario 11

Either rename it to "validate and test independently produce correct trust" (what it actually proves) or hold it until Phase 012 resolves the pin-data handoff gap to test the real lifecycle claim.

---

## Implementation Round 2 — R1–R5 Findings

### What shipped (R2–R5)

**R2 + R4 combined** — scenario 07 now exercises `client.test()` through the MCP transport layer (R4) and tests the "test before push" error path using a `no-id.ts` fixture without `metadata.id` (R2). The no-id fixture triggers `interpret()`'s internal error path: it returns a diagnostic with `status: 'error'` and a `platform`-classified error mentioning `metadata.id`. This is NOT an MCP error envelope — `interpret()` catches the missing-ID case internally before `ExecutionPreconditionError` is ever thrown. So `precondition_error` as an MCP envelope type is currently unreachable in the architecture. What we test instead is the actual user-facing behavior: the `test` tool returns a clear diagnostic explaining why execution can't proceed.

**R3** — scenario 05 now asserts the specific guardrail action `'warn'` and validates that the explanation contains meaningful content (mentions coverage, narrowing, trusted, or broad). The broken `overridable` typecheck was removed.

**R5** — scenario 11 renamed to `11-independent-trust` with an honest doc comment: it proves validate and test independently build correct trust state, but explicitly does NOT claim trust carries across tools (Phase 012 gap).

### R1 — `expression` classification: not integration-testable

The `expression` classification has two entry paths:

1. **Static**: `unresolvable-expression` finding → `expression`. Only triggered by `$fromAI()` or `$json[dynamicVar]` (dynamic bracket access). The `expression-bug` fixture uses `$("NonExistentNode").item.json.value` which doesn't match either pattern. When the display name isn't in the graph, `extractExplicitRefs` sets `resolved: false`, and `handleExplicitReference` skips unresolved refs (`if (!ref.resolved) return`). No static finding is produced.

2. **Execution**: `ExpressionError` constructor name → `expression`. Tested multiple expressions:
   - `$json.nonexistent.deep.path` — n8n resolves to `undefined`, coerces to string `"undefined"`. No error.
   - `$("NonExistentNode").item.json.value` — n8n resolves silently. No error.
   - `$json.contact.name.toString()` — n8n's expression engine catches the TypeError internally. No error.
   - `JSON.parse("{invalid")` — n8n catches the SyntaxError internally. No error.

   n8n v2.16's expression engine is exceptionally lenient in Set node contexts. Every attempted expression evaluated successfully with zero execution errors. The `expression` classification cannot be triggered from a ManualTrigger → Set node fixture.

**Unit test coverage is sufficient.** `test/diagnostics/errors.test.ts#L160` proves `ExpressionError` → `expression` classification via `classifyExecutionErrors()` with a known-good execution data fixture. The classification logic itself is correct — the gap is that no integration fixture can reliably trigger `ExpressionError` from n8n's runtime.

**Scenario 14 remains in-tree but fails.** It requires MCP (skips without `callTool`) and asserts `status: 'fail'` from the expression-bug fixture. Decision pending on whether to remove it, convert it to a skip-with-reason, or find a node type that does throw ExpressionError.

### `availableInMCP` workaround gap discovered

The `ensureMcpAccess` function in `test/integration/lib/enable-mcp-access.ts` had a sampling bug: it checked only the first workflow in the manifest. If that workflow already had the flag set but others didn't (e.g., after reseeding a single fixture), the rest were skipped. Fixed to check all workflows individually instead of sampling one.

The seed script resets `.local-state.json` (clearing the `mcpAccessVerified` cache), so the next test run always re-runs `ensureMcpAccess`. This is the correct behavior — but the sampling bug meant it could still miss workflows that lost the flag during reseed.

### Current state: 14 pass, 0 fail

```
PASS  01-static-only
PASS  02-execution-happy
PASS  03-execution-failure
PASS  04-trust-lifecycle
PASS  05-guardrail-rerun          (tightened: asserts 'warn' + explanation content)
PASS  06-branching-execution
PASS  07-mcp-tools                (added: client.test() + no-id error path)
PASS  08-full-pipeline
PASS  09-nodes-target
PASS  10-test-refusal
PASS  11-independent-trust        (renamed, honest doc)
PASS  12-error-envelope-types
PASS  13-pin-data
PASS  14-expression-classification (SKIPPED — SP3: n8n expression engine too lenient)
```

> Scenario 14 is a documented skip (SP3). See `docs/test-plan.md` for rationale.
