import { describe, it, expect } from 'vitest';
import { detectDisconnectedNodes } from '../../src/static-analysis/disconnected.js';
import type { WorkflowGraph, GraphNode, Edge } from '../../src/types/graph.js';
import type { NodeIdentity } from '../../src/types/identity.js';
import { nodeIdentity } from '../../src/types/identity.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(
  name: string,
  type: string,
  overrides: Partial<GraphNode> = {},
): [NodeIdentity, GraphNode] {
  const id = nodeIdentity(name);
  return [
    id,
    {
      name: id,
      displayName: name,
      type,
      typeVersion: 1,
      parameters: {},
      credentials: null,
      disabled: false,
      classification: 'shape-replacing',
      ...overrides,
    },
  ];
}

function makeGraph(
  nodes: [NodeIdentity, GraphNode][],
  edges: Array<{ from: string; to: string }>,
): WorkflowGraph {
  const nodeMap = new Map(nodes);
  const forward = new Map<NodeIdentity, Edge[]>();
  const backward = new Map<NodeIdentity, Edge[]>();
  const displayNameIndex = new Map<string, NodeIdentity>();

  for (const [id, node] of nodes) {
    forward.set(id, []);
    backward.set(id, []);
    displayNameIndex.set(node.displayName, id);
  }

  for (const { from, to } of edges) {
    const fromId = nodeIdentity(from);
    const toId = nodeIdentity(to);
    const edge: Edge = { from: fromId, to: toId, fromOutput: 0, toInput: 0, isError: false };
    forward.get(fromId)?.push(edge);
    backward.get(toId)?.push(edge);
  }

  return { nodes: nodeMap, forward, backward, displayNameIndex, ast: { nodes: [], connections: [] } };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('detectDisconnectedNodes', () => {
  it('returns empty for a fully connected graph', () => {
    const graph = makeGraph(
      [
        makeNode('ScheduleTrigger', 'n8n-nodes-base.scheduleTrigger'),
        makeNode('HttpRequest', 'n8n-nodes-base.httpRequest'),
      ],
      [{ from: 'ScheduleTrigger', to: 'HttpRequest' }],
    );
    const hints = detectDisconnectedNodes(graph);
    expect(hints).toHaveLength(0);
  });

  it('detects an enabled disconnected node as warning', () => {
    const graph = makeGraph(
      [
        makeNode('ScheduleTrigger', 'n8n-nodes-base.scheduleTrigger'),
        makeNode('HttpRequest', 'n8n-nodes-base.httpRequest'),
        makeNode('Orphan', 'n8n-nodes-base.set'),
      ],
      [{ from: 'ScheduleTrigger', to: 'HttpRequest' }],
    );
    const hints = detectDisconnectedNodes(graph);
    expect(hints).toHaveLength(1);
    expect(hints[0].node).toBe(nodeIdentity('Orphan'));
    expect(hints[0].severity).toBe('warning');
    expect(hints[0].message).toContain('not reachable from any trigger');
  });

  it('detects a disabled disconnected node as info', () => {
    const graph = makeGraph(
      [
        makeNode('ScheduleTrigger', 'n8n-nodes-base.scheduleTrigger'),
        makeNode('DisabledNode', 'n8n-nodes-base.set', { disabled: true }),
      ],
      [],
    );
    const hints = detectDisconnectedNodes(graph);
    expect(hints).toHaveLength(1);
    expect(hints[0].node).toBe(nodeIdentity('DisabledNode'));
    expect(hints[0].severity).toBe('info');
    expect(hints[0].message).toContain('Disabled node');
  });

  it('excludes sticky notes from detection', () => {
    const graph = makeGraph(
      [
        makeNode('ScheduleTrigger', 'n8n-nodes-base.scheduleTrigger'),
        makeNode('StickyNote', 'n8n-nodes-base.stickyNote'),
      ],
      [],
    );
    const hints = detectDisconnectedNodes(graph);
    expect(hints).toHaveLength(0);
  });

  it('returns info hint when no triggers exist', () => {
    const graph = makeGraph(
      [
        makeNode('HttpRequest', 'n8n-nodes-base.httpRequest'),
        makeNode('SetFields', 'n8n-nodes-base.set'),
      ],
      [{ from: 'HttpRequest', to: 'SetFields' }],
    );
    const hints = detectDisconnectedNodes(graph);
    expect(hints).toHaveLength(1);
    expect(hints[0].severity).toBe('info');
    expect(hints[0].node).toBeNull();
    expect(hints[0].message).toContain('No trigger nodes found');
  });

  it('follows error output edges', () => {
    const graph = makeGraph(
      [
        makeNode('ScheduleTrigger', 'n8n-nodes-base.scheduleTrigger'),
        makeNode('HttpRequest', 'n8n-nodes-base.httpRequest'),
        makeNode('ErrorHandler', 'n8n-nodes-base.set'),
      ],
      [],
    );
    // Add error edge manually
    const fromId = nodeIdentity('HttpRequest');
    const toId = nodeIdentity('ErrorHandler');
    const triggerId = nodeIdentity('ScheduleTrigger');
    graph.forward.get(triggerId)!.push({ from: triggerId, to: fromId, fromOutput: 0, toInput: 0, isError: false });
    graph.backward.get(fromId)!.push({ from: triggerId, to: fromId, fromOutput: 0, toInput: 0, isError: false });
    graph.forward.get(fromId)!.push({ from: fromId, to: toId, fromOutput: 0, toInput: 0, isError: true });
    graph.backward.get(toId)!.push({ from: fromId, to: toId, fromOutput: 0, toInput: 0, isError: true });

    const hints = detectDisconnectedNodes(graph);
    expect(hints).toHaveLength(0);
  });

  it('handles multiple triggers reaching different subgraphs', () => {
    const graph = makeGraph(
      [
        makeNode('TriggerA', 'n8n-nodes-base.scheduleTrigger'),
        makeNode('TriggerB', 'n8n-nodes-base.manualTrigger'),
        makeNode('NodeA', 'n8n-nodes-base.httpRequest'),
        makeNode('NodeB', 'n8n-nodes-base.set'),
      ],
      [
        { from: 'TriggerA', to: 'NodeA' },
        { from: 'TriggerB', to: 'NodeB' },
      ],
    );
    const hints = detectDisconnectedNodes(graph);
    expect(hints).toHaveLength(0);
  });

  it('detects multiple disconnected nodes', () => {
    const graph = makeGraph(
      [
        makeNode('ScheduleTrigger', 'n8n-nodes-base.scheduleTrigger'),
        makeNode('Connected', 'n8n-nodes-base.httpRequest'),
        makeNode('OrphanA', 'n8n-nodes-base.set'),
        makeNode('OrphanB', 'n8n-nodes-base.noOp'),
      ],
      [{ from: 'ScheduleTrigger', to: 'Connected' }],
    );
    const hints = detectDisconnectedNodes(graph);
    expect(hints).toHaveLength(2);
    const nodeNames = hints.map((h) => h.node);
    expect(nodeNames).toContain(nodeIdentity('OrphanA'));
    expect(nodeNames).toContain(nodeIdentity('OrphanB'));
  });

  it('handles LangChain trigger types', () => {
    const graph = makeGraph(
      [
        makeNode('ChatTrigger', '@n8n/n8n-nodes-langchain.chatTrigger'),
        makeNode('Agent', '@n8n/n8n-nodes-langchain.agent'),
        makeNode('Orphan', 'n8n-nodes-base.set'),
      ],
      [{ from: 'ChatTrigger', to: 'Agent' }],
    );
    const hints = detectDisconnectedNodes(graph);
    expect(hints).toHaveLength(1);
    expect(hints[0].node).toBe(nodeIdentity('Orphan'));
  });
});
