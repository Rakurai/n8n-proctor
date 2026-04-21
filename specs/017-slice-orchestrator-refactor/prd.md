# Remediation PRD B

## Title

Slice Semantics Consolidation and Orchestrator Decompression

## Purpose

This document defines the second remediation spec in the foundation repair program. It exists to remove the two highest-value internal architectural liabilities after the public boundary and test safety work are in place:

- duplicated graph traversal and slice semantics
- a control-flow-heavy orchestrator that owns too many detailed responsibilities

This PRD is standalone. It does not assume the reader has [audit.synthesis.md](./audit/audit.synthesis.md) or PRD A open.

## Series Context

The codebase’s strongest qualities are at the architectural boundary level: strong types, good subsystem decomposition, and disciplined domain modeling. The main internal structural risks are concentrated in a few places:

1. duplicated traversal and slice construction logic
2. a policy-and-plumbing god function in the orchestrator
3. a blurry execution boundary where orchestration still owns too much setup detail
4. a flat dependency bag that acts like a service locator

This PRD targets the first two items directly.

## Evidence Posture

The source audit synthesis separated findings into confirmed, probable, and downgraded buckets. This PRD is driven only by confirmed findings and the explicit architectural repair agenda.

## Architectural Repairs Covered By This PRD

### Repair 1: Decompress the orchestrator into coarse phases

The orchestrator should coordinate a few explicit phases instead of owning detailed mechanics for validation, execution preparation, synthesis, and persistence all inline.

### Repair 2: Centralize graph traversal and slice semantics

Target resolution and narrowing should share the same traversal and boundary language instead of evolving independently.

## Problems This PRD Resolves

### Problem 1: Graph traversal and slice construction logic are duplicated in high-risk paths

Verified evidence:

- [src/orchestrator/resolve.ts](../../src/orchestrator/resolve.ts) duplicates seed setup, entry and exit derivation, deduplication, and traversal across changed-node and named-node resolution.
- [src/orchestrator/resolve.ts](../../src/orchestrator/resolve.ts) implements separate forward and backward propagation functions with mirrored logic.
- [src/guardrails/narrow.ts](../../src/guardrails/narrow.ts) reimplements the same directional traversal pattern for narrowing.

Why it matters:

- semantic drift risk is high
- slice semantics become harder to reason about
- future guardrail work becomes riskier because there is no single place that defines slice growth and stopping rules

### Problem 2: The orchestrator remains a concentrated god function

Verified evidence:

- [src/orchestrator/interpret.ts](../../src/orchestrator/interpret.ts) owns request validation, graph parsing, trust loading, target resolution, guardrail routing, static analysis dispatch, execution setup, pin-data sourcing, synthesis, trust persistence, snapshot persistence, and cache writes.
- execution-preparation detail is still mixed into orchestration even though execution-focused modules exist.

Why it matters:

- unrelated changes compete in one large function
- test isolation is poor
- subsystem boundaries exist on paper but are punctured in implementation

## Goals

1. Create one coherent set of traversal and boundary semantics for slice growth.
2. Refactor target resolution and narrowing to rely on shared primitives.
3. Reduce the orchestrator to a smaller coordinating function with explicit phases.
4. Preserve existing validation behavior while making later execution-ownership work easier.

## Non-Goals

This PRD does not include:

- final execution-ownership relocation into the execution subsystem
- grouped dependency contract redesign
- dependency upgrades
- broad cleanup unrelated to traversal or orchestration
- a generic sweep for all duplicated loops in the repo

The point is not to eliminate all repetition. The point is to remove the repetition that defines slice semantics and orchestrator control flow.

## Scope

This PRD covers Unit 2 and Unit 3 of the remediation sequence.

### Unit 2: Slice Semantics Consolidation

Includes:

- shared traversal helper or helpers
- shared entry and exit boundary classification
- refactor of [src/orchestrator/resolve.ts](../../src/orchestrator/resolve.ts)
- refactor of [src/guardrails/narrow.ts](../../src/guardrails/narrow.ts)
- tests that pin current slicing semantics before refactor

### Unit 3: Orchestrator Decompression

Includes:

- extraction of target and guardrail phase helpers
- extraction of execution-preparation handoff points
- extraction of pass-only persistence and cache-update logic
- cleanup of orchestration flow and intermediate data shapes so `interpret()` becomes a clear coordinator rather than a mechanics owner

## Requirements

### Requirement B1: Introduce shared traversal primitives

The codebase must have shared traversal logic that can represent:

- direction of movement
- stopping at trust boundaries
- stopping at graph roots or terminals when appropriate
- bounded traversal within a target node set when required

The implementation does not need a generic graph library. It does need one coherent internal language for traversal.

### Requirement B2: Introduce shared boundary classification

Entry and exit point derivation must be defined in one reusable place rather than separately in resolution and narrowing code.

### Requirement B3: Pin existing semantics before refactor

Before changing traversal behavior, tests must pin current slice behavior closely enough that accidental semantic drift is visible.

The tests must cover:

- changed-target slice construction
- named-node slice construction
- trust-boundary stopping behavior
- entry and exit derivation
- narrowing behavior around changed nodes and trusted unchanged nodes

### Requirement B4: Decompress `interpret()` into explicit phases

The implementation must break [src/orchestrator/interpret.ts](../../src/orchestrator/interpret.ts) into smaller helpers or subsystem calls representing coarse phases.

Minimum target phase separation:

- target and guardrail resolution
- validation or execution-preparation handoff
- synthesis
- pass-only persistence

### Requirement B5: Preserve behavior while changing structure

This PRD is a structural refactor, not a behavior redesign. It may improve clarity and ownership, but it must not intentionally redefine MCP bootstrap policy, execution ownership, or grouped dependency contracts. Those belong to other PRDs.

## Deferred Findings Related To This PRD

These items remain valid but are not scope drivers here:

- `Array.shift()` queue cleanup outside the new shared traversal helper design
- small repeated loops unrelated to slice semantics
- dependency contract reshape
- execution-side ownership of pin-data tiering

## Downgraded Findings Explicitly Not Driving This PRD

These findings were preserved in the synthesis as lower-signal concerns and are not primary objectives here:

- every repeated loop is not equally important
- generic `Error` usage is not the main architectural issue in this phase

## Dependency Position

This PRD is second in the remediation sequence.

Depends on:

- PRD A, because structural refactor should happen only after direct safety-net tests and explicit boundary behavior are in place

Enables:

- PRD C, by making execution ownership cleanup and dependency contract reshape less tangled

## Acceptance Criteria

1. Slice construction logic is centralized in reusable helpers.
2. Resolve and narrow share the same boundary rules unless intentionally overridden and documented.
3. Tests pin slice behavior before and after the refactor.
4. `interpret()` is materially smaller and delegates coarse phases to helpers or subsystem calls.
5. Pass-only persistence and cache-update mechanics are no longer owned inline by the main orchestration flow.
6. The refactor does not silently change public boundary behavior introduced by PRD A.

## Verification

- slice construction behavior is pinned by tests before and after refactor.
- target-selection tests continue to pass.
- orchestrator complexity is reduced without changing intended validation semantics.
- `interpret()` delegates more of its detailed mechanics.

## Output Of This PRD

If successful, this PRD leaves the system with one coherent model of slice semantics and a smaller orchestrator, which makes the next execution-ownership and dependency-contract work substantially safer.
