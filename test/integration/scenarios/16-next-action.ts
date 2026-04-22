/**
 * Scenario 16: nextAction recommendation across different outcomes
 *
 * Proves that DiagnosticSummary.nextAction correctly reflects the
 * recommended agent action for each status outcome:
 *
 * 1. fail → fix-errors (blocking)
 * 2. pass (clean) → continue-building (non-blocking)
 * 3. skipped (refusal) → force-revalidate (non-blocking, overridable)
 * 4. pass with warnings → review-warnings (non-blocking)
 */

import { resolve, join } from 'node:path';
import { interpret } from '../../../src/orchestrator/interpret.js';
import { buildTestDeps } from '../lib/deps.js';
import { assertStatus, assertNextAction } from '../lib/assertions.js';
import type { IntegrationContext } from '../lib/setup.js';
import type { Scenario } from '../run.js';

async function run(ctx: IntegrationContext): Promise<void> {
  // Test 1: fail → fix-errors
  {
    const deps = buildTestDeps(ctx.trustDir, ctx.snapshotDir);
    const dataLossPath = resolve(join(ctx.fixturesDir, 'data-loss-passthrough.ts'));
    const result = await interpret(
      {
        workflowPath: dataLossPath,
        target: { kind: 'workflow' },
        tool: 'validate',
        force: false,
        pinData: null,
      },
      deps,
    );

    assertStatus(result, 'fail');
    assertNextAction(result, 'fix-errors');
    if (!result.nextAction.blocking) {
      throw new Error('Expected nextAction.blocking=true for fix-errors');
    }
  }

  // Test 2: pass (clean) → continue-building
  {
    const deps = buildTestDeps(ctx.trustDir, ctx.snapshotDir);
    const happyPath = resolve(join(ctx.fixturesDir, 'happy-path.ts'));
    const result = await interpret(
      {
        workflowPath: happyPath,
        target: { kind: 'workflow' },
        tool: 'validate',
        force: false,
        pinData: null,
      },
      deps,
    );

    assertStatus(result, 'pass');
    assertNextAction(result, 'continue-building');
    if (result.nextAction.blocking) {
      throw new Error('Expected nextAction.blocking=false for continue-building');
    }
  }

  // Test 3: skipped (refusal) → force-revalidate
  {
    const deps = buildTestDeps(ctx.trustDir, ctx.snapshotDir);
    const happyPath = resolve(join(ctx.fixturesDir, 'happy-path.ts'));
    // test without force on structurally-analyzable workflow → refusal
    const result = await interpret(
      {
        workflowPath: happyPath,
        target: { kind: 'changed' },
        tool: 'test',
        force: false,
        pinData: null,
      },
      deps,
    );

    assertStatus(result, 'skipped');
    assertNextAction(result, 'force-revalidate');
    if (result.nextAction.blocking) {
      throw new Error('Expected nextAction.blocking=false for force-revalidate');
    }
  }

  // Test 4: pass with warnings → review-warnings
  {
    const deps = buildTestDeps(ctx.trustDir, ctx.snapshotDir);
    const brokenWiringPath = resolve(join(ctx.fixturesDir, 'broken-wiring.ts'));
    const result = await interpret(
      {
        workflowPath: brokenWiringPath,
        target: { kind: 'workflow' },
        tool: 'validate',
        force: false,
        pinData: null,
      },
      deps,
    );

    // broken-wiring passes static but has disconnected node warning
    assertStatus(result, 'pass');
    assertNextAction(result, 'review-warnings');
    if (result.nextAction.blocking) {
      throw new Error('Expected nextAction.blocking=false for review-warnings');
    }
  }
}

export const scenario: Scenario = { name: '16-next-action', run };
