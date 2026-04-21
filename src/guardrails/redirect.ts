/**
 * Redirect logic — evaluates whether execution-layer validation can be
 * safely redirected to static-only analysis.
 *
 * Checks 6 escalation triggers that require execution evidence:
 *   1. Shape-opaque node changed
 *   2. Shape-replacing node with downstream $json dependence
 *   3. Sub-workflow call node changed
 *   4. LLM validation explicitly requested
 *   5. Branching node with runtime-dependent condition from opaque/shape-replacing source
 *   6. Non-structurally-analyzable change kind (e.g. execution-setting)
 */

import type { NodeIdentity } from '../types/identity.js';
import { assembleEvidence } from './evidence.js';
import type { EvaluationInput } from './types.js';
import { STRUCTURALLY_ANALYZABLE_KINDS } from './types.js';
import type { EscalationAssessment } from './types.js';

const BRANCHING_TYPES = new Set(['n8n-nodes-base.if', 'n8n-nodes-base.switch']);

/**
 * Assess whether any escalation trigger blocks redirect to static-only.
 *
 * Returns an EscalationAssessment indicating whether execution is required
 * and human-readable reasons for each trigger that fired.
 */
export function assessEscalationTriggers(input: EvaluationInput): EscalationAssessment {
  const { graph, changeSet, expressionRefs, llmValidationRequested } = input;
  const evidence = assembleEvidence(input);
  const changedNodeSet = new Set<NodeIdentity>(evidence.changedNodes);
  const reasons: string[] = [];

  // Also consider added nodes as changed for redirect assessment
  for (const added of changeSet.added) {
    if (input.targetNodes.has(added)) {
      changedNodeSet.add(added);
    }
  }

  for (const nodeId of changedNodeSet) {
    const graphNode = graph.nodes.get(nodeId);
    if (!graphNode) {
      throw new Error(
        `Changed node '${nodeId}' not found in workflow graph — upstream data inconsistency.`,
      );
    }

    // Trigger 1: shape-opaque
    if (graphNode.classification === 'shape-opaque') {
      reasons.push(`Node '${nodeId}' is shape-opaque — output cannot be statically determined.`);
    }

    // Trigger 2: shape-replacing with downstream $json dependence
    if (graphNode.classification === 'shape-replacing') {
      const hasDownstreamJsonRef = hasDownstreamJsonDependence(nodeId, graph, expressionRefs);
      if (hasDownstreamJsonRef) {
        reasons.push(
          `Node '${nodeId}' is shape-replacing with downstream $json dependence — execution needed to verify output shape.`,
        );
      }
    }

    // Trigger 3: sub-workflow call
    if (graphNode.type === 'n8n-nodes-base.executeWorkflow') {
      reasons.push(
        `Node '${nodeId}' is a sub-workflow call — cannot statically analyze external workflow.`,
      );
    }
  }

  // Trigger 4: LLM validation explicitly requested
  if (llmValidationRequested) {
    reasons.push('LLM/agent output validation was explicitly requested — requires execution.');
  }

  // Trigger 5: branching node with runtime-dependent condition from opaque/replacing source
  for (const nodeId of changedNodeSet) {
    const graphNode = graph.nodes.get(nodeId);
    if (!graphNode) {
      throw new Error(
        `Changed node '${nodeId}' not found in workflow graph — upstream data inconsistency.`,
      );
    }
    if (!BRANCHING_TYPES.has(graphNode.type)) continue;

    const branchRefs = expressionRefs.filter((ref) => ref.node === nodeId);
    for (const ref of branchRefs) {
      if (ref.referencedNode) {
        const sourceNode = graph.nodes.get(ref.referencedNode);
        if (
          sourceNode &&
          (sourceNode.classification === 'shape-opaque' ||
            sourceNode.classification === 'shape-replacing')
        ) {
          reasons.push(
            `Branching node '${nodeId}' has a condition referencing '${ref.referencedNode}' (${sourceNode.classification}) — runtime-dependent.`,
          );
          break;
        }
      } else if (!ref.resolved) {
        // Unresolvable reference on a branching node — walk backward to check source
        const upstreamClassifications = getUpstreamClassifications(nodeId, graph);
        if (
          upstreamClassifications.has('shape-opaque') ||
          upstreamClassifications.has('shape-replacing')
        ) {
          reasons.push(
            `Branching node '${nodeId}' has an unresolvable expression with opaque/shape-replacing upstream — runtime-dependent.`,
          );
          break;
        }
      }
    }
  }

  // Trigger 6: non-structurally-analyzable change kind
  for (const mod of changeSet.modified) {
    if (!input.targetNodes.has(mod.node)) continue;
    for (const kind of mod.changes) {
      if (!(STRUCTURALLY_ANALYZABLE_KINDS as ReadonlySet<string>).has(kind)) {
        reasons.push(
          `Node '${mod.node}' has change kind '${kind}' which is not structurally analyzable.`,
        );
        break;
      }
    }
  }

  // Trigger 7: changed node feeds into a shape-opaque downstream consumer
  for (const nodeId of changedNodeSet) {
    const downstream = collectDownstream(nodeId, graph);
    for (const downId of downstream) {
      const downNode = graph.nodes.get(downId);
      if (downNode && downNode.classification === 'shape-opaque') {
        reasons.push(
          `Changed node '${nodeId}' feeds into shape-opaque node '${downId}' — runtime validation needed to verify integration.`,
        );
        break;
      }
    }
  }

  return {
    triggered: reasons.length > 0,
    reasons,
  };
}

/**
 * BFS forward from a node, returning all downstream node IDs.
 */
function collectDownstream(
  nodeId: NodeIdentity,
  graph: Parameters<typeof assessEscalationTriggers>[0]['graph'],
): Set<NodeIdentity> {
  const downstream = new Set<NodeIdentity>();
  const queue: NodeIdentity[] = [];
  const edges = graph.forward.get(nodeId) ?? [];
  for (const edge of edges) {
    const target = edge.to as NodeIdentity;
    if (!downstream.has(target)) {
      downstream.add(target);
      queue.push(target);
    }
  }
  while (queue.length > 0) {
    const current = queue.shift() as NodeIdentity;
    const next = graph.forward.get(current) ?? [];
    for (const edge of next) {
      const target = edge.to as NodeIdentity;
      if (!downstream.has(target)) {
        downstream.add(target);
        queue.push(target);
      }
    }
  }
  return downstream;
}

/**
 * Check if any downstream node of the given node has a $json expression
 * reference that flows through it (referencedNode is null = implicit $json
 * from previous node).
 */
function hasDownstreamJsonDependence(
  nodeId: NodeIdentity,
  graph: Parameters<typeof assessEscalationTriggers>[0]['graph'],
  expressionRefs: Parameters<typeof assessEscalationTriggers>[0]['expressionRefs'],
): boolean {
  const downstream = collectDownstream(nodeId, graph);

  // Check if any downstream node references $json without a specific referencedNode
  for (const ref of expressionRefs) {
    if (downstream.has(ref.node) && ref.referencedNode === null && ref.raw.includes('$json')) {
      return true;
    }
  }
  return false;
}

/**
 * Get the set of classifications from immediate upstream nodes via backward edges.
 */
function getUpstreamClassifications(
  nodeId: NodeIdentity,
  graph: Parameters<typeof assessEscalationTriggers>[0]['graph'],
): Set<string> {
  const classifications = new Set<string>();
  const upstream = graph.backward.get(nodeId) ?? [];
  for (const edge of upstream) {
    const node = graph.nodes.get(edge.from);
    if (node) classifications.add(node.classification);
  }
  return classifications;
}
