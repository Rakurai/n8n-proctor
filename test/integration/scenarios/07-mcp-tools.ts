/**
 * Scenario 07: MCP tools round-trip
 *
 * Spawns the MCP server, tests all 4 tools (validate, test, trust_status, explain)
 * with valid and invalid input. The `test` tool is exercised both for the
 * "test before push" precondition_error path (no metadata.id) and for valid input.
 */

import { resolve, join } from 'node:path';
import { createMcpTestClient, type McpTestClient } from '../lib/mcp-client.js';
import type { IntegrationContext } from '../lib/setup.js';
import type { Scenario } from '../run.js';

async function run(ctx: IntegrationContext): Promise<void> {
  let client: McpTestClient | null = null;

  try {
    client = await createMcpTestClient();

    const happyPath = resolve(join(ctx.fixturesDir, 'happy-path.ts'));

    // Test 1: validate with valid input
    const validateResult = await client.validate({
      workflowPath: happyPath,
      kind: 'workflow',
    });

    if (!validateResult.success) {
      throw new Error(`validate tool failed: ${JSON.stringify(validateResult.error)}`);
    }
    if (!validateResult.data) {
      throw new Error('validate tool returned no data');
    }

    // Test 2: trust_status with valid input
    const trustResult = await client.trustStatus({
      workflowPath: happyPath,
    });

    if (!trustResult.success) {
      throw new Error(`trust_status tool failed: ${JSON.stringify(trustResult.error)}`);
    }
    if (!trustResult.data) {
      throw new Error('trust_status tool returned no data');
    }

    // Test 3: explain with valid input
    const explainResult = await client.explain({
      workflowPath: happyPath,
      tool: 'validate',
    });

    if (!explainResult.success) {
      throw new Error(`explain tool failed: ${JSON.stringify(explainResult.error)}`);
    }
    if (!explainResult.data) {
      throw new Error('explain tool returned no data');
    }

    // Test 4: validate with nonexistent file — returns success with status 'error' in data
    // (interpret catches parse errors internally and returns an error diagnostic)
    const invalidResult = await client.validate({
      workflowPath: 'nonexistent/workflow.ts',
      kind: 'workflow',
    });

    if (!invalidResult.success) {
      throw new Error(`validate tool returned failure for nonexistent file — expected success with error diagnostic`);
    }
    const diagnosticData = invalidResult.data as { status?: string };
    if (diagnosticData?.status !== 'error') {
      throw new Error(`Expected diagnostic status 'error' for nonexistent file, got '${diagnosticData?.status}'`);
    }

    // Test 5: trust_status with nonexistent file — throws (no internal catch)
    const invalidTrustResult = await client.trustStatus({
      workflowPath: 'nonexistent/workflow.ts',
    });

    if (invalidTrustResult.success) {
      throw new Error('trust_status tool should have failed for nonexistent file');
    }
    if (!invalidTrustResult.error) {
      throw new Error(
        `Expected trust_status error, got none`,
      );
    }

    // Test 6: explain with nonexistent file — throws (no internal catch)
    const invalidExplainResult = await client.explain({
      workflowPath: 'nonexistent/workflow.ts',
    });

    if (invalidExplainResult.success) {
      throw new Error('explain tool should have failed for nonexistent file');
    }
    if (!invalidExplainResult.error) {
      throw new Error('Expected explain error, got none');
    }
    // Assert the error type string
    if (invalidExplainResult.error.type !== 'workflow_not_found' && invalidExplainResult.error.type !== 'parse_error') {
      throw new Error(`Expected error type 'workflow_not_found' or 'parse_error', got '${invalidExplainResult.error.type}'`);
    }

    // Test 7: test tool via MCP transport — exercises the test handler (R4, C1)
    // The MCP server process has no n8n MCP credentials → falls back to static-only
    const testResult = await client.test({
      workflowPath: happyPath,
      kind: 'workflow',
      force: true,
    });

    if (!testResult.success) {
      throw new Error(`test tool MCP transport failed unexpectedly: ${JSON.stringify(testResult.error)}`);
    }
    const testData = testResult.data as {
      status?: string;
      evidenceBasis?: string;
      nodeAnnotations?: unknown[];
      hints?: unknown[];
    };
    if (!testData?.status) {
      throw new Error('Expected test tool to return diagnostic with status');
    }
    // Without n8n MCP connection: static-only evidence, pass status (happy-path has no static issues)
    if (testData.status !== 'pass') {
      throw new Error(`Expected test tool status 'pass', got '${testData.status}'`);
    }
    if (testData.evidenceBasis !== 'static') {
      throw new Error(`Expected evidenceBasis 'static' (no MCP in server process), got '${testData.evidenceBasis}'`);
    }
    if (!Array.isArray(testData.nodeAnnotations)) {
      throw new Error('Expected nodeAnnotations array in test diagnostic');
    }
    if (!Array.isArray(testData.hints)) {
      throw new Error('Expected hints array in test diagnostic');
    }

    // Test 8: test tool on no-id fixture — "test before push" → error diagnostic (SP2)
    // interpret() returns an errorDiagnostic (status:'error') rather than throwing,
    // so the MCP envelope is success:true with an error-status diagnostic inside.
    const noIdPath = resolve(join(ctx.fixturesDir, 'no-id.ts'));
    const noIdResult = await client.test({
      workflowPath: noIdPath,
      kind: 'workflow',
      force: true,
    });

    if (!noIdResult.success) {
      throw new Error(`Expected test on no-id fixture to return success:true with error diagnostic, got success:false`);
    }
    const noIdData = noIdResult.data as Record<string, unknown>;
    if (noIdData.status !== 'error') {
      throw new Error(`Expected diagnostic status 'error', got '${noIdData.status}'`);
    }
    const noIdErrors = noIdData.errors as Array<{ message: string }>;
    const mentionsMetadataId = noIdErrors?.some((e) => e.message.includes('metadata.id'));
    if (!mentionsMetadataId) {
      throw new Error(`Expected error message to mention 'metadata.id', got: ${JSON.stringify(noIdErrors)}`);
    }
  } finally {
    if (client) await client.close();
  }
}

export const scenario: Scenario = { name: '07-mcp-tools', run };
