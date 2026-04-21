/**
 * Shared graph traversal primitives — stack-based DFS with configurable
 * stopping and boundary classification for slice construction.
 *
 * Used by resolve.ts (target resolution) and narrow.ts (guardrail narrowing)
 * to avoid duplicated graph-walking logic.
 */

import type { WorkflowGraph } from '../types/graph.js';
import type { NodeIdentity } from '../types/identity.js';

/** Result of a directional graph traversal. */
export interface TraversalResult {
  /** All nodes reached during traversal (including seeds and boundary stops). */
  visited: Set<NodeIdentity>;
  /** Nodes where traversal stopped (by predicate or graph terminal). */
  boundaryNodes: NodeIdentity[];
}

/** Result of boundary classification on a node set. */
export interface BoundaryClassification {
  /** Nodes with no incoming edges from within the set (or no incoming edges at all). */
  entryPoints: NodeIdentity[];
  /** Nodes with no outgoing edges, or with at least one outgoing edge to a node outside the set. */
  exitPoints: NodeIdentity[];
}

/**
 * Stack-based DFS traversal from seed nodes through the graph in a given direction.
 *
 * Stops expanding (but includes) nodes where `shouldStop` returns true or
 * where no edges exist in the given direction (graph terminals).
 *
 * @param startNodes — seed nodes to begin traversal from
 * @param graph — the workflow graph to walk
 * @param direction — which edge map to follow ('forward' or 'backward')
 * @param shouldStop — predicate controlling when to stop propagating;
 *   node is added to result but not expanded further when this returns true
 */
export function traverse(
  startNodes: NodeIdentity[],
  graph: WorkflowGraph,
  direction: 'forward' | 'backward',
  shouldStop: (node: NodeIdentity) => boolean,
): TraversalResult {
  const visited = new Set<NodeIdentity>();
  const boundaryNodes: NodeIdentity[] = [];
  const edgeMap = direction === 'forward' ? graph.forward : graph.backward;
  const stack: NodeIdentity[] = [...startNodes];

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    if (visited.has(current)) continue;
    visited.add(current);

    const edges = edgeMap.get(current);
    if (!edges || edges.length === 0) {
      boundaryNodes.push(current);
      continue;
    }

    for (const edge of edges) {
      const neighbor = (direction === 'forward' ? edge.to : edge.from) as NodeIdentity;
      if (visited.has(neighbor)) continue;

      if (shouldStop(neighbor)) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          boundaryNodes.push(neighbor);
        }
        continue;
      }

      stack.push(neighbor);
    }
  }

  return { visited, boundaryNodes };
}

/**
 * Classify entry and exit points for a node set within a graph.
 *
 * - Entry point: node with no incoming edges from within the set, or no incoming edges at all
 * - Exit point: node with no outgoing edges, or with at least one outgoing edge to a node outside the set
 *
 * Single pass over the node set.
 */
export function classifyBoundaries(
  nodes: Set<NodeIdentity>,
  graph: WorkflowGraph,
): BoundaryClassification {
  const entryPoints: NodeIdentity[] = [];
  const exitPoints: NodeIdentity[] = [];

  for (const nodeId of nodes) {
    const incoming = graph.backward.get(nodeId);
    const hasInSlicePredecessor =
      incoming !== undefined &&
      incoming.length > 0 &&
      incoming.some((e) => nodes.has(e.from as NodeIdentity));
    if (!hasInSlicePredecessor) {
      entryPoints.push(nodeId);
    }

    const outgoing = graph.forward.get(nodeId);
    if (!outgoing || outgoing.length === 0) {
      exitPoints.push(nodeId);
    } else if (outgoing.some((e) => !nodes.has(e.to as NodeIdentity))) {
      exitPoints.push(nodeId);
    }
  }

  return { entryPoints, exitPoints };
}
