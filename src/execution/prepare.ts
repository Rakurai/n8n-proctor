/**
 * Execution preparation — owns capability detection, pin-data tiering,
 * smoke execution via MCP, and result retrieval.
 *
 * Extracted from the orchestrator so execution-input preparation is
 * independently testable without orchestration mocks.
 */

import type { ExecutionData } from '../diagnostics/types.js';
import { computeNodeHashes } from '../trust/hash.js';
import type { AvailableCapabilities } from '../types/diagnostic.js';
import type { NodeIdentity } from '../types/identity.js';
import { ExecutionPreconditionError } from './errors.js';
import { getExecution, preparePinData } from './mcp-client.js';
import { generateSampleFromSchema, readCachedPinData } from './pin-data.js';
import type {
  ExecutionInternalDeps,
  ExecutionPreparationError,
  ExecutionPreparationInput,
  ExecutionPreparationResult,
  PinData,
  PinDataItem,
} from './types.js';

/** The three contract-level execution deps from OrchestratorDeps.execution. */
interface ExecutionContractDeps {
  executeSmoke: ExecutionInternalDeps['executeSmoke'];
  constructPinData: ExecutionInternalDeps['constructPinData'];
  detectCapabilities: ExecutionInternalDeps['detectCapabilities'];
}

/**
 * Build ExecutionInternalDeps from the grouped execution contract deps.
 *
 * Wires the three contract-level deps (executeSmoke, constructPinData,
 * detectCapabilities) with the five execution-internal functions that
 * the orchestrator should not import directly.
 */
export function buildExecutionInternalDeps(
  contractDeps: ExecutionContractDeps,
): ExecutionInternalDeps {
  return {
    executeSmoke: contractDeps.executeSmoke,
    constructPinData: contractDeps.constructPinData,
    detectCapabilities: contractDeps.detectCapabilities,
    readCachedPinData,
    preparePinData,
    getExecution,
    generateSampleFromSchema,
    computeNodeHashes,
  };
}

/**
 * Prepare and execute a test-tool validation run.
 *
 * Handles capability detection, pin-data tiering (agent → cached → MCP → default),
 * smoke execution via MCP, and result retrieval. Throws ExecutionPreconditionError
 * for unrecoverable precondition failures.
 */
export async function prepareExecution(
  input: ExecutionPreparationInput,
  deps: ExecutionInternalDeps,
): Promise<ExecutionPreparationResult> {
  const capabilities: AvailableCapabilities = {
    staticAnalysis: true,
    mcpTools: false,
  };
  let executionData: ExecutionData | null = null;
  let usedPinData: PinData | null = null;
  let executionId: string | null = null;
  const executionErrors: ExecutionPreparationError[] = [];
  const warnings: string[] = [];

  if (!input.n8nWorkflowId) {
    throw new ExecutionPreconditionError(
      'workflow-not-found',
      'Cannot run execution validation: missing metadata.id in workflow file. Run n8nac push first to populate the workflow ID.',
    );
  }

  const detected = await deps.detectCapabilities(
    input.callTool ? { callTool: input.callTool } : undefined,
  );
  capabilities.mcpTools = detected.mcpAvailable;

  if (detected.mcpAvailable && input.callTool) {
    const allTrusted = input.resolvedTarget.nodes.filter((n) => input.trustState.nodes.has(n));
    const untrustedNodes = input.resolvedTarget.nodes.filter((n) => !input.trustState.nodes.has(n));
    const trustedBoundaries =
      untrustedNodes.length === 0
        ? []
        : allTrusted.filter((n) => {
            const forward = input.graph.forward.get(n);
            return forward?.some((e) => !input.trustState.nodes.has(e.to)) ?? false;
          });

    // Load cached pin data as prior artifacts (tier 2)
    const priorArtifacts: Record<string, PinDataItem[]> = {};
    const nodeHashes = deps.computeNodeHashes(input.graph, trustedBoundaries);
    for (const boundary of trustedBoundaries) {
      const hash = nodeHashes.get(boundary);
      if (hash) {
        const cached = await deps.readCachedPinData(input.workflowId, hash);
        if (cached) priorArtifacts[boundary as string] = cached;
      }
    }

    // Tier 3: MCP-sourced pin data from prepare_test_pin_data schemas
    let mcpPinData: Record<string, PinDataItem[]> | undefined;
    if (trustedBoundaries.length > 0) {
      try {
        const prepared = await deps.preparePinData(input.n8nWorkflowId, input.callTool);
        mcpPinData = {};
        for (const boundary of trustedBoundaries) {
          const nodeName = boundary as string;
          if (nodeName in prepared.nodeSchemasToGenerate) {
            const schema = prepared.nodeSchemasToGenerate[nodeName] as Record<string, unknown>;
            mcpPinData[nodeName] = [{ json: deps.generateSampleFromSchema(schema) }];
          } else if (prepared.nodesSkipped.includes(nodeName)) {
            mcpPinData[nodeName] = [{ json: {} }];
          } else if (prepared.nodesWithoutSchema.includes(nodeName)) {
            mcpPinData[nodeName] = [{ json: {} }];
          }
        }
      } catch (err) {
        // MCP tier-3 is non-fatal — constructPinData will use default pin data.
        // Surface the error as a warning so it's visible in diagnostics.
        const message = err instanceof Error ? err.message : String(err);
        warnings.push(`MCP tier-3 pin data unavailable: ${message}`);
      }
    }

    const pinDataResult = deps.constructPinData(
      input.graph,
      trustedBoundaries,
      input.pinData as Record<string, PinDataItem[]> | undefined,
      Object.keys(priorArtifacts).length > 0 ? priorArtifacts : undefined,
      mcpPinData && Object.keys(mcpPinData).length > 0 ? mcpPinData : undefined,
    );
    usedPinData = pinDataResult.pinData;

    const execResult = await deps.executeSmoke(
      input.n8nWorkflowId,
      pinDataResult.pinData,
      input.callTool,
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
      const mcpResult = await deps.getExecution(
        input.n8nWorkflowId,
        execResult.executionId,
        input.callTool,
        { includeData: true },
      );
      if (mcpResult.data) {
        executionData = mcpResult.data;
      }
    }
  }

  return { executionData, executionErrors, warnings, usedPinData, capabilities, executionId };
}
