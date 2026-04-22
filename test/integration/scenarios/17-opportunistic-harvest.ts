/**
 * Scenario 17: Opportunistic trust harvesting
 *
 * Proves that execution-backed testing records 'execution-opportunistic'
 * trust for out-of-scope nodes that ran successfully.
 *
 * Uses the 5-node multi-node-change fixture: Trigger → A → B → C → D
 *
 * Steps:
 * 1. Validate all nodes (workflow target) — all 5 nodes trusted with 'static'
 * 2. Test targeting only B with force=true
 *    - Trust-boundary-aware traversal stops at trusted neighbors:
 *      backward from B stops at A (trusted), forward stops at C (trusted)
 *    - Resolved target = {A, B, C} (B + boundary nodes)
 *    - n8n executes the full chain: Trigger, A, B, C, D all run
 * 3. Assert primary trust: A, B, C → 'execution' (in resolved target)
 * 4. Assert opportunistic harvest: Trigger, D → 'execution-opportunistic'
 *    (out of resolved target, ran successfully)
 *
 * Requires MCP — skipped without ctx.callTool.
 */

import { resolve, join } from 'node:path';
import { interpret } from '../../../src/orchestrator/interpret.js';
import { buildTrustStatusReport } from '../../../src/surface.js';
import { buildTestDeps } from '../lib/deps.js';
import {
  assertStatus,
  assertTrustedWith,
} from '../lib/assertions.js';
import { nodeIdentity } from '../../../src/types/identity.js';
import type { IntegrationContext } from '../lib/setup.js';
import type { Scenario } from '../run.js';

async function run(ctx: IntegrationContext): Promise<void> {
  if (!ctx.callTool) {
    return;
  }

  const deps = buildTestDeps(ctx.trustDir, ctx.snapshotDir);
  const multiNodePath = resolve(join(ctx.fixturesDir, 'multi-node-change.ts'));

  // Step 1: Validate all nodes — build full static trust
  const validateResult = await interpret(
    {
      workflowPath: multiNodePath,
      target: { kind: 'workflow' },
      tool: 'validate',
      force: false,
      pinData: null,
    },
    deps,
  );
  assertStatus(validateResult, 'pass');

  // Verify all 5 nodes trusted with 'static'
  const trustAfterValidate = await buildTrustStatusReport(multiNodePath, deps);
  assertTrustedWith(trustAfterValidate, 'Trigger', 'static');
  assertTrustedWith(trustAfterValidate, 'A', 'static');
  assertTrustedWith(trustAfterValidate, 'B', 'static');
  assertTrustedWith(trustAfterValidate, 'C', 'static');
  assertTrustedWith(trustAfterValidate, 'D', 'static');

  // Step 2: Test targeting only B with force=true
  // Trust-boundary traversal: backward stops at A, forward stops at C
  // → resolvedTarget.nodes = {A, B, C}
  // → Out-of-scope: Trigger, D
  const testResult = await interpret(
    {
      workflowPath: multiNodePath,
      target: { kind: 'nodes', nodes: [nodeIdentity('B')] },
      tool: 'test',
      force: true,
      pinData: null,
      callTool: ctx.callTool,
    },
    deps,
  );

  if (testResult.status === 'error') {
    const msgs = testResult.errors.map(e => `${e.classification}: ${e.message}`).join('; ');
    throw new Error(`Execution failed: ${msgs}`);
  }
  assertStatus(testResult, 'pass');

  // Step 3: Check trust state after test execution
  const trustAfterTest = await buildTrustStatusReport(multiNodePath, deps);

  // In-scope nodes (resolved target {A, B, C}): primary 'execution' trust
  assertTrustedWith(trustAfterTest, 'A', 'execution');
  assertTrustedWith(trustAfterTest, 'B', 'execution');
  assertTrustedWith(trustAfterTest, 'C', 'execution');

  // Out-of-scope nodes that ran successfully: opportunistic harvest
  // Trigger and D were 'static' → upgraded to 'execution-opportunistic'
  assertTrustedWith(trustAfterTest, 'Trigger', 'execution-opportunistic');
  assertTrustedWith(trustAfterTest, 'D', 'execution-opportunistic');
}

export const scenario: Scenario = { name: '17-opportunistic-harvest', run };
