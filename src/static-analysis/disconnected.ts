/**
 * Disconnected node detection — BFS from trigger nodes to identify
 * nodes unreachable from any trigger in the workflow graph.
 *
 * Reports disconnected nodes as DiagnosticHint entries with severity
 * based on whether the node is disabled (info) or enabled (warning).
 */

import type { DiagnosticHint } from '../types/diagnostic.js';
import type { WorkflowGraph } from '../types/graph.js';
import type { NodeIdentity } from '../types/identity.js';

const STICKY_NOTE_TYPE = 'n8n-nodes-base.stickyNote';

/**
 * Detect nodes not reachable from any trigger via forward traversal.
 *
 * Excludes sticky notes (not execution nodes). Reports disabled nodes
 * at info severity and enabled disconnected nodes at warning severity.
 *
 * When no triggers exist (e.g. sub-workflows), returns a single info hint
 * and skips detection — sub-workflow entry point detection is a follow-up.
 */
export function detectDisconnectedNodes(graph: WorkflowGraph): DiagnosticHint[] {
  const triggers: NodeIdentity[] = [];
  for (const [name, node] of graph.nodes) {
    if (node.type.toLowerCase().includes('trigger')) {
      triggers.push(name);
    }
  }

  if (triggers.length === 0) {
    return [
      {
        node: null,
        message: 'No trigger nodes found — disconnected node detection skipped.',
        severity: 'info',
      },
    ];
  }

  const reachable = new Set<NodeIdentity>(triggers);
  const queue = [...triggers];
  while (queue.length > 0) {
    const current = queue.shift() as NodeIdentity;
    for (const edge of graph.forward.get(current) ?? []) {
      if (!reachable.has(edge.to)) {
        reachable.add(edge.to);
        queue.push(edge.to);
      }
    }
  }

  const hints: DiagnosticHint[] = [];
  for (const [name, node] of graph.nodes) {
    if (reachable.has(name)) continue;
    if (node.type === STICKY_NOTE_TYPE) continue;

    hints.push({
      node: name,
      message: node.disabled
        ? `Disabled node '${node.displayName}' is not connected to any trigger.`
        : `Node '${node.displayName}' is not reachable from any trigger — possible incomplete wiring.`,
      severity: node.disabled ? 'info' : 'warning',
    });
  }

  return hints;
}
