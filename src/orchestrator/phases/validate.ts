/**
 * Static analysis phase — dispatches data-loss, schema, and parameter
 * validation across resolved paths.
 */

import type { ExpressionReference, StaticFinding } from '../../static-analysis/types.js';
import type { ResolvedTarget } from '../../types/diagnostic.js';
import type { WorkflowGraph } from '../../types/graph.js';
import type { PathDefinition } from '../../types/slice.js';
import type { OrchestratorDeps } from '../types.js';

/**
 * Run static analysis for validate-tool requests.
 *
 * For single-path slices, runs analysis once over the full slice.
 * For multi-path slices, runs per-path and merges. Returns deduplicated findings.
 */
export function runStaticAnalysis(
  graph: WorkflowGraph,
  paths: PathDefinition[],
  resolvedTarget: ResolvedTarget,
  expressionRefs: ExpressionReference[],
  deps: Pick<
    OrchestratorDeps,
    'detectDataLoss' | 'checkSchemas' | 'validateNodeParams' | 'traceExpressions'
  >,
): StaticFinding[] {
  const findings: StaticFinding[] = [];

  if (paths.length <= 1) {
    const dataLossFindings = deps.detectDataLoss(graph, expressionRefs, resolvedTarget.nodes);
    const schemaFindings = deps.checkSchemas(graph, expressionRefs);
    const paramFindings = deps.validateNodeParams(graph, resolvedTarget.nodes);
    findings.push(...dataLossFindings, ...schemaFindings, ...paramFindings);
  } else {
    for (const path of paths) {
      const pathNodes = path.nodes;
      const refs = deps.traceExpressions(graph, pathNodes);
      const dataLossFindings = deps.detectDataLoss(graph, refs, pathNodes);
      const schemaFindings = deps.checkSchemas(graph, refs);
      const paramFindings = deps.validateNodeParams(graph, pathNodes);
      findings.push(...dataLossFindings, ...schemaFindings, ...paramFindings);
    }
  }

  return findings;
}
