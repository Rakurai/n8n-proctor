/**
 * Internal types for the trust subsystem — persistence schema and rerun assessment.
 *
 * Shared types (TrustState, NodeTrustRecord, NodeChangeSet, etc.) live in
 * src/types/trust.ts. This file defines types used only within the trust
 * subsystem implementation.
 */

import { z } from 'zod';
import type { NodeIdentity } from '../types/identity.js';
import type { NodeTrustRecord } from '../types/trust.js';

/** Result of evaluating whether re-validating a target is likely low-value. */
export interface RerunAssessment {
  isLowValue: boolean;
  confidence: 'high' | 'medium';
  reason: string;
  suggestedNarrowedTarget: NodeIdentity[] | null;
}

/** On-disk representation of the full trust store (all workflows). */
export interface PersistedTrustStore {
  schemaVersion: number;
  workflows: Record<string, PersistedWorkflowTrust>;
}

/** Single workflow's trust state in persisted (JSON-safe) form. */
export interface PersistedWorkflowTrust {
  workflowId: string;
  workflowHash: string;
  connectionsHash: string;
  nodes: Record<string, NodeTrustRecord>;
}

// -- Zod schemas for persistence boundary validation --

const nodeTrustRecordSchema = z.object({
  contentHash: z.string(),
  validatedBy: z.string(),
  validatedAt: z.string(),
  validationLayer: z.enum(['static', 'execution', 'both']),
  fixtureHash: z.string().nullable(),
});

const persistedWorkflowTrustSchema = z.object({
  workflowId: z.string(),
  workflowHash: z.string(),
  connectionsHash: z.string(),
  nodes: z.record(z.string(), nodeTrustRecordSchema),
});

export const persistedTrustStoreSchema = z.object({
  schemaVersion: z.number(),
  workflows: z.record(z.string(), persistedWorkflowTrustSchema),
});
