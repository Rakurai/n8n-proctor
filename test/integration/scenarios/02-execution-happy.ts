/**
 * Scenario 02: Execution happy path via n8n MCP
 *
 * Validates happy-path.ts with layer 'both' and a real callTool connected
 * to n8n's native MCP server. The workflow executes successfully via
 * test_workflow, producing execution data alongside static analysis.
 *
 * When N8N_MCP_TOKEN is not configured, falls back to verifying graceful
 * degradation (execution skipped, static-only results).
 */

import { resolve, join } from 'node:path';
import { interpret } from '../../../src/orchestrator/interpret.js';
import { buildTrustStatusReport } from '../../../src/surface.js';
import { buildTestDeps } from '../lib/deps.js';
import { assertStatus, assertNoFindings, assertTrusted } from '../lib/assertions.js';
import type { IntegrationContext } from '../lib/setup.js';
import type { Scenario } from '../run.js';

async function run(ctx: IntegrationContext): Promise<void> {
  const deps = buildTestDeps(ctx.trustDir, ctx.snapshotDir);
  const happyPath = resolve(join(ctx.fixturesDir, 'happy-path.ts'));

  const result = await interpret(
    {
      workflowPath: happyPath,
      target: { kind: 'workflow' },
      layer: 'both',
      force: true,
      pinData: null,
      callTool: ctx.callTool ?? undefined,
    },
    deps,
  );

  assertStatus(result, 'pass');
  assertNoFindings(result);

  if (ctx.callTool) {
    // With MCP: execution should have produced an executedPath
    if (result.executedPath === null) {
      throw new Error('Expected executedPath to be non-null when callTool is provided');
    }

    // Capabilities should report MCP tools available
    if (!result.capabilities.mcpTools) {
      throw new Error('Expected capabilities.mcpTools to be true');
    }
  } else {
    // Without MCP: execution skipped gracefully
    if (result.executedPath !== null) {
      throw new Error('Expected executedPath to be null when no callTool is provided');
    }
  }

  // Verify trust state was updated for all nodes (pass → trust recorded)
  const trustReport = await buildTrustStatusReport(happyPath, deps);
  assertTrusted(trustReport, 'Trigger');
  assertTrusted(trustReport, 'Set');
  assertTrusted(trustReport, 'Noop');
}

export const scenario: Scenario = { name: '02-execution-happy', run };
