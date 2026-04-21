# Research: Slice Semantics Consolidation and Orchestrator Decompression

**Feature**: 017-slice-orchestrator-refactor  
**Date**: 2026-04-20

## Research Tasks

### R1: Traversal Order — BFS vs DFS

**Context**: `resolve.ts` uses stack-based DFS (`stack.pop()`). `narrow.ts` uses queue-based BFS (`forwardQueue.shift()`). The shared primitive must pick one.

**Decision**: Use stack-based DFS (matching resolve.ts).

**Rationale**:
- Both approaches produce identical set membership for connected-component discovery with stopping conditions. The traversal order only affects the order elements appear in intermediate arrays before deduplication.
- resolve.ts is the primary consumer — its DFS order is what all existing tests assert against. Switching resolve to BFS would risk ordering differences in entry/exit arrays that could propagate to path selection.
- narrow.ts's BFS order is an implementation detail — its output is a Set (result nodes) and two arrays (entry/exit points) derived from a final pass over the set, not from traversal order.
- The PRD explicitly notes `Array.shift()` queue cleanup as a deferred finding outside the shared traversal design. DFS with `stack.pop()` avoids this O(n) issue entirely.

**Alternatives considered**:
- BFS (queue-based): Rejected because it would change resolve.ts traversal order and introduce the `Array.shift()` performance concern.
- Configurable BFS/DFS: Rejected per constitution principle III (no over-engineering) — no current requirement needs both orders.

### R2: Stopping Condition Representation

**Context**: resolve.ts stops at trust boundaries. narrow.ts stops at trust boundaries AND target boundaries AND trigger nodes. The shared primitive needs a way to represent these different stopping policies.

**Decision**: Use a stopping predicate function `(node: NodeIdentity) => boolean` passed to the traversal function.

**Rationale**:
- A predicate is the minimal abstraction that covers all current stopping conditions without encoding narrow-specific domain knowledge into the traversal primitive.
- resolve.ts passes a trust-boundary predicate. narrow.ts passes a predicate combining trust + target membership + trigger detection.
- Each consumer constructs its own predicate from its domain context — the traversal primitive stays domain-agnostic.

**Alternatives considered**:
- Enum of stopping modes (`'trust' | 'trust-and-target' | ...`): Rejected because it couples the primitive to current narrow/resolve domain knowledge and violates open-closed — new stopping conditions require modifying the enum.
- Configuration object with boolean flags: Rejected as premature abstraction over a simple predicate.

### R3: Boundary Classification Scope

**Context**: Entry/exit derivation appears in three places: resolve.ts (for named/changed targets), narrow.ts (for narrowed sets), and resolve.ts's `resolveWorkflow` (for whole-workflow). Should `resolveWorkflow` use the shared classifier?

**Decision**: Yes — `resolveWorkflow` should use `classifyBoundaries()`.

**Rationale**:
- resolveWorkflow's current entry/exit logic (lines 217-230) is the same classification: nodes with no incoming edges are entries, nodes with no outgoing edges are exits. Using the shared classifier gives it 3 consumers, not 2.
- The implementation is trivial and the classification logic is identical.

**Alternatives considered**:
- Leave resolveWorkflow's inline classification alone: Rejected because it's the same logic and using the shared function reduces one more duplication point at no cost.

### R4: Phase Helper Granularity

**Context**: The spec requires minimum 4 phases. The current interpret() has ~10 numbered steps. How granular should phase helpers be?

**Decision**: 4 phase helpers matching the spec's minimum: validate, execute, synthesize, persist.

**Rationale**:
- Steps 1-5 (parse, trust, change set, resolve, guardrails) remain in interpret() because they are the coordination logic that determines which phases run. These are lightweight and sequential.
- Steps 6a (static analysis) → `phases/validate.ts`
- Steps 6b (execution) → `phases/execute.ts`
- Step 7 (deduplication + synthesis) → `phases/synthesize.ts`
- Steps 8-9 (trust + snapshot + cache) → `phases/persist.ts`
- Step 10 (return) stays in interpret().

**Alternatives considered**:
- More granular (8+ helpers): Rejected per constitution III — extracting parse, trust-load, resolve, guardrails into separate files would create single-call helpers with no reuse benefit.
- Fewer helpers (2-3): Rejected because combining validate+execute into one helper would still produce a large function, especially given the execution path's complexity (pin data tiering, MCP calls).

### R5: Traversal Module Location

**Context**: Where should the shared traversal primitives live?

**Decision**: `src/static-analysis/traversal.ts`

**Rationale**:
- The traversal operates on `WorkflowGraph` — a static analysis data structure. It does not depend on trust, guardrails, or execution.
- `src/static-analysis/` already contains graph parsing, expression tracing, and data-loss detection — all graph-structural operations.
- Placing it in `src/types/` would be wrong (it has behavior, not just type definitions).
- Creating a new `src/graph/` subsystem would be premature — constitution III prohibits speculative structure.

**Alternatives considered**:
- `src/orchestrator/`: Rejected because narrow.ts (in `src/guardrails/`) also needs it — placing it in orchestrator creates a cross-subsystem dependency in the wrong direction.
- `src/types/`: Rejected — it contains behavior, not just types.
- New `src/graph/` subsystem: Rejected per constitution III — one file doesn't justify a new subsystem.
