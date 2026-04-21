/**
 * Integration test setup — prerequisite checks, temp directory creation,
 * manifest loading, and cleanup.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { type McpToolCaller } from '../../../src/execution/mcp-client.js';
import { createN8nMcpCaller } from './n8n-mcp-client.js';
import { ensureMcpAccess } from './enable-mcp-access.js';

// ── Types ────────────────────────────────────────────────────────

/** Maps fixture names to n8n workflow IDs. */
export type Manifest = Record<string, string>;

/** Shared context object passed to every scenario. */
export interface IntegrationContext {
  n8nHost: string;
  apiKey: string | null;
  trustDir: string;
  snapshotDir: string;
  fixturesDir: string;
  manifest: Manifest;
  /** MCP tool caller connected to n8n's native MCP server. null if MCP not configured. */
  callTool: McpToolCaller | null;
  cleanup: () => void;
}

// ── Setup ────────────────────────────────────────────────────────

const FIXTURES_DIR = resolve('test/integration/fixtures');
const N8N_HOST = process.env.N8N_HOST ?? 'http://localhost:5678';
const N8N_MCP_URL = process.env.N8N_MCP_URL ?? `${N8N_HOST}/mcp-server/http`;
const N8N_MCP_TOKEN = process.env.N8N_MCP_TOKEN ?? '';

/**
 * Verify all 7 prerequisites and create an IntegrationContext.
 * Throws on any prerequisite failure.
 */
export async function setup(): Promise<IntegrationContext> {
  // 1. n8n reachable via GET /api/v1/workflows
  await checkN8nReachable();

  // 2. n8nac available via `n8nac --version`
  checkCommand('n8nac', ['--version'], 'n8nac CLI not available');

  // 3. API key configured
  const apiKey = checkApiKey();

  // 4. n8nac pointed at correct host via `n8nac config`
  checkN8nacConfig();

  // 5. Node.js 20+ via `node --version`
  checkNodeVersion();

  // 6. Project built via dist/ existence
  checkProjectBuilt();

  // 7. Manifest exists
  const manifest = loadManifest();

  // 8. Ensure MCP access on all fixtures (workaround for older n8nac that strips availableInMCP)
  if (apiKey) {
    await ensureMcpAccess(N8N_HOST, apiKey, manifest, FIXTURES_DIR);
  }

  // 9. n8n MCP server reachable (optional but recommended)
  let callTool: McpToolCaller | null = null;
  let mcpCleanup: (() => Promise<void>) | null = null;
  if (N8N_MCP_TOKEN) {
    const mcp = await checkN8nMcp();
    callTool = mcp.callTool;
    mcpCleanup = mcp.close;
  } else {
    console.log('  WARN: N8N_MCP_TOKEN not set — execution tests will be skipped');
  }

  // Create temp dirs for trust/snapshot isolation
  const base = join(tmpdir(), `n8n-proctor-integ-${Date.now()}`);
  const trustDir = join(base, 'trust');
  const snapshotDir = join(base, 'snapshots');
  mkdirSync(trustDir, { recursive: true });
  mkdirSync(snapshotDir, { recursive: true });

  return {
    n8nHost: N8N_HOST,
    apiKey,
    trustDir,
    snapshotDir,
    fixturesDir: FIXTURES_DIR,
    manifest,
    callTool,
    cleanup: () => {
      rmSync(base, { recursive: true, force: true });
      mcpCleanup?.();
    },
  };
}

/**
 * Create a fresh IntegrationContext for a single scenario with isolated
 * trust/snapshot directories. Inherits shared fields from the base context.
 */
export function createScenarioContext(base: IntegrationContext): IntegrationContext {
  const dir = join(tmpdir(), `n8n-proctor-scenario-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const trustDir = join(dir, 'trust');
  const snapshotDir = join(dir, 'snapshots');
  mkdirSync(trustDir, { recursive: true });
  mkdirSync(snapshotDir, { recursive: true });

  return {
    ...base,
    trustDir,
    snapshotDir,
    callTool: base.callTool,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

// ── Prerequisite checks ──────────────────────────────────────────

async function checkN8nReachable(): Promise<void> {
  const apiKey = process.env.N8N_API_KEY ?? '';
  const headers: Record<string, string> = {};
  if (apiKey) headers['X-N8N-API-KEY'] = apiKey;

  const url = `${N8N_HOST}/api/v1/workflows`;
  let response: Response;
  try {
    response = await fetch(url, { headers });
  } catch (err) {
    throw new Error(`n8n not reachable at ${url}: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!response.ok) {
    throw new Error(`n8n returned HTTP ${response.status} from ${url}`);
  }
}

async function checkN8nMcp(): Promise<{ callTool: McpToolCaller; close: () => Promise<void> }> {
  try {
    return await createN8nMcpCaller(N8N_MCP_URL, N8N_MCP_TOKEN);
  } catch (err) {
    throw new Error(`n8n MCP server not reachable at ${N8N_MCP_URL}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function checkCommand(cmd: string, args: string[], errorMsg: string): void {
  try {
    execFileSync(cmd, args, { stdio: 'pipe', encoding: 'utf-8' });
  } catch {
    throw new Error(errorMsg);
  }
}

function checkApiKey(): string | null {
  const key = process.env.N8N_API_KEY;
  if (key) return key;

  // Check if n8nac has a configured API key
  try {
    const output = execFileSync('n8nac', ['config'], { stdio: 'pipe', encoding: 'utf-8' });
    if (/api.?key/i.test(output)) return null; // key is managed by n8nac, not directly available
  } catch {
    // fall through
  }

  throw new Error('N8N_API_KEY env var not set and n8nac config does not show a configured key');
}

function checkN8nacConfig(): void {
  try {
    const output = execFileSync('n8nac', ['instance', 'list', '--json'], { stdio: 'pipe', encoding: 'utf-8' });
    const instances = JSON.parse(output) as Array<{ host?: string; active?: boolean }>;
    const active = instances.find(i => i.active);
    if (!active || !active.host) {
      throw new Error('n8nac has no active instance configured with a host');
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('n8nac')) throw err;
    throw new Error(`n8nac config check failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function checkNodeVersion(): void {
  const output = execFileSync('node', ['--version'], { stdio: 'pipe', encoding: 'utf-8' });
  const match = output.trim().match(/^v(\d+)/);
  if (!match || parseInt(match[1], 10) < 20) {
    throw new Error(`Node.js 20+ required, got: ${output.trim()}`);
  }
}

function checkProjectBuilt(): void {
  if (!existsSync(resolve('dist'))) {
    throw new Error('Project not built — run `npm run build` first (dist/ not found)');
  }
}

function loadManifest(): Manifest {
  const manifestPath = join(FIXTURES_DIR, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`Manifest not found at ${manifestPath} — run seed script first`);
  }

  const raw = readFileSync(manifestPath, 'utf-8');
  return JSON.parse(raw) as Manifest;
}
