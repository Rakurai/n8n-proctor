import { describe, it, expect } from 'vitest';
import { findHarvestableNodes } from '../../src/trust/harvest.js';
import type { ExecutionData, NodeExecutionResult } from '../../src/execution/types.js';
import type { WorkflowGraph, GraphNode, Edge } from '../../src/types/graph.js';
import type { NodeIdentity } from '../../src/types/identity.js';
import { nodeIdentity } from '../../src/types/identity.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(name: string): [NodeIdentity, GraphNode] {
  const id = nodeIdentity(name);
  return [
    id,
    {
      name: id,
      displayName: name,
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4,
      parameters: {},
      credentials: null,
      disabled: false,
      classification: 'shape-replacing',
    },
  ];
}

function makeGraph(nodeNames: string[]): WorkflowGraph {
  const nodes = new Map(nodeNames.map(makeNode));
  const forward = new Map<NodeIdentity, Edge[]>();
  const backward = new Map<NodeIdentity, Edge[]>();
  const displayNameIndex = new Map<string, NodeIdentity>();
  for (const [id, node] of nodes) {
    forward.set(id, []);
    backward.set(id, []);
    displayNameIndex.set(node.displayName, id);
  }
  return { nodes, forward, backward, displayNameIndex, ast: { nodes: [], connections: [] } };
}

function successResult(index: number): NodeExecutionResult {
  return {
    executionIndex: index,
    status: 'success',
    executionTimeMs: 10,
    error: null,
    source: null,
    hints: [],
  };
}

function errorResult(index: number): NodeExecutionResult {
  return {
    executionIndex: index,
    status: 'error',
    executionTimeMs: 10,
    error: { type: 'TestError', message: 'fail', description: null, node: null, contextKind: 'other', context: {} },
    source: null,
    hints: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('findHarvestableNodes', () => {
  it('returns empty when no execution results exist beyond target', () => {
    const graph = makeGraph(['trigger', 'target']);
    const executionData: ExecutionData = {
      nodeResults: new Map([[nodeIdentity('target'), [successResult(0)]]]),
      lastNodeExecuted: 'target',
      error: null,
      status: 'success',
    };

    const result = findHarvestableNodes(
      executionData,
      new Set<string>(),
      new Set([nodeIdentity('target')]),
      graph,
    );
    expect(result).toHaveLength(0);
  });

  it('harvests out-of-scope nodes with successful results', () => {
    const graph = makeGraph(['trigger', 'target', 'outOfScope']);
    const executionData: ExecutionData = {
      nodeResults: new Map([
        [nodeIdentity('target'), [successResult(0)]],
        [nodeIdentity('outOfScope'), [successResult(1)]],
      ]),
      lastNodeExecuted: 'outOfScope',
      error: null,
      status: 'success',
    };

    const result = findHarvestableNodes(
      executionData,
      new Set<string>(),
      new Set([nodeIdentity('target')]),
      graph,
    );
    expect(result).toEqual([nodeIdentity('outOfScope')]);
  });

  it('excludes pinned nodes', () => {
    const graph = makeGraph(['trigger', 'target', 'pinned']);
    const executionData: ExecutionData = {
      nodeResults: new Map([
        [nodeIdentity('target'), [successResult(0)]],
        [nodeIdentity('pinned'), [successResult(1)]],
      ]),
      lastNodeExecuted: 'pinned',
      error: null,
      status: 'success',
    };

    const result = findHarvestableNodes(
      executionData,
      new Set(['pinned']),
      new Set([nodeIdentity('target')]),
      graph,
    );
    expect(result).toHaveLength(0);
  });

  it('excludes nodes with any error result', () => {
    const graph = makeGraph(['trigger', 'target', 'failed']);
    const executionData: ExecutionData = {
      nodeResults: new Map([
        [nodeIdentity('target'), [successResult(0)]],
        [nodeIdentity('failed'), [successResult(1), errorResult(2)]],
      ]),
      lastNodeExecuted: 'failed',
      error: null,
      status: 'error',
    };

    const result = findHarvestableNodes(
      executionData,
      new Set<string>(),
      new Set([nodeIdentity('target')]),
      graph,
    );
    expect(result).toHaveLength(0);
  });

  it('excludes nodes not in graph', () => {
    const graph = makeGraph(['trigger', 'target']);
    const executionData: ExecutionData = {
      nodeResults: new Map([
        [nodeIdentity('target'), [successResult(0)]],
        [nodeIdentity('ghost'), [successResult(1)]],
      ]),
      lastNodeExecuted: 'ghost',
      error: null,
      status: 'success',
    };

    const result = findHarvestableNodes(
      executionData,
      new Set<string>(),
      new Set([nodeIdentity('target')]),
      graph,
    );
    expect(result).toHaveLength(0);
  });

  it('excludes nodes with empty results array', () => {
    const graph = makeGraph(['trigger', 'target', 'noRun']);
    const executionData: ExecutionData = {
      nodeResults: new Map([
        [nodeIdentity('target'), [successResult(0)]],
        [nodeIdentity('noRun'), []],
      ]),
      lastNodeExecuted: 'target',
      error: null,
      status: 'success',
    };

    const result = findHarvestableNodes(
      executionData,
      new Set<string>(),
      new Set([nodeIdentity('target')]),
      graph,
    );
    expect(result).toHaveLength(0);
  });

  it('harvests multiple eligible nodes', () => {
    const graph = makeGraph(['trigger', 'target', 'nodeA', 'nodeB']);
    const executionData: ExecutionData = {
      nodeResults: new Map([
        [nodeIdentity('target'), [successResult(0)]],
        [nodeIdentity('nodeA'), [successResult(1)]],
        [nodeIdentity('nodeB'), [successResult(2)]],
      ]),
      lastNodeExecuted: 'nodeB',
      error: null,
      status: 'success',
    };

    const result = findHarvestableNodes(
      executionData,
      new Set<string>(),
      new Set([nodeIdentity('target')]),
      graph,
    );
    expect(result).toHaveLength(2);
    expect(result).toContain(nodeIdentity('nodeA'));
    expect(result).toContain(nodeIdentity('nodeB'));
  });
});
