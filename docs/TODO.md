# TODO — Future Work

---

## Next (v0.3.1+)

- **Postgres/OpenAI shape inference** — Already classified `shape-replacing` (not opaque). Real value is downstream expression checking against inferred fields.

---

## Future Work

### Agent Decision Surface

Design constraint: compact-by-default, detail on demand.

- **Causal slice trace** — Serialize propagation path from trigger through changed nodes to failure site. Infrastructure exists in `resolveChanged()` + `buildSlice()`.
- **Scope/execution rationale** — Promote `explain` reasoning into main response as structured fields.
- **Categorical confidence** — Replace binary status with `high`/`medium`/`low`/`unknown`. No numeric scores without calibration data.
- **Layered response envelope** — Default compact, detail via `verbose` flag. Prerequisite for the above.

### Lifecycle Guardrails (add when field-testing shows need)

- **Test-before-validate refusal** — Refuse `test` when changed nodes have no static trust record.
- **Runtime-sensitive hint after validate** — Advisory when escalation triggers fire on a passing validation.

### Distribution

- **GitHub Copilot agent support** — Separate config files, same MCP core.
- **npm registry publishing** — For standalone MCP server users.

- **Remove `availableInMCP` REST API workaround** — Older n8nac versions strip `availableInMCP` on push. The integration test setup re-enables it via REST API (`test/integration/lib/enable-mcp-access.ts`). Remove when the minimum supported n8nac version preserves the flag. May already be fixed in recent n8nac releases — needs testing.

- **Execution backend capability detection** — `detectCapabilities()` calls `tools/list` which we intercept and map to `client.listTools()`. Workaround because `tools/list` is not an actual MCP tool name. May be unblocked if the MCP SDK adds a standard tool-listing method.

---

## Definitely Blocked

Items with hard external dependencies that cannot be resolved by this project alone.

- **Bounded execution (`destinationNode`)** — True bounded execution is not available from any public n8n surface. Three options for future investigation: (1) n8n feature request to expose `destinationNode` on MCP `test_workflow`, (2) internal API with session auth (fragile, undocumented), (3) import `@n8n/core` directly (heavy, brittle). None suitable until n8n acts.

- **Credential type validation** — Deferred because it requires a credential type registry not available from `NodeSchemaProvider` in v1. Currently a no-op in `src/static-analysis/params.ts:52`. Needs either a bundled registry or a way to query n8n for credential type schemas. (audit finding PH-001)

- **MCP transport abstraction** — `test/integration/lib/n8n-mcp-client.ts` uses `StreamableHTTPClientTransport` directly. Only relevant if n8n ever supports other transports (stdio, SSE). No indication this is coming.
