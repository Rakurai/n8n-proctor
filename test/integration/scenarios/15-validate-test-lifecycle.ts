/**
 * Scenario 15: Validate → test lifecycle with trust carrying across
 *
 * Proves the core product claim: static trust persists into execution testing.
 * Unlike scenario 11 (which isolates trust), this test uses the SAME deps
 * across validate and test steps. After validate trusts nodes statically,
 * the test step uses MCP tier-3 pin data sourcing (prepare_test_pin_data)
 * to generate pin data for trusted boundaries, avoiding the "pin data
 * unavailable" error that previously blocked this lifecycle.
 *
 * Steps:
 * 1. Validate static → assert pass, all nodes trusted with 'static'
 * 2. Test execution (same deps, no pinData provided) → assert pass
 * 3. Assert trust updated to 'execution' evidence
 *
 * Requires MCP — skipped without ctx.callTool.
 */

import { resolve, join } from 'node:path';
import { interpret } from '../../../src/orchestrator/interpret.js';
import { buildTrustStatusReport } from '../../../src/surface.js';
import { buildTestDeps } from '../lib/deps.js';
import {
  assertStatus,
  assertNoFindings,
  assertEvidenceBasis,
  assertTrustedWith,
} from '../lib/assertions.js';
import type { IntegrationContext } from '../lib/setup.js';
import type { Scenario } from '../run.js';

async function run(ctx: IntegrationContext): Promise<void> {
  if (!ctx.callTool) {
    return;
  }

  // Shared deps — trust carries across validate and test
  const deps = buildTestDeps(ctx.trustDir, ctx.snapshotDir);
  const happyPath = resolve(join(ctx.fixturesDir, 'happy-path.ts'));

  // Step 1: Validate static
  const validateResult = await interpret(
    {
      workflowPath: happyPath,
      target: { kind: 'workflow' },
      tool: 'validate',
      force: false,
      pinData: null,
    },
    deps,
  );

  assertStatus(validateResult, 'pass');
  assertNoFindings(validateResult);
  assertEvidenceBasis(validateResult, 'static');

  // Verify trust built from static validation
  const trustAfterValidate = await buildTrustStatusReport(happyPath, deps);
  assertTrustedWith(trustAfterValidate, 'Trigger', 'static');
  assertTrustedWith(trustAfterValidate, 'Set', 'static');
  assertTrustedWith(trustAfterValidate, 'Noop', 'static');

  // Step 2: Test execution — same deps, NO agent-provided pinData
  // This is the critical assertion: tier-3 MCP sourcing must provide pin data
  // for the statically-trusted boundaries so execution can proceed.
  const testResult = await interpret(
    {
      workflowPath: happyPath,
      target: { kind: 'workflow' },
      tool: 'test',
      force: true,
      pinData: null,
      callTool: ctx.callTool,
    },
    deps,
  );

  if (testResult.status === 'error') {
    const msgs = testResult.errors.map(e => `${e.classification}: ${e.message}`).join('; ');
    throw new Error(
      `Lifecycle broken: test step failed after validate. ` +
      `This means tier-3 pin data sourcing did not provide data for ` +
      `statically-trusted boundaries. Errors: ${msgs || 'none'}`,
    );
  }

  assertStatus(testResult, 'pass');
  assertEvidenceBasis(testResult, 'execution');

  if (!testResult.meta.executionId) {
    throw new Error('Expected meta.executionId after execution test');
  }

  // Step 3: Trust should now reflect execution evidence
  const trustAfterTest = await buildTrustStatusReport(happyPath, deps);
  assertTrustedWith(trustAfterTest, 'Trigger', 'execution');
  assertTrustedWith(trustAfterTest, 'Set', 'execution');
  assertTrustedWith(trustAfterTest, 'Noop', 'execution');
}

export const scenario: Scenario = { name: '15-validate-test-lifecycle', run };
