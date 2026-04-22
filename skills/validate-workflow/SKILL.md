---
name: validate-workflow
description: Use to validate n8n-as-code workflow files, debug n8n execution failures, check data flow between nodes, or decide whether a workflow change needs runtime validation. Requires the n8n-proctor MCP server.
license: MIT
compatibility: ">=0.3.0"
---

# n8n Workflow Validation

You have access to n8n-proctor tools for validating n8n workflows. n8n-proctor keeps validation **bounded, local, and diagnostic** rather than broad and wasteful.

n8n-proctor is a **sibling tool** to n8nac. n8n-proctor validates data flow and wiring; n8nac validates node parameters against schemas and pushes.

## Tools

### validate

Run static analysis on a workflow. Returns a diagnostic summary. Does not require a running n8n instance.

**Parameters:**

| Param | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `kind` | `'changed' \| 'nodes' \| 'workflow'` | yes | — | `changed`: auto-detect what changed. `nodes`: target specific nodes. `workflow`: whole workflow. |
| `workflowPath` | string | yes | — | Relative path to the `.ts` workflow file. |
| `nodes` | string[] | only when `kind: 'nodes'` | — | Node names to validate. |
| `force` | boolean | no | `false` | Override guardrail decisions (narrowing, refusal). |
| `compact` | boolean | no | `false` | Return a shorter diagnostic summary. |

### test

Run execution-backed validation against a live n8n instance. Requires the workflow to be pushed (`metadata.id` must exist) and an n8n MCP connection.

**Parameters:**

| Param | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `kind` | `'changed' \| 'nodes' \| 'workflow'` | yes | — | `changed`: auto-detect what changed. `nodes`: target specific nodes. `workflow`: whole workflow. |
| `workflowPath` | string | yes | — | Relative path to the `.ts` workflow file. |
| `nodes` | string[] | only when `kind: 'nodes'` | — | Node names to validate. |
| `force` | boolean | no | `false` | Override guardrail decisions (narrowing, test-refusal). |
| `compact` | boolean | no | `false` | Return a shorter diagnostic summary. |
| `pinData` | `Record<string, {json: object}[]>` | no | — | Mock data keyed by node name. Used to pin upstream outputs during execution. |

### trust_status

Check which nodes are trusted (previously validated, unchanged) vs which need validation.

| Param | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `workflowPath` | string | yes | — | Relative path to the `.ts` workflow file. |
| `compact` | boolean | no | `false` | Return a shorter trust report. |

### explain

Dry-run guardrail evaluation. Shows what `validate` or `test` would decide without running validation.

| Param | Type | Required | Default |
|-------|------|----------|---------|
| `workflowPath` | string | yes | — |
| `kind` | `'changed' \| 'nodes' \| 'workflow'` | no | `'changed'` |
| `nodes` | string[] | no | — |
| `tool` | `'validate' \| 'test'` | no | `'validate'` |

## Response envelope

All tools return `{ success: true, data: <result> }` or `{ success: false, error: { type, message } }`.

Error types: `workflow_not_found`, `parse_error`, `configuration_error`, `infrastructure_error`, `trust_error`, `precondition_error`, `internal_error`.

## Development Workflow: Validate → Push → Test

Validation and testing are separate operations with separate tools. n8n-proctor catches data-flow and wiring issues; n8nac catches node parameter problems (invalid typeVersion, wrong operation values, missing required params). Together they cover complementary error classes. Both local validates are fast — run them before every push.

### Step 1: Validate (before push)

No n8n instance required. Two complementary checks:

1. **n8n-proctor `validate`** — Call with `kind: 'changed'` (or `'nodes'`). Catches data-loss between nodes, broken expression references, wiring issues, disconnected nodes, and node classification problems.
2. **`n8nac skills validate <workflowPath>`** — Validates node parameters against bundled n8n node schemas (800+ node types). Catches invalid typeVersions, wrong operation/resource values, type mismatches, and missing required parameters.

Both are cheap, local, and fast. Run both before pushing.

### Step 2: Push the workflow

After both validates pass, push with `n8nac push <workflowPath>`. The first push assigns `metadata.id` in the workflow file, which is required for execution testing.

### Step 3: Test (after push)

Requires a deployed workflow. Call `test` with the desired target. Runs a smoke test via MCP, observes the actual execution path, and catches runtime issues (credential failures, external service errors, expression evaluation bugs).

If `metadata.id` is missing when you call `test`, n8n-proctor returns a precondition error.

### n8nac schema tools reference

n8nac provides two schema validation commands. Both use the same validation engine and bundled schema data — the difference is the input source.

- **`n8nac skills validate <workflowPath>`** — validates a **local** `.workflow.ts` file. Use as a pre-push check or anytime during development. No n8n instance needed.
- **`n8nac verify <id>`** — fetches a **deployed** workflow from n8n by ID, then validates it. Use as a diagnostic when a deployed workflow misbehaves.

| Symptom | Command |
|---------|---------|
| Unsure if a typeVersion or operation value is valid | `n8nac skills validate <workflowPath>` |
| n8n-proctor `validate` passes but workflow is still broken | `n8nac skills validate <workflowPath>` — likely a parameter-level issue |
| Node shows "?" icon or "Could not find property option" in n8n | `n8nac verify <id>` |
| Workflow pushed but behaves unexpectedly | `n8nac verify <id>` |

n8n-proctor's `validate` and n8nac's schema tools catch different error classes. When diagnosing a problem, use both.

Trust carries forward across calls. Nodes that pass static validation (Step 1) remain trusted through execution testing (Step 3) as long as their content hasn't changed. This means execution focuses only on runtime-specific concerns.

Call `trust_status` to see current trust state before deciding what to validate or test.

## How `kind: 'changed'` works

When you use `kind: 'changed'`, n8n-proctor compares the current workflow against the last validated snapshot:

- **With a prior snapshot**: Detects added nodes, modified nodes (parameter/expression/connection changes), and nodes that exist in the graph but have no trust record. Only these nodes (plus their forward/backward dependents up to trust boundaries) enter the validation scope.
- **Without a prior snapshot** (first-ever validation): Every node is considered "changed" — equivalent to `kind: 'workflow'`. This is expected on first use.
- **No changes detected**: All nodes are trusted and unchanged. The tool returns `status: 'skipped'` with an explanation. Use `kind: 'workflow'` with `force: true` to re-validate anyway.

## When to validate

| Situation | Call |
|-----------|------|
| Edited a `.ts` workflow file | `validate({ kind: 'changed', workflowPath })` + `n8nac skills validate <path>` |
| Want to check data flow before push | `validate({ kind: 'changed', workflowPath })` |
| Want to check node parameters before push | `n8nac skills validate <workflowPath>` |
| Debugging node parameter issues on deployed workflow | `n8nac verify <id>` |
| Target specific nodes for static analysis | `validate({ kind: 'nodes', workflowPath, nodes: ['HTTP Request', 'Set Fields'] })` |
| System refused validation | Call `explain` to understand why, then decide whether to `force` |
| Not sure what needs validation | Call `trust_status` first |

## When to test

| Situation | Call |
|-----------|------|
| After `n8nac push` succeeds | `test({ kind: 'changed', workflowPath })` |
| Smoke test whole workflow | `test({ kind: 'workflow', workflowPath })` |
| Debugging execution failure | `test({ kind: 'nodes', workflowPath, nodes: ['Failing Node'] })` |
| Mock upstream data for execution | `test({ kind: 'nodes', workflowPath, nodes: [...], pinData: { 'Source Node': [{ json: { field: 'value' } }] } })` |

## Reading results

The `DiagnosticSummary` has a `status` field: `pass`, `fail`, `error`, `skipped`.

- **pass** — No issues. Trust updated.
- **fail** — Errors found. Check `errors[]` for classified issues.
- **error** — Tool/infrastructure failure (not a workflow bug).
- **skipped** — Guardrails refused. Read `guardrailActions[]` for explanation.

Note: if `metadata.id` is missing when calling `test`, the response is an error envelope (`success: false`, `type: 'precondition_error'`), not a diagnostic summary.

### Coverage

The `coverage` field on `DiagnosticSummary` reports how much of the validation scope was statically analyzable:

- `coverage.analyzableRatio` — fraction of in-scope nodes that are not shape-opaque (0.0–1.0)
- `coverage.counts` — per-classification breakdown: `shape-preserving`, `shape-augmenting`, `shape-replacing`, `shape-opaque`
- `coverage.totalInScope` — total nodes in the resolved target scope

A low `analyzableRatio` means many nodes are shape-opaque (Code, Function, AI nodes, etc.) and static analysis has limited visibility. Consider execution-backed testing for higher confidence.

### Next action

The `nextAction` field recommends the highest-value next step:

| Value | Meaning |
|-------|--------|
| `fix-errors` | Errors found — fix the listed issues |
| `fix-workflow` | Workflow could not be parsed |
| `fix-request` | Validation request is malformed (e.g. `kind: 'nodes'` without `nodes`) |
| `push-workflow` | No `metadata.id` — push with n8nac before testing |
| `use-validate` | Use `validate` instead of `test` — static analysis is sufficient |
| `narrow-scope` | Target is too broad — narrow to specific nodes or use `kind: 'changed'` |
| `review-warnings` | Passed but warnings exist — review before continuing |
| `continue-building` | Passed — proceed with development |
| `force-revalidate` | Skipped by guardrails — use `force: true` if needed |
| `none` | Nothing to do — validation was skipped with no action needed |

Use `nextAction` as your primary decision signal after reading the status.

### Error classifications

Branch on `errors[].classification`:

| Classification | Meaning | Agent action |
|---------------|---------|-------------|
| `wiring` | Broken references, missing connections | Fix workflow structure |
| `expression` | Invalid expressions, reference errors | Fix the expression |
| `credentials` | Missing or invalid credentials | Ask user to configure |
| `external-service` | Third-party API failure | Retry or ask user |
| `platform` | n8n infrastructure issue | Not fixable by editing workflow |
| `cancelled` | Execution was cancelled | Investigate cause |
| `unknown` | Unclassified | Inspect error message |

### Hints

Check `hints[]` for additional signals. Each hint has `severity: 'info' | 'warning' | 'danger'` and a `message`. These supplement errors with context about opaque nodes, trust boundaries, reduced confidence areas, and disconnected nodes (nodes unreachable from any trigger).

## Guardrails

If the system narrows your target or refuses, read `guardrailActions[]` in the response. Each action has an `explanation` and is `overridable: true/false`. Only use `force: true` if you have a specific reason to override.

When calling `test` and the guardrails determine all changes are structurally analyzable (no opaque nodes, no runtime-dependent behavior), the tool will refuse and recommend using `validate` instead. This is the **test-refusal** guardrail — it prevents unnecessary execution cost when static analysis is sufficient.

Guardrail actions: `proceed`, `warn`, `narrow`, `refuse`.
