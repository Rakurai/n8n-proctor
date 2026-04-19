/**
 * REST API client for n8n — read-only operations.
 *
 * Handles credential resolution from a 4-level config cascade
 * and execution status/data retrieval via GET /executions/:id.
 * REST is not used for triggering execution (MCP is the sole backend).
 *
 * Zod schemas validate all REST API response boundaries per
 * constitution principle II (Contract-Driven Boundaries).
 */

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';

import { ExecutionConfigError, ExecutionInfrastructureError } from './errors.js';
import type { ExecutionStatus, ExplicitCredentials, ResolvedCredentials } from './types.js';

// ---------------------------------------------------------------------------
// Zod schemas — REST API response boundaries
// ---------------------------------------------------------------------------

/** Schema for GET /executions/:id response (flat, status-only fields). */
export const ExecutionStatusResponseSchema = z.object({
  id: z.string(),
  finished: z.boolean(),
  mode: z.string(),
  status: z.string(),
  startedAt: z.string(),
  stoppedAt: z.string().nullable(),
});

/** Schema for GET /executions/:id?includeData=true response (flat). */
export const ExecutionDataResponseSchema = ExecutionStatusResponseSchema.extend({
  data: z.object({
    resultData: z.object({
      runData: z.record(
        z.array(
          z.object({
            startTime: z.number(),
            executionTime: z.number(),
            executionStatus: z.string().optional(),
            error: z
              .object({
                message: z.string(),
                description: z.string().nullable().optional(),
                name: z.string().optional(),
                node: z.object({ name: z.string() }).optional(),
                httpCode: z.string().optional(),
                context: z.record(z.unknown()).optional(),
              })
              .optional()
              .nullable(),
            source: z
              .array(
                z
                  .object({
                    previousNode: z.string(),
                    previousNodeOutput: z.number().optional(),
                    previousNodeRun: z.number().optional(),
                  })
                  .nullable(),
              )
              .optional()
              .nullable(),
            hints: z
              .array(
                z.object({
                  message: z.string(),
                  level: z.string().optional(),
                }),
              )
              .optional(),
            data: z.record(z.unknown()).optional(),
          }),
        ),
      ),
      error: z
        .object({
          message: z.string(),
          description: z.string().nullable().optional(),
          name: z.string().optional(),
          node: z.object({ name: z.string() }).optional(),
          httpCode: z.string().optional(),
          context: z.record(z.unknown()).optional(),
        })
        .optional()
        .nullable(),
      lastNodeExecuted: z.string().optional().nullable(),
    }),
  }),
});

/** Schema for GET /workflows/:id response (existence check). */
export const WorkflowResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  active: z.boolean(),
  updatedAt: z.string().optional(),
  hash: z.string().optional(),
});

// ---------------------------------------------------------------------------
// n8nac config file schemas
// ---------------------------------------------------------------------------

/** Schema for n8nac-config.json project config. */
const N8nacProjectConfigSchema = z.object({
  activeInstance: z.string().optional(),
  instances: z
    .record(
      z.object({
        host: z.string().optional(),
        apiKey: z.string().optional(),
      }),
    )
    .optional(),
});

/** Schema for ~/.config/n8nac/credentials.json global credential store. */
const N8nacGlobalCredentialsSchema = z.record(
  z.object({
    host: z.string().optional(),
    apiKey: z.string().optional(),
  }),
);

// ---------------------------------------------------------------------------
// Credential Resolution (T004)
// ---------------------------------------------------------------------------

/**
 * Resolves n8n host and API key from the 4-level config cascade.
 *
 * Cascade priority (high to low):
 *   1. Explicit credentials passed in the request
 *   2. Environment variables: N8N_HOST, N8N_API_KEY
 *   3. n8nac project config: n8nac-config.json (active instance)
 *   4. Global credential store: ~/.config/n8nac/credentials.json
 *
 * Throws ExecutionConfigError identifying the specific missing credential
 * and which sources were checked.
 */
export async function resolveCredentials(
  explicit?: ExplicitCredentials,
): Promise<ResolvedCredentials> {
  // Layer 1: Explicit
  let host = explicit?.host;
  let apiKey = explicit?.apiKey;

  // Layer 2: Environment variables
  host ??= process.env.N8N_HOST;
  apiKey ??= process.env.N8N_API_KEY;

  // Layer 3: n8nac project config
  if (!host || !apiKey) {
    const projectCreds = await readProjectConfig();
    host ??= projectCreds?.host;
    apiKey ??= projectCreds?.apiKey;
  }

  // Layer 4: Global credential store
  if (!host || !apiKey) {
    const globalCreds = await readGlobalCredentials();
    host ??= globalCreds?.host;
    apiKey ??= globalCreds?.apiKey;
  }

  // Validate completeness
  const missing: string[] = [];
  if (!host) missing.push('host');
  if (!apiKey) missing.push('apiKey');

  if (missing.length > 0) {
    throw new ExecutionConfigError(
      `Missing ${missing.join(' and ')}: checked explicit config, env vars (N8N_HOST/N8N_API_KEY), n8nac-config.json, ~/.config/n8nac/credentials.json`,
    );
  }

  return { host: host as string, apiKey: apiKey as string };
}

// ---------------------------------------------------------------------------
// Config file readers
// ---------------------------------------------------------------------------

/** Partial credential result from a config source. */
interface PartialCredentials {
  host: string | undefined;
  apiKey: string | undefined;
}

/** Read n8nac project config from cwd. Returns active instance creds or undefined. */
async function readProjectConfig(): Promise<PartialCredentials | undefined> {
  try {
    const raw = await readFile(resolve('n8nac-config.json'), 'utf-8');
    const parsed = N8nacProjectConfigSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return undefined;

    const config = parsed.data;
    const instanceName = config.activeInstance;
    if (!instanceName || !config.instances) return undefined;

    const instance = config.instances[instanceName];
    if (!instance) return undefined;
    return { host: instance.host, apiKey: instance.apiKey };
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw err;
  }
}

/** Read global n8nac credentials. Returns first entry or undefined. */
async function readGlobalCredentials(): Promise<PartialCredentials | undefined> {
  try {
    const credPath = join(homedir(), '.config', 'n8nac', 'credentials.json');
    const raw = await readFile(credPath, 'utf-8');
    const parsed = N8nacGlobalCredentialsSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return undefined;

    const entries = Object.values(parsed.data);
    const first = entries[0];
    if (!first) return undefined;
    return { host: first.host, apiKey: first.apiKey };
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// REST API helpers
// ---------------------------------------------------------------------------

/** Build headers for authenticated n8n REST API requests. */
function authHeaders(creds: ResolvedCredentials): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-N8N-API-KEY': creds.apiKey,
  };
}

/** Normalize host URL — strip trailing slash. */
function normalizeHost(host: string): string {
  return host.replace(/\/+$/, '');
}

// ---------------------------------------------------------------------------
// Execution Status & Data Retrieval — REST read-only path
// ---------------------------------------------------------------------------

/**
 * Get execution status (metadata only) via REST API.
 */
export async function getExecutionStatus(
  executionId: string,
  credentials: ResolvedCredentials,
): Promise<{ status: ExecutionStatus; finished: boolean }> {
  const url = `${normalizeHost(credentials.host)}/api/v1/executions/${executionId}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: authHeaders(credentials),
    });
  } catch (err) {
    throw new ExecutionInfrastructureError(
      'unreachable',
      `n8n unreachable during polling: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new ExecutionInfrastructureError(
        'execution-not-found',
        `Execution ${executionId} not found`,
      );
    }
    throw new ExecutionInfrastructureError(
      'unreachable',
      `n8n returned HTTP ${response.status} during status poll`,
    );
  }

  const json: unknown = await response.json();
  const parsed = ExecutionStatusResponseSchema.parse(json);

  return {
    status: parsed.status as ExecutionStatus,
    finished: parsed.finished,
  };
}

/**
 * Get full execution data via REST API.
 * Used for the data retrieval phase after terminal status detected.
 */
export async function getExecutionData(
  executionId: string,
  credentials: ResolvedCredentials,
): Promise<z.infer<typeof ExecutionDataResponseSchema>> {
  const url = `${normalizeHost(credentials.host)}/api/v1/executions/${executionId}?includeData=true`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: authHeaders(credentials),
    });
  } catch (err) {
    throw new ExecutionInfrastructureError(
      'unreachable',
      `n8n unreachable during data retrieval: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new ExecutionInfrastructureError(
        'execution-not-found',
        `Execution ${executionId} not found (HTTP 404)`,
      );
    }
    throw new ExecutionInfrastructureError(
      'unreachable',
      `Failed to retrieve execution data for ${executionId} (HTTP ${response.status})`,
    );
  }

  const json: unknown = await response.json();
  return ExecutionDataResponseSchema.parse(json);
}
