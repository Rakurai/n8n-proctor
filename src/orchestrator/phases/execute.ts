/**
 * Execution phase — capability detection, pin-data construction, smoke
 * execution via MCP, and result retrieval.
 */

import type { ExecutionData } from '../../diagnostics/types.js';
import { ExecutionPreconditionError } from '../../execution/errors.js';
import { getExecution, preparePinData } from '../../execution/mcp-client.js';
import type { McpToolCaller } from '../../execution/mcp-client.js';
import { generateSampleFromSchema, readCachedPinData } from '../../execution/pin-data.js';
import type { PinData, PinDataItem } from '../../execution/types.js';
import { computeNodeHashes } from '../../trust/hash.js';
import type { AvailableCapabilities, ResolvedTarget } from '../../types/diagnostic.js';
import type { WorkflowGraph } from '../../types/graph.js';
import type { NodeIdentity } from '../../types/identity.js';
import type { TrustState } from '../../types/trust.js';
import type { OrchestratorDeps } from '../types.js';

/** Execution phase output. */
export interface ExecutionPhaseResult {
  executionData: ExecutionData | null;
  executionErrors: ExecutionError[];
  executionId: string | null;
  capabilities: AvailableCapabilities;
  usedPinData: PinData | null;
}

/** Execution error shape matching interpret.ts expectations. */
export interface ExecutionError {
  type: string;
  message: string;
  description: null;
  node: NodeIdentity | null;
  classification: 'platform';
  context: Record<string, never>;
}

/**
 * Run the execution phase for test-tool requests.
 *
 * Handles capability detection, pin-data tiering (agent → cached → MCP → default),
 * smoke execution via MCP, and result retrieval.
 */
export async function runExecution(
  n8nWorkflowId: string,
  workflowId: string,
  graph: WorkflowGraph,
  resolvedTarget: ResolvedTarget,
  activeTrust: TrustState,
  request: { callTool?: McpToolCaller | undefined; pinData: PinData | null },
  deps: Pick<OrchestratorDeps, 'detectCapabilities' | 'constructPinData' | 'executeSmoke'>,
): Promise<ExecutionPhaseResult> {
  const capabilities: AvailableCapabilities = {
    staticAnalysis: true,
    mcpTools: false,
  };
  let executionData: ExecutionData | null = null;
  let usedPinData: PinData | null = null;
  let executionId: string | null = null;
  const executionErrors: ExecutionError[] = [];

  if (!n8nWorkflowId) {
    throw new ExecutionPreconditionError(
      'workflow-not-found',
      'Cannot run execution validation: missing metadata.id in workflow file. Run n8nac push first to populate the workflow ID.',
    );
  }

  const detected = await deps.detectCapabilities(
    request.callTool ? { callTool: request.callTool } : undefined,
  );
  capabilities.mcpTools = detected.mcpAvailable;

  if (detected.mcpAvailable && request.callTool) {
    const allTrusted = resolvedTarget.nodes.filter((n) => activeTrust.nodes.has(n));
    const untrustedNodes = resolvedTarget.nodes.filter((n) => !activeTrust.nodes.has(n));
    const trustedBoundaries =
      untrustedNodes.length === 0
        ? []
        : allTrusted.filter((n) => {
            const forward = graph.forward.get(n);
            return forward?.some((e) => !activeTrust.nodes.has(e.to)) ?? false;
          });

    // Load cached pin data as prior artifacts (tier 2)
    const priorArtifacts: Record<string, PinDataItem[]> = {};
    const nodeHashes = computeNodeHashes(graph, trustedBoundaries);
    for (const boundary of trustedBoundaries) {
      const hash = nodeHashes.get(boundary);
      if (hash) {
        const cached = await readCachedPinData(workflowId, hash);
        if (cached) priorArtifacts[boundary as string] = cached;
      }
    }

    // Tier 3: MCP-sourced pin data from prepare_test_pin_data schemas
    let mcpPinData: Record<string, PinDataItem[]> | undefined;
    if (trustedBoundaries.length > 0) {
      try {
        const prepared = await preparePinData(n8nWorkflowId, request.callTool);
        mcpPinData = {};
        for (const boundary of trustedBoundaries) {
          const nodeName = boundary as string;
          if (nodeName in prepared.nodeSchemasToGenerate) {
            const schema = prepared.nodeSchemasToGenerate[nodeName] as Record<string, unknown>;
            mcpPinData[nodeName] = [{ json: generateSampleFromSchema(schema) }];
          } else if (prepared.nodesSkipped.includes(nodeName)) {
            mcpPinData[nodeName] = [{ json: {} }];
          } else if (prepared.nodesWithoutSchema.includes(nodeName)) {
            mcpPinData[nodeName] = [{ json: {} }];
          }
        }
      } catch {
        // MCP tier-3 failure is non-fatal — fall through to tier 4
      }
    }

    const pinDataResult = deps.constructPinData(
      graph,
      trustedBoundaries,
      request.pinData as Record<string, PinDataItem[]> | undefined,
      Object.keys(priorArtifacts).length > 0 ? priorArtifacts : undefined,
      mcpPinData && Object.keys(mcpPinData).length > 0 ? mcpPinData : undefined,
    );
    usedPinData = pinDataResult.pinData;

    const execResult = await deps.executeSmoke(
      n8nWorkflowId,
      pinDataResult.pinData,
      request.callTool,
    );

    if (execResult.error) {
      executionErrors.push({
        type: execResult.error.type,
        message: execResult.error.message,
        description: null,
        node: execResult.error.node as NodeIdentity | null,
        classification: 'platform',
        context: {},
      });
    }

    executionId = execResult.executionId;

    // Retrieve execution data via MCP
    if (execResult.executionId) {
      const mcpResult = await getExecution(
        n8nWorkflowId,
        execResult.executionId,
        request.callTool,
        { includeData: true },
      );
      if (mcpResult.data) {
        executionData = mcpResult.data;
      }
    }
  }

  return { executionData, executionErrors, executionId, capabilities, usedPinData };
}
