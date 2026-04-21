/**
 * Pinning tests — capture exact current behavior of slice construction and
 * narrowing before the 017 refactor. Any semantic drift during refactoring
 * will show up as assertion failures here.
 *
 * These tests pin 6 distinct behaviors:
 * 1. Changed-target slice construction (node membership, entries, exits)
 * 2. Named-node slice construction (forward/backward propagation stops)
 * 3. Trust-boundary stopping behavior
 * 4. Entry/exit derivation
 * 5. Narrowing behavior
 * 6. Empty change set handling
 */

import { describe, expect, it } from 'vitest';
import { computeNarrowedTarget } from '../../src/guardrails/narrow.js';
import { resolveTarget } from '../../src/orchestrator/resolve.js';
import { computeContentHash } from '../../src/trust/hash.js';
import type { Edge, GraphNode, WorkflowGraph } from '../../src/types/graph.js';
import type { NodeIdentity } from '../../src/types/identity.js';
import type { NodeChangeSet, TrustState } from '../../src/types/trust.js';
import type { WorkflowAST } from '@n8n-as-code/transformer';
import type { EvaluationInput } from '../../src/guardrails/types.js';

// ── Fixtures ──────────────────────────────────────────────────────

function makeNode(name: string): GraphNode {
  return {
    name: name as NodeIdentity,
    displayName: name,
    type: 'n8n-nodes-base.noOp',
    typeVersion: 1,
    parameters: {},
    credentials: null,
    disabled: false,
    classification: 'shape-preserving',
  };
}

function makeEdge(from: string, to: string): Edge {
  return {
    from: from as NodeIdentity,
    fromOutput: 0,
    isError: false,
    to: to as NodeIdentity,
    toInput: 0,
  };
}

const stubAst = { nodes: [], connections: [] } as unknown as WorkflowAST;

/** Linear chain: Trigger → A → B → C → D */
function linearGraph(): WorkflowGraph {
  const names = ['Trigger', 'A', 'B', 'C', 'D'];
  const nodes = new Map<NodeIdentity, GraphNode>(
    names.map((n) => [n as NodeIdentity, makeNode(n)]),
  );
  const forward = new Map<NodeIdentity, Edge[]>([
    ['Trigger' as NodeIdentity, [makeEdge('Trigger', 'A')]],
    ['A' as NodeIdentity, [makeEdge('A', 'B')]],
    ['B' as NodeIdentity, [makeEdge('B', 'C')]],
    ['C' as NodeIdentity, [makeEdge('C', 'D')]],
    ['D' as NodeIdentity, []],
  ]);
  const backward = new Map<NodeIdentity, Edge[]>([
    ['Trigger' as NodeIdentity, []],
    ['A' as NodeIdentity, [makeEdge('Trigger', 'A')]],
    ['B' as NodeIdentity, [makeEdge('A', 'B')]],
    ['C' as NodeIdentity, [makeEdge('B', 'C')]],
    ['D' as NodeIdentity, [makeEdge('C', 'D')]],
  ]);
  const displayNameIndex = new Map<string, NodeIdentity>(
    names.map((n) => [n, n as NodeIdentity]),
  );
  return { nodes, forward, backward, displayNameIndex, ast: stubAst };
}

/**
 * Branching graph:
 *   Root → A → B → C
 *              ↓
 *              D → E
 */
function branchingGraph(): WorkflowGraph {
  const names = ['Root', 'A', 'B', 'C', 'D', 'E'];
  const nodes = new Map<NodeIdentity, GraphNode>(
    names.map((n) => [n as NodeIdentity, makeNode(n)]),
  );
  const forward = new Map<NodeIdentity, Edge[]>([
    ['Root' as NodeIdentity, [makeEdge('Root', 'A')]],
    ['A' as NodeIdentity, [makeEdge('A', 'B')]],
    ['B' as NodeIdentity, [makeEdge('B', 'C'), makeEdge('B', 'D')]],
    ['C' as NodeIdentity, []],
    ['D' as NodeIdentity, [makeEdge('D', 'E')]],
    ['E' as NodeIdentity, []],
  ]);
  const backward = new Map<NodeIdentity, Edge[]>([
    ['Root' as NodeIdentity, []],
    ['A' as NodeIdentity, [makeEdge('Root', 'A')]],
    ['B' as NodeIdentity, [makeEdge('A', 'B')]],
    ['C' as NodeIdentity, [makeEdge('B', 'C')]],
    ['D' as NodeIdentity, [makeEdge('B', 'D')]],
    ['E' as NodeIdentity, [makeEdge('D', 'E')]],
  ]);
  const displayNameIndex = new Map<string, NodeIdentity>(
    names.map((n) => [n, n as NodeIdentity]),
  );
  return { nodes, forward, backward, displayNameIndex, ast: stubAst };
}

function emptyTrust(): TrustState {
  return { workflowId: 'test', nodes: new Map(), connectionsHash: '' };
}

function trustWith(graph: WorkflowGraph, trustedNames: string[]): TrustState {
  const state = emptyTrust();
  for (const name of trustedNames) {
    const node = graph.nodes.get(name as NodeIdentity);
    if (node) {
      state.nodes.set(name as NodeIdentity, {
        contentHash: computeContentHash(node, graph.ast),
        validatedBy: 'pin-run',
        validatedAt: '2026-01-01',
        validatedWith: 'static',
        fixtureHash: null,
      });
    }
  }
  return state;
}

// ── Pinning Tests ─────────────────────────────────────────────────

describe('pinning: slice semantics', () => {
  // T002: Changed-target slice construction
  it('changed-target: B changed in linear graph produces correct slice membership, entries, exits', () => {
    const graph = linearGraph(); // Trigger → A → B → C → D
    const trust = trustWith(graph, ['Trigger', 'D']);
    const changeSet: NodeChangeSet = {
      added: [],
      removed: [],
      modified: [{ node: 'B' as NodeIdentity, changes: ['parameter'] }],
      unchanged: ['Trigger' as NodeIdentity, 'A' as NodeIdentity, 'C' as NodeIdentity, 'D' as NodeIdentity],
    };

    const result = resolveTarget({ kind: 'changed' }, graph, changeSet, trust);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Slice membership: B is seed. Forward from B hits C, then D (trusted boundary — included but not expanded).
    // Backward from B hits A, then Trigger (trusted boundary — included but not expanded).
    const nodeNames = [...result.slice.nodes].sort();
    expect(nodeNames).toEqual(['A', 'B', 'C', 'D', 'Trigger']);

    // Seeds: B (modified) + A, C (not in trust state — no trust record means "changed")
    expect([...result.slice.seedNodes].sort()).toEqual(['A', 'B', 'C']);

    // Entry points: Trigger (trusted boundary, backward stop)
    expect(result.slice.entryPoints.sort()).toEqual(['Trigger']);

    // Exit points: D (trusted boundary, forward stop)
    expect(result.slice.exitPoints.sort()).toEqual(['D']);
  });

  // T003: Named-node slice construction with branching
  it('named-node: targeting B in branching graph propagates correctly', () => {
    const graph = branchingGraph(); // Root → A → B → C, B → D → E
    const trust = trustWith(graph, ['Root']);

    const result = resolveTarget(
      { kind: 'nodes', nodes: ['B' as NodeIdentity] },
      graph,
      null,
      trust,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Forward from B: C (terminal), D → E (terminal) — all included
    // Backward from B: A, then Root (trusted boundary — included)
    const nodeNames = [...result.slice.nodes].sort();
    expect(nodeNames).toEqual(['A', 'B', 'C', 'D', 'E', 'Root']);

    // Backward stops at Root (trusted), so Root is an entry point
    expect(result.slice.entryPoints).toContain('Root');
    // C and E are terminals (no forward edges)
    expect(result.slice.exitPoints.sort()).toEqual(['C', 'E']);
  });

  // T004: Trust-boundary stopping behavior
  it('trust boundaries stop traversal — trusted C stops forward propagation from B', () => {
    const graph = linearGraph(); // Trigger → A → B → C → D
    const trust = trustWith(graph, ['C']);

    const result = resolveTarget(
      { kind: 'nodes', nodes: ['B' as NodeIdentity] },
      graph,
      null,
      trust,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Forward from B: hits C (trusted boundary) — C is included but D is NOT reached
    expect(result.slice.nodes.has('C' as NodeIdentity)).toBe(true);
    expect(result.slice.nodes.has('D' as NodeIdentity)).toBe(false);

    // C should be an exit point (trusted boundary stop)
    expect(result.slice.exitPoints).toContain('C');
  });

  // T004 continued: multiple trust boundaries
  it('trust boundaries at multiple points — each stops independently', () => {
    const graph = linearGraph(); // Trigger → A → B → C → D
    const trust = trustWith(graph, ['Trigger', 'C']);

    const result = resolveTarget(
      { kind: 'nodes', nodes: ['B' as NodeIdentity] },
      graph,
      null,
      trust,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Forward from B: C (trusted, stop) — D not reached
    // Backward from B: A, then Trigger (trusted, stop)
    expect(result.slice.nodes.has('D' as NodeIdentity)).toBe(false);
    expect(result.slice.entryPoints).toContain('Trigger');
    expect(result.slice.exitPoints).toContain('C');
  });

  // T005: Entry/exit derivation for resolveNodes and resolveChanged
  it('entry/exit derivation: resolveNodes — entries have no in-slice predecessors', () => {
    const graph = linearGraph(); // Trigger → A → B → C → D
    const trust = emptyTrust();

    const result = resolveTarget(
      { kind: 'nodes', nodes: ['B' as NodeIdentity] },
      graph,
      null,
      trust,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // No trust boundaries — full backward walk hits Trigger (graph root)
    // Entry = Trigger (no incoming edges in graph)
    expect(result.slice.entryPoints).toContain('Trigger');
    // Exit = D (no outgoing edges in graph)
    expect(result.slice.exitPoints).toContain('D');
  });

  it('entry/exit derivation: resolveChanged — entries and exits match changed propagation', () => {
    const graph = linearGraph();
    const changeSet: NodeChangeSet = {
      added: [],
      removed: [],
      modified: [{ node: 'C' as NodeIdentity, changes: ['parameter'] }],
      unchanged: ['Trigger' as NodeIdentity, 'A' as NodeIdentity, 'B' as NodeIdentity, 'D' as NodeIdentity],
    };

    const result = resolveTarget({ kind: 'changed' }, graph, changeSet, emptyTrust());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Forward from C: D (terminal) — exit
    // Backward from C: B, A, Trigger (root) — entry
    expect(result.slice.entryPoints).toContain('Trigger');
    expect(result.slice.exitPoints).toContain('D');
  });

  // T006: Narrowing behavior
  it('narrowing: 7-node workflow with 1 changed node narrows correctly', () => {
    // Build a 7-node linear graph
    const names = ['t', 'a', 'b', 'c', 'd', 'e', 'f'];
    const nodes = new Map<NodeIdentity, GraphNode>(
      names.map((n) => [n as NodeIdentity, makeNode(n)]),
    );
    const forward = new Map<NodeIdentity, Edge[]>();
    const backward = new Map<NodeIdentity, Edge[]>();
    for (const n of names) {
      forward.set(n as NodeIdentity, []);
      backward.set(n as NodeIdentity, []);
    }
    for (let i = 0; i < names.length - 1; i++) {
      forward.get(names[i] as NodeIdentity)!.push(makeEdge(names[i], names[i + 1]));
      backward.get(names[i + 1] as NodeIdentity)!.push(makeEdge(names[i], names[i + 1]));
    }
    const displayNameIndex = new Map<string, NodeIdentity>(
      names.map((n) => [n, n as NodeIdentity]),
    );
    const graph: WorkflowGraph = { nodes, forward, backward, displayNameIndex, ast: stubAst };

    // Trust all except 'c' — 'c' is the changed node
    const trustedNames = names.filter((n) => n !== 'c');
    const trustState: TrustState = {
      workflowId: 'test',
      nodes: new Map(),
      connectionsHash: '',
    };
    const currentHashes = new Map<NodeIdentity, string>();
    const hash = 'hash-000';
    for (const name of names) {
      currentHashes.set(name as NodeIdentity, hash);
      if (name !== 'c') {
        trustState.nodes.set(name as NodeIdentity, {
          contentHash: hash,
          validatedBy: 'pin-run',
          validatedAt: '2026-01-01',
          validatedWith: 'static',
          fixtureHash: null,
        });
      }
    }

    const input: EvaluationInput = {
      target: { kind: 'workflow' },
      targetNodes: new Set(names.map((n) => n as NodeIdentity)),
      tool: 'validate',
      force: false,
      trustState,
      changeSet: {
        added: [],
        removed: [],
        modified: [{ node: 'c' as NodeIdentity, changes: ['parameter'] }],
        unchanged: trustedNames.map((n) => n as NodeIdentity),
      },
      graph,
      currentHashes,
      priorSummary: null,
      expressionRefs: [],
      llmValidationRequested: false,
      fixtureHash: null,
    };

    const result = computeNarrowedTarget(input);

    // 7 nodes, 1 changed (ratio 1/7 ≈ 0.14 < 0.2), > 5 nodes — narrowing applies
    expect(result).not.toBeNull();
    if (!result || result.kind !== 'slice') return;

    // Narrowed set must contain the changed node
    expect(result.slice.nodes.has('c' as NodeIdentity)).toBe(true);
    // Must be a proper subset
    expect(result.slice.nodes.size).toBeLessThan(7);
    // Seed nodes = changed nodes
    expect(result.slice.seedNodes.has('c' as NodeIdentity)).toBe(true);
    // Entry and exit points must exist
    expect(result.slice.entryPoints.length).toBeGreaterThan(0);
    expect(result.slice.exitPoints.length).toBeGreaterThan(0);
  });

  // T007: Empty change set
  it('empty change set with all nodes trusted returns empty slice', () => {
    const graph = linearGraph();
    const names = [...graph.nodes.keys()];
    const trust = trustWith(graph, [...names] as string[]);

    const changeSet: NodeChangeSet = {
      added: [],
      removed: [],
      modified: [],
      unchanged: names as NodeIdentity[],
    };

    const result = resolveTarget({ kind: 'changed' }, graph, changeSet, trust);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.target.nodes).toHaveLength(0);
    expect(result.target.description).toBe('No changes detected');
    expect(result.slice.nodes.size).toBe(0);
    expect(result.slice.seedNodes.size).toBe(0);
    expect(result.slice.entryPoints).toHaveLength(0);
    expect(result.slice.exitPoints).toHaveLength(0);
  });
});
