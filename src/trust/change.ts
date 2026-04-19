/**
 * Change detection — computes a NodeChangeSet between two WorkflowGraph
 * snapshots, classifying every node as added, removed, modified (with
 * sub-classified change kinds), or unchanged.
 */

import type { GraphNode, WorkflowGraph } from '../types/graph.js';
import type { NodeIdentity } from '../types/identity.js';
import type { ChangeKind, NodeChangeSet, NodeModification } from '../types/trust.js';
import { computeConnectionsHash, computeContentHash, computeWorkflowHash } from './hash.js';

/**
 * Compute the diff between two workflow snapshots.
 *
 * Performs a workflow-level quick check first; short-circuits with an empty
 * change set when hashes match. Otherwise does node-level diffing with
 * sub-classification and rename detection.
 */
export function computeChangeSet(previous: WorkflowGraph, current: WorkflowGraph): NodeChangeSet {
  // Workflow-level quick check (research R6)
  if (computeWorkflowHash(previous) === computeWorkflowHash(current)) {
    const unchanged = [...current.nodes.keys()] as NodeIdentity[];
    return { added: [], removed: [], modified: [], unchanged };
  }

  const prevNames = new Set(previous.nodes.keys());
  const currNames = new Set(current.nodes.keys());

  const added: NodeIdentity[] = [];
  const removed: NodeIdentity[] = [];
  const modified: NodeModification[] = [];
  const unchanged: NodeIdentity[] = [];

  // Identify added and removed
  for (const name of currNames) {
    if (!prevNames.has(name)) added.push(name as NodeIdentity);
  }
  for (const name of prevNames) {
    if (!currNames.has(name)) removed.push(name as NodeIdentity);
  }

  // Classify common nodes
  const prevConnectionsHash = computeConnectionsHash(previous);
  const currConnectionsHash = computeConnectionsHash(current);

  for (const name of currNames) {
    if (!prevNames.has(name)) continue; // already in added

    const prevNode = previous.nodes.get(name);
    const currNode = current.nodes.get(name);
    if (!prevNode || !currNode) continue;
    const prevHash = computeContentHash(prevNode, previous.ast);
    const currHash = computeContentHash(currNode, current.ast);

    if (prevHash === currHash) {
      // Content is the same — check for connection and position changes
      const changes: ChangeKind[] = [];

      if (
        prevConnectionsHash !== currConnectionsHash &&
        nodeEdgesChanged(previous, current, name)
      ) {
        changes.push('connection');
      }

      if (nodePositionChanged(previous, current, name)) {
        changes.push('position-only');
      }

      if (changes.length > 0) {
        modified.push({ node: name as NodeIdentity, changes });
      } else {
        unchanged.push(name as NodeIdentity);
      }
    } else {
      // Content changed — sub-classify
      const changes = classifyChanges(prevNode, currNode, previous, current);
      modified.push({ node: name as NodeIdentity, changes });
    }
  }

  // Rename detection: removed+added pairs with matching type/typeVersion/parameters
  applyRenameDetection(removed, added, previous, current, modified);

  return { added, removed, modified, unchanged };
}

/** Check if a specific node's position changed between AST snapshots. */
function nodePositionChanged(
  previous: WorkflowGraph,
  current: WorkflowGraph,
  nodeName: string,
): boolean {
  const prevAst = previous.ast.nodes.find((n) => n.propertyName === nodeName);
  const currAst = current.ast.nodes.find((n) => n.propertyName === nodeName);

  if (!prevAst || !currAst) return false;

  const prevPos = prevAst.position ?? [0, 0];
  const currPos = currAst.position ?? [0, 0];
  return prevPos[0] !== currPos[0] || prevPos[1] !== currPos[1];
}

/** Check if a specific node's edges changed between snapshots. */
function nodeEdgesChanged(
  previous: WorkflowGraph,
  current: WorkflowGraph,
  nodeName: string,
): boolean {
  const prevEdges = previous.forward.get(nodeName) ?? [];
  const currEdges = current.forward.get(nodeName) ?? [];

  if (prevEdges.length !== currEdges.length) return true;

  const sortEdges = (edges: typeof prevEdges) =>
    [...edges].sort((a, b) => a.fromOutput - b.fromOutput || a.to.localeCompare(b.to));

  const prevSorted = sortEdges(prevEdges);
  const currSorted = sortEdges(currEdges);

  for (let i = 0; i < prevSorted.length; i++) {
    const p = prevSorted[i];
    const c = currSorted[i];
    if (
      p.to !== c.to ||
      p.fromOutput !== c.fromOutput ||
      p.toInput !== c.toInput ||
      p.isError !== c.isError
    ) {
      return true;
    }
  }

  return false;
}

/** Sub-classify what changed between two versions of the same node. */
function classifyChanges(
  prevNode: GraphNode,
  currNode: GraphNode,
  prevGraph: WorkflowGraph,
  currGraph: WorkflowGraph,
): ChangeKind[] {
  const changes: ChangeKind[] = [];

  // Type/version change
  if (prevNode.type !== currNode.type || prevNode.typeVersion !== currNode.typeVersion) {
    changes.push('type-version');
  }

  // Credential change
  if (JSON.stringify(prevNode.credentials) !== JSON.stringify(currNode.credentials)) {
    changes.push('credential');
  }

  // Execution setting change (from AST)
  if (executionSettingsChanged(prevNode.name, prevGraph, currGraph)) {
    changes.push('execution-setting');
  }

  // Parameter change + expression change detection
  if (JSON.stringify(prevNode.parameters) !== JSON.stringify(currNode.parameters)) {
    changes.push('parameter');

    // Check for expression changes (research R4)
    const prevExpressions = collectExpressions(prevNode.parameters);
    const currExpressions = collectExpressions(currNode.parameters);
    if (!expressionSetsEqual(prevExpressions, currExpressions)) {
      changes.push('expression');
    }
  }

  // If disabled state changed, it's an execution-setting if not already added
  if (prevNode.disabled !== currNode.disabled && !changes.includes('execution-setting')) {
    changes.push('execution-setting');
  }

  // If nothing else changed, something did change (hash mismatch led here)
  // — fall through to parameter if changes is still empty
  if (changes.length === 0) {
    changes.push('parameter');
  }

  return changes;
}

/** Check if execution settings changed between AST snapshots. */
function executionSettingsChanged(
  nodeName: string,
  prevGraph: WorkflowGraph,
  currGraph: WorkflowGraph,
): boolean {
  const prevAst = prevGraph.ast.nodes.find((n) => n.propertyName === nodeName);
  const currAst = currGraph.ast.nodes.find((n) => n.propertyName === nodeName);

  const prevSettings = {
    retryOnFail: prevAst?.retryOnFail ?? false,
    executeOnce: prevAst?.executeOnce ?? false,
    onError: prevAst?.onError ?? null,
  };
  const currSettings = {
    retryOnFail: currAst?.retryOnFail ?? false,
    executeOnce: currAst?.executeOnce ?? false,
    onError: currAst?.onError ?? null,
  };

  return JSON.stringify(prevSettings) !== JSON.stringify(currSettings);
}

/** Recursively collect all expression strings (={{ ... }}) from a parameter tree. */
function collectExpressions(params: Record<string, unknown>): Set<string> {
  const expressions = new Set<string>();

  function walk(value: unknown, path: string): void {
    if (typeof value === 'string' && value.startsWith('=')) {
      expressions.add(`${path}::${value}`);
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        walk(value[i], `${path}[${i}]`);
      }
    } else if (value !== null && typeof value === 'object') {
      for (const [key, val] of Object.entries(value)) {
        walk(val, `${path}.${key}`);
      }
    }
  }

  walk(params, '');
  return expressions;
}

/** Compare two sets of expression path::value pairs. */
function expressionSetsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

/**
 * Apply rename detection: removed+added pairs with identical type, typeVersion,
 * and parameters are treated as renames. The removed entry is dropped, the added
 * entry becomes a modified entry with metadata-only change.
 */
function applyRenameDetection(
  removed: NodeIdentity[],
  added: NodeIdentity[],
  previous: WorkflowGraph,
  current: WorkflowGraph,
  modified: NodeModification[],
): void {
  const matchedRemoved = new Set<number>();
  const matchedAdded = new Set<number>();

  for (let ri = 0; ri < removed.length; ri++) {
    if (matchedRemoved.has(ri)) continue;
    const removedNode = previous.nodes.get(removed[ri]);
    if (!removedNode) continue;
    const removedHash = computeContentHash(removedNode, previous.ast);

    for (let ai = 0; ai < added.length; ai++) {
      if (matchedAdded.has(ai)) continue;
      const addedNode = current.nodes.get(added[ai]);
      if (!addedNode) continue;
      const addedHash = computeContentHash(addedNode, current.ast);

      if (removedHash === addedHash) {
        matchedRemoved.add(ri);
        matchedAdded.add(ai);
        // Treat as rename — record as modified with metadata-only
        modified.push({
          node: added[ai],
          changes: ['metadata-only'],
        });
        break;
      }
    }
  }

  // Remove matched entries from added and removed (in reverse order to preserve indices)
  for (const idx of [...matchedRemoved].sort((a, b) => b - a)) {
    removed.splice(idx, 1);
  }
  for (const idx of [...matchedAdded].sort((a, b) => b - a)) {
    added.splice(idx, 1);
  }
}
