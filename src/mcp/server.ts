/**
 * MCP server — registers three tools (validate, trust_status, explain) and
 * exposes them to agents via the MCP protocol.
 *
 * This is a thin delegation layer. Tool handlers parse input, apply defaults,
 * delegate to library core functions, and wrap results in the response envelope.
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { OrchestratorDeps } from '../orchestrator/types.js';
import type { ValidationRequest } from '../orchestrator/types.js';
import { interpret } from '../orchestrator/interpret.js';
import type { NodeIdentity } from '../types/identity.js';
import type { AgentTarget, ValidationLayer } from '../types/target.js';
import type { McpResponse } from '../errors.js';
import { mapToMcpError } from '../errors.js';
import { buildTrustStatusReport, buildGuardrailExplanation } from '../surface.js';

// ── Input schemas ────────────────────────────────────────────────

const TargetSchema = z.object({
  kind: z.enum(['nodes', 'changed', 'workflow']),
  nodes: z.array(z.string()).optional(),
});

const ValidateInputSchema = {
  workflowPath: z.string().min(1),
  target: TargetSchema.optional(),
  layer: z.enum(['static', 'execution', 'both']).optional(),
  force: z.boolean().optional(),
  pinData: z.record(z.array(z.object({ json: z.record(z.unknown()) }).passthrough())).optional(),
  destinationNode: z.string().min(1).optional(),
  destinationMode: z.enum(['inclusive', 'exclusive']).optional(),
};

const TrustStatusInputSchema = {
  workflowPath: z.string().min(1),
};

const ExplainInputSchema = {
  workflowPath: z.string().min(1),
  target: TargetSchema.optional(),
  layer: z.enum(['static', 'execution', 'both']).optional(),
};

// ── Helpers ──────────────────────────────────────────────────────

function wrapSuccess<T>(data: T): { content: Array<{ type: 'text'; text: string }> } {
  const envelope: McpResponse<T> = { success: true, data };
  return { content: [{ type: 'text', text: JSON.stringify(envelope) }] };
}

function wrapError(error: unknown): { content: Array<{ type: 'text'; text: string }> } {
  const envelope: McpResponse<never> = { success: false, error: mapToMcpError(error) };
  return { content: [{ type: 'text', text: JSON.stringify(envelope) }] };
}

function resolveTarget(raw?: { kind: 'nodes' | 'changed' | 'workflow'; nodes?: string[] | undefined }): AgentTarget | Error {
  if (!raw) return { kind: 'changed' };
  if (raw.kind === 'nodes') {
    if (!raw.nodes || raw.nodes.length === 0) {
      return new Error('target.nodes must be a non-empty array when target.kind is "nodes"');
    }
    return { kind: 'nodes', nodes: raw.nodes as NodeIdentity[] };
  }
  if (raw.kind === 'workflow') return { kind: 'workflow' };
  return { kind: 'changed' };
}

function resolveLayer(raw?: string): ValidationLayer {
  if (raw === 'execution' || raw === 'both') return raw;
  return 'static';
}

// ── Server factory ───────────────────────────────────────────────

/** Create an MCP server with all three n8n-vet tools registered. */
export function createServer(deps: OrchestratorDeps): McpServer {
  const server = new McpServer({ name: 'n8n-vet', version: '0.1.0' });

  // ── validate ─────────────────────────────────────────────────
  server.registerTool('validate', {
    description: 'Validate an n8n workflow. Returns a diagnostic summary.',
    inputSchema: ValidateInputSchema,
  }, async (args) => {
    try {
      const target = resolveTarget(args.target);
      if (target instanceof Error) return wrapError(target);

      const request: ValidationRequest = {
        workflowPath: args.workflowPath,
        target,
        layer: resolveLayer(args.layer),
        force: args.force ?? false,
        pinData: args.pinData ?? null,
        destinationNode: args.destinationNode ?? null,
        destinationMode: args.destinationMode ?? 'inclusive',
      };
      const summary = await interpret(request, deps);
      return wrapSuccess(summary);
    } catch (error) {
      return wrapError(error);
    }
  });

  // ── trust_status ─────────────────────────────────────────────
  server.registerTool('trust_status', {
    description: 'Inspect trust state for a workflow. Shows trusted/untrusted nodes and changes.',
    inputSchema: TrustStatusInputSchema,
  }, async (args) => {
    try {
      const report = await buildTrustStatusReport(args.workflowPath, deps);
      return wrapSuccess(report);
    } catch (error) {
      return wrapError(error);
    }
  });

  // ── explain ──────────────────────────────────────────────────
  server.registerTool('explain', {
    description: 'Dry-run guardrail evaluation. Shows what guardrails would decide without performing validation.',
    inputSchema: ExplainInputSchema,
  }, async (args) => {
    try {
      const target = resolveTarget(args.target);
      if (target instanceof Error) return wrapError(target);

      const explanation = await buildGuardrailExplanation(
        args.workflowPath,
        target,
        resolveLayer(args.layer),
        deps,
      );
      return wrapSuccess(explanation);
    } catch (error) {
      return wrapError(error);
    }
  });

  return server;
}
