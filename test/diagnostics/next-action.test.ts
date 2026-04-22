import { describe, it, expect } from 'vitest';
import { deriveNextAction } from '../../src/diagnostics/next-action.js';
import type { DiagnosticSummary } from '../../src/types/diagnostic.js';
import { nodeIdentity } from '../../src/types/identity.js';

function baseSummary(overrides: Partial<DiagnosticSummary> = {}): DiagnosticSummary {
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
    nextAction: { type: 'none', targetNodes: null, blocking: false, reason: '' },
    capabilities: { staticAnalysis: true, mcpTools: false },
    meta: { runId: 'r1', executionId: null, timestamp: '2026-01-01T00:00:00Z', durationMs: 10 },
    ...overrides,
  };
}

describe('deriveNextAction', () => {
  it('returns continue-building for pass with no warnings', () => {
    const result = deriveNextAction(baseSummary());
    expect(result.type).toBe('continue-building');
    expect(result.blocking).toBe(false);
  });

  it('returns review-warnings for pass with warning hints', () => {
    const result = deriveNextAction(baseSummary({
      hints: [{ node: nodeIdentity('n1'), message: 'disconnected', severity: 'warning' }],
    }));
    expect(result.type).toBe('review-warnings');
    expect(result.blocking).toBe(false);
  });

  it('returns fix-errors for fail status with node-attributed errors', () => {
    const result = deriveNextAction(baseSummary({
      status: 'fail',
      errors: [{
        type: 'ExpressionError',
        message: 'bad',
        description: null,
        node: nodeIdentity('httpRequest'),
        classification: 'expression',
        context: {},
      }],
    }));
    expect(result.type).toBe('fix-errors');
    expect(result.blocking).toBe(true);
    expect(result.targetNodes).toEqual([nodeIdentity('httpRequest')]);
  });

  it('returns fix-errors with null targetNodes when errors have no node', () => {
    const result = deriveNextAction(baseSummary({
      status: 'fail',
      errors: [{
        type: 'Error',
        message: 'fail',
        description: null,
        node: null,
        classification: 'unknown',
        context: {},
      }],
    }));
    expect(result.type).toBe('fix-errors');
    expect(result.targetNodes).toBeNull();
  });

  it('returns fix-workflow for error status with parse failure', () => {
    const result = deriveNextAction(baseSummary({
      status: 'error',
      errors: [{
        type: 'OrchestratorError',
        message: 'Failed to parse workflow: syntax error',
        description: null,
        node: null,
        classification: 'platform',
        context: {},
      }],
    }));
    expect(result.type).toBe('fix-workflow');
    expect(result.blocking).toBe(true);
  });

  it('returns fix-request for error status with invalid request', () => {
    const result = deriveNextAction(baseSummary({
      status: 'error',
      errors: [{
        type: 'OrchestratorError',
        message: 'Invalid request: missing workflowPath',
        description: null,
        node: null,
        classification: 'platform',
        context: {},
      }],
    }));
    expect(result.type).toBe('fix-request');
    expect(result.blocking).toBe(true);
  });

  it('returns push-workflow for error status with metadata.id issue', () => {
    const result = deriveNextAction(baseSummary({
      status: 'error',
      errors: [{
        type: 'OrchestratorError',
        message: 'Workflow has no metadata.id — push with n8nac first, then test.',
        description: null,
        node: null,
        classification: 'platform',
        context: {},
      }],
    }));
    expect(result.type).toBe('push-workflow');
    expect(result.blocking).toBe(true);
  });

  it('returns force-revalidate for skipped with overridable refuse', () => {
    const result = deriveNextAction(baseSummary({
      status: 'skipped',
      guardrailActions: [{
        action: 'refuse',
        explanation: 'No changes detected',
        evidence: { changedNodes: [], trustedNodes: [], lastValidatedAt: null, fixtureChanged: false },
        overridable: true,
      }],
    }));
    expect(result.type).toBe('force-revalidate');
    expect(result.blocking).toBe(false);
  });

  it('returns none for skipped with non-overridable refuse', () => {
    const result = deriveNextAction(baseSummary({
      status: 'skipped',
      guardrailActions: [{
        action: 'refuse',
        explanation: 'No changes detected',
        evidence: { changedNodes: [], trustedNodes: [], lastValidatedAt: null, fixtureChanged: false },
        overridable: false,
      }],
    }));
    expect(result.type).toBe('none');
    expect(result.blocking).toBe(false);
  });

  it('returns none for skipped without refuse action', () => {
    const result = deriveNextAction(baseSummary({
      status: 'skipped',
      guardrailActions: [],
    }));
    expect(result.type).toBe('none');
  });
});
