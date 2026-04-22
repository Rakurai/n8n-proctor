/**
 * Persistence phase — trust recording, snapshot saving, and pin-data caching.
 * Side-effect-only: writes to trust state, snapshots, and pin-data cache.
 */

import { writeCachedPinData } from '../../execution/pin-data.js';
import type { ExecutionData, PinData } from '../../execution/types.js';
import { findHarvestableNodes } from '../../trust/harvest.js';
import { computeNodeHashes, computeWorkflowHash } from '../../trust/hash.js';
import type { DiagnosticSummary, ResolvedTarget } from '../../types/diagnostic.js';
import type { WorkflowGraph } from '../../types/graph.js';
import type { NodeIdentity } from '../../types/identity.js';
import type { PathDefinition } from '../../types/slice.js';
import type { TrustState } from '../../types/trust.js';
import type { OrchestratorDeps } from '../types.js';

/** Context for the persistence phase. */
export interface PersistContext {
  summary: DiagnosticSummary;
  activeTrust: TrustState;
  graph: WorkflowGraph;
  workflowId: string;
  tool: 'validate' | 'test';
  runId: string;
  fixtureHash: string | null;
  paths: PathDefinition[];
  resolvedTarget: ResolvedTarget;
  usedPinData: PinData | null;
  executionData: ExecutionData | null;
}

/**
 * Persist validation results: update trust state, save snapshot, cache pin data.
 *
 * Only runs when the summary status is 'pass'.
 */
export async function persistResults(
  ctx: PersistContext,
  deps: Pick<OrchestratorDeps, 'trust' | 'snapshots'>,
): Promise<void> {
  const {
    summary,
    activeTrust,
    graph,
    workflowId,
    tool,
    runId,
    fixtureHash,
    paths,
    resolvedTarget,
    usedPinData,
    executionData,
  } = ctx;
  if (summary.status !== 'pass') return;

  // Record trust for nodes that were actually validated
  const validatedNodes = collectValidatedNodes(paths, resolvedTarget.nodes);
  let updatedTrust = deps.trust.recordValidation(
    activeTrust,
    validatedNodes,
    graph,
    tool === 'test' ? 'execution' : 'static',
    runId,
    fixtureHash,
  );

  // Opportunistic trust harvesting: record trust for out-of-scope nodes
  // that ran successfully during execution (never downgrade existing trust)
  if (executionData !== null && tool === 'test') {
    const pinnedNames = new Set<string>(usedPinData ? Object.keys(usedPinData) : []);
    const targetSet = new Set<NodeIdentity>(resolvedTarget.nodes);
    const harvestable = findHarvestableNodes(executionData, pinnedNames, targetSet, graph);

    if (harvestable.length > 0) {
      // Filter out nodes that already have equal-or-stronger trust
      const eligible = harvestable.filter((nodeId) => {
        const existing = updatedTrust.nodes.get(nodeId);
        if (!existing) return true;
        // execution > execution-opportunistic > static — never downgrade
        return existing.validatedWith === 'static';
      });

      if (eligible.length > 0) {
        updatedTrust = deps.trust.recordValidation(
          updatedTrust,
          eligible,
          graph,
          'execution-opportunistic',
          runId,
          fixtureHash,
        );
      }
    }
  }

  deps.trust.persistTrustState(updatedTrust, computeWorkflowHash(graph));

  // Save snapshot
  deps.snapshots.saveSnapshot(workflowId, graph);

  // Cache used pin data for future tier 2 sourcing
  if (usedPinData) {
    const hashes = computeNodeHashes(graph, [...Object.keys(usedPinData)] as NodeIdentity[]);
    for (const [nodeId, hash] of hashes) {
      const items = usedPinData[nodeId as string];
      if (items) {
        await writeCachedPinData(workflowId, hash, items);
      }
    }
  }
}

/** Collect nodes that were actually covered by selected paths. */
function collectValidatedNodes(
  paths: PathDefinition[],
  targetNodes: NodeIdentity[],
): NodeIdentity[] {
  if (paths.length === 0) return targetNodes;
  const covered = new Set<string>();
  for (const path of paths) {
    for (const node of path.nodes) {
      covered.add(node as string);
    }
  }
  return targetNodes.filter((n) => covered.has(n as string));
}
