/**
 * Opportunistic trust harvesting — after execution, record trust for
 * out-of-scope nodes that ran successfully.
 *
 * Identifies nodes eligible for harvesting by excluding:
 * - Nodes already in the resolved target (handled by primary trust recording)
 * - Nodes that were pinned (their "success" is synthetic)
 * - Nodes that did not run or had any error
 */

import type { ExecutionData } from '../execution/types.js';
import type { WorkflowGraph } from '../types/graph.js';
import type { NodeIdentity } from '../types/identity.js';

/**
 * Identify nodes eligible for opportunistic trust harvesting.
 *
 * Filters execution results to find out-of-scope nodes that:
 * 1. Are not in the resolved target (already handled)
 * 2. Were not pinned (synthetic success)
 * 3. Have status 'success' for all runs
 * 4. Exist in the current graph
 */
export function findHarvestableNodes(
  executionData: ExecutionData,
  pinnedNodeNames: ReadonlySet<string>,
  targetNodes: ReadonlySet<NodeIdentity>,
  graph: WorkflowGraph,
): NodeIdentity[] {
  const harvestable: NodeIdentity[] = [];

  for (const [nodeId, results] of executionData.nodeResults) {
    // Skip nodes in resolved target — already handled by primary trust recording
    if (targetNodes.has(nodeId)) continue;

    // Skip pinned nodes — their success is synthetic
    if (pinnedNodeNames.has(nodeId as string)) continue;

    // Skip nodes not in graph (shouldn't happen, but defensive)
    if (!graph.nodes.has(nodeId)) continue;

    // All runs must have status 'success'
    const allSuccess = results.length > 0 && results.every((r) => r.status === 'success');
    if (!allSuccess) continue;

    harvestable.push(nodeId);
  }

  return harvestable;
}
