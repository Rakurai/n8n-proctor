/**
 * Scenario 14: Expression error classification
 *
 * The expression-bug fixture has a Set node with `JSON.parse("{invalid")` —
 * an expression that unconditionally throws SyntaxError at runtime. n8n wraps
 * this as ExpressionError → `expression` classification.
 *
 * This scenario proves that the `expression` classification string is returned
 * from execution errors — agents branch on this string to decide their action.
 *
 * Requires MCP — skipped without ctx.callTool.
 */

import { resolve, join } from 'node:path';
import { interpret } from '../../../src/orchestrator/interpret.js';
import { buildTestDeps } from '../lib/deps.js';
import {
  assertStatus,
  assertFindingPresent,
  assertFindingOnNode,
  assertEvidenceBasis,
} from '../lib/assertions.js';
import type { IntegrationContext } from '../lib/setup.js';
import type { Scenario } from '../run.js';

async function run(ctx: IntegrationContext): Promise<void> {
  if (!ctx.callTool) {
    // MCP required for execution — skip gracefully
    return;
  }

  const deps = buildTestDeps(ctx.trustDir, ctx.snapshotDir);
  const exprBugPath = resolve(join(ctx.fixturesDir, 'expression-bug.ts'));

  const execResult = await interpret(
    {
      workflowPath: exprBugPath,
      target: { kind: 'workflow' },
      tool: 'test',
      force: true,
      pinData: null,
      callTool: ctx.callTool,
    },
    deps,
  );

  // Diagnostic dump on unexpected pass — helps debug n8n runtime behavior
  if (execResult.status === 'pass') {
    const detail = JSON.stringify({
      status: execResult.status,
      evidenceBasis: execResult.evidenceBasis,
      capabilities: execResult.capabilities,
      errors: execResult.errors,
      paths: execResult.paths,
      meta: execResult.meta,
    }, null, 2);
    throw new Error(`Expected execution to fail but got pass. Diagnostic:\n${detail}`);
  }

  assertStatus(execResult, 'fail');
  assertEvidenceBasis(execResult, 'execution');

  // The execution error should be classified as 'expression'
  assertFindingPresent(execResult, 'expression');
  assertFindingOnNode(execResult, 'expression', 'Bad Expression');
}

export const scenario: Scenario = { name: '14-expression-classification', run };
