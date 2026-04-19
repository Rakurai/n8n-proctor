# Implementation Audit: Plugin Wrapper

**Date**: 2026-04-19
**Branch**: 009-plugin-wrapper
**Base**: main (2a178b0)
**Files audited**: 11 (1 source change, 1 binary, 8 test files, 1 CLAUDE.md update)

---

## Findings

| ID | Category | Severity | Location | Description | Quoted Evidence |
|----|----------|----------|----------|-------------|-----------------|
| SD-001 | Spec Drift | HIGH | `specs/009-plugin-wrapper/spec.md:141` | FR-013 says trust stored in `${CLAUDE_PLUGIN_DATA}/trust/` but code writes to `${N8N_VET_DATA_DIR}/trust-state.json` (data dir root, no `trust/` subdirectory). US5 scenario 2 (line 88) was fixed to say `${CLAUDE_PLUGIN_DATA}/` but FR-013 was not updated to match. | `FR-013: Trust state MUST be stored in ${CLAUDE_PLUGIN_DATA}/trust/ when running as a plugin` |
| TQ-001 | Test Quality | MEDIUM | `test/plugin/credentials.test.ts:19-25` | T013(a) requires "capabilities detection returns static-only when N8N_HOST is empty string" but the test verifies `resolveCredentials()` throws, not that the system returns static-only capabilities. The graceful degradation (orchestrator catching the error) is untested. | `it('resolveCredentials throws ExecutionConfigError when N8N_HOST is empty string', async () => { ... await expect(resolveCredentials()).rejects.toThrow(ExecutionConfigError); })` |
| TQ-002 | Test Quality | MEDIUM | `test/plugin/hook.test.ts:54-57` | "command removes cached copy on failure" assertion is trivially satisfiable. It checks `toContain('rm')` and `toContain('package.json')` separately, but `package.json` appears 4 times in the command string (in diff, cp, npm install context, and rm). The test passes even if the `rm` clause were removed. | `it('command removes cached copy on failure (fail-fast)', () => { expect(command).toContain('rm'); expect(command).toContain('package.json'); })` |
| TQ-003 | Test Quality | LOW | `test/plugin/mcp-config.test.ts:37-51` | Four near-identical tests each assert `toHaveProperty` for one env var key. These verify the same contract (env vars are declared) through the same mechanism, differing only in the string literal. One test with four assertions would be equivalent. | `it('passes N8N_HOST env var', () => { expect(server.env).toHaveProperty('N8N_HOST'); })` (repeated x4) |
| TQ-004 | Test Quality | LOW | `test/plugin/skill.test.ts:43-51` | Three tests each assert `body.toContain()` for one tool name. Same pattern as TQ-003 -- one test with three assertions covers the same contract. | `it('body mentions validate tool', () => { expect(body).toContain('validate'); })` (repeated x3) |

---

## Requirement Traceability

| Requirement | Status | Implementing Code | Notes |
|-------------|--------|-------------------|-------|
| FR-001 | IMPLEMENTED | `.claude-plugin/plugin.json` (pre-existing scaffold) | Validated by T005, tested in `test/plugin/manifest.test.ts` |
| FR-002 | IMPLEMENTED | `.claude-plugin/plugin.json:3`, `package.json:3` | Version sync tested in `test/plugin/manifest.test.ts:15` |
| FR-003 | IMPLEMENTED | `.claude-plugin/plugin.json:12-19` (pre-existing scaffold) | userConfig fields validated by T011 |
| FR-003a | IMPLEMENTED | `src/execution/rest-client.ts:176`, `src/errors.ts:68` | ExecutionConfigError → configuration_error mapping; tested in `test/plugin/credentials.test.ts` |
| FR-004 | IMPLEMENTED | `.mcp.json` (pre-existing scaffold) | stdio transport, tested in `test/plugin/mcp-config.test.ts` |
| FR-005 | IMPLEMENTED | `.mcp.json:7-10` | N8N_HOST, N8N_API_KEY env vars passed; tested in `test/plugin/mcp-config.test.ts` |
| FR-006 | IMPLEMENTED | `hooks/hooks.json` (pre-existing scaffold) | SessionStart hook with diff + npm install; tested in `test/plugin/hook.test.ts` |
| FR-007 | IMPLEMENTED | `hooks/hooks.json:8` | `cp` in hook command copies package.json after install |
| FR-008 | IMPLEMENTED | `hooks/hooks.json:8` | `rm -f` on failure removes cached copy, `||` chain exits non-zero |
| FR-009 | IMPLEMENTED | `hooks/hooks.json:8` | `diff -q` skips when files match |
| FR-010 | IMPLEMENTED | `skills/validate-workflow/SKILL.md` (pre-existing scaffold) | Tested in `test/plugin/skill.test.ts` |
| FR-011 | IMPLEMENTED | `skills/validate-workflow/SKILL.md:13,29,35,37` | Bounded targets, static-first, trust reuse, guardrail understanding all present |
| FR-012 | IMPLEMENTED | `skills/validate-workflow/SKILL.md:1-9` | agentskills.io frontmatter with name, description, license, compatibility, metadata |
| FR-013 | DEVIATED | `src/trust/persistence.ts:134` | Code writes to `${N8N_VET_DATA_DIR}/trust-state.json`; FR-013 says `${CLAUDE_PLUGIN_DATA}/trust/`. See SD-001. |
| FR-014 | IMPLEMENTED | `.mcp.json:9`, `src/trust/persistence.ts:134`, `src/orchestrator/snapshots.ts:49` | Runtime mode detected via N8N_VET_DATA_DIR (mapped from CLAUDE_PLUGIN_DATA by .mcp.json) |
| FR-015 | IMPLEMENTED | `bin/n8n-vet` | Tested in `test/plugin/cli-binary.test.ts` |
| FR-016 | IMPLEMENTED | `package.json:12` | `"bin": { "n8n-vet": "./dist/cli/index.js" }` |
| FR-017 | IMPLEMENTED | `.mcp.json:9-10`, `hooks/hooks.json:8` | All mutable state uses CLAUDE_PLUGIN_DATA paths |

---

## Architecture Compliance Summary

Architecture compliance: no architecture docs exist for this project (§H checks N/A).

---

## Metrics

- **Files audited**: 11
- **Findings**: 0 critical, 1 high, 2 medium, 2 low
- **Spec coverage**: 17 / 18 requirements implemented (1 deviated: FR-013)
- **Constitution compliance**: 0 violations across 5 principles checked

---

## Remediation Decisions

### 1. [SD-001] FR-013 says trust stored in `${CLAUDE_PLUGIN_DATA}/trust/` but code writes to data dir root

**Location**: `specs/009-plugin-wrapper/spec.md:141`
**Spec says**: Trust state MUST be stored in `${CLAUDE_PLUGIN_DATA}/trust/`
**Code does**: Trust state written to `${N8N_VET_DATA_DIR}/trust-state.json` (data dir root). US5 scenario 2 already corrected to match code.

The code is correct (trust subsystem owns its file layout). FR-013 is the stale artifact.

Action: fix / **spec** / skip / split

---

### MEDIUM / LOW Summary

- **TQ-001** (MEDIUM): `credentials.test.ts` tests `resolveCredentials()` throwing, not the orchestrator gracefully degrading to static-only. The spec-required "returns static-only capabilities" behavior is tested only indirectly (via existing `test/orchestrator/interpret.test.ts`).
- **TQ-002** (MEDIUM): `hook.test.ts` "removes cached copy on failure" assertion is trivially satisfiable — `toContain('package.json')` matches the diff/cp parts, not specifically the rm clause.
- **TQ-003** (LOW): Four identical env-var presence tests in `mcp-config.test.ts` could be one test.
- **TQ-004** (LOW): Three identical tool-name presence tests in `skill.test.ts` could be one test.

Do you want to promote any MEDIUM/LOW findings to remediation tasks?

---

## Proposed Spec Changes

**SD-001**: Update FR-013 in `specs/009-plugin-wrapper/spec.md:141` from:
> FR-013: Trust state MUST be stored in `${CLAUDE_PLUGIN_DATA}/trust/` when running as a plugin and in `.n8n-vet/` when running standalone.

To:
> FR-013: Trust state MUST be stored in `${CLAUDE_PLUGIN_DATA}/` when running as a plugin and in `.n8n-vet/` when running standalone. The trust subsystem controls exact file layout within the data directory.

---

## Remediation Tasks

All 5 findings remediated on 2026-04-19:

- [x] T024 [AR] Update FR-013 in `spec.md:141` — remove `/trust/` subdirectory, match US5 scenario and actual code behavior
- [x] T025 [AR] Rewrite `test/plugin/credentials.test.ts` — verify throw + MCP mapping in one test, add structural verification of orchestrator catch behavior
- [x] T026 [AR] Fix `test/plugin/hook.test.ts:54-57` — replace trivial `toContain('rm')` with regex matching `rm -f.*CLAUDE_PLUGIN_DATA.*package.json`
- [x] T027 [AR] Consolidate 4 env-var presence tests in `test/plugin/mcp-config.test.ts` into one loop-based test
- [x] T028 [AR] Consolidate 3 tool-name presence tests in `test/plugin/skill.test.ts` into one loop-based test
