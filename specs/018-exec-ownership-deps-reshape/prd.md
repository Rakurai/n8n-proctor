# Remediation PRD C

## Title

Execution Ownership Cleanup and Dependency Contract Reshape

## Purpose

This document defines the third remediation spec in the foundation repair program. It completes the internal boundary cleanup after the public boundary work and the structural refactor work have landed.

This PRD is standalone. It does not assume the reader has [audit.synthesis.md](./audit/audit.synthesis.md), PRD A, or PRD B open.

## Series Context

The remediation sequence addresses four high-value architectural repairs:

1. decompress the orchestrator into coarse phases
2. centralize graph traversal and slice semantics
3. move execution preparation fully behind the execution subsystem
4. replace the flat dependency bag with grouped subsystem contracts

This PRD covers repairs 3 and 4 directly, and it absorbs the small cleanup items that should ride along while the relevant files are already open.

## Evidence Posture

The source audit synthesis separated findings into confirmed, probable, and downgraded buckets. This PRD is driven by confirmed findings and by cleanup items that were explicitly designated as ride-along work rather than primary drivers.

## Architectural Repairs Covered By This PRD

### Repair 3: Move execution preparation fully behind the execution subsystem

Execution input preparation should be owned by the execution subsystem, not by the orchestrator. That includes pin-data tiering, schema-derived fallback behavior, and execution-ready planning.

### Repair 4: Replace the flat dependency bag with grouped subsystem contracts

The orchestrator should depend on coherent subsystem capabilities rather than receiving one broad bag of unrelated functions.

## Problems This PRD Resolves

### Problem 1: The execution boundary is blurry

Verified evidence:

- [src/orchestrator/interpret.ts](../../src/orchestrator/interpret.ts) still owns too much execution preparation logic.
- [src/execution/pin-data.ts](../../src/execution/pin-data.ts) exists, but the real tiering and MCP-assisted preparation logic is still split across orchestration and execution code.

Why it matters:

- the execution subsystem does not fully explain how a test run is prepared
- orchestration remains coupled to execution mechanics
- execution-preparation behavior is harder to test in isolation

### Problem 2: The dependency boundary acts like a flat service locator

Verified evidence:

- [src/deps.ts](../../src/deps.ts) builds a flat dependency bag.
- [src/orchestrator/types.ts](../../src/orchestrator/types.ts) defines a wide `OrchestratorDeps` contract that mixes unrelated subsystem concerns.

Why it matters:

- responsibilities are harder to read from type boundaries
- tests need one broad mock bag instead of subsystem-scoped doubles
- accidental coupling between unrelated capabilities is easier

### Problem 3: Several smaller abstractions leak intent or use brittle shortcuts

Verified evidence:

- [src/orchestrator/types.ts](../../src/orchestrator/types.ts) carries `n8nHost` and `n8nApiKey` on `ValidationRequest`, even though the orchestrator does not meaningfully consume them.
- [src/orchestrator/snapshots.ts](../../src/orchestrator/snapshots.ts) reconstructs a stub `WorkflowAST` with a double-cast.
- [src/trust/change.ts](../../src/trust/change.ts) repeats ad hoc `JSON.stringify()` equality checks for change classification.
- [src/trust/trust.ts](../../src/trust/trust.ts) and [src/guardrails/evidence.ts](../../src/guardrails/evidence.ts) duplicate the same `TRUST_PRESERVING` constant.

Why it matters:

- these shortcuts increase maintenance drag
- they make later structural work harder to reason about
- they are best fixed while the associated files are already in motion

## Goals

1. Move execution-input preparation behind a real execution-side API.
2. Remove orchestration ownership of pin-data tiering and schema-derived fallback logic.
3. Replace the flat dependency bag with grouped subsystem contracts.
4. Clean up the most obvious abstraction leaks while the affected files are open.
5. Finish the remediation trilogy with clearer subsystem ownership and narrower contracts.

## Non-Goals

This PRD does not include:

- revisiting boundary-hardening policy from PRD A except where interfaces must be consumed
- redoing traversal and slice semantics from PRD B except where execution ownership now depends on those interfaces
- dependency version upgrades for Zod, TypeScript, Vitest, or Biome
- broad cleanup of every test helper or every repeated loop in the repo
- low-value hygiene items such as `.gitignore` expansion unless they naturally fall out of touched files

## Scope

This PRD covers Unit 4 and Unit 5 of the remediation sequence, and it explicitly folds in Unit 6 ride-along cleanup where relevant.

### Unit 4: Execution Ownership Cleanup

Includes:

- a real execution-preparation API
- relocation of pin-data tiering ownership
- MCP schema-derived pin-data fallback owned by execution code rather than orchestration
- simplification of the orchestrator-to-execution handoff

### Unit 5: Dependency Contract Reshape

Includes:

- grouped subsystem deps in [src/deps.ts](../../src/deps.ts)
- reshaped `OrchestratorDeps` or its replacement in [src/orchestrator/types.ts](../../src/orchestrator/types.ts)
- test updates to use subsystem-scoped doubles instead of one broad mock bag

### Unit 6: Opportunistic Cleanup Riding On Structural Changes

Includes, when touched by the above work:

- dead request field removal in [src/orchestrator/types.ts](../../src/orchestrator/types.ts)
- snapshot stub cleanup in [src/orchestrator/snapshots.ts](../../src/orchestrator/snapshots.ts)
- shared comparison helper in [src/trust/change.ts](../../src/trust/change.ts)
- shared constants cleanup in [src/trust/trust.ts](../../src/trust/trust.ts) and [src/guardrails/evidence.ts](../../src/guardrails/evidence.ts)
- shared test fixture extraction where it reduces churn in touched tests

## Requirements

### Requirement C1: Create a real execution-preparation API

The execution subsystem must expose an API that owns execution-input preparation end to end.

That API must be responsible for:

- execution-ready plan assembly
- pin-data tiering
- schema-derived fallback behavior
- inputs required for execution handoff from orchestration

### Requirement C2: Remove orchestration ownership of pin-data tiering

[src/orchestrator/interpret.ts](../../src/orchestrator/interpret.ts) must no longer contain the detailed rules for pin-data source selection and MCP-assisted fallback generation. The orchestrator may request execution preparation, but it must not define those tiering mechanics inline.

### Requirement C3: Group dependency contracts by subsystem capability

The broad dependency bag must be replaced by narrower subsystem-scoped contracts. The exact type names are flexible, but the dependency boundary must reflect actual subsystem ownership.

Suggested grouping shape:

- trust
- analysis
- execution
- diagnostics
- snapshots

### Requirement C4: Update tests to use subsystem-scoped doubles

Tests that currently depend on one large dependency mock bag must be refactored to use smaller, subsystem-scoped doubles where the new contract makes that possible.

### Requirement C5: Fold in ride-along cleanup where it removes friction

The following cleanup is in scope only because the associated files are already being changed:

- remove dead request fields
- replace double-cast snapshot reconstruction with explicit typed modeling
- centralize structured equality checks used in trust change classification
- consolidate shared constants duplicated across trust and guardrail evidence

## Deferred Findings Related To This PRD

These items remain valid but are explicitly deferred beyond this spec:

- dependency freshness and coordinated version upgrades
- format-test tightening outside touched tests
- broader test fixture cleanup not caused by the new dependency shapes

## Downgraded Findings Explicitly Not Driving This PRD

These findings were preserved in the synthesis but are not central objectives here:

- generic `Error` usage as a repo-wide cleanup target
- `.gitignore` secret pattern expansion
- plugin-test complaints as a primary remediation driver

## Dependency Position

This PRD is third in the remediation sequence.

Depends on:

- PRD A, because public-boundary behavior and test safety need to be stabilized first
- PRD B, because execution ownership and dependency contracts are easier to reshape after traversal semantics and orchestrator phases are cleaner

Enables:

- a cleaner long-term architecture with narrower subsystem ownership
- later dependency upgrade work on top of clearer interfaces

## Acceptance Criteria

1. Execution-input preparation is owned by a real execution-side API.
2. Pin-data tiering and schema-derived fallback behavior are no longer defined inline in the orchestrator.
3. The orchestrator-to-execution handoff is materially simpler.
4. The flat dependency bag has been replaced by grouped subsystem contracts.
5. Tests touched by the new dependency boundary use subsystem-scoped doubles rather than one broad mock bag.
6. Dead request fields are removed.
7. Snapshot reconstruction no longer relies on a double-cast shortcut.
8. Structured equality checks for trust change classification are centralized.
9. Shared constants duplicated across trust and guardrail evidence are consolidated.

## Verification

- execution preparation can be tested independently of orchestration.
- orchestration no longer owns detailed pin-data tiering mechanics.
- grouped subsystem contracts are visible in dependency wiring and orchestration types.
- touched tests remain green with narrower doubles.
- no functionality from PRD A or PRD B regresses.

## Output Of This PRD

If successful, this PRD finishes the remediation sequence with clearer execution ownership, narrower subsystem boundaries, and a materially healthier foundation for future product work.
