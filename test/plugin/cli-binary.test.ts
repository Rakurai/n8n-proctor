import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = resolve('.');
const BIN_PATH = resolve(ROOT, 'bin/n8n-vet');

describe('bin/n8n-vet CLI binary', () => {
  it('bin/n8n-vet file exists', () => {
    expect(existsSync(BIN_PATH)).toBe(true);
  });

  it('bin/n8n-vet is executable', () => {
    const stat = statSync(BIN_PATH);
    // Check owner execute bit (0o100)
    const isExecutable = (stat.mode & 0o111) !== 0;
    expect(isExecutable).toBe(true);
  });

  it('bin/n8n-vet has correct shebang', () => {
    const content = readFileSync(BIN_PATH, 'utf-8');
    expect(content.startsWith('#!/usr/bin/env node')).toBe(true);
  });

  it('bin/n8n-vet with no args exits with code 2 and prints usage', () => {
    try {
      execFileSync('node', [BIN_PATH], { encoding: 'utf-8', timeout: 10_000 });
      // If it succeeds unexpectedly, fail the test
      expect.fail('Expected non-zero exit code');
    } catch (err: unknown) {
      const execErr = err as { status: number; stderr: string; stdout: string };
      expect(execErr.status).toBe(2);
      const output = (execErr.stderr || '') + (execErr.stdout || '');
      expect(output.toLowerCase()).toMatch(/usage|help|n8n-vet/i);
    }
  });
});
