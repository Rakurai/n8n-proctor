import { describe, expect, it, vi } from 'vitest';
import { prepareExecution } from '../../src/execution/prepare.js';
import { ExecutionPreconditionError } from '../../src/execution/errors.js';
import type {
  ExecutionInternalDeps,
  ExecutionPreparationInput,
  PinData,
  PinDataItem,
} from '../../src/execution/types.js';
import type { WorkflowGraph } from '../../src/types/graph.js';
import type { NodeIdentity } from '../../src/types/identity.js';
import type { TrustState, NodeTrustRecord } from '../../src/types/trust.js';
import type { ResolvedTarget } from '../../src/types/diagnostic.js';

// ── Helpers ──────────────────────────────────────────────────────────

function nid(name: string): NodeIdentity {
  return name as NodeIdentity;
}

function makeGraph(nodeNames: string[]): WorkflowGraph {
  const nodes = new Map<NodeIdentity, import('../../src/types/graph.js').GraphNode>();
  const forward = new Map<NodeIdentity, import('../../src/types/graph.js').Edge[]>();
  const backward = new Map<NodeIdentity, import('../../src/types/graph.js').Edge[]>();
  const displayNameIndex = new Map<string, NodeIdentity>();

  for (const name of nodeNames) {
    const id = nid(name);
    nodes.set(id, {
      name: id,
      displayName: name,
      type: 'n8n-nodes-base.noOp',
      typeVersion: 1,
      parameters: {},
      credentials: null,
      disabled: false,
      classification: 'shape-preserving',
    });
    forward.set(id, []);
    backward.set(id, []);
    displayNameIndex.set(name, id);
  }

  const ast = { nodes: [], connections: [] } as unknown as import('@n8n-as-code/transformer').WorkflowAST;
  return { nodes, forward, backward, displayNameIndex, ast };
}

function makeTarget(nodeNames: string[]): ResolvedTarget {
  return {
    description: 'test target',
    nodes: nodeNames.map(nid),
    automatic: false,
  };
}

function emptyTrust(): TrustState {
  return { workflowId: '', connectionsHash: '', nodes: new Map() };
}

function trustedState(nodeNames: string[]): TrustState {
  const nodes = new Map<NodeIdentity, NodeTrustRecord>();
  for (const name of nodeNames) {
    nodes.set(nid(name), {
      contentHash: 'hash-' + name,
      validatedBy: 'run-1',
      validatedAt: '2024-01-01T00:00:00Z',
      validatedWith: 'execution',
      fixtureHash: null,
    });
  }
  return { workflowId: 'test-workflow', connectionsHash: 'wf-hash', nodes };
}

function makeInput(overrides?: Partial<ExecutionPreparationInput>): ExecutionPreparationInput {
  return {
    n8nWorkflowId: 'wf-123',
    workflowId: 'test-workflow.ts',
    graph: makeGraph(['trigger', 'http', 'output']),
    trustState: emptyTrust(),
    resolvedTarget: makeTarget(['trigger', 'http', 'output']),
    callTool: vi.fn(),
    pinData: null,
    ...overrides,
  };
}

function makeDeps(overrides?: Partial<ExecutionInternalDeps>): ExecutionInternalDeps {
  return {
    executeSmoke: vi.fn().mockResolvedValue({
      executionId: 'exec-1',
      status: 'success',
      error: null,
    }),
    constructPinData: vi.fn().mockReturnValue({
      pinData: { trigger: [{ json: { key: 'value' } }] },
      sourceMap: { trigger: 'agent-fixture' },
    }),
    detectCapabilities: vi.fn().mockResolvedValue({
      level: 'mcp',
      mcpAvailable: true,
      mcpTools: ['test_workflow', 'get_execution'],
    }),
    readCachedPinData: vi.fn().mockResolvedValue(undefined),
    preparePinData: vi.fn().mockResolvedValue({
      nodeSchemasToGenerate: {},
      nodesWithoutSchema: [],
      nodesSkipped: [],
      coverage: { withSchemaFromExecution: 0, withSchemaFromDefinition: 0, withoutSchema: 0, skipped: 0, total: 0 },
    }),
    getExecution: vi.fn().mockResolvedValue({
      status: 'success',
      data: { nodeResults: new Map(), lastNodeExecuted: 'output', error: null, status: 'success' },
    }),
    generateSampleFromSchema: vi.fn().mockReturnValue({ sample: true }),
    computeNodeHashes: vi.fn().mockReturnValue(new Map()),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('prepareExecution', () => {
  it('throws ExecutionPreconditionError when n8nWorkflowId is empty', async () => {
    const input = makeInput({ n8nWorkflowId: '' });
    const deps = makeDeps();

    await expect(prepareExecution(input, deps)).rejects.toThrow(ExecutionPreconditionError);
  });

  it('returns static-only capabilities when MCP is unavailable', async () => {
    const deps = makeDeps({
      detectCapabilities: vi.fn().mockResolvedValue({
        level: 'static-only',
        mcpAvailable: false,
        mcpTools: [],
      }),
    });
    const input = makeInput();

    const result = await prepareExecution(input, deps);

    expect(result.capabilities.mcpTools).toBe(false);
    expect(result.executionData).toBeNull();
    expect(result.executionId).toBeNull();
    expect(deps.executeSmoke).not.toHaveBeenCalled();
  });

  it('returns static-only when callTool is not provided', async () => {
    const input = makeInput();
    delete (input as unknown as Record<string, unknown>).callTool;
    const deps = makeDeps();

    const result = await prepareExecution(input, deps);

    expect(result.capabilities.mcpTools).toBe(true);
    expect(result.executionData).toBeNull();
    expect(deps.executeSmoke).not.toHaveBeenCalled();
  });

  it('happy path: MCP available, executes and retrieves data', async () => {
    const input = makeInput();
    const deps = makeDeps();

    const result = await prepareExecution(input, deps);

    expect(result.capabilities.mcpTools).toBe(true);
    expect(result.executionId).toBe('exec-1');
    expect(result.executionData).not.toBeNull();
    expect(result.executionErrors).toHaveLength(0);
    expect(deps.executeSmoke).toHaveBeenCalledOnce();
    expect(deps.constructPinData).toHaveBeenCalledOnce();
    expect(deps.getExecution).toHaveBeenCalledOnce();
  });

  it('collects execution error when smoke execution returns error', async () => {
    const deps = makeDeps({
      executeSmoke: vi.fn().mockResolvedValue({
        executionId: 'exec-err',
        status: 'error',
        error: {
          type: 'NodeOperationError',
          message: 'HTTP 500',
          description: null,
          node: 'http',
          contextKind: 'api',
          context: { httpCode: '500' },
        },
      }),
    });
    const input = makeInput();

    const result = await prepareExecution(input, deps);

    expect(result.executionErrors).toHaveLength(1);
    expect(result.executionErrors[0].type).toBe('NodeOperationError');
    expect(result.executionErrors[0].node).toBe('http');
    expect(result.executionId).toBe('exec-err');
  });

  it('uses pin data tiering: loads cached artifacts for trusted boundaries', async () => {
    const graph = makeGraph(['trigger', 'http', 'output']);
    // Set up forward edges: trigger → http → output
    graph.forward.set(nid('trigger'), [{
      from: nid('trigger'), to: nid('http'), fromOutput: 0, toInput: 0, isError: false,
    }]);
    graph.forward.set(nid('http'), [{
      from: nid('http'), to: nid('output'), fromOutput: 0, toInput: 0, isError: false,
    }]);

    const trust = trustedState(['trigger']);
    const input = makeInput({
      graph,
      trustState: trust,
      resolvedTarget: makeTarget(['trigger', 'http', 'output']),
    });

    const cachedItems: PinDataItem[] = [{ json: { cached: true } }];
    const deps = makeDeps({
      readCachedPinData: vi.fn().mockResolvedValue(cachedItems),
      computeNodeHashes: vi.fn().mockReturnValue(
        new Map([[nid('trigger'), 'hash-trigger']]),
      ),
    });

    await prepareExecution(input, deps);

    expect(deps.readCachedPinData).toHaveBeenCalledWith('test-workflow.ts', 'hash-trigger');
    // constructPinData should receive prior artifacts
    expect(deps.constructPinData).toHaveBeenCalledWith(
      graph,
      [nid('trigger')],
      null,
      { trigger: cachedItems },
      undefined,
    );
  });

  it('MCP tier-3: generates sample from schema when available', async () => {
    const graph = makeGraph(['trigger', 'http']);
    graph.forward.set(nid('trigger'), [{
      from: nid('trigger'), to: nid('http'), fromOutput: 0, toInput: 0, isError: false,
    }]);

    const trust = trustedState(['trigger']);
    const input = makeInput({
      graph,
      trustState: trust,
      resolvedTarget: makeTarget(['trigger', 'http']),
    });

    const deps = makeDeps({
      computeNodeHashes: vi.fn().mockReturnValue(
        new Map([[nid('trigger'), 'hash-trigger']]),
      ),
      preparePinData: vi.fn().mockResolvedValue({
        nodeSchemasToGenerate: { trigger: { type: 'object', properties: { id: { type: 'number' } } } },
        nodesWithoutSchema: [],
        nodesSkipped: [],
        coverage: { withSchemaFromExecution: 1, withSchemaFromDefinition: 0, withoutSchema: 0, skipped: 0, total: 1 },
      }),
      generateSampleFromSchema: vi.fn().mockReturnValue({ id: 42 }),
    });

    await prepareExecution(input, deps);

    expect(deps.generateSampleFromSchema).toHaveBeenCalledWith({
      type: 'object',
      properties: { id: { type: 'number' } },
    });
  });

  it('MCP tier-3 failure surfaces warning — does not throw', async () => {
    const graph = makeGraph(['trigger', 'http']);
    graph.forward.set(nid('trigger'), [{
      from: nid('trigger'), to: nid('http'), fromOutput: 0, toInput: 0, isError: false,
    }]);

    const trust = trustedState(['trigger']);
    const input = makeInput({
      graph,
      trustState: trust,
      resolvedTarget: makeTarget(['trigger', 'http']),
    });

    const deps = makeDeps({
      computeNodeHashes: vi.fn().mockReturnValue(
        new Map([[nid('trigger'), 'hash-trigger']]),
      ),
      preparePinData: vi.fn().mockRejectedValue(new Error('MCP unavailable')),
    });

    const result = await prepareExecution(input, deps);
    expect(result.executionErrors).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('MCP unavailable');
    expect(deps.constructPinData).toHaveBeenCalled();
  });

  it('propagates agent-provided pin data as tier 1 fixtures', async () => {
    const agentPinData: PinData = { trigger: [{ json: { agent: true } }] };
    const input = makeInput({ pinData: agentPinData });
    const deps = makeDeps();

    await prepareExecution(input, deps);

    // constructPinData receives agent pin data as fixtures parameter
    const call = (deps.constructPinData as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[2]).toEqual(agentPinData);
  });
});
