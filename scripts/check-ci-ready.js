#!/usr/bin/env node

/**
 * CI readiness check for integration tests.
 *
 * Verifies that the environment is correctly configured before running
 * `npm run test:integration`. Designed for agents that cannot easily
 * inspect .env files or diagnose silent configuration failures.
 *
 * Usage:
 *   node scripts/check-ci-ready.js          # check and report
 *   node scripts/check-ci-ready.js --json   # machine-readable output
 *
 * Exit codes:
 *   0 — all checks passed
 *   1 — one or more checks failed (details in output)
 */

import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const json = process.argv.includes('--json');

/** @type {{ name: string, status: 'pass' | 'fail' | 'warn', detail: string }[]} */
const results = [];

function pass(name, detail) {
  results.push({ name, status: 'pass', detail });
}
function fail(name, detail) {
  results.push({ name, status: 'fail', detail });
}
function warn(name, detail) {
  results.push({ name, status: 'warn', detail });
}

// ── 1. .env file exists ──────────────────────────────────────────

const envPath = resolve(root, '.env');
if (existsSync(envPath)) {
  pass('.env file', 'Found');
} else {
  fail('.env file', 'Missing — copy .env.example to .env and fill in values');
}

// ── 2. Required env vars ─────────────────────────────────────────

// Load .env manually for checking (dotenv-cli loads it for the actual test run)
/** @type {Record<string, string>} */
const envVars = {};
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    envVars[key] = value;
  }
}

// Also check process.env (env vars may be set directly, not via .env)
function getVar(name) {
  return process.env[name] || envVars[name] || '';
}

const n8nHost = getVar('N8N_HOST');
const n8nApiKey = getVar('N8N_API_KEY');
const n8nMcpToken = getVar('N8N_MCP_TOKEN');

if (n8nHost) {
  pass('N8N_HOST', n8nHost);
} else {
  fail('N8N_HOST', 'Not set — provide the n8n instance URL (e.g. http://localhost:5678)');
}

if (n8nApiKey) {
  pass('N8N_API_KEY', 'Set (value hidden)');
} else {
  fail('N8N_API_KEY', 'Not set — create one in n8n: Settings → API → Create API Key');
}

if (n8nMcpToken) {
  pass('N8N_MCP_TOKEN', 'Set (value hidden)');
} else {
  warn('N8N_MCP_TOKEN', 'Not set — execution tests will be skipped. Generate in n8n: Settings → MCP Server → Generate Token (audience: mcp-server-api)');
}

// ── 3. n8n reachable ─────────────────────────────────────────────

if (n8nHost) {
  const url = `${n8nHost}/api/v1/workflows`;
  try {
    const curlOutput = execFileSync('curl', [
      '-s', '-o', '/dev/null', '-w', '%{http_code}',
      '-H', n8nApiKey ? `X-N8N-API-KEY: ${n8nApiKey}` : '',
      '--max-time', '5',
      url,
    ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();

    if (curlOutput === '200') {
      pass('n8n reachable', `${n8nHost} responded 200`);
    } else {
      fail('n8n reachable', `${url} returned HTTP ${curlOutput}`);
    }
  } catch (err) {
    fail('n8n reachable', `Cannot reach ${url} — is n8n running?`);
  }
} else {
  fail('n8n reachable', 'Skipped — N8N_HOST not set');
}

// ── 4. n8nac CLI available ───────────────────────────────────────

try {
  const version = execFileSync('npx', ['--yes', 'n8nac', '--version'], {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 30000,
  }).trim();
  pass('n8nac CLI', `Available (${version})`);
} catch {
  fail('n8nac CLI', 'Not available — install n8n-as-code or check PATH');
}

// ── 5. Node.js version ───────────────────────────────────────────

try {
  const nodeVersion = execFileSync('node', ['--version'], {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
  const major = parseInt(nodeVersion.replace(/^v/, '').split('.')[0], 10);
  if (major >= 20) {
    pass('Node.js version', nodeVersion);
  } else {
    fail('Node.js version', `${nodeVersion} — requires >= 20`);
  }
} catch {
  fail('Node.js version', 'Cannot determine Node.js version');
}

// ── 6. Project built ─────────────────────────────────────────────

if (existsSync(resolve(root, 'dist'))) {
  pass('Project built', 'dist/ exists');
} else {
  fail('Project built', 'dist/ not found — run `npm run build`');
}

// ── 7. Fixtures seeded ───────────────────────────────────────────

const manifestPath = resolve(root, 'test/integration/fixtures/manifest.json');
if (existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    const count = Object.keys(manifest).length;
    pass('Fixtures seeded', `manifest.json has ${count} fixture(s)`);
  } catch {
    fail('Fixtures seeded', 'manifest.json exists but is not valid JSON');
  }
} else {
  fail('Fixtures seeded', 'manifest.json not found — run `npm run test:integ:seed`');
}

// ── 8. dotenv-cli available ──────────────────────────────────────

try {
  execFileSync('npx', ['--yes', 'dotenv-cli', '--help'], {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 30000,
  });
  pass('dotenv-cli', 'Available');
} catch {
  fail('dotenv-cli', 'Not available — run `npm install` (it is a devDependency)');
}

// ── Output ───────────────────────────────────────────────────────

const failures = results.filter(r => r.status === 'fail');
const warnings = results.filter(r => r.status === 'warn');

if (json) {
  const output = {
    ready: failures.length === 0,
    checks: results,
    summary: {
      passed: results.filter(r => r.status === 'pass').length,
      failed: failures.length,
      warnings: warnings.length,
    },
  };
  console.log(JSON.stringify(output, null, 2));
} else {
  console.log('n8n-proctor CI readiness check\n');

  for (const r of results) {
    const icon = r.status === 'pass' ? '✓' : r.status === 'warn' ? '⚠' : '✗';
    console.log(`  ${icon} ${r.name}: ${r.detail}`);
  }

  console.log('');
  if (failures.length === 0 && warnings.length === 0) {
    console.log('Ready for integration tests.');
  } else if (failures.length === 0) {
    console.log(`Ready with ${warnings.length} warning(s). Some tests may be skipped.`);
  } else {
    console.log(`Not ready: ${failures.length} check(s) failed.`);
  }
}

process.exit(failures.length > 0 ? 1 : 0);
