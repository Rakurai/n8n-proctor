/**
 * Scenario 14: Expression error classification — SKIPPED
 *
 * SKIP REASON (SP3):
 * n8n v2.16 expression engine swallows all attempted expression errors in Set
 * nodes. `JSON.parse("{invalid")` runs but n8n coerces the result to a string
 * instead of propagating ExpressionError. The `expression` classification
 * logic IS unit-tested (test/diagnostics/errors.test.ts) — this integration
 * scenario cannot trigger the code path because we have no control over n8n's
 * expression engine behavior from outside.
 *
 * Revisit when n8n upgrades its expression engine or when a different node
 * type (e.g. Code node) reliably surfaces ExpressionError at runtime.
 */

import type { IntegrationContext } from '../lib/setup.js';
import type { Scenario } from '../run.js';

async function run(_ctx: IntegrationContext): Promise<void> {
  // Intentional skip — see SP3 rationale above.
}

export const scenario: Scenario = { name: '14-expression-classification', run };
