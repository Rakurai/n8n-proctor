/**
 * DeFlaker-style rerun check — extracts prior run context from a cached
 * DiagnosticSummary and evaluates whether a rerun is likely to be
 * unrelated to current changes.
 *
 * Warns when a prior failure path does not intersect the current changes,
 * suggesting the rerun is likely a flake or unrelated issue.
 */

import type { DiagnosticSummary, ErrorClassification } from '../types/diagnostic.js';
import type { NodeIdentity } from '../types/identity.js';
import type { PriorRunContext } from './types.js';

/**
 * Extract prior run context from a cached DiagnosticSummary.
 *
 * Returns null when no summary is available.
 */
export function extractPriorRunContext(summary: DiagnosticSummary | null): PriorRunContext | null {
  if (summary === null) return null;

  const failed = summary.status === 'fail';
  const failingPath: NodeIdentity[] | null = summary.executedPath
    ? summary.executedPath.map((p) => p.name)
    : null;
  const failureClassification: ErrorClassification | null =
    summary.errors.length > 0 ? summary.errors[0].classification : null;

  return { failed, failingPath, failureClassification };
}

/**
 * Check whether a DeFlaker warn should be issued.
 *
 * Returns true (should warn) when:
 *   - The prior run failed
 *   - The failing path is reconstructable (non-null)
 *   - No intersection between the failing path and current changed nodes
 *   - The failure classification is not 'external-service' or 'platform'
 *     (those indicate infrastructure issues, not code-related flakes)
 */
export function checkDeFlaker(context: PriorRunContext, changedNodes: Set<NodeIdentity>): boolean {
  if (!context.failed) return false;
  if (context.failingPath === null) return false;
  if (context.failureClassification === 'external-service') return false;
  if (context.failureClassification === 'platform') return false;

  // Check for intersection between failing path and changed nodes
  const hasIntersection = context.failingPath.some((node) => changedNodes.has(node));
  return !hasIntersection;
}
