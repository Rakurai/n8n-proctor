# Quickstart: Execution Backend Revision

**Branch**: `012-execution-backend-revision`

## What Changed

The execution subsystem was designed around two backends: REST (bounded execution via `POST /workflows/:id/run`) and MCP (`test_workflow` for whole-workflow). Research confirmed that `POST /workflows/:id/run` is an internal/editor-only endpoint — not accessible via API key auth. This revision removes the non-functional REST execution path and consolidates on MCP `test_workflow` as the sole execution backend.

## Key Concept: Scoped Pin Data

"Bounded execution" (running only a slice of the workflow) is replaced by "scoped pin data." Pin data placed at trusted boundaries prevents those nodes from executing, so the effective execution scope is the unpinned region. The workflow runs whole, but pinned nodes pass through their fixed data without re-executing.

## Development Setup

No new dependencies or infrastructure required. The existing MCP connection to n8n remains the execution surface. REST API credentials (if configured) continue to work for read operations (execution data retrieval, workflow existence checks).

## Files to Modify

See `data-model.md` for entity-level changes and `plan.md` for the phased implementation order.

## Verification

After implementation:
1. `npm run typecheck` — zero errors
2. `npm test` — all tests pass
3. `npm run lint` — zero warnings
4. Search for `executeBounded` — zero results
5. Search for `destinationNode` in source — zero results (design docs may reference it in deferred/historical context)
