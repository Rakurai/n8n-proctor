/**
 * Typed assertion helpers for integration test scenarios.
 *
 * Each function throws with a descriptive message on failure.
 * Operates on n8n-vet's DiagnosticSummary and TrustStatusReport types.
 */

import type { DiagnosticSummary, ErrorClassification } from '../../../src/types/diagnostic.js';
import type { GuardrailAction } from '../../../src/types/guardrail.js';
import type { McpResponse, McpErrorType } from '../../../src/errors.js';
import type { TrustStatusReport } from '../../../src/types/surface.js';
import type { ValidationEvidence } from '../../../src/types/target.js';

export function assertStatus(
  summary: DiagnosticSummary,
  expected: 'pass' | 'fail' | 'error' | 'skipped',
  fixture?: string,
): void {
  if (summary.status !== expected) {
    const ctx = fixture ? ` [fixture: ${fixture}]` : '';
    const errors = summary.errors.length > 0
      ? `\n  errors: ${summary.errors.map(e => `${e.classification}: ${e.message}`).join('; ')}`
      : '';
    const evidence = `\n  evidenceBasis: ${summary.evidenceBasis}`;
    const capabilities = `\n  capabilities: mcpTools=${summary.capabilities.mcpTools}`;
    throw new Error(
      `Expected status '${expected}', got '${summary.status}'${ctx}${evidence}${capabilities}${errors}`,
    );
  }
}

export function assertEvidenceBasis(
  summary: DiagnosticSummary,
  expected: ValidationEvidence,
  fixture?: string,
): void {
  if (summary.evidenceBasis !== expected) {
    const ctx = fixture ? ` [fixture: ${fixture}]` : '';
    throw new Error(
      `Expected evidenceBasis '${expected}', got '${summary.evidenceBasis}'${ctx}`,
    );
  }
}

export function assertFindingPresent(
  summary: DiagnosticSummary,
  classification: ErrorClassification,
  fixture?: string,
): void {
  const match = summary.errors.find(e => e.classification === classification);
  if (!match) {
    const found = summary.errors.map(e => e.classification).join(', ') || 'none';
    const ctx = fixture ? ` [fixture: ${fixture}]` : '';
    throw new Error(
      `Expected finding with classification '${classification}', found: [${found}]${ctx}`,
    );
  }
}

export function assertFindingOnNode(
  summary: DiagnosticSummary,
  classification: ErrorClassification,
  nodeName: string,
  fixture?: string,
): void {
  const match = summary.errors.find(
    e => e.classification === classification && e.node === nodeName,
  );
  if (!match) {
    const found = summary.errors.map(e => `${e.classification}@${e.node ?? '?'}`).join(', ') || 'none';
    const ctx = fixture ? ` [fixture: ${fixture}]` : '';
    throw new Error(
      `Expected '${classification}' finding on node '${nodeName}', found: [${found}]${ctx}`,
    );
  }
}

export function assertNoFindings(summary: DiagnosticSummary, fixture?: string): void {
  if (summary.errors.length > 0) {
    const found = summary.errors.map(e => `${e.classification}: ${e.message}`).join('; ');
    const ctx = fixture ? ` [fixture: ${fixture}]` : '';
    throw new Error(`Expected no findings, but got ${summary.errors.length}: ${found}${ctx}`);
  }
}

export function assertExecutedPathContains(
  summary: DiagnosticSummary,
  nodeNames: string[],
  fixture?: string,
): void {
  const ctx = fixture ? ` [fixture: ${fixture}]` : '';
  if (!summary.executedPath) {
    throw new Error(`Expected executedPath to be non-null${ctx}`);
  }
  const pathNames = summary.executedPath.map(n => n.name);
  for (const name of nodeNames) {
    if (!pathNames.includes(name)) {
      throw new Error(
        `Expected executedPath to contain '${name}', got: [${pathNames.join(', ')}]${ctx}`,
      );
    }
  }
}

export function assertExecutedPathOrder(
  summary: DiagnosticSummary,
  orderedNames: string[],
  fixture?: string,
): void {
  const ctx = fixture ? ` [fixture: ${fixture}]` : '';
  if (!summary.executedPath) {
    throw new Error(`Expected executedPath to be non-null${ctx}`);
  }
  const pathNames = summary.executedPath.map(n => n.name);
  let lastIndex = -1;
  for (const name of orderedNames) {
    const idx = pathNames.indexOf(name, lastIndex + 1);
    if (idx === -1) {
      throw new Error(
        `Expected executedPath to contain '${name}' after index ${lastIndex}, got: [${pathNames.join(', ')}]${ctx}`,
      );
    }
    lastIndex = idx;
  }
}

export function assertTrusted(status: TrustStatusReport, nodeName: string, fixture?: string): void {
  const match = status.trustedNodes.find(n => n.name === nodeName);
  if (!match) {
    const trusted = status.trustedNodes.map(n => n.name).join(', ') || 'none';
    const ctx = fixture ? ` [fixture: ${fixture}]` : '';
    throw new Error(
      `Expected node '${nodeName}' to be trusted. Trusted nodes: [${trusted}]${ctx}`,
    );
  }
}

export function assertTrustedWith(
  status: TrustStatusReport,
  nodeName: string,
  evidence: ValidationEvidence,
  fixture?: string,
): void {
  const match = status.trustedNodes.find(n => n.name === nodeName);
  if (!match) {
    const trusted = status.trustedNodes.map(n => n.name).join(', ') || 'none';
    const ctx = fixture ? ` [fixture: ${fixture}]` : '';
    throw new Error(
      `Expected node '${nodeName}' to be trusted. Trusted nodes: [${trusted}]${ctx}`,
    );
  }
  if (match.validatedWith !== evidence) {
    const ctx = fixture ? ` [fixture: ${fixture}]` : '';
    throw new Error(
      `Expected node '${nodeName}' validated with '${evidence}', got '${match.validatedWith}'${ctx}`,
    );
  }
}

export function assertUntrusted(status: TrustStatusReport, nodeName: string, fixture?: string): void {
  const match = status.untrustedNodes.find(n => n.name === nodeName);
  if (!match) {
    const untrusted = status.untrustedNodes.map(n => n.name).join(', ') || 'none';
    const ctx = fixture ? ` [fixture: ${fixture}]` : '';
    throw new Error(
      `Expected node '${nodeName}' to be untrusted. Untrusted nodes: [${untrusted}]${ctx}`,
    );
  }
}

export function assertGuardrailAction(
  summary: DiagnosticSummary,
  kind: GuardrailAction,
  fixture?: string,
): void {
  const match = summary.guardrailActions.find(d => d.action === kind);
  if (!match) {
    const found = summary.guardrailActions.map(d => d.action).join(', ') || 'none';
    const ctx = fixture ? ` [fixture: ${fixture}]` : '';
    throw new Error(
      `Expected guardrail action '${kind}', found: [${found}]${ctx}`,
    );
  }
}

export function assertGuardrailExplanationContains(
  summary: DiagnosticSummary,
  kind: GuardrailAction,
  substring: string,
  fixture?: string,
): void {
  const match = summary.guardrailActions.find(d => d.action === kind);
  if (!match) {
    const found = summary.guardrailActions.map(d => d.action).join(', ') || 'none';
    const ctx = fixture ? ` [fixture: ${fixture}]` : '';
    throw new Error(
      `Expected guardrail action '${kind}', found: [${found}]${ctx}`,
    );
  }
  if (!match.explanation.toLowerCase().includes(substring.toLowerCase())) {
    const ctx = fixture ? ` [fixture: ${fixture}]` : '';
    throw new Error(
      `Expected guardrail '${kind}' explanation to contain '${substring}', got: '${match.explanation}'${ctx}`,
    );
  }
}

export function assertMcpErrorType(
  response: McpResponse<unknown>,
  expectedType: McpErrorType,
  fixture?: string,
): void {
  const ctx = fixture ? ` [fixture: ${fixture}]` : '';
  if (response.success) {
    throw new Error(`Expected MCP error response, got success${ctx}`);
  }
  if (response.error.type !== expectedType) {
    throw new Error(
      `Expected error type '${expectedType}', got '${response.error.type}'${ctx}`,
    );
  }
}
