/**
 * Synthesis phase — deduplicates static findings, builds metadata,
 * calls the diagnostics synthesizer, and appends execution errors.
 */

import type { ExecutionData } from '../../diagnostics/types.js';
import type { StaticFinding } from '../../static-analysis/types.js';
import type {
  AvailableCapabilities,
  DiagnosticSummary,
  ResolvedTarget,
  ValidationMeta,
} from '../../types/diagnostic.js';
import type { GuardrailDecision } from '../../types/guardrail.js';
import type { TrustState } from '../../types/trust.js';
import type { OrchestratorDeps } from '../types.js';
import type { ExecutionError } from './execute.js';

/**
 * Deduplicate findings, synthesize diagnostics, and append execution errors.
 */
export function buildSynthesis(
  staticFindings: StaticFinding[],
  executionData: ExecutionData | null,
  executionErrors: ExecutionError[],
  activeTrust: TrustState,
  guardrailDecisions: GuardrailDecision[],
  resolvedTarget: ResolvedTarget,
  capabilities: AvailableCapabilities,
  meta: ValidationMeta,
  deps: Pick<OrchestratorDeps, 'synthesize'>,
): DiagnosticSummary {
  // Deduplicate static findings by (node, kind, message)
  const seen = new Set<string>();
  const deduplicatedFindings = staticFindings.filter((f) => {
    const key = `${f.node}|${f.kind}|${f.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const summary = deps.synthesize({
    staticFindings: deduplicatedFindings,
    executionData,
    trustState: activeTrust,
    guardrailDecisions,
    resolvedTarget,
    capabilities,
    meta,
  });

  // Append execution errors (e.g., missing metadata.id) to the summary
  if (executionErrors.length > 0) {
    summary.errors.push(...executionErrors);
    if (summary.status === 'pass') {
      summary.status = 'error';
    }
  }

  return summary;
}
