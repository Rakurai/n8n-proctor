# Quickstart: Integration Testing Suite

**Feature**: 010-integration-testing
**Date**: 2026-04-19

## Prerequisites

1. **n8n instance running** — verify: `curl http://localhost:5678/api/v1/workflows` returns 200
2. **n8n API key** — set `N8N_API_KEY` env var or configure via n8nac
3. **n8nac CLI available** — verify: `n8nac --version`
4. **n8nac configured** — `n8nac config` shows correct host pointing to your n8n instance
5. **Node.js 20+** — verify: `node --version`
6. **Project built** — run: `npm run build`
7. **Dependencies installed** — run: `npm install`

## First-Time Setup

```bash
# 1. Build the project
npm run build

# 2. Seed fixtures (creates test workflows on n8n, pulls as artifacts)
npx tsx test/integration/seed.ts

# 3. Commit the fixtures (they're real server artifacts)
git add test/integration/fixtures/
```

## Running Tests

```bash
# Check prerequisites (no tests run)
npx tsx test/integration/run.ts --check

# Run all 8 scenarios
npx tsx test/integration/run.ts

# Run a single scenario
npx tsx test/integration/run.ts --scenario 04

# Verbose output (print diagnostic summaries)
npx tsx test/integration/run.ts --verbose
```

## Key Files

| File | Purpose |
|------|---------|
| `test/integration/seed.ts` | Creates test workflows on n8n, pulls as n8nac artifacts |
| `test/integration/run.ts` | Test runner entry point |
| `test/integration/fixtures/` | Committed n8nac workflow artifacts + manifest |
| `test/integration/scenarios/` | 8 scenario scripts (01 through 08) |
| `test/integration/lib/` | Shared utilities (setup, push, assertions, MCP client) |

## Refreshing Fixtures

Re-run the seed script when:
- n8n version changes (node schemas may drift)
- Adding a new fixture to the catalog
- A fixture stops round-tripping cleanly

```bash
npx tsx test/integration/seed.ts
git diff test/integration/fixtures/  # Review changes
```

## Debugging Failures

1. Run the failing scenario in isolation: `npx tsx test/integration/run.ts --scenario 03 --verbose`
2. Check the workflow on n8n (fixture names start with `n8n-vet-test--`)
3. Check execution history: `n8nac execution list --workflow-id <id-from-manifest>`
4. The failure message includes fixture name, expected outcome, and actual outcome
