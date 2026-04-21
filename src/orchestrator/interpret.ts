/**
 * The 10-step orchestration pipeline — receives a ValidationRequest and
 * coordinates all five internal subsystems to produce a DiagnosticSummary.
 *
 * Steps 1-5 (parse, trust, change set, resolve, guardrails) are coordination
 * logic. Steps 6-9 are delegated to phase helpers in ./phases/.
 *
 * Throws ExecutionPreconditionError for precondition failures (e.g. missing
 * metadata.id) — callers must map these to error envelopes at the boundary.
 */

import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import stringify from 'json-stable-stringify';
import { ExecutionPreconditionError } from '../execution/errors.js';
import { buildExecutionInternalDeps, prepareExecution } from '../execution/prepare.js';
import type { ExecutionPreparationResult, PinData } from '../execution/types.js';
import type { EvaluationInput } from '../guardrails/types.js';
import { computeNodeHashes } from '../trust/hash.js';
import type { DiagnosticSummary, ValidationMeta } from '../types/diagnostic.js';
import type { WorkflowGraph } from '../types/graph.js';
import type { GuardrailDecision } from '../types/guardrail.js';
import type { NodeIdentity } from '../types/identity.js';
import type { NodeChangeSet } from '../types/trust.js';
import { selectPaths } from './path.js';
import { persistResults } from './phases/persist.js';
import { buildSynthesis } from './phases/synthesize.js';
import { runStaticAnalysis } from './phases/validate.js';
import { resolveTarget } from './resolve.js';
import {
  type OrchestratorDeps,
  type ValidationRequest,
  ValidationRequestSchema,
  deriveWorkflowId,
} from './types.js';

/**
 * Interpret a validation request — the single public entry point for the orchestrator.
 *
 * Returns a DiagnosticSummary for most cases. Throws domain errors
 * (ExecutionPreconditionError) for precondition failures that require
 * agent action — these propagate to the MCP/CLI boundary for envelope mapping.
 */
export async function interpret(
  request: ValidationRequest,
  deps: OrchestratorDeps,
): Promise<DiagnosticSummary> {
  const startTime = Date.now();
  const runId = randomUUID();

  // ── Step 1: Validate and parse ──────────────────────────────────
  const parseResult = ValidationRequestSchema.safeParse(request);
  if (!parseResult.success) {
    return errorDiagnostic(`Invalid request: ${parseResult.error.message}`, runId, startTime);
  }

  let graph: WorkflowGraph;
  let n8nWorkflowId: string;
  try {
    const ast = await deps.parsing.parseWorkflowFile(request.workflowPath);
    graph = deps.parsing.buildGraph(ast);
    // buildGraph always produces a full WorkflowAST — narrow past SnapshotAST union
    const fullAst = graph.ast as import('@n8n-as-code/transformer').WorkflowAST;
    n8nWorkflowId = fullAst.metadata.id.trim();
  } catch (err) {
    return errorDiagnostic(
      `Failed to parse workflow: ${err instanceof Error ? err.message : String(err)}`,
      runId,
      startTime,
    );
  }

  // ── Step 2: Load trust state ────────────────────────────────────
  const workflowId = deriveWorkflowId(request.workflowPath);
  const trustState = deps.trust.loadTrustState(workflowId);

  // ── Step 3: Compute change set ──────────────────────────────────
  let changeSet: NodeChangeSet | null = null;
  const previousGraph = deps.snapshots.loadSnapshot(workflowId);
  let activeTrust = trustState;
  if (previousGraph) {
    changeSet = deps.trust.computeChangeSet(previousGraph, graph);
    activeTrust = deps.trust.invalidateTrust(trustState, changeSet, graph);
  }

  // ── Step 4: Resolve target ──────────────────────────────────────
  const resolveResult = resolveTarget(request.target, graph, changeSet, activeTrust);
  if (!resolveResult.ok) {
    return errorDiagnostic(resolveResult.errorMessage, runId, startTime);
  }

  let { target: resolvedTarget, slice } = resolveResult;
  let paths = selectPaths(slice, graph, changeSet, activeTrust);

  // ── Step 5: Consult guardrails ──────────────────────────────────
  const expressionRefs = deps.analysis.traceExpressions(graph, resolvedTarget.nodes);

  const currentHashes = computeNodeHashes(graph, resolvedTarget.nodes);
  const fixtureHash = request.pinData ? hashPinData(request.pinData) : null;

  const evaluationInput: EvaluationInput = {
    target: { kind: 'slice', slice },
    targetNodes: new Set(resolvedTarget.nodes),
    tool: request.tool,
    force: request.force,
    trustState: activeTrust,
    changeSet: changeSet ?? { added: [], removed: [], modified: [], unchanged: [] },
    graph,
    currentHashes,
    priorSummary: null,
    expressionRefs,
    llmValidationRequested: false,
    fixtureHash,
  };

  const guardrailDecision = deps.guardrails.evaluate(evaluationInput);
  const guardrailDecisions: GuardrailDecision[] = [guardrailDecision];

  // Route on guardrail action
  if (guardrailDecision.action === 'refuse' && !request.force) {
    return skippedDiagnostic(resolvedTarget, guardrailDecisions, runId, startTime);
  }

  if (guardrailDecision.action === 'narrow' && !request.force) {
    const narrowedTarget = guardrailDecision.narrowedTarget;
    if (narrowedTarget.kind === 'slice') {
      slice = narrowedTarget.slice;
      resolvedTarget = {
        description: `Narrowed: ${resolvedTarget.description}`,
        nodes: [...narrowedTarget.slice.nodes],
        automatic: true,
      };
      paths = selectPaths(slice, graph, changeSet, activeTrust);
    }
  }

  // ── Step 6a: Static analysis (validate tool only) ───────────────
  const staticFindings =
    request.tool === 'validate'
      ? runStaticAnalysis(graph, paths, resolvedTarget, expressionRefs, deps.analysis)
      : [];

  // ── Step 6b: Execution (test tool only) ─────────────────────────
  let executionResult: ExecutionPreparationResult = {
    executionData: null,
    executionErrors: [],
    warnings: [],
    executionId: null,
    capabilities: { staticAnalysis: true, mcpTools: false },
    usedPinData: null,
  };

  if (request.tool === 'test') {
    try {
      executionResult = await prepareExecution(
        {
          n8nWorkflowId,
          workflowId,
          graph,
          trustState: activeTrust,
          resolvedTarget,
          ...(request.callTool ? { callTool: request.callTool } : {}),
          pinData: request.pinData,
        },
        buildExecutionInternalDeps(deps.execution),
      );
    } catch (err) {
      if (err instanceof ExecutionPreconditionError) throw err;
      return errorDiagnostic(
        `Execution failed: ${err instanceof Error ? err.message : String(err)}`,
        runId,
        startTime,
      );
    }
  }

  // ── Step 7: Synthesize ──────────────────────────────────────────
  const meta: ValidationMeta = {
    runId,
    executionId: executionResult.executionId,
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startTime,
  };

  const summary = buildSynthesis(
    staticFindings,
    executionResult.executionData,
    executionResult.executionErrors,
    activeTrust,
    guardrailDecisions,
    resolvedTarget,
    executionResult.capabilities,
    meta,
    deps,
  );

  // Surface execution warnings as info-severity hints
  for (const warning of executionResult.warnings) {
    summary.hints.push({ node: null, message: warning, severity: 'info' });
  }

  // ── Steps 8-9: Persist ──────────────────────────────────────────
  await persistResults(
    {
      summary,
      activeTrust,
      graph,
      workflowId,
      tool: request.tool,
      runId,
      fixtureHash,
      paths,
      resolvedTarget,
      usedPinData: executionResult.usedPinData,
    },
    deps,
  );

  // ── Step 10: Return ─────────────────────────────────────────────
  return summary;
}

// ── helpers ───────────────────────────────────────────────────────

function hashPinData(pinData: PinData): string {
  const serialized = stringify(pinData);
  if (serialized === undefined) {
    throw new Error('Pin data contains non-serializable values');
  }
  return createHash('sha256').update(serialized).digest('hex');
}

function errorDiagnostic(message: string, runId: string, startTime: number): DiagnosticSummary {
  return {
    schemaVersion: 1,
    status: 'error',
    target: { description: 'N/A', nodes: [], automatic: false },
    evidenceBasis: 'static',
    executedPath: null,
    errors: [
      {
        type: 'OrchestratorError',
        message,
        description: null,
        node: null,
        classification: 'platform',
        context: {},
      },
    ],
    nodeAnnotations: [],
    guardrailActions: [],
    hints: [],
    capabilities: { staticAnalysis: true, mcpTools: false },
    meta: {
      runId,
      executionId: null,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    },
  };
}

function skippedDiagnostic(
  target: { description: string; nodes: NodeIdentity[]; automatic: boolean },
  guardrailDecisions: GuardrailDecision[],
  runId: string,
  startTime: number,
): DiagnosticSummary {
  return {
    schemaVersion: 1,
    status: 'skipped',
    target,
    evidenceBasis: 'static',
    executedPath: null,
    errors: [],
    nodeAnnotations: [],
    guardrailActions: guardrailDecisions,
    hints: [],
    capabilities: { staticAnalysis: true, mcpTools: false },
    meta: {
      runId,
      executionId: null,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    },
  };
}
