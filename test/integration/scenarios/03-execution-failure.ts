/**
 * Scenario 03: Execution failure via n8n MCP
 *
 * Validates credential-failure.ts with layer 'both' and a real callTool.
 * The workflow has an HTTP Request node with no credentials pointing to an
 * invalid URL — execution should fail at runtime.
 *
 * Static analysis also detects data-loss wiring (Process references $json.data
 * through HttpNoCreds which replaces item shape).
 *
 * When N8N_MCP_TOKEN is not configured, falls back to static-only assertions.
 */

import { resolve, join } from 'node:path';
import { interpret } from '../../../src/orchestrator/interpret.js';
import { buildTestDeps } from '../lib/deps.js';
import { assertStatus, assertFindingPresent } from '../lib/assertions.js';
import type { IntegrationContext } from '../lib/setup.js';
import type { Scenario } from '../run.js';

async function run(ctx: IntegrationContext): Promise<void> {
  const deps = buildTestDeps(ctx.trustDir, ctx.snapshotDir);
  const credFailurePath = resolve(join(ctx.fixturesDir, 'credential-failure.ts'));

  const result = await interpret(
    {
      workflowPath: credFailurePath,
      target: { kind: 'workflow' },
      layer: 'both',
      force: true,
      pinData: null,
      callTool: ctx.callTool ?? undefined,
    },
    deps,
  );

  // Should fail: static analysis detects data-loss wiring, and if MCP is
  // available the execution itself may also fail
  assertStatus(result, 'fail');
  assertFindingPresent(result, 'wiring');

  // Verify the wiring finding identifies the correct node
  const wiringError = result.errors.find(e => e.classification === 'wiring');
  if (!wiringError) throw new Error('Expected a wiring error');
  if (wiringError.node !== 'Process') {
    throw new Error(`Expected error on node 'Process', got '${wiringError.node}'`);
  }

  if (ctx.callTool) {
    // With MCP: capabilities should report MCP tools available
    if (!result.capabilities.mcpTools) {
      throw new Error('Expected capabilities.mcpTools to be true');
    }
  }
}

export const scenario: Scenario = { name: '03-execution-failure', run };
