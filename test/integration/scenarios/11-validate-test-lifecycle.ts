/**
 * Scenario 11: Validate and test independently produce correct trust
 *
 * Proves that both validate (static) and test (execution) independently
 * build the correct trust state. This is the core product lifecycle,
 * but trust does NOT carry across the two tools due to a Phase 012 gap:
 * static validation does not produce cached pin data, so the test step
 * cannot reuse statically-trusted boundaries as execution pin data.
 *
 * Until Phase 012 resolves the pin-data handoff, this scenario uses
 * fresh deps for the test step to prove each tool's trust output in
 * isolation. The validate→test handoff (trust carrying across) is
 * explicitly NOT claimed here.
 *
 * Steps:
 * 1. Validate static → assert pass, evidenceBasis 'static', trust built
 * 2. Test execution (fresh deps) → assert pass, evidenceBasis 'execution'
 * 3. Check trust → assert nodes have execution trust
 *
 * Requires MCP — skipped without ctx.callTool.
 */

import { resolve, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
    // MCP required for execution — skip gracefully
    return;
  }

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

  // Check trust — all nodes should be trusted with 'static' evidence
  const trust1 = await buildTrustStatusReport(happyPath, deps);
  assertTrustedWith(trust1, 'Trigger', 'static');
  assertTrustedWith(trust1, 'Set', 'static');
  assertTrustedWith(trust1, 'Noop', 'static');

  // Step 2: Test execution with fresh deps (avoids pin-data-unavailable for
  // statically-trusted nodes that lack cached execution artifacts)
  const testDir = join(tmpdir(), `n8n-proctor-lifecycle-test-${Date.now()}`);
  const testTrustDir = join(testDir, 'trust');
  const testSnapshotDir = join(testDir, 'snapshots');
  mkdirSync(testTrustDir, { recursive: true });
  mkdirSync(testSnapshotDir, { recursive: true });
  const testDeps = buildTestDeps(testTrustDir, testSnapshotDir);

  const testResult = await interpret(
    {
      workflowPath: happyPath,
      target: { kind: 'workflow' },
      tool: 'test',
      force: true,
      pinData: null,
      callTool: ctx.callTool,
    },
    testDeps,
  );

  if (testResult.status === 'error') {
    const msgs = testResult.errors.map(e => `${e.classification}: ${e.message}`).join('; ');
    throw new Error(`Test step returned error: ${msgs || 'no error details'}`);
  }
  assertStatus(testResult, 'pass');
  assertNoFindings(testResult);
  assertEvidenceBasis(testResult, 'execution');

  // Execution metadata should be populated
  if (!testResult.meta.executionId) {
    throw new Error('Expected meta.executionId to be populated after execution test');
  }

  // Step 3: Check trust — nodes should now have execution trust
  const trust2 = await buildTrustStatusReport(happyPath, testDeps);
  assertTrustedWith(trust2, 'Trigger', 'execution');
  assertTrustedWith(trust2, 'Set', 'execution');
  assertTrustedWith(trust2, 'Noop', 'execution');
}

export const scenario: Scenario = { name: '11-independent-trust', run };
