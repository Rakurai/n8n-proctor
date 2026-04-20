/**
 * Scenario 13: pinData parameter
 *
 * The `test` tool accepts `pinData` as a first-class parameter, documented
 * in SKILL.md. This is the mechanism agents use to mock upstream data during
 * execution testing.
 *
 * Steps:
 * 1. Call test with explicit pinData for Trigger node
 * 2. Assert execution succeeds
 * 3. Assert executedPath is present
 *
 * Requires MCP — skipped without ctx.callTool.
 */

import { resolve, join } from 'node:path';
import { interpret } from '../../../src/orchestrator/interpret.js';
import { buildTestDeps } from '../lib/deps.js';
import {
  assertStatus,
  assertNoFindings,
  assertEvidenceBasis,
  assertExecutedPathContains,
} from '../lib/assertions.js';
import type { IntegrationContext } from '../lib/setup.js';
import type { Scenario } from '../run.js';

async function run(ctx: IntegrationContext): Promise<void> {
  if (!ctx.callTool) {
    // MCP required for execution — skip gracefully
    return;
  }

  const deps = buildTestDeps(ctx.trustDir, ctx.snapshotDir);
  const happyPath = resolve(join(ctx.fixturesDir, 'happy-path.ts'));

  // Call test with explicit pinData for the Trigger node
  const result = await interpret(
    {
      workflowPath: happyPath,
      target: { kind: 'workflow' },
      tool: 'test',
      force: true,
      pinData: {
        Trigger: [{ json: { mockField: 'mockValue', testScenario: 'pin-data' } }],
      },
      callTool: ctx.callTool,
    },
    deps,
  );

  // Execution should succeed
  assertStatus(result, 'pass');
  assertNoFindings(result);
  assertEvidenceBasis(result, 'execution');

  // Execution path should be present
  assertExecutedPathContains(result, ['Trigger', 'Set']);

  // Execution metadata should be populated
  if (!result.meta.executionId) {
    throw new Error('Expected meta.executionId to be populated with pinData test');
  }
}

export const scenario: Scenario = { name: '13-pin-data', run };
