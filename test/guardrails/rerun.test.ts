/**
 * Tests for extractPriorRunContext and checkDeFlaker.
 */

import { describe, it, expect } from 'vitest';
import { extractPriorRunContext, checkDeFlaker } from '../../src/guardrails/rerun.js';
import type { DiagnosticSummary } from '../../src/types/diagnostic.js';
import { nodeIdentity } from '../../src/types/identity.js';
import type { PriorRunContext } from '../../src/guardrails/types.js';

function makeSummary(overrides?: Partial<DiagnosticSummary>): DiagnosticSummary {
  return {
    schemaVersion: 2,
    status: 'pass',
    target: { description: 'test', nodes: [], automatic: true },
    evidenceBasis: 'static',
    executedPath: null,
    errors: [],
    nodeAnnotations: [],
    guardrailActions: [],
    hints: [],
    coverage: {
      analyzableRatio: 1,
      counts: { 'shape-preserving': 0, 'shape-augmenting': 0, 'shape-replacing': 0, 'shape-opaque': 0 },
      totalInScope: 0,
    },
    nextAction: { type: 'continue-building', targetNodes: null, blocking: false, reason: 'Validation passed — continue building.' },
    capabilities: { staticAnalysis: true, mcpTools: false },
    meta: {
      runId: 'run-1',
      executionId: null,
      timestamp: '2026-01-01T00:00:00Z',
      durationMs: 10,
    },
    ...overrides,
  };
}

describe('extractPriorRunContext', () => {
  it('returns null for null summary', () => {
    expect(extractPriorRunContext(null)).toBeNull();
  });

  it('extracts failed status from fail summary', () => {
    const ctx = extractPriorRunContext(makeSummary({ status: 'fail' }));
    expect(ctx).not.toBeNull();
    expect(ctx!.failed).toBe(true);
  });

  it('extracts non-failed status from pass summary', () => {
    const ctx = extractPriorRunContext(makeSummary({ status: 'pass' }));
    expect(ctx!.failed).toBe(false);
  });

  it('extracts failing path from executedPath', () => {
    const ctx = extractPriorRunContext(makeSummary({
      status: 'fail',
      executedPath: [
        { name: nodeIdentity('a'), executionIndex: 0, sourceOutput: null },
        { name: nodeIdentity('b'), executionIndex: 0, sourceOutput: 0 },
      ],
    }));
    expect(ctx!.failingPath).toEqual([nodeIdentity('a'), nodeIdentity('b')]);
  });

  it('extracts failure classification from first error', () => {
    const ctx = extractPriorRunContext(makeSummary({
      status: 'fail',
      errors: [{
        type: 'HttpError',
        message: 'timeout',
        description: null,
        node: nodeIdentity('api'),
        classification: 'external-service',
        context: {},
      }],
    }));
    expect(ctx!.failureClassification).toBe('external-service');
  });
});

describe('checkDeFlaker', () => {
  it('returns false when prior run did not fail', () => {
    const ctx: PriorRunContext = { failed: false, failingPath: null, failureClassification: null };
    expect(checkDeFlaker(ctx, new Set())).toBe(false);
  });

  it('returns false when failing path is null', () => {
    const ctx: PriorRunContext = { failed: true, failingPath: null, failureClassification: 'unknown' };
    expect(checkDeFlaker(ctx, new Set())).toBe(false);
  });

  it('returns false when failure is external-service', () => {
    const ctx: PriorRunContext = {
      failed: true,
      failingPath: [nodeIdentity('a')],
      failureClassification: 'external-service',
    };
    expect(checkDeFlaker(ctx, new Set())).toBe(false);
  });

  it('returns false when failure is platform', () => {
    const ctx: PriorRunContext = {
      failed: true,
      failingPath: [nodeIdentity('a')],
      failureClassification: 'platform',
    };
    expect(checkDeFlaker(ctx, new Set())).toBe(false);
  });

  it('returns true when failing path has no intersection with changed nodes', () => {
    const ctx: PriorRunContext = {
      failed: true,
      failingPath: [nodeIdentity('a'), nodeIdentity('b')],
      failureClassification: 'unknown',
    };
    expect(checkDeFlaker(ctx, new Set([nodeIdentity('c')]))).toBe(true);
  });

  it('returns false when failing path intersects changed nodes', () => {
    const ctx: PriorRunContext = {
      failed: true,
      failingPath: [nodeIdentity('a'), nodeIdentity('b')],
      failureClassification: 'unknown',
    };
    expect(checkDeFlaker(ctx, new Set([nodeIdentity('b')]))).toBe(false);
  });
});
