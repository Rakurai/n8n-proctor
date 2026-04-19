/**
 * Trust derivation, invalidation, and query functions.
 *
 * All functions are immutable — they return new TrustState instances and
 * never mutate their inputs.
 */

import type { WorkflowGraph } from '../types/graph.js';
import type { NodeIdentity } from '../types/identity.js';
import type { ValidationLayer } from '../types/target.js';
import type { ChangeKind, NodeChangeSet, NodeTrustRecord, TrustState } from '../types/trust.js';
import { computeContentHash } from './hash.js';
import type { RerunAssessment } from './types.js';

const TRUST_PRESERVING: ReadonlySet<ChangeKind> = new Set(['position-only', 'metadata-only']);

// ── Derivation (US2) ────────────────────────────────────────────────

/**
 * Record trust from a successful validation run.
 *
 * Creates NodeTrustRecord for each specified node. Replaces existing records.
 * Caller is responsible for excluding mocked/skipped nodes from the list.
 */
export function recordValidation(
  state: TrustState,
  nodes: NodeIdentity[],
  graph: WorkflowGraph,
  layer: ValidationLayer,
  runId: string,
  fixtureHash: string | null,
): TrustState {
  const newNodes = new Map(state.nodes);
  const timestamp = new Date().toISOString();

  for (const nodeId of nodes) {
    const graphNode = graph.nodes.get(nodeId);
    if (!graphNode) {
      throw new Error(`recordValidation: node '${nodeId}' not found in graph`);
    }

    const record: NodeTrustRecord = {
      contentHash: computeContentHash(graphNode, graph.ast),
      validatedBy: runId,
      validatedAt: timestamp,
      validationLayer: layer,
      fixtureHash,
    };

    newNodes.set(nodeId, record);
  }

  return { ...state, nodes: newNodes };
}

// ── Invalidation (US3) ──────────────────────────────────────────────

/**
 * Apply forward-only trust invalidation based on detected changes.
 *
 * Seeds invalidation from trust-breaking modified nodes, added nodes, and
 * connection-changed nodes. BFS forward through graph.forward adjacency.
 * Removes stale records for nodes no longer in the graph.
 */
export function invalidateTrust(
  state: TrustState,
  changeSet: NodeChangeSet,
  graph: WorkflowGraph,
): TrustState {
  const invalidationSet = new Set<NodeIdentity>();

  // Seed from trust-breaking modifications
  for (const mod of changeSet.modified) {
    const isTrustPreserving = mod.changes.every((c) => TRUST_PRESERVING.has(c));
    if (!isTrustPreserving) {
      invalidationSet.add(mod.node);
    }
  }

  // Seed from added nodes
  for (const node of changeSet.added) {
    invalidationSet.add(node);
  }

  // BFS forward through the graph
  const queue = [...invalidationSet];
  while (queue.length > 0) {
    const current = queue.shift() as NodeIdentity;
    const downstream = graph.forward.get(current) ?? [];
    for (const edge of downstream) {
      const target = edge.to as NodeIdentity;
      if (!invalidationSet.has(target)) {
        invalidationSet.add(target);
        queue.push(target);
      }
    }
  }

  // Build new nodes map: copy trusted records, skip invalidated and stale
  const newNodes = new Map<NodeIdentity, NodeTrustRecord>();
  const currentNodeNames = new Set(graph.nodes.keys());

  for (const [nodeId, record] of state.nodes) {
    if (invalidationSet.has(nodeId)) continue;
    if (!currentNodeNames.has(nodeId)) continue; // stale record (FR-021: spec says "during change detection" but removal here is functionally equivalent since invalidateTrust is always called after computeChangeSet)
    newNodes.set(nodeId, record);
  }

  // Transfer trust for renames: metadata-only modifications where the new
  // identity has no trust record but an old record with matching content hash
  // exists in the original state (FR-007).
  for (const mod of changeSet.modified) {
    if (mod.changes.length === 1 && mod.changes[0] === 'metadata-only' && !newNodes.has(mod.node)) {
      const graphNode = graph.nodes.get(mod.node);
      if (!graphNode) continue;
      const currentHash = computeContentHash(graphNode, graph.ast);
      // Find a stale record (node no longer in graph) with matching hash
      for (const [oldId, oldRecord] of state.nodes) {
        if (!currentNodeNames.has(oldId) && oldRecord.contentHash === currentHash) {
          newNodes.set(mod.node, oldRecord);
          break;
        }
      }
    }
  }

  return { ...state, nodes: newNodes };
}

// ── Queries (US5) ───────────────────────────────────────────────────

/**
 * Check if a node is currently trusted.
 *
 * Returns true only if a trust record exists AND its contentHash matches
 * the current hash.
 */
export function isTrusted(state: TrustState, node: NodeIdentity, currentHash: string): boolean {
  const record = state.nodes.get(node);
  return record !== undefined && record.contentHash === currentHash;
}

/**
 * Find trusted nodes at the edge of the trusted region — trusted nodes
 * that have at least one untrusted downstream neighbor.
 */
export function getTrustedBoundaries(
  state: TrustState,
  graph: WorkflowGraph,
  scope: Set<NodeIdentity>,
  currentHashes: Map<NodeIdentity, string>,
): NodeIdentity[] {
  const boundaries: NodeIdentity[] = [];

  // Check nodes within and adjacent to scope
  const candidates = new Set<NodeIdentity>(scope);
  for (const nodeId of scope) {
    const downstream = graph.forward.get(nodeId) ?? [];
    for (const edge of downstream) {
      candidates.add(edge.to as NodeIdentity);
    }
    const upstream = graph.backward.get(nodeId) ?? [];
    for (const edge of upstream) {
      candidates.add(edge.from as NodeIdentity);
    }
  }

  for (const nodeId of candidates) {
    const hash = currentHashes.get(nodeId);
    if (!hash || !isTrusted(state, nodeId, hash)) continue;

    // Check if any downstream neighbor is untrusted
    const downstream = graph.forward.get(nodeId) ?? [];
    const hasUntrustedDownstream = downstream.some((edge) => {
      const downstreamHash = currentHashes.get(edge.to as NodeIdentity);
      return !downstreamHash || !isTrusted(state, edge.to as NodeIdentity, downstreamHash);
    });

    if (hasUntrustedDownstream) {
      boundaries.push(nodeId);
    }
  }

  return boundaries;
}

/**
 * Find untrusted nodes within a scope.
 */
export function getUntrustedNodes(
  state: TrustState,
  scope: Set<NodeIdentity>,
  currentHashes: Map<NodeIdentity, string>,
): NodeIdentity[] {
  const untrusted: NodeIdentity[] = [];
  for (const nodeId of scope) {
    const hash = currentHashes.get(nodeId);
    if (!hash || !isTrusted(state, nodeId, hash)) {
      untrusted.push(nodeId);
    }
  }
  return untrusted;
}

/**
 * Evaluate whether re-validating a target is likely low-value.
 *
 * Checks trust-level conditions only: all target nodes trusted, fixture hash
 * matches. Does NOT check failing-path relevance (owned by guardrails, Phase 4).
 */
export function getRerunAssessment(
  state: TrustState,
  target: NodeIdentity[],
  currentHashes: Map<NodeIdentity, string>,
  fixtureHash: string | null,
): RerunAssessment {
  // Check if all target nodes are trusted with matching hashes
  const untrustedNodes: NodeIdentity[] = [];
  for (const nodeId of target) {
    const hash = currentHashes.get(nodeId);
    if (!hash || !isTrusted(state, nodeId, hash)) {
      untrustedNodes.push(nodeId);
    }
  }

  if (untrustedNodes.length > 0) {
    return {
      isLowValue: false,
      confidence: 'high',
      reason: `${untrustedNodes.length} of ${target.length} target node(s) are not trusted`,
      suggestedNarrowedTarget: untrustedNodes.length < target.length ? untrustedNodes : null,
    };
  }

  // All nodes trusted — check fixture hash
  if (fixtureHash !== null) {
    const fixtureMatches = target.every((nodeId) => {
      const record = state.nodes.get(nodeId);
      return record?.fixtureHash === fixtureHash;
    });

    if (!fixtureMatches) {
      return {
        isLowValue: false,
        confidence: 'medium',
        reason: 'Fixture hash has changed since last validation',
        suggestedNarrowedTarget: null,
      };
    }
  }

  return {
    isLowValue: true,
    confidence: 'high',
    reason: 'All target nodes are trusted with matching content and fixture hashes',
    suggestedNarrowedTarget: null,
  };
}
