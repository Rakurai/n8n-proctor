/**
 * Surface-layer types returned by MCP tools and CLI commands.
 *
 * These types define the output shapes for trust_status and explain tools.
 * They are assembled at the MCP/CLI boundary from existing subsystem data.
 */

import type { AvailableCapabilities } from './diagnostic.js';
import type { GuardrailDecision } from './guardrail.js';

// ── TrustStatusReport ────────────────────────────────────────────

/** Output of the trust_status tool. */
export interface TrustStatusReport {
  workflowId: string;
  totalNodes: number;
  trustedNodes: TrustedNodeInfo[];
  untrustedNodes: UntrustedNodeInfo[];
  changedSinceLastValidation: string[];
}

/** A node with an active trust record. */
export interface TrustedNodeInfo {
  name: string;
  validatedAt: string;
  validationLayer: string;
  contentUnchanged: boolean;
}

/** A node without trust or with invalidated trust. */
export interface UntrustedNodeInfo {
  name: string;
  reason: string;
}

// ── GuardrailExplanation ─────────────────────────────────────────

/** Output of the explain tool — dry-run guardrail evaluation. */
export interface GuardrailExplanation {
  guardrailDecision: GuardrailDecision;
  targetResolution: TargetResolutionInfo;
  capabilities: AvailableCapabilities;
}

/** How the agent's target would resolve. */
export interface TargetResolutionInfo {
  resolvedNodes: string[];
  selectedPath: string[];
  automatic: boolean;
}
