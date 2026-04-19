# Tasks: Plugin Wrapper

**Input**: Design documents from `/specs/009-plugin-wrapper/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Integration tests included — the PRD acceptance criteria require verifiable plugin behavior and the plan explicitly calls for integration tests.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Verify existing scaffolds and establish the one missing file

- [x] T001 Verify build succeeds and dist/mcp/serve.js exists after `npm run build`
- [x] T002 Create CLI binary wrapper script at bin/n8n-vet with Node.js shebang pointing to dist/cli/index.js

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Fix the snapshot path resolution gap identified in research — blocks trust persistence in plugin mode (US5) and affects all validation flows

- [x] T003 Align snapshot path resolution in src/orchestrator/snapshots.ts to check `process.env.N8N_VET_DATA_DIR` when no explicit `dataDir` is provided, matching the pattern in src/trust/persistence.ts. Note: resolved path should be `${N8N_VET_DATA_DIR}/snapshots/` (preserve the `snapshots` subdirectory), not the data dir root
- [x] T004 Update snapshot path tests to verify dual-mode resolution: `N8N_VET_DATA_DIR` present uses that directory, absent uses `.n8n-vet/snapshots`

**Checkpoint**: Foundation ready — snapshot and trust persistence both respect `N8N_VET_DATA_DIR`. User story implementation can begin.

---

## Phase 3: User Story 1 - Plugin Installation and MCP Tool Access (Priority: P1)

**Goal**: Plugin loads in Claude Code and exposes all three MCP tools without manual server configuration.

**Independent Test**: Load plugin with `claude --plugin-dir .` and verify `validate`, `trust_status`, `explain` tools appear and respond.

### Implementation for User Story 1

- [x] T005 [US1] Validate .claude-plugin/plugin.json has correct name, description, license, keywords, repository, and author fields per contracts/plugin-contracts.md
- [x] T006 [US1] Validate .mcp.json stdio transport config points to correct server entry point and passes all required env vars (N8N_HOST, N8N_API_KEY, N8N_VET_DATA_DIR, NODE_PATH)
- [x] T007 [US1] Write integration test at test/plugin/manifest.test.ts that reads both .claude-plugin/plugin.json and package.json, asserts version fields match (FR-002)
- [x] T008 [US1] Write integration test at test/plugin/mcp-config.test.ts that reads .mcp.json and asserts the server command, args template, and all four env var keys are present

**Checkpoint**: Plugin manifest and MCP config are validated and tested. Plugin loads and tools are accessible.

---

## Phase 4: User Story 2 - Automatic Dependency Installation (Priority: P1)

**Goal**: SessionStart hook auto-installs dependencies when package.json changes and skips when unchanged.

**Independent Test**: Simulate hook logic: first run installs deps, second run with matching package.json skips, failed install raises error.

### Implementation for User Story 2

- [x] T009 [US2] Review and validate hooks/hooks.json SessionStart hook command handles: (a) missing cached package.json triggers install, (b) matching package.json skips, (c) npm install failure removes cached copy and exits non-zero
- [x] T010 [US2] Write integration test at test/plugin/hook.test.ts that parses hooks/hooks.json, validates structure matches Claude Code hooks schema (hooks.SessionStart array with command entries), and asserts the command contains diff, npm install, and cp operations

**Checkpoint**: Hook behavior is validated. Dependencies auto-install on package.json change, skip when unchanged, fail visibly on error.

---

## Phase 5: User Story 3 - User Configuration for n8n Connection (Priority: P2)

**Goal**: Plugin declares optional n8n credentials. Static validation works without them. Execution returns typed error when credentials missing.

**Independent Test**: Load plugin without configuring credentials, run static validation (succeeds), request execution validation (returns configuration error).

### Implementation for User Story 3

- [x] T011 [US3] Validate .claude-plugin/plugin.json userConfig declares n8n_host (sensitive: false) and n8n_api_key (sensitive: true) per contracts/plugin-contracts.md
- [x] T012 [US3] Verify src/execution/capabilities.ts handles empty/undefined N8N_HOST gracefully by reporting no execution capability (not throwing)
- [x] T013 [US3] Write test at test/plugin/credentials.test.ts that verifies: (a) capabilities detection returns static-only when N8N_HOST is empty string, (b) execution request with empty credentials returns a configuration_error via the MCP error envelope

**Checkpoint**: Plugin works for static-only validation without credentials. Execution requests with missing credentials return clear typed errors.

---

## Phase 6: User Story 4 - Agent Learns Validation Workflow via Skill (Priority: P2)

**Goal**: Validation skill is discoverable, complies with agentskills.io spec, and teaches bounded validation philosophy.

**Independent Test**: Parse SKILL.md frontmatter, verify required fields, check body contains all documented patterns.

### Implementation for User Story 4

- [x] T014 [US4] Review skills/validate-workflow/SKILL.md content for completeness: must cover validate, trust_status, explain tools; common patterns (changed node, smoke test, trust check, guardrail refusal); bounded validation philosophy
- [x] T015 [US4] Write test at test/plugin/skill.test.ts that parses SKILL.md frontmatter and asserts: (a) name matches directory name `validate-workflow`, (b) description is 1-1024 chars and contains trigger keywords (validate, n8n, workflow), (c) body is under 500 lines, (d) body mentions all three tool names

**Checkpoint**: Skill is format-compliant and contains actionable guidance for all major validation patterns.

---

## Phase 7: User Story 5 - Trust State Persistence Across Sessions (Priority: P2)

**Goal**: Trust state and snapshots persist in `${CLAUDE_PLUGIN_DATA}` when running as plugin, in `.n8n-vet/` when standalone.

**Independent Test**: Write trust state with N8N_VET_DATA_DIR set, read it back, verify location. Repeat without env var.

### Implementation for User Story 5

- [x] T016 [US5] Write integration test at test/plugin/trust-path.test.ts that: (a) sets N8N_VET_DATA_DIR to a temp dir, calls loadTrustState/persistTrustState, asserts file written under that dir; (b) unsets N8N_VET_DATA_DIR, asserts file written under .n8n-vet/
- [x] T017 [US5] Write integration test at test/plugin/snapshot-path.test.ts that: (a) sets N8N_VET_DATA_DIR to a temp dir, calls loadSnapshot/saveSnapshot, asserts file written under that dir/snapshots/; (b) unsets N8N_VET_DATA_DIR, asserts file written under .n8n-vet/snapshots/

**Checkpoint**: Both trust state and snapshots respect the dual-mode storage path. Data persists across sessions in the correct location.

---

## Phase 8: User Story 6 - CLI Access Within Plugin Sessions (Priority: P3)

**Goal**: `n8n-vet` command is available as bare command in plugin sessions and via `npx` standalone.

**Independent Test**: Run `bin/n8n-vet --help` (or with no args) and verify it prints usage. Run `npx n8n-vet --help` and verify identical behavior.

### Implementation for User Story 6

- [x] T018 [US6] Verify bin/n8n-vet (created in T002) is executable, has correct shebang, and invokes dist/cli/index.js
- [x] T019 [US6] Verify package.json bin field maps `n8n-vet` to `./dist/cli/index.js` for npx standalone use
- [x] T020 [US6] Write test at test/plugin/cli-binary.test.ts that: (a) asserts bin/n8n-vet exists and is executable, (b) spawns `node bin/n8n-vet` with no args and asserts exit code 2 and stderr contains usage text

**Checkpoint**: CLI is accessible both as a plugin bare command and via npx. Usage output confirms correct wiring.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final validation across all stories

- [x] T021 Run full test suite (`npm test`) and verify all new and existing tests pass
- [x] T022 Run quickstart.md validation steps: build, verify dist/mcp/serve.js exists, verify bin/n8n-vet works
- [x] T023 Verify no existing tests were broken by the snapshot path resolution change (T003)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS User Story 5 (trust/snapshot paths) and affects all validation flows
- **User Stories (Phase 3-8)**: US1-US4 and US6 can start after Setup (Phase 1). US5 depends on Foundational (Phase 2) for snapshot path fix.
- **Polish (Phase 9)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Setup — no dependencies on other stories
- **US2 (P1)**: Can start after Setup — independent of US1
- **US3 (P2)**: Can start after Setup — depends on .mcp.json being correct (validated in US1) but independently testable
- **US4 (P2)**: Can start after Setup — no code dependencies, content review only
- **US5 (P2)**: Depends on Foundational (Phase 2) for snapshot path fix — independent of other stories
- **US6 (P3)**: Depends on T002 (bin/n8n-vet creation in Setup) — independent of other stories

### Parallel Opportunities

- T005, T006, T009, T011, T014 can all run in parallel (different files, read-only validation)
- T007, T008, T010, T013, T015 can all run in parallel (different test files)
- T016, T017 can run in parallel (different test files, both depend on T003/T004)
- US1, US2, US3, US4, US6 can all proceed in parallel after Setup

---

## Parallel Example: User Story 1

```
# Launch validation tasks in parallel:
Task: "Validate .claude-plugin/plugin.json fields" (T005)
Task: "Validate .mcp.json config" (T006)

# Launch test tasks in parallel (after validation):
Task: "Write manifest version sync test" (T007)
Task: "Write MCP config test" (T008)
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup (T001-T002)
2. Complete Phase 3: US1 — Plugin loads and tools appear (T005-T008)
3. Complete Phase 4: US2 — Dependencies auto-install (T009-T010)
4. **STOP and VALIDATE**: Load plugin, verify tools work, verify hook behavior
5. This is the minimum viable plugin

### Incremental Delivery

1. Setup + US1 + US2 → Plugin loads, tools work, deps install → **MVP**
2. Add Foundational (T003-T004) → Snapshot paths fixed
3. Add US3 → Static-only works without credentials → **Credentials-optional release**
4. Add US4 → Skill teaches agents → **Teaching release**
5. Add US5 → Trust persists across sessions → **Persistence release**
6. Add US6 → CLI bare command → **Full release**

---

## Audit Remediation

> Generated by `/speckit.audit` on 2026-04-19. All items resolved.

- [x] T024 [AR] Update FR-013 in spec.md:141 — remove `/trust/` subdirectory path, align with US5 scenario and actual trust persistence behavior
- [x] T025 [AR] Rewrite test/plugin/credentials.test.ts — verify throw + MCP mapping in one test, add structural verification of orchestrator catch behavior
- [x] T026 [AR] Fix test/plugin/hook.test.ts:54-57 — replace trivial toContain assertions with regex matching `rm -f.*CLAUDE_PLUGIN_DATA.*package.json`
- [x] T027 [AR] Consolidate 4 env-var presence tests in test/plugin/mcp-config.test.ts into one loop-based test
- [x] T028 [AR] Consolidate 3 tool-name presence tests in test/plugin/skill.test.ts into one loop-based test

- Most plugin files already exist as scaffolds — tasks focus on validation, refinement, and testing
- The one source code change is T003 (snapshot path alignment) — everything else is config validation and test creation
- Tasks are designed to be specific enough for an LLM to execute without additional context
- Commit after each task or logical group
