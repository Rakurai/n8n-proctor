/**
 * Unit tests for REST client credential resolution and response schema validation.
 *
 * Covers: credential resolution from explicit config / env / fallback,
 * Zod schema validation for execution status and workflow responses.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  resolveCredentials,
  ExecutionStatusResponseSchema,
  ExecutionDataResponseSchema,
  WorkflowResponseSchema,
} from '../../src/execution/rest-client.js';
import { ExecutionConfigError } from '../../src/execution/errors.js';

// ---------------------------------------------------------------------------
// resolveCredentials
// ---------------------------------------------------------------------------

describe('resolveCredentials', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env['N8N_HOST'];
    delete process.env['N8N_API_KEY'];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('resolves from explicit credentials', async () => {
    const creds = await resolveCredentials({
      host: 'https://n8n.example.com',
      apiKey: 'test-key-123',
    });
    expect(creds).toEqual({
      host: 'https://n8n.example.com',
      apiKey: 'test-key-123',
    });
  });

  it('resolves from environment variables', async () => {
    process.env['N8N_HOST'] = 'https://env-host.example.com';
    process.env['N8N_API_KEY'] = 'env-key-456';

    const creds = await resolveCredentials();
    expect(creds).toEqual({
      host: 'https://env-host.example.com',
      apiKey: 'env-key-456',
    });
  });

  it('explicit overrides env vars', async () => {
    process.env['N8N_HOST'] = 'https://env-host.example.com';
    process.env['N8N_API_KEY'] = 'env-key-456';

    const creds = await resolveCredentials({
      host: 'https://explicit.example.com',
    });
    expect(creds.host).toBe('https://explicit.example.com');
    expect(creds.apiKey).toBe('env-key-456');
  });

  it('throws ExecutionConfigError when no credentials found', async () => {
    await expect(resolveCredentials()).rejects.toThrow(ExecutionConfigError);
    await expect(resolveCredentials()).rejects.toThrow(/Missing host and apiKey/);
  });

  it('throws ExecutionConfigError identifying specific missing credential', async () => {
    process.env['N8N_HOST'] = 'https://partial.example.com';
    await expect(resolveCredentials()).rejects.toThrow(/Missing apiKey/);
  });

  it('error message lists all checked sources', async () => {
    try {
      await resolveCredentials();
      expect.fail('should have thrown');
    } catch (e) {
      const err = e as ExecutionConfigError;
      expect(err.message).toContain('explicit config');
      expect(err.message).toContain('N8N_HOST');
      expect(err.message).toContain('n8nac-config.json');
      expect(err.message).toContain('credentials.json');
    }
  });
});

// ---------------------------------------------------------------------------
// Zod schema validation
// ---------------------------------------------------------------------------

describe('ExecutionStatusResponseSchema', () => {
  it('parses valid status response', () => {
    const result = ExecutionStatusResponseSchema.parse({
      id: 'exec-123',
      finished: true,
      mode: 'manual',
      status: 'success',
      startedAt: '2026-01-01T00:00:00.000Z',
      stoppedAt: '2026-01-01T00:00:05.000Z',
    });
    expect(result.status).toBe('success');
    expect(result.finished).toBe(true);
  });

  it('accepts null stoppedAt for running executions', () => {
    const result = ExecutionStatusResponseSchema.parse({
      id: 'exec-123',
      finished: false,
      mode: 'manual',
      status: 'running',
      startedAt: '2026-01-01T00:00:00.000Z',
      stoppedAt: null,
    });
    expect(result.stoppedAt).toBeNull();
  });
});

describe('WorkflowResponseSchema', () => {
  it('parses valid workflow response', () => {
    const result = WorkflowResponseSchema.parse({
      id: 'wf-123',
      name: 'Test Workflow',
      active: true,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(result.id).toBe('wf-123');
  });

  it('accepts missing optional fields', () => {
    const result = WorkflowResponseSchema.parse({
      id: 'wf-123',
      name: 'Test',
      active: false,
    });
    expect(result.hash).toBeUndefined();
  });
});

