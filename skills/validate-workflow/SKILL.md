---
name: validate-workflow
description: Use to validate n8n-as-code workflow files, debug n8n execution failures, check data flow between nodes, or decide whether a workflow change needs runtime validation. Requires the n8n-vet MCP server.
license: MIT
compatibility: ">=0.1.0"
---

# n8n Workflow Validation

You have access to n8n-vet tools for validating n8n workflows. n8n-vet keeps validation **bounded, local, and diagnostic** rather than broad and wasteful.

n8n-vet is a **sibling tool** to n8nac. n8n-vet validates; n8nac authors and pushes. You coordinate both tools independently.

## Tools

### validate

Run validation on a workflow. Returns a diagnostic summary.

**Parameters:**

| Param | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `kind` | `'changed' \| 'nodes' \| 'workflow'` | yes | — | `changed`: auto-detect what changed. `nodes`: target specific nodes. `workflow`: whole workflow. |
| `workflowPath` | string | yes | — | Relative path to the `.ts` workflow file. |
| `nodes` | string[] | only when `kind: 'nodes'` | — | Node names to validate. |
| `layer` | `'static' \| 'execution' \| 'both'` | no | `'static'` | `static`: local analysis, no n8n needed. `execution`: live run against n8n. `both`: static first, then execution. |
| `force` | boolean | no | `false` | Override guardrail decisions (narrowing, redirect, refusal). |
| `pinData` | `Record<string, {json: object}[]>` | no | — | Mock data keyed by node name. Used to pin upstream outputs during execution. |

### trust_status

Check which nodes are trusted (previously validated, unchanged) vs which need validation.

| Param | Type | Required |
|-------|------|----------|
| `workflowPath` | string | yes |

### explain

Dry-run guardrail evaluation. Shows what `validate` would decide without running validation.

| Param | Type | Required | Default |
|-------|------|----------|---------|
| `workflowPath` | string | yes | — |
| `kind` | `'changed' \| 'nodes' \| 'workflow'` | no | `'changed'` |
| `nodes` | string[] | no | — |
| `layer` | `'static' \| 'execution' \| 'both'` | no | `'static'` |

## Response envelope

All tools return `{ success: true, data: <result> }` or `{ success: false, error: { type, message } }`.

Error types: `workflow_not_found`, `parse_error`, `configuration_error`, `infrastructure_error`, `trust_error`, `precondition_error`, `internal_error`.

## Two-phase validation

Validation happens in two phases separated by an `n8nac push`.

### Phase 1: Static (before push)

No n8n instance required. Call `validate` with `kind: 'changed'` (or `'nodes'`) and `layer: 'static'` (the default). Catches data-loss between nodes, broken expression references, schema/parameter errors, wiring issues, and node classification problems. Cheap, local, fast.

### Push the workflow

After static validation passes, push with `n8nac push`. n8n-vet does not push. The first push assigns `metadata.id` in the workflow file, which is required for execution validation.

### Phase 2: Execution (after push)

Requires a deployed workflow. Call `validate` with `layer: 'execution'` or `layer: 'both'`. Runs a smoke test via MCP, observes the actual execution path, and catches runtime issues (credential failures, external service errors, expression evaluation bugs).

If `metadata.id` is missing when you request execution, n8n-vet returns an error. With `layer: 'both'`, static results are still returned alongside the execution error.

## Trust persistence

Trust carries forward across calls. Nodes that pass static validation (Phase 1) remain trusted through execution validation (Phase 2) as long as their content hasn't changed. This means execution focuses only on runtime-specific concerns.

Call `trust_status` to see current trust state before deciding what to validate.

## When to validate

| Situation | Call |
|-----------|------|
| Edited a `.ts` workflow file | `validate({ kind: 'changed', workflowPath })` |
| Want to check data flow before push | `validate({ kind: 'changed', workflowPath })` |
| After `n8nac push` succeeds | `validate({ kind: 'changed', workflowPath, layer: 'execution' })` |
| Full validation after push | `validate({ kind: 'changed', workflowPath, layer: 'both' })` |
| Target specific nodes | `validate({ kind: 'nodes', workflowPath, nodes: ['HTTP Request', 'Set Fields'] })` |
| Smoke test whole workflow | `validate({ kind: 'workflow', workflowPath, layer: 'execution' })` |
| Debugging execution failure | `validate({ kind: 'nodes', workflowPath, nodes: ['Failing Node'], layer: 'execution' })` |
| Mock upstream data for execution | `validate({ kind: 'nodes', workflowPath, nodes: [...], layer: 'execution', pinData: { 'Source Node': [{ json: { field: 'value' } }] } })` |
| System refused validation | Call `explain` to understand why, then decide whether to `force` |
| Not sure what needs validation | Call `trust_status` first |

## Reading results

The `DiagnosticSummary` has a `status` field: `pass`, `fail`, `error`, `skipped`.

- **pass** — No issues. Trust updated.
- **fail** — Errors found. Check `errors[]` for classified issues.
- **error** — Tool/infrastructure failure (not a workflow bug). Common: missing `metadata.id`.
- **skipped** — Guardrails refused. Read `guardrailActions[]` for explanation.

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

Check `hints[]` for additional signals. Each hint has `severity: 'info' | 'warning' | 'danger'` and a `message`. These supplement errors with context about opaque nodes, trust boundaries, or reduced confidence areas.

## Guardrails

If the system narrows your target, redirects from execution to static, or refuses, read `guardrailActions[]` in the response. Each action has an `explanation` and is `overridable: true/false`. Only use `force: true` if you have a specific reason to override.

Guardrail actions: `proceed`, `warn`, `narrow`, `redirect`, `refuse`.
