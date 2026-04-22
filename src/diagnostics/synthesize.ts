/**
 * Top-level diagnostic synthesis — the single public entry point for the
 * diagnostics subsystem.
 *
 * Assembles status, errors, annotations, hints, and path into a canonical
 * DiagnosticSummary.
 */

import { z } from 'zod';
import type { DiagnosticSummary } from '../types/diagnostic.js';
import type { NodeClassification } from '../types/graph.js';
import type { NodeIdentity } from '../types/identity.js';
import type { ValidationEvidence } from '../types/target.js';
import { assignAnnotations } from './annotations.js';
import { classifyExecutionErrors, classifyStaticFindings, orderErrors } from './errors.js';
import { collectHints } from './hints.js';
import { deriveNextAction } from './next-action.js';
import { reconstructPath } from './path.js';
import { determineStatus } from './status.js';
import type { SynthesisInput } from './types.js';

/** Typed error for synthesis-level validation failures. */
export class SynthesisError extends Error {
  override readonly name = 'SynthesisError' as const;
}

/**
 * Synthesize a DiagnosticSummary from all evidence layers.
 *
 * This is the only public export from the diagnostics subsystem.
 */
export function synthesize(input: SynthesisInput): DiagnosticSummary {
  validateInput(input);

  const {
    staticFindings,
    executionData,
    trustState,
    guardrailDecisions,
    resolvedTarget,
    capabilities,
    meta,
    nodeClassifications,
  } = input;

  const status = determineStatus(staticFindings, executionData, guardrailDecisions);

  const staticErrors = classifyStaticFindings(staticFindings);
  const executionErrors = executionData !== null ? classifyExecutionErrors(executionData) : [];
  const errors = orderErrors([...staticErrors, ...executionErrors]);

  const nodeAnnotations = assignAnnotations(
    resolvedTarget,
    trustState,
    executionData,
    staticFindings,
  );

  const hints = collectHints(staticFindings, executionData);

  const executedPath = reconstructPath(executionData);

  const evidenceBasis = determineEvidenceBasis(executionData);

  const coverage = computeCoverage(resolvedTarget.nodes, nodeClassifications);

  const summary: DiagnosticSummary = {
    schemaVersion: 2,
    status,
    target: resolvedTarget,
    evidenceBasis,
    executedPath,
    errors,
    nodeAnnotations,
    guardrailActions: guardrailDecisions,
    hints,
    coverage,
    nextAction: { type: 'none', targetNodes: null, blocking: false, reason: '' },
    capabilities,
    meta,
  };

  summary.nextAction = deriveNextAction(summary);

  return summary;
}

const SynthesisInputSchema = z.object({
  staticFindings: z.array(
    z.object({
      node: z.string().min(1),
      kind: z.string(),
      severity: z.enum(['error', 'warning']),
      message: z.string(),
      context: z.record(z.unknown()),
    }),
  ),
  executionData: z.union([
    z.object({
      status: z.enum(['success', 'error', 'cancelled']),
      lastNodeExecuted: z.string().nullable(),
      error: z.unknown().nullable(),
      nodeResults: z.instanceof(Map),
    }),
    z.null(),
  ]),
  trustState: z.object({
    nodes: z.instanceof(Map),
  }),
  guardrailDecisions: z.array(
    z
      .object({
        action: z.string(),
        explanation: z.string(),
      })
      .passthrough(),
  ),
  resolvedTarget: z.object({
    description: z.string(),
    nodes: z
      .array(z.string().min(1))
      .min(
        1,
        'resolvedTarget.nodes must not be empty — a validation run with no nodes in scope is a caller bug.',
      ),
    automatic: z.boolean(),
  }),
  capabilities: z.object({
    staticAnalysis: z.literal(true),
    mcpTools: z.boolean(),
  }),
  meta: z.object({
    runId: z.string().min(1),
    executionId: z.string().nullable(),
    timestamp: z.string().min(1),
    durationMs: z.number().nonnegative(),
  }),
  nodeClassifications: z.instanceof(Map),
});

function validateInput(input: SynthesisInput): void {
  const result = SynthesisInputSchema.safeParse(input);
  if (!result.success) {
    throw new SynthesisError(result.error.issues[0].message);
  }
}

function determineEvidenceBasis(
  executionData: SynthesisInput['executionData'],
): ValidationEvidence {
  const executionRan = executionData !== null;
  if (executionRan) return 'execution';
  return 'static';
}

function computeCoverage(
  nodes: readonly NodeIdentity[],
  classifications: Map<string, NodeClassification>,
): import('../types/diagnostic.js').AnalysisCoverage {
  const counts = {
    'shape-preserving': 0,
    'shape-augmenting': 0,
    'shape-replacing': 0,
    'shape-opaque': 0,
  };

  for (const node of nodes) {
    const classification = classifications.get(node) ?? 'shape-opaque';
    counts[classification]++;
  }

  const totalInScope = nodes.length;
  const analyzable = totalInScope - counts['shape-opaque'];
  const analyzableRatio = totalInScope > 0 ? analyzable / totalInScope : 1;

  return { analyzableRatio, counts, totalInScope };
}
