# Implementation Plan: Plugin Wrapper

**Branch**: `009-plugin-wrapper` | **Date**: 2026-04-19 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-plugin-wrapper/spec.md`

## Summary

Bundle the existing n8n-vet MCP server, CLI, and supporting subsystems into a fully functional Claude Code plugin. The plugin provides automatic dependency installation, secure credential management, trust state persistence across sessions, a validation skill for agent teaching, and CLI access within plugin sessions. Most plugin infrastructure files already exist as scaffolds from Phase 0 — this phase validates, refines, tests, and completes them.

## Technical Context

**Language/Version**: TypeScript 5.7+ (strict mode, ESM) on Node.js 20+
**Primary Dependencies**: `@modelcontextprotocol/sdk`, `@n8n-as-code/transformer`, `zod`
**Storage**: JSON files for trust state and snapshots (via `N8N_VET_DATA_DIR` or `.n8n-vet/`)
**Testing**: vitest
**Target Platform**: Claude Code plugin runtime (macOS, Linux)
**Project Type**: Claude Code plugin wrapping an MCP server + CLI library
**Performance Goals**: MCP tools responsive within 10 seconds of session start (post-install); SessionStart hook < 5s when no install needed
**Constraints**: All mutable state in `${CLAUDE_PLUGIN_DATA}` (plugin root is ephemeral); sensitive config via system keychain only; skill body < 500 lines
**Scale/Scope**: Single plugin, 3 MCP tools, 1 skill, 1 hook

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Fail-Fast, No Fallbacks | PASS | Hook raises visible error on install failure (FR-008). No silent degradation. Missing credentials return typed error, not degraded results (FR-003a). |
| II. Contract-Driven Boundaries | PASS | Plugin manifest uses `userConfig` schema with sensitivity annotations. MCP response envelope validates at boundary. Trust persistence uses Zod schema. |
| III. No Over-Engineering | PASS | Plugin wrapper is thin — delegates all logic to existing subsystems. No new abstractions. Single manifest, no dev/prod split. |
| IV. Honest Code Only | PASS | All referenced files already exist with real implementations (MCP server, CLI, trust persistence). No stubs or phantoms needed. |
| V. Minimal, Meaningful Tests | PASS | Integration tests for plugin load, hook behavior, trust path resolution, skill discovery. No trivial tests. |

All gates pass. No violations to justify.

**Post-Phase 1 re-check**: Still passing. Design adds no new abstractions (principle III), no stubs (principle IV), and the only source change (snapshot path alignment) uses the same env-var pattern already established in trust persistence. Tests are integration-level, not trivial (principle V).

## Project Structure

### Documentation (this feature)

```text
specs/009-plugin-wrapper/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
.claude-plugin/
└── plugin.json            # Plugin manifest — EXISTS, needs version-sync validation

.mcp.json                  # MCP server stdio config — EXISTS, complete

hooks/
└── hooks.json             # SessionStart hook — EXISTS, needs edge-case hardening

skills/
└── validate-workflow/
    └── SKILL.md           # Validation skill — EXISTS, needs progressive-disclosure review

bin/
└── n8n-vet                # CLI binary — NEEDS CREATION (symlink to dist/cli/index.js)

src/
├── mcp/serve.ts           # MCP server entry point — EXISTS, no changes needed
├── cli/index.ts           # CLI entry point — EXISTS, no changes needed
├── trust/persistence.ts   # Trust state with N8N_VET_DATA_DIR support — EXISTS, no changes needed
└── orchestrator/snapshots.ts  # Snapshot with dataDir support — EXISTS, may need N8N_VET_DATA_DIR

test/
├── plugin/                # NEW: Plugin integration tests
│   ├── manifest.test.ts   # Version sync, schema validation
│   ├── hook.test.ts       # SessionStart hook behavior
│   └── trust-path.test.ts # Dual-mode trust state resolution
└── integration/
    └── skill.test.ts      # Skill format compliance
```

**Structure Decision**: Plugin wrapper is not a new subsystem — it's configuration files and tests around existing subsystems. Source changes are minimal (snapshot path resolution alignment, bin symlink). Most work is in the `.claude-plugin/`, `hooks/`, `skills/`, and `test/` directories.

## Complexity Tracking

No violations. No complexity justification needed.
