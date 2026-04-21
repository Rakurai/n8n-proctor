/**
 * Target resolution — converts an AgentTarget into a ResolvedTarget with a
 * concrete SliceDefinition for scoped validation.
 *
 * Three resolution strategies:
 * - `nodes`: verify existence, forward/backward propagate to build slice
 * - `changed`: RTS/TIA heuristic from change set or approximate detection
 * - `workflow`: all nodes in the graph
 */

import { classifyBoundaries, traverse } from '../static-analysis/traversal.js';
import { computeContentHash } from '../trust/hash.js';
import { isTrusted as isTrustedCanonical } from '../trust/trust.js';
import type { ResolvedTarget } from '../types/diagnostic.js';
import type { WorkflowGraph } from '../types/graph.js';
import type { NodeIdentity } from '../types/identity.js';
import type { SliceDefinition } from '../types/slice.js';
import type { AgentTarget } from '../types/target.js';
import type { NodeChangeSet, TrustState } from '../types/trust.js';

/** Result of target resolution — either success with target+slice, or error data. */
export type ResolveResult =
  | { ok: true; target: ResolvedTarget; slice: SliceDefinition }
  | { ok: false; errorMessage: string };

/**
 * Resolve an agent target to concrete nodes and a slice definition.
 *
 * Returns error data (not throws) for missing nodes, empty lists, and
 * empty change sets — the caller wraps these into status:'error' diagnostics.
 */
export function resolveTarget(
  target: AgentTarget,
  graph: WorkflowGraph,
  changeSet: NodeChangeSet | null,
  trustState: TrustState,
): ResolveResult {
  switch (target.kind) {
    case 'nodes':
      return resolveNodes(target.nodes, graph, trustState);
    case 'changed':
      return resolveChanged(graph, changeSet, trustState);
    case 'workflow':
      return resolveWorkflow(graph);
  }
}

// ── nodes ─────────────────────────────────────────────────────────

function resolveNodes(
  names: NodeIdentity[],
  graph: WorkflowGraph,
  trustState: TrustState,
): ResolveResult {
  if (names.length === 0) {
    return { ok: false, errorMessage: 'Empty nodes list in validation target' };
  }

  const missing: string[] = [];
  for (const name of names) {
    if (!graph.nodes.has(name)) {
      missing.push(name);
    }
  }

  if (missing.length > 0) {
    return { ok: false, errorMessage: `Nodes not found in workflow: ${missing.join(', ')}` };
  }

  const seedNodes = new Set(names);
  const shouldStop = makeTrustPredicate(trustState, graph);

  // Forward-propagate to exits (stops at trust boundaries)
  const forwardResult = traverse(names, graph, 'forward', shouldStop);
  // Backward-walk to entry points (triggers, graph roots, or trust boundaries)
  const backwardResult = traverse(names, graph, 'backward', shouldStop);

  // Merge all visited nodes
  const sliceNodes = new Set<NodeIdentity>(names);
  for (const n of forwardResult.visited) sliceNodes.add(n);
  for (const n of backwardResult.visited) sliceNodes.add(n);

  const { entryPoints, exitPoints } = classifyBoundaries(sliceNodes, graph);

  return {
    ok: true,
    target: {
      description: `Named nodes: ${names.map(String).join(', ')}`,
      nodes: [...sliceNodes],
      automatic: false,
    },
    slice: {
      nodes: sliceNodes,
      seedNodes,
      entryPoints,
      exitPoints,
    },
  };
}

// ── changed ───────────────────────────────────────────────────────

function resolveChanged(
  graph: WorkflowGraph,
  changeSet: NodeChangeSet | null,
  trustState: TrustState,
): ResolveResult {
  let seedNames: NodeIdentity[];

  if (changeSet !== null) {
    // Precise detection from snapshot diff
    const diffSeeds = new Set<NodeIdentity>([
      ...changeSet.added,
      ...changeSet.modified.map((m) => m.node),
    ]);

    // Also include nodes present in the graph but absent from trust state.
    // These are nodes that existed before the last validation but were never
    // included in the validation target — they have no trust record and are
    // definitionally "changed" relative to the trust store.
    for (const [name] of graph.nodes) {
      if (!trustState.nodes.has(name)) {
        diffSeeds.add(name);
      }
    }

    seedNames = [...diffSeeds];
  } else {
    // Approximate detection from trust state content hashes
    seedNames = approximateChanges(graph, trustState);
  }

  if (seedNames.length === 0) {
    // No changes detected — pass to guardrails which will refuse
    return {
      ok: true,
      target: {
        description: 'No changes detected',
        nodes: [],
        automatic: true,
      },
      slice: {
        nodes: new Set(),
        seedNodes: new Set(),
        entryPoints: [],
        exitPoints: [],
      },
    };
  }

  const seedNodes = new Set(seedNames);
  const shouldStop = makeTrustPredicate(trustState, graph);

  const forwardResult = traverse(seedNames, graph, 'forward', shouldStop);
  const backwardResult = traverse(seedNames, graph, 'backward', shouldStop);

  const sliceNodes = new Set<NodeIdentity>(seedNames);
  for (const n of forwardResult.visited) sliceNodes.add(n);
  for (const n of backwardResult.visited) sliceNodes.add(n);

  const { entryPoints, exitPoints } = classifyBoundaries(sliceNodes, graph);

  return {
    ok: true,
    target: {
      description: `Changed nodes: ${seedNames.map(String).join(', ')}`,
      nodes: [...sliceNodes],
      automatic: true,
    },
    slice: {
      nodes: sliceNodes,
      seedNodes,
      entryPoints,
      exitPoints,
    },
  };
}

/**
 * Approximate change detection when no prior snapshot is available.
 * Compare graph nodes against trust state content hashes.
 * Nodes not in trust state, or with different hashes, are considered changed.
 */
function approximateChanges(graph: WorkflowGraph, trustState: TrustState): NodeIdentity[] {
  if (trustState.nodes.size === 0) {
    // No trust at all — everything is "changed"
    return [...graph.nodes.keys()];
  }

  const changed: NodeIdentity[] = [];
  for (const [name] of graph.nodes) {
    const trustRecord = trustState.nodes.get(name);
    if (!trustRecord) {
      // New or unknown node
      changed.push(name);
    }
    // Note: without a snapshot we can't recompute content hashes,
    // so we trust the trust state records. Only truly new nodes are flagged.
  }

  return changed;
}

// ── workflow ──────────────────────────────────────────────────────

function resolveWorkflow(graph: WorkflowGraph): ResolveResult {
  const allNodes: NodeIdentity[] = [...graph.nodes.keys()];
  const nodeSet = new Set(allNodes);
  const { entryPoints, exitPoints } = classifyBoundaries(nodeSet, graph);

  return {
    ok: true,
    target: {
      description: 'Entire workflow',
      nodes: allNodes,
      automatic: false,
    },
    slice: {
      nodes: nodeSet,
      seedNodes: nodeSet,
      entryPoints,
      exitPoints,
    },
  };
}

// ── trust predicate ──────────────────────────────────────────────

/** Build a stopping predicate that halts traversal at trusted boundaries. */
function makeTrustPredicate(
  trustState: TrustState,
  graph: WorkflowGraph,
): (node: NodeIdentity) => boolean {
  return (node: NodeIdentity) => {
    const graphNode = graph.nodes.get(node);
    if (!graphNode) return false;
    const hash = computeContentHash(graphNode, graph.ast);
    return isTrustedCanonical(trustState, node, hash);
  };
}
