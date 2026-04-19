/**
 * Scenario 06: Targeted node validation with pin data
 *
 * Validates multi-node-change.ts with target nodes ['B'], pin data for trigger,
 * and layer 'both'. Asserts that execution runs (MCP smoke test) and that
 * the validation target is scoped to the requested nodes.
 *
 * NOTE: The previous version of this scenario tested bounded REST execution
 * via destinationNode/destinationMode, which has been removed. Execution now
 * uses MCP smoke tests (whole-workflow). This scenario verifies that targeted
 * node validation still works with the new execution backend.
 */

import { resolve, join } from 'node:path';
import { interpret } from '../../../src/orchestrator/interpret.js';
import { buildTestDeps } from '../lib/deps.js';
import type { IntegrationContext } from '../lib/setup.js';
import type { Scenario } from '../run.js';

async function run(ctx: IntegrationContext): Promise<void> {
  const deps = buildTestDeps(ctx.trustDir, ctx.snapshotDir);
  const multiNodePath = resolve(join(ctx.fixturesDir, 'multi-node-change.ts'));

  const result = await interpret(
    {
      workflowPath: multiNodePath,
      target: { kind: 'nodes', nodes: ['B'] },
      layer: 'both',
      force: false,
      pinData: {
        Trigger: [{ json: { value: 'test' } }],
      },
    },
    deps,
  );

  // Validation target should be scoped to the requested node(s)
  const targetNodes = result.target.nodes.map(n => String(n));
  if (!targetNodes.includes('B')) {
    throw new Error(
      `Expected node B in validation target, got: [${targetNodes.join(', ')}]`,
    );
  }

  // Execution should have run (MCP smoke test runs whole workflow)
  if (result.executedPath === null) {
    throw new Error('Expected execution to run with layer "both"');
  }
}

export const scenario: Scenario = { name: '06-bounded-execution', run };
