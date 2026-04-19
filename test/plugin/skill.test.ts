import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve('.');
const SKILL_PATH = resolve(ROOT, 'skills/validate-workflow/SKILL.md');

describe('skills/validate-workflow/SKILL.md', () => {
  const raw = readFileSync(SKILL_PATH, 'utf-8');

  // Split frontmatter from body
  const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  it('has valid YAML frontmatter delimiters', () => {
    expect(frontmatterMatch).not.toBeNull();
  });

  const frontmatter = frontmatterMatch![1]!;
  const body = frontmatterMatch![2]!;

  it('frontmatter name matches directory name "validate-workflow"', () => {
    const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
    expect(nameMatch).not.toBeNull();
    expect(nameMatch![1]!.trim()).toBe('validate-workflow');
  });

  it('frontmatter description is 1-1024 chars with trigger keywords', () => {
    const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
    expect(descMatch).not.toBeNull();
    const desc = descMatch![1]!.trim();
    expect(desc.length).toBeGreaterThanOrEqual(1);
    expect(desc.length).toBeLessThanOrEqual(1024);
    expect(desc.toLowerCase()).toContain('validate');
    expect(desc.toLowerCase()).toContain('n8n');
    expect(desc.toLowerCase()).toContain('workflow');
  });

  it('body is under 500 lines', () => {
    const lines = body.split('\n');
    expect(lines.length).toBeLessThan(500);
  });

  it('body mentions all three MCP tools (validate, trust_status, explain)', () => {
    for (const tool of ['validate', 'trust_status', 'explain']) {
      expect(body, `missing tool reference: ${tool}`).toContain(tool);
    }
  });

  it('frontmatter has license field', () => {
    expect(frontmatter).toMatch(/^license:/m);
  });

  it('frontmatter has compatibility field', () => {
    expect(frontmatter).toMatch(/^compatibility:/m);
  });
});
