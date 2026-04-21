import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve('.');

function readJson(relPath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(ROOT, relPath), 'utf-8'));
}

describe('plugin manifest (FR-002 version sync)', () => {
  const pluginJson = readJson('.claude-plugin/plugin.json');
  const packageJson = readJson('package.json');

  it('plugin.json version matches package.json version', () => {
    expect(pluginJson.version).toBe(packageJson.version);
  });

  it('plugin.json has required name field', () => {
    expect(pluginJson.name).toBe('n8n-proctor');
  });

  it('plugin.json has description', () => {
    expect(typeof pluginJson.description).toBe('string');
    expect((pluginJson.description as string).length).toBeGreaterThan(0);
  });

  it('plugin.json has license', () => {
    expect(pluginJson.license).toBe('MIT');
  });

  it('plugin.json has keywords array', () => {
    expect(Array.isArray(pluginJson.keywords)).toBe(true);
    expect((pluginJson.keywords as string[]).length).toBeGreaterThan(0);
  });

  it('plugin.json has repository', () => {
    expect(pluginJson.repository).toBeDefined();
  });

  it('plugin.json has author', () => {
    expect(pluginJson.author).toBeDefined();
  });
});
