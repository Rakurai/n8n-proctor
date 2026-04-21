/**
 * Surface-layer types returned by MCP tools and CLI commands.
 *
 * These types define the output shapes for trust_status and explain tools.
 * They are assembled at the MCP/CLI boundary from existing subsystem data.
 */

import type { AvailableCapabilities } from './diagnostic.js';
import type { GuardrailDecision } from './guardrail.js';
import type { NodeIdentity } from './identity.js';
import type { ValidationEvidence } from './target.js';

// ── TrustStatusReport ────────────────────────────────────────────

/** Output of the trust_status tool. */
export type TrustStatusReport = TrustStatusDetailedReport | TrustStatusCompactReport;

/** Full per-node trust status detail. */
export interface TrustStatusDetailedReport {
  workflowId: string;
  totalNodes: number;
  trustedNodes: TrustedNodeInfo[];
  untrustedNodes: UntrustedNodeInfo[];
  changedSinceLastValidation: NodeIdentity[];
}

/** Compact counts-only trust status (compact mode). */
export interface TrustStatusCompactReport {
  workflowId: string;
  totalNodes: number;
  trustedCount: number;
  untrustedCount: number;
  changedCount: number;
}

/** A node with an active trust record. */
export interface TrustedNodeInfo {
  name: NodeIdentity;
  validatedAt: string;
  validatedWith: ValidationEvidence;
  contentUnchanged: boolean;
}

/** A node without trust or with invalidated trust. */
export interface UntrustedNodeInfo {
  name: NodeIdentity;
  reason: string;
}

// ── GuardrailExplanation ─────────────────────────────────────────

/** Output of the explain tool — dry-run guardrail evaluation. */
export interface GuardrailExplanation {
  guardrailDecision: GuardrailDecision;
  targetResolution: TargetResolutionInfo;
  capabilities: AvailableCapabilities;
  /** Precondition status for the requested tool. Present when tool='test'. */
  preconditions?: TestPreconditions;
}

/** Precondition checks for the test tool, reported by explain. */
export interface TestPreconditions {
  mcpAvailable: boolean;
  metadataIdPresent: boolean;
}

/** How the agent's target would resolve. */
export interface TargetResolutionInfo {
  resolvedNodes: NodeIdentity[];
  selectedPath: NodeIdentity[];
  automatic: boolean;
}
