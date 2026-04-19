/**
 * Unit tests for capability detection.
 *
 * Covers: n8n reachable + auth = static-only, n8n + auth + MCP = mcp,
 * unreachable → infrastructure error, auth failure → infrastructure error,
 * workflow not found → precondition error with push advice,
 * toAvailableCapabilities mapper.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DetectedCapabilities, CapabilityLevel } from '../../src/execution/types.js';
import { toAvailableCapabilities, detectCapabilities } from '../../src/execution/capabilities.js';
import { ExecutionInfrastructureError, ExecutionPreconditionError } from '../../src/execution/errors.js';

// ---------------------------------------------------------------------------
// toAvailableCapabilities mapper
// ---------------------------------------------------------------------------

describe('toAvailableCapabilities', () => {
  it('maps mcp capabilities', () => {
    const detected: DetectedCapabilities = {
      level: 'mcp',
      restReadable: true,
      mcpAvailable: true,
      mcpTools: ['test_workflow', 'get_execution', 'prepare_test_pin_data'],
    };

    const available = toAvailableCapabilities(detected);
    expect(available).toEqual({
      staticAnalysis: true,
      restReadable: true,
      mcpTools: true,
    });
  });

  it('maps static-only capabilities (REST available but no MCP)', () => {
    const detected: DetectedCapabilities = {
      level: 'static-only',
      restReadable: true,
      mcpAvailable: false,
      mcpTools: [],
    };

    const available = toAvailableCapabilities(detected);
    expect(available).toEqual({
      staticAnalysis: true,
      restReadable: true,
      mcpTools: false,
    });
  });

  it('maps static-only capabilities (no REST, no MCP)', () => {
    const detected: DetectedCapabilities = {
      level: 'static-only',
      restReadable: false,
      mcpAvailable: false,
      mcpTools: [],
    };

    const available = toAvailableCapabilities(detected);
    expect(available).toEqual({
      staticAnalysis: true,
      restReadable: false,
      mcpTools: false,
    });
  });
});

// ---------------------------------------------------------------------------
// DetectedCapabilities type contracts
// ---------------------------------------------------------------------------

describe('DetectedCapabilities type', () => {
  it('represents mcp capability with all MCP tools', () => {
    const caps: DetectedCapabilities = {
      level: 'mcp',
      restReadable: true,
      mcpAvailable: true,
      mcpTools: ['test_workflow', 'get_execution', 'prepare_test_pin_data'],
    };
    expect(caps.level).toBe('mcp');
    expect(caps.mcpTools).toHaveLength(3);
  });

  it('level corresponds to available surfaces', () => {
    const levels: Array<[CapabilityLevel, boolean, boolean]> = [
      ['mcp', true, true],
      ['static-only', true, false],
      ['static-only', false, false],
    ];

    for (const [level, rest, mcp] of levels) {
      const caps: DetectedCapabilities = {
        level,
        restReadable: rest,
        mcpAvailable: mcp,
        mcpTools: mcp ? ['test_workflow'] : [],
      };
      expect(caps.restReadable).toBe(rest);
      expect(caps.mcpAvailable).toBe(mcp);
    }
  });
});

// ---------------------------------------------------------------------------
// detectCapabilities — integration-style unit tests with fetch mocked
// ---------------------------------------------------------------------------

describe('detectCapabilities', () => {
  const TEST_HOST = 'http://localhost:5678';
  const TEST_API_KEY = 'test-api-key';

  beforeEach(() => {
    process.env['N8N_HOST'] = TEST_HOST;
    process.env['N8N_API_KEY'] = TEST_API_KEY;
  });

  afterEach(() => {
    delete process.env['N8N_HOST'];
    delete process.env['N8N_API_KEY'];
    vi.restoreAllMocks();
  });

  it('REST available, no MCP → level static-only', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );

    const result = await detectCapabilities();

    expect(result.level).toBe('static-only');
    expect(result.restReadable).toBe(true);
    expect(result.mcpAvailable).toBe(false);
    expect(result.mcpTools).toEqual([]);
  });

  it('REST + MCP available → level mcp', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );

    const callTool = vi.fn().mockResolvedValue({ content: [] });

    const result = await detectCapabilities({ callTool });

    expect(result.level).toBe('mcp');
    expect(result.restReadable).toBe(true);
    expect(result.mcpAvailable).toBe(true);
    expect(result.mcpTools).toEqual([
      'test_workflow',
      'get_execution',
      'prepare_test_pin_data',
    ]);
  });

  it('fetch throws → degrades to static-only (restReadable false)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await detectCapabilities();
    expect(result.level).toBe('static-only');
    expect(result.restReadable).toBe(false);
  });

  it('fetch returns 401 → degrades to static-only (restReadable false)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Unauthorized', { status: 401 }),
    );

    const result = await detectCapabilities();
    expect(result.level).toBe('static-only');
    expect(result.restReadable).toBe(false);
  });

  it('workflow not found → throws ExecutionPreconditionError workflow-not-found', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    // First call: probe succeeds
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );
    // Second call: workflow check returns 404
    fetchSpy.mockResolvedValueOnce(
      new Response('Not Found', { status: 404 }),
    );

    await expect(detectCapabilities({ workflowId: 'wf-123' })).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ExecutionPreconditionError && err.reason === 'workflow-not-found',
    );
  });

  it('MCP tools partially available → mcpTools has only responding tools', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );

    const callTool = vi.fn()
      .mockRejectedValueOnce(new Error('tools/list not found'))  // tools/list — unavailable
      .mockResolvedValueOnce({ content: [] })   // test_workflow — available
      .mockResolvedValueOnce({ content: [] })   // get_execution — available
      .mockRejectedValueOnce(new Error('tool not found')); // prepare_test_pin_data — unavailable

    const result = await detectCapabilities({ callTool });

    expect(result.mcpTools).toEqual(['test_workflow', 'get_execution']);
    expect(result.mcpAvailable).toBe(true);
  });

  it('no credentials available → degrades to static-only', async () => {
    delete process.env['N8N_HOST'];
    delete process.env['N8N_API_KEY'];

    const result = await detectCapabilities();
    expect(result.level).toBe('static-only');
    expect(result.restReadable).toBe(false);
  });

  it('network error during workflow check → throws ExecutionInfrastructureError unreachable', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    // First call: probe succeeds
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );
    // Second call: network fails
    fetchSpy.mockRejectedValueOnce(new Error('socket hang up'));

    await expect(detectCapabilities({ workflowId: 'wf-456' })).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ExecutionInfrastructureError && err.reason === 'unreachable',
    );
  });
});
