# Implementation Audit: Execution Subsystem

**Date**: 2026-04-18
**Branch**: `005-execution-subsystem`
**Base**: `main` (88353f5)
**Files audited**: 15 (9 source, 6 test)

---

## Findings

| ID | Category | Severity | Location | Description | Quoted Evidence |
|----|----------|----------|----------|-------------|-----------------|
| PH-001 | Phantom | HIGH | `capabilities.ts:138-154` | `discoverMcpTools()` claims to discover MCP tools but unconditionally adds all 3 tool names without probing. It always returns `['test_workflow', 'get_execution', 'prepare_test_pin_data']` regardless of actual availability. The `try/catch` inside the loop is dead code — `discovered.push(toolName)` cannot throw. | `for (const toolName of EXECUTION_MCP_TOOLS) { try { discovered.push(toolName); } catch { } }` |
| CV-001 | Constitution | HIGH | `rest-client.ts:194-208`, `rest-client.ts:212-225`, `pin-data.ts:131-138` | Silent failure via `catch { return undefined }` — three config/cache reader functions swallow all errors and return `undefined`. For config readers this is the intended cascade behavior (file may not exist), but `readCachedPinData` silently masks JSON parse errors on corrupt cache files. Per CODING.md: "Do not wrap synchronous code in try/catch as control flow" and "catch without re-throwing" is prohibited. The config readers are borderline-acceptable (file-not-found is expected), but the pin data cache reader masks data corruption. | `readCachedPinData: try { ... return JSON.parse(raw) as PinDataItem[]; } catch { return undefined; }` |
| CV-002 | Constitution | HIGH | `rest-client.ts:433`, `mcp-client.ts:199` | `as any` type assertions used to bypass type checking when passing Zod-validated data to `extractExecutionData()`. CODING.md prohibits type assertions to silence the compiler. The `RawResultData` interface should align with the Zod schema output types instead. | `return extractExecutionData(resultData as any, status, nodeNames as string[]);` |
| SD-001 | Spec Drift | HIGH | `lock.ts` (entire file) | FR-016 requires serialized execution, and `lock.ts` implements `withExecutionLock()`. However, neither `executeBounded()` in `rest-client.ts` nor `executeSmoke()` in `mcp-client.ts` calls the lock. The lock exists but is not wired in — FR-016 is not enforced. | `lock.ts` exports `withExecutionLock()` but grep for `acquireExecutionLock\|withExecutionLock\|lock` across `rest-client.ts` and `mcp-client.ts` returns zero hits. |
| OE-001 | Over-Engineering | MEDIUM | `poll.ts:39-49` | `PollingStrategy` interface has exactly two implementors (`createRestPollingStrategy` and `createMcpPollingStrategy`), which is borderline acceptable per constitution III. However, the interface is defined in `poll.ts` while its implementations live in `rest-client.ts` and `mcp-client.ts`, creating a bidirectional dependency concern. More importantly, it adds an indirection layer where the caller already knows which strategy to use based on `DetectedCapabilities`. | `export interface PollingStrategy { checkStatus(...): Promise<PollStatusResult>; retrieveData(...): Promise<ExecutionData>; }` |
| TQ-001 | Test Quality | HIGH | `poll.test.ts` (entire file) | Poll test file tests only constants and a manually-coded backoff calculation — it never imports or tests `pollForCompletion()`. The actual polling function (status loop, timeout behavior, phase transition from status-only to data retrieval) has zero test coverage. The test for backoff "produces correct delay sequence" reimplements the algorithm in the test rather than testing the production code. | `poll.test.ts` imports only from `types.js` (constants). Does not import `pollForCompletion` or `PollingStrategy` from `poll.js`. |
| TQ-002 | Test Quality | HIGH | `rest-client.test.ts:13-14` | Test file comment says "We'll test executeBounded once implemented" but executeBounded IS implemented. No tests exist for `executeBounded()` — the public function that performs the core bounded execution operation (FR-005). Request shaping, auth headers, and error mapping for 404/401/network are untested. | `// We'll test executeBounded once implemented. For now, test resolveCredentials` |
| TQ-003 | Test Quality | MEDIUM | `capabilities.test.ts` | Tests only the `toAvailableCapabilities` mapper and type contracts (constructing objects and checking their fields). No tests for `detectCapabilities()` — the public function for FR-010. The acceptance scenarios (unreachable → error, auth failure → error, workflow not found → error) are not tested. | File imports only `toAvailableCapabilities` from capabilities.js. `detectCapabilities` is never imported or tested. |
| TQ-004 | Test Quality | MEDIUM | `mcp-client.test.ts` | Tests only Zod schema parsing. No tests for `executeSmoke()`, `getExecution()`, or `preparePinData()` — the three public MCP client functions. The test comment mentions "mock MCP tool caller" but none is implemented. | File imports only `TestWorkflowResponseSchema`, `GetExecutionResponseSchema`, `PreparePinDataResponseSchema`. No public function is tested. |
| TQ-005 | Test Quality | MEDIUM | `poll.test.ts:48-68` | Five tests assert that named constants equal their literal values (`expect(POLL_INITIAL_DELAY_MS).toBe(1000)`). These are trivial tests — they verify a constant is its own value. Constitution V: "No trivial tests (asserting a constructor sets a field)." | `it('initial delay is 1 second', () => { expect(POLL_INITIAL_DELAY_MS).toBe(1000); });` |
| CQ-001 | Code Quality | MEDIUM | `mcp-client.ts:224` | `createMcpPollingStrategy` hardcodes terminal statuses inline instead of using `isTerminalStatus()` from `types.ts`. This duplicates the terminal status logic, creating a drift risk. | `finished: ['success', 'error', 'crashed', 'canceled'].includes(result.status),` |
| SF-001 | Silent Failure | MEDIUM | `capabilities.ts:170-173` | `checkWorkflow` silently returns on network error (`catch { return; }`). After `probeRest` confirmed reachability, a subsequent fetch failure indicates a transient or real problem, not an expected condition. | `} catch { return; // Already validated reachability in probeRest }` |

---

## Requirement Traceability

| Requirement | Status | Implementing Code | Notes |
|-------------|--------|-------------------|-------|
| FR-001 | IMPLEMENTED | `pin-data.ts:40-82` | 4-tier sourcing; tier 3 (MCP) deferred as documented |
| FR-002 | IMPLEMENTED | `pin-data.ts:74-78` | Throws on missing, no stubs |
| FR-003 | IMPLEMENTED | `pin-data.ts:46-47, 55-57, 62-64` | sourceMap built correctly |
| FR-004 | IMPLEMENTED | `pin-data.ts:94-104` | normalizePinData wraps flat objects |
| FR-005 | IMPLEMENTED | `rest-client.ts:260-316` | destinationNode with nodeName, inclusive/exclusive mode |
| FR-006 | IMPLEMENTED | `mcp-client.ts:103-141` | test_workflow with pinData and triggerNodeName |
| FR-007 | IMPLEMENTED | `poll.ts:62-90` | Two-phase: status loop then single data retrieval |
| FR-008 | IMPLEMENTED | `types.ts:154-167` | Named constants match spec values |
| FR-009 | IMPLEMENTED | `results.ts:71-95` | Per-node extraction without raw output |
| FR-010 | IMPLEMENTED | `capabilities.ts:45-84` | Detects REST, MCP, workflow existence |
| FR-011 | IMPLEMENTED | `rest-client.ts:290-293`, `capabilities.ts:176-178` | "Push it first via n8nac" message present |
| FR-012 | IMPLEMENTED | `rest-client.ts:143-180` | 4-level cascade in correct order |
| FR-013 | IMPLEMENTED | `rest-client.ts:169-176` | Identifies specific missing credential and sources |
| FR-014 | IMPLEMENTED | `poll.ts:101-115` | Timeout returns ExecutionData with canceled/timeout, not thrown |
| FR-015 | IMPLEMENTED | `rest-client.ts`, `mcp-client.ts` | Independent modules, no fallback between them |
| FR-016 | PARTIAL | `lock.ts:38-45` | Lock exists but is not called by `executeBounded` or `executeSmoke` (SD-001) |

---

## Architecture Compliance Summary

This project has no `docs/architecture/` directory. Compliance checks are against `docs/CODING.md` and `.specify/memory/constitution.md`.

| Rule Area | Status | Finding Count | Worst Severity |
|-----------|--------|---------------|----------------|
| Fail-Fast / No Fallbacks | VIOLATION | 2 | HIGH (CV-001, SF-001) |
| Contract-Driven Boundaries | CLEAN | 0 | — |
| No Over-Engineering | BORDERLINE | 1 | MEDIUM (OE-001) |
| Honest Code / No Phantoms | VIOLATION | 1 | HIGH (PH-001) |
| Minimal Meaningful Tests | VIOLATION | 5 | HIGH (TQ-001, TQ-002) |
| Type Safety (no `as any`) | VIOLATION | 1 | HIGH (CV-002) |
| Wiring & Dead Code | VIOLATION | 1 | HIGH (SD-001) |

---

## Metrics

- **Files audited**: 15
- **Findings**: 0 critical, 5 high, 6 medium, 0 low
- **Spec coverage**: 15 / 16 requirements implemented (FR-016 partial)
- **Constitution compliance**: 3 violations across 5 principles checked
- **Architecture compliance**: 5 rule areas violated / 7 rule areas checked

---

## Remediation Decisions

For each item below, choose an action:
- **fix**: Create a remediation task
- **spec**: Update the spec (if implementation is correct)
- **skip**: Accept the finding
- **split**: Fix part, update spec for part

### 1. [PH-001] discoverMcpTools is a phantom — always returns all tools without probing
**Location**: `capabilities.ts:138-154`
**Spec says**: FR-010 — detect MCP tool availability
**Code does**: Unconditionally returns all 3 tool names. The `try/catch` is dead code.

Action: fix / skip

### 2. [CV-001] Silent catch-and-return-undefined in cache reader masks corruption
**Location**: `pin-data.ts:131-138`
**Spec says**: Constitution I — no silent catches
**Code does**: `readCachedPinData` swallows JSON parse errors on corrupt cache files

Note: The config file readers (`readProjectConfig`, `readGlobalCredentials`) are acceptable — file-not-found is an expected condition in the cascade. Only the cache reader is problematic.

Action: fix / skip

### 3. [CV-002] `as any` type assertions bypass type checking
**Location**: `rest-client.ts:433`, `mcp-client.ts:199`
**Code does**: Casts Zod-validated response data to `any` before passing to `extractExecutionData()`
**CODING.md says**: "Do not use type assertions (`as T`) to silence the compiler"

Action: fix / skip

### 4. [SD-001] Execution lock exists but is not wired into executeBounded or executeSmoke
**Location**: `lock.ts` vs `rest-client.ts:260`, `mcp-client.ts:103`
**Spec says**: FR-016 — serialize execution, one at a time
**Code does**: Lock module exists but neither execution entry point calls it

Action: fix / skip

### 5. [TQ-001] pollForCompletion has zero test coverage
**Location**: `poll.test.ts`
**Spec says**: SC-004, SC-009 — polling verified via unit tests
**Code does**: Tests only constants and reimplements backoff math; never tests the actual function

Action: fix / skip

### 6. [TQ-002] executeBounded has zero test coverage
**Location**: `rest-client.test.ts`
**Spec says**: SC-003, SC-009 — bounded execution verified via unit tests
**Code does**: Comment says "we'll test once implemented" but implementation exists

Action: fix / skip

### MEDIUM / LOW Summary

- **TQ-003**: `detectCapabilities()` untested (only mapper tested)
- **TQ-004**: `executeSmoke()`, `getExecution()`, `preparePinData()` untested (only Zod schemas tested)
- **TQ-005**: 5 trivial constant-value assertions in `poll.test.ts`
- **CQ-001**: `createMcpPollingStrategy` hardcodes terminal statuses instead of using `isTerminalStatus()`
- **SF-001**: `checkWorkflow` silently returns on network error
- **OE-001**: `PollingStrategy` interface — borderline, has 2 implementors

Would you like to promote any MEDIUM findings to remediation tasks?
