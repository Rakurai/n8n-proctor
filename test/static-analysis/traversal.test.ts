/**
 * Unit tests for shared traversal primitives: traverse() and classifyBoundaries().
 */

import { describe, expect, it } from 'vitest';
import { classifyBoundaries, traverse } from '../../src/static-analysis/traversal.js';
import type { Edge, GraphNode, WorkflowGraph } from '../../src/types/graph.js';
import type { NodeIdentity } from '../../src/types/identity.js';
import type { WorkflowAST } from '@n8n-as-code/transformer';

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

function buildGraph(
  names: string[],
  edgePairs: [string, string][],
): WorkflowGraph {
  const nodes = new Map<NodeIdentity, GraphNode>(
    names.map((n) => [n as NodeIdentity, makeNode(n)]),
  );
  const forward = new Map<NodeIdentity, Edge[]>(
    names.map((n) => [n as NodeIdentity, []]),
  );
  const backward = new Map<NodeIdentity, Edge[]>(
    names.map((n) => [n as NodeIdentity, []]),
  );
  for (const [from, to] of edgePairs) {
    const edge = makeEdge(from, to);
    forward.get(from as NodeIdentity)!.push(edge);
    backward.get(to as NodeIdentity)!.push(edge);
  }
  const displayNameIndex = new Map<string, NodeIdentity>(
    names.map((n) => [n, n as NodeIdentity]),
  );
  return { nodes, forward, backward, displayNameIndex, ast: stubAst };
}

const neverStop = () => false;

// ── traverse() ────────────────────────────────────────────────────

describe('traverse', () => {
  it('forward traversal visits all reachable nodes', () => {
    const graph = buildGraph(['A', 'B', 'C', 'D'], [['A', 'B'], ['B', 'C'], ['C', 'D']]);
    const result = traverse(['A' as NodeIdentity], graph, 'forward', neverStop);

    expect([...result.visited].sort()).toEqual(['A', 'B', 'C', 'D']);
    // D is graph terminal (no forward edges)
    expect(result.boundaryNodes).toContain('D');
  });

  it('backward traversal visits all reachable nodes', () => {
    const graph = buildGraph(['A', 'B', 'C', 'D'], [['A', 'B'], ['B', 'C'], ['C', 'D']]);
    const result = traverse(['D' as NodeIdentity], graph, 'backward', neverStop);

    expect([...result.visited].sort()).toEqual(['A', 'B', 'C', 'D']);
    // A is graph root (no backward edges)
    expect(result.boundaryNodes).toContain('A');
  });

  it('stops at nodes where predicate returns true', () => {
    const graph = buildGraph(['A', 'B', 'C', 'D'], [['A', 'B'], ['B', 'C'], ['C', 'D']]);
    const stopAtC = (node: NodeIdentity) => node === ('C' as NodeIdentity);

    const result = traverse(['A' as NodeIdentity], graph, 'forward', stopAtC);

    // C is included but not expanded — D is not visited
    expect(result.visited.has('C' as NodeIdentity)).toBe(true);
    expect(result.visited.has('D' as NodeIdentity)).toBe(false);
    expect(result.boundaryNodes).toContain('C');
  });

  it('handles cycles without infinite loop', () => {
    const graph = buildGraph(['A', 'B', 'C'], [['A', 'B'], ['B', 'C'], ['C', 'A']]);
    const result = traverse(['A' as NodeIdentity], graph, 'forward', neverStop);

    expect([...result.visited].sort()).toEqual(['A', 'B', 'C']);
  });

  it('handles branching graph', () => {
    // A → B → C, A → D → E
    const graph = buildGraph(
      ['A', 'B', 'C', 'D', 'E'],
      [['A', 'B'], ['B', 'C'], ['A', 'D'], ['D', 'E']],
    );
    const result = traverse(['A' as NodeIdentity], graph, 'forward', neverStop);

    expect([...result.visited].sort()).toEqual(['A', 'B', 'C', 'D', 'E']);
    // C and E are terminals
    expect(result.boundaryNodes.sort()).toEqual(['C', 'E']);
  });

  it('graph terminal is always a boundary node', () => {
    const graph = buildGraph(['A', 'B'], [['A', 'B']]);
    const result = traverse(['A' as NodeIdentity], graph, 'forward', neverStop);

    expect(result.boundaryNodes).toContain('B');
  });

  it('multiple start nodes are all visited', () => {
    // Disconnected: A → B, C → D
    const graph = buildGraph(
      ['A', 'B', 'C', 'D'],
      [['A', 'B'], ['C', 'D']],
    );
    const result = traverse(
      ['A' as NodeIdentity, 'C' as NodeIdentity],
      graph,
      'forward',
      neverStop,
    );

    expect([...result.visited].sort()).toEqual(['A', 'B', 'C', 'D']);
  });
});

// ── classifyBoundaries() ──────────────────────────────────────────

describe('classifyBoundaries', () => {
  it('classifies entry and exit points for a subgraph', () => {
    // Full graph: A → B → C → D → E
    // Subgraph: {B, C, D}
    const graph = buildGraph(
      ['A', 'B', 'C', 'D', 'E'],
      [['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'E']],
    );
    const subset = new Set(['B', 'C', 'D'] as NodeIdentity[]);

    const result = classifyBoundaries(subset, graph);

    // B's incoming edge is from A (not in set) → entry
    expect(result.entryPoints).toContain('B');
    // D's outgoing edge goes to E (not in set) → exit
    expect(result.exitPoints).toContain('D');
    // C has both incoming and outgoing within the set — neither entry nor exit
    expect(result.entryPoints).not.toContain('C');
    expect(result.exitPoints).not.toContain('C');
  });

  it('graph root is always an entry point', () => {
    const graph = buildGraph(['A', 'B', 'C'], [['A', 'B'], ['B', 'C']]);
    const allNodes = new Set(['A', 'B', 'C'] as NodeIdentity[]);

    const result = classifyBoundaries(allNodes, graph);

    expect(result.entryPoints).toContain('A');
  });

  it('graph terminal is always an exit point', () => {
    const graph = buildGraph(['A', 'B', 'C'], [['A', 'B'], ['B', 'C']]);
    const allNodes = new Set(['A', 'B', 'C'] as NodeIdentity[]);

    const result = classifyBoundaries(allNodes, graph);

    expect(result.exitPoints).toContain('C');
  });

  it('node with external outgoing edge is an exit point even if it has in-set outgoing edges', () => {
    // A → B → C, B → D (D outside set)
    const graph = buildGraph(
      ['A', 'B', 'C', 'D'],
      [['A', 'B'], ['B', 'C'], ['B', 'D']],
    );
    const subset = new Set(['A', 'B', 'C'] as NodeIdentity[]);

    const result = classifyBoundaries(subset, graph);

    // B has outgoing to D which is outside set → exit
    expect(result.exitPoints).toContain('B');
  });

  it('single-node set: node is both entry and exit', () => {
    const graph = buildGraph(['A', 'B', 'C'], [['A', 'B'], ['B', 'C']]);
    const single = new Set(['B'] as NodeIdentity[]);

    const result = classifyBoundaries(single, graph);

    // B's predecessor A is not in set → entry
    // B's successor C is not in set → exit
    expect(result.entryPoints).toContain('B');
    expect(result.exitPoints).toContain('B');
  });
});
