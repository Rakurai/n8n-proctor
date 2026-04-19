# Quickstart: Plugin Wrapper

## What this phase delivers

A complete Claude Code plugin that makes n8n-vet's MCP tools, CLI, and validation skill available to agents with zero manual setup beyond providing n8n connection details.

## Key files

| File | Purpose | Status |
|------|---------|--------|
| `.claude-plugin/plugin.json` | Plugin manifest with userConfig | Exists — validate version sync |
| `.mcp.json` | MCP server stdio config | Exists — complete |
| `hooks/hooks.json` | SessionStart dependency hook | Exists — harden error handling |
| `skills/validate-workflow/SKILL.md` | Agent validation skill | Exists — review content |
| `bin/n8n-vet` | CLI binary for plugin PATH | Needs creation |
| `src/orchestrator/snapshots.ts` | Snapshot path resolution | Needs N8N_VET_DATA_DIR alignment |

## What's already done

The Phase 0 scaffolding and Phase 8 implementation created all the core plugin files:
- Plugin manifest with correct `userConfig` schema
- MCP server config with template variable resolution
- SessionStart hook with diff-and-install logic
- Validation skill with agentskills.io frontmatter and teaching content
- Trust persistence already respects `N8N_VET_DATA_DIR`

## What needs to happen

1. **Snapshot path fix**: Align `snapshots.ts` path resolution with trust persistence's `N8N_VET_DATA_DIR` pattern
2. **CLI binary**: Create `bin/n8n-vet` shebang wrapper
3. **Version sync validation**: Ensure plugin manifest version matches package.json (build-time or test-time check)
4. **Integration tests**: Plugin load, hook behavior, trust path dual-mode, skill compliance
5. **Edge case handling**: Empty credentials in MCP server, hook failure surfacing

## How to test locally

1. Build: `npm run build`
2. Load as plugin: `claude --plugin-dir .`
3. Verify tools: check that `validate`, `trust_status`, `explain` tools appear
4. Verify skill: run `/help` and check `validate-workflow` appears
5. Verify CLI: run `n8n-vet validate test/fixtures/simple-linear.ts` in Bash tool
6. Verify trust persistence: run validation, restart session, check trust_status
