/**
 * Narrowing algorithm — reduces a broad validation target to the smallest
 * useful scope around changed nodes.
 *
 * Seeds from trust-breaking changed nodes, then traverses forward and backward
 * through the graph, stopping at trusted-unchanged nodes or target boundaries.
 * Returns null when narrowing would not reduce the scope.
 */

import { classifyBoundaries, traverse } from '../static-analysis/traversal.js';
import { isTrusted } from '../trust/trust.js';
import type { GuardrailEvidence } from '../types/guardrail.js';
import type { NodeIdentity } from '../types/identity.js';
import type { ValidationTarget } from '../types/target.js';
import { assembleEvidence } from './evidence.js';
import type { EvaluationInput } from './types.js';
import { NARROW_MAX_CHANGED_RATIO, NARROW_MIN_TARGET_NODES } from './types.js';

/**
 * Compute a narrowed validation target from the evaluation input.
 *
 * Returns a `ValidationTarget` with `kind: 'slice'` when narrowing is
 * applicable, or null when the precondition fails or narrowing would
 * not reduce scope.
 *
 * Accepts optional pre-computed evidence to avoid redundant recomputation.
 */
export function computeNarrowedTarget(
  input: EvaluationInput,
  precomputedEvidence?: GuardrailEvidence,
): ValidationTarget | null {
  const { targetNodes, graph, trustState, currentHashes } = input;

  const evidence = precomputedEvidence ?? assembleEvidence(input);
  const changedNodes = evidence.changedNodes;

  // Precondition: target must be large enough and changes must be narrow
  if (targetNodes.size <= NARROW_MIN_TARGET_NODES) return null;
  if (changedNodes.length === 0) return null;
  const changedRatio = changedNodes.length / targetNodes.size;
  if (changedRatio >= NARROW_MAX_CHANGED_RATIO) return null;

  const changedSet = new Set<NodeIdentity>(changedNodes);

  // Stopping predicate: stop at nodes outside target, trusted-unchanged nodes, or trigger nodes (backward only)
  const makeStopPredicate = (direction: 'forward' | 'backward') => (node: NodeIdentity) => {
    // Stop at nodes outside target
    if (!targetNodes.has(node)) return true;

    // Stop at trigger nodes during backward traversal
    if (direction === 'backward') {
      const incoming = graph.backward.get(node) ?? [];
      if (incoming.length === 0) return false; // Don't stop — include trigger but let traverse handle the terminal
    }

    // Stop at trusted-unchanged nodes
    const hash = currentHashes.get(node);
    if (hash && isTrusted(trustState, node, hash) && !changedSet.has(node)) return true;

    return false;
  };

  const forwardResult = traverse(changedNodes, graph, 'forward', makeStopPredicate('forward'));
  const backwardResult = traverse(changedNodes, graph, 'backward', makeStopPredicate('backward'));

  // Merge results, only keeping nodes within the target set
  const result = new Set<NodeIdentity>();
  for (const n of forwardResult.visited) {
    if (targetNodes.has(n)) result.add(n);
  }
  for (const n of backwardResult.visited) {
    if (targetNodes.has(n)) result.add(n);
  }

  // No reduction — return null
  if (result.size >= targetNodes.size) return null;

  const { entryPoints, exitPoints } = classifyBoundaries(result, graph);

  return {
    kind: 'slice',
    slice: {
      nodes: result,
      seedNodes: changedSet,
      entryPoints,
      exitPoints,
    },
  };
}
