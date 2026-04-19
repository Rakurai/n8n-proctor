---
name: validate-workflow
description: Validate n8n workflow changes using n8n-vet tools. Two-phase validation — static analysis before push (no n8n instance needed), execution validation after push (requires deployed workflow). Use when editing n8n-as-code workflow files (.ts), debugging execution failures, checking data flow between nodes, or testing workflow paths. n8n-vet is a sibling tool to n8nac — it validates, n8nac authors and pushes, and the agent coordinates both independently.
license: MIT
compatibility: Designed for Claude Code. Requires the n8n-vet MCP server (bundled by this plugin).
metadata:
  author: n8n-vet
  version: "0.2"
---

# n8n Workflow Validation

You have access to n8n-vet tools for validating n8n workflows. n8n-vet keeps validation **bounded, local, and diagnostic** rather than broad and wasteful.

n8n-vet is a **sibling tool** to n8nac. n8n-vet validates; n8nac authors and pushes. You coordinate both tools independently — neither wraps the other.

## Tools available

- **validate** — Run validation on a workflow. Returns a diagnostic summary with status, errors, warnings, and node annotations.
- **trust_status** — Check which nodes are trusted (previously validated and unchanged) vs which need validation.
- **explain** — Dry-run: see what validate would do without actually running it. Useful before deciding whether to force-override guardrails.

## Two-phase validation

Validation happens in two phases separated by an `n8nac push`. You control the phase with the `layer` parameter on `validate`.

### Phase 1: Static validation (before push)

**No n8n instance required.** Run this immediately after editing a `.ts` workflow file.

Call `validate` with `layer: 'static'` (the default). Static analysis catches:

- Data-loss between nodes (fields dropped or overwritten)
- Schema and parameter validation errors
- Broken expression references
- Wiring issues (missing connections, unreachable nodes)
- Node classification problems

This is cheap, local, and fast. Run it after every edit.

### Agent pushes the workflow

After static validation passes, push the workflow to n8n using `n8nac push`. This is **your responsibility** — n8n-vet does not push workflows.

The first `n8nac push` assigns an n8n workflow ID and writes it into the file's `metadata.id` field. This ID is required for execution validation.

### Phase 2: Execution validation (after push)

**Requires a deployed workflow on n8n.** Run this after `n8nac push` succeeds.

Call `validate` with `layer: 'execution'` or `layer: 'both'`. Execution validation:

- Runs a smoke test against the live n8n instance via MCP
- Observes the actual execution path taken
- Catches runtime issues that static analysis cannot detect (credential failures, external service errors, expression evaluation bugs)

`layer: 'both'` runs static analysis first, then execution. Use this when you want full coverage in a single call.

### The metadata.id requirement

Execution validation requires `metadata.id` to be populated in the workflow file. This field is set by the first `n8nac push`.

- If `metadata.id` is missing or empty when you request `layer: 'execution'`, n8n-vet returns an error: "Workflow file missing metadata.id -- cannot execute. Run n8nac push first to assign an n8n ID."
- If `metadata.id` is missing and you request `layer: 'both'`, static analysis runs and returns results, but the execution portion returns an error diagnostic. Both are included in the response.
- `layer: 'static'` works fine without `metadata.id`.

## Trust persistence

Trust state carries forward across validation calls. This is the key efficiency mechanism.

When nodes pass static validation (Phase 1), that trust state persists. When you later run execution validation (Phase 2), n8n-vet recognizes which nodes are already trusted from static analysis and reduces re-validation work.

Trust is invalidated only when a node's content changes. Unchanged nodes that passed static validation remain trusted through execution validation. This means:

- You do not need to re-prove static correctness during execution validation
- The execution phase focuses on runtime-specific concerns for changed or untrusted nodes
- Call `trust_status` at any point to see which nodes are trusted and which need validation

## When to validate

| Timing | Action |
|--------|--------|
| After editing a `.ts` workflow file | `validate` with `layer: 'static'` (default) |
| After `n8nac push` succeeds | `validate` with `layer: 'execution'` or `layer: 'both'` |
| Before pushing, to check data flow | `validate` with `layer: 'static'` |
| After an execution failure is reported | `validate` with `layer: 'execution'` targeting the failing node |
| When the user asks to check or test a workflow | Start with `trust_status`, then validate as needed |

## How to validate

1. **Default: validate what changed.** Call `validate` with just the `workflowPath`. The system auto-detects changes and validates the minimum useful scope. Default layer is `static`.

2. **Target specific nodes.** If you know which nodes changed: `{ kind: 'nodes', workflowPath: '...', nodes: ['HTTP Request', 'Set Fields'] }`.

3. **Respect guardrails.** If the system narrows your target or redirects from execution to static, it is saving you work. Read the `guardrailActions` in the response to understand why. Only use `force: true` if you have a specific reason.

4. **Check trust before broad validation.** Call `trust_status` to see what is already trusted. Do not re-validate unchanged regions.

## Typical workflow

```
1. Agent edits workflow.ts
2. validate(workflowPath, layer: 'static')     -- fix any static issues
3. n8nac push                                    -- agent's responsibility
4. validate(workflowPath, layer: 'execution')   -- trust from step 2 carries forward
```

## Common patterns

| Situation | Action |
|-----------|--------|
| Edited one node | `validate` with default target (auto-detects change, static layer) |
| Want to check data flow | `validate` with `layer: 'static'` |
| Need runtime proof after push | `validate` with `layer: 'execution'` |
| Full validation after push | `validate` with `layer: 'both'` |
| Debugging execution failure | `validate` with `layer: 'execution'` targeting the failing node |
| Smoke test whole workflow | `validate` with `kind: 'workflow', layer: 'execution'` |
| System refused validation | Call `explain` to understand why, then decide whether to `force` |
| Not sure what needs validation | Call `trust_status` first |

## Reading results

The `DiagnosticSummary` has a `status` field you can branch on: `pass`, `fail`, `error`, `skipped`.

- **pass**: No issues found. Trust is updated.
- **fail**: Errors found. Check `errors[]` for classified issues (`wiring`, `expression`, `credentials`, `external-service`).
- **error**: Tool or infrastructure failure. Check `errors[]` for what went wrong. Common cause: missing `metadata.id` when requesting execution.
- **skipped**: Guardrails refused (e.g., identical rerun). Read `guardrailActions[]` for explanation.

Focus on `errors` and `warnings`, not on the full node annotation list. The summary is designed to be compact -- do not expand it unnecessarily.
