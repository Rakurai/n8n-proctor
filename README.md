# n8n-proctor

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node >= 20](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg?logo=typescript&logoColor=white)](tsconfig.json)

Stop re-running the whole workflow. Validate what changed.

n8n-proctor is a validation control tool for agent-built n8n workflows. It exposes an MCP server that agents call during development. Given a workflow file and a change, it:

- **Targets the change, not the workflow.** Computes the smallest useful slice around what changed, selects a path through it, and validates that — not the whole graph.
- **Tracks trust across edits.** Nodes validated in prior runs stay trusted until they change. Previously validated, unchanged regions become trusted boundaries instead of repeated work.
- **Runs static analysis before touching n8n.** Expression tracing, data-loss detection, and schema checks run locally first. Execution against the n8n instance is reserved for cases where runtime evidence is actually needed.
- **Returns structured diagnostics, not transcripts.** Compact JSON with classified errors, node annotations, and guardrail explanations. Optimized for agent token budgets, not human scrolling.
- **Prevents low-value work.** Guardrails warn, narrow, redirect, or refuse requests that would waste time — identical reruns, overly broad targets, execution when static suffices.

## How it works

```
workflow file
     │
     ▼
┌─ parse ─── graph ─── trust ─── target ─── guardrails ──┐
│                                                        │
│  static analysis (always)    execution (when needed)   │
│                                                        │
└────────────────── diagnostic summary ──────────────────┘
                          │
                     update trust
```

1. Parse the workflow (TypeScript via n8n-as-code)
2. Build a traversable graph with node classification and expression references
3. Load trust state — what was validated before, what changed since
4. Compute the validation target — changed nodes + forward propagation
5. Consult guardrails — should this proceed, narrow, redirect, or refuse?
6. Run static analysis (always) and execution (only when warranted)
7. Synthesize a diagnostic summary
8. Update trust for next time

For the engineering details: [Strategy](docs/STRATEGY.md) covers the target-selection, prioritization, and rerun-suppression approaches (including RTS/TIA-style targeting and DeFlaker-style rerun suppression) and their evidence basis.

## MCP tools

n8n-proctor exposes four MCP tools:

| Tool | Purpose |
|------|---------|
| **`validate`** | Static analysis — resolves scope, applies guardrails, runs structural checks, returns diagnostics |
| **`test`** | Execution-backed testing — runs the workflow against a live n8n instance for runtime evidence |
| **`trust_status`** | Inspect what's trusted, what changed, what needs validation |
| **`explain`** | Dry-run guardrail evaluation — preview what `validate` or `test` would decide |

`validate` and `test` are separate tools producing separate evidence types (`static` and `execution`). The agent coordinates a push step between them via n8nac: **validate → push → test**.

Default behavior when the agent calls `validate` with no target: validate whatever changed since the last successful run, using static analysis. The cheapest useful default.

## Setup

### Claude Code plugin (recommended)

```
/plugin marketplace add Rakurai/n8n-proctor
/plugin install n8n-proctor@n8n-proctor
```

Then configure the MCP servers n8n-proctor needs at runtime — **n8n-mcp** (n8n's
built-in MCP server for workflow execution) and **n8nac** (for workflow authoring):

```sh
claude mcp add n8n-mcp --transport http --url http://localhost:5678/mcp-server/http
claude mcp add n8nac -- npx --yes n8nac mcp
```

### VS Code / Copilot

Add to your `.vscode/settings.json`:

```jsonc
{
  "mcp.servers": {
    "n8n-proctor": { "command": "node", "args": ["./dist/mcp/serve.js"] },
    "n8n-mcp": { "url": "http://localhost:5678/mcp-server/http" },
    "n8nac": { "command": "npx", "args": ["--yes", "n8nac", "mcp"] }
  }
}
```

### Other MCP clients (Claude Desktop, Cursor, etc.)

```json
{
  "mcpServers": {
    "n8n-proctor": {
      "command": "node",
      "args": ["./dist/mcp/serve.js"]
    }
  }
}
```

### From source

```sh
git clone https://github.com/Rakurai/n8n-proctor.git && cd n8n-proctor
npm install && npm run build
```

### Prerequisites

- **Node >= 20**
- **n8n instance** — required for execution-layer testing (static analysis works without one)
- **n8nac** — for workflow authoring and push to n8n ([n8n-as-code](https://github.com/EtienneLescot/n8n-as-code))

## CLI

A secondary CLI exists for local debugging and development:

```
n8n-proctor validate workflow.ts                    # static analysis on changes
n8n-proctor test workflow.ts                        # execution-backed testing
n8n-proctor trust workflow.ts                       # inspect trust state
n8n-proctor explain workflow.ts                     # preview guardrail decision
n8n-proctor validate workflow.ts --target workflow  # validate entire workflow
n8n-proctor validate workflow.ts --json             # raw JSON (same as MCP output)
```

## Built on

- [n8n-as-code](https://github.com/EtienneLescot/n8n-as-code) (n8nac) — sibling tool for workflow authoring and push; n8n-proctor and n8nac are independent tools that an agent coordinates, not layered dependencies
- TypeScript, strict mode, ESM
- MCP server via `@modelcontextprotocol/sdk`

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, integration testing,
and coding conventions.

## License

[MIT](LICENSE)
