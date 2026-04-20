/**
 * MCP server entry point — creates the server, connects stdio transport, starts.
 *
 * This file is the entry point referenced by `.mcp.json` (dist/mcp/serve.js).
 * It is invoked by the Claude Code plugin system.
 *
 * When N8N_HOST and N8N_MCP_TOKEN are set (via plugin userConfig),
 * a client connection to n8n's MCP server is established so the execution
 * layer can run workflows and retrieve results.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { buildDeps } from '../deps.js';
import type { McpToolCaller } from '../execution/mcp-client.js';
import { createServer } from './server.js';

/**
 * Connect to n8n's Streamable HTTP MCP server and return a McpToolCaller.
 * Returns undefined if connection fails (graceful degradation to static-only).
 */
async function connectToN8n(url: string, token: string): Promise<McpToolCaller | undefined> {
  try {
    const transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: {
        headers: { Authorization: `Bearer ${token}` },
      },
    });

    const client = new Client({ name: 'n8n-vet', version: '0.1.0' });
    await client.connect(transport as Transport);

    const callTool: McpToolCaller = async (toolName, args) => {
      if (toolName === 'tools/list') {
        const listed = await client.listTools();
        return listed.tools.map((t) => ({ name: t.name }));
      }

      const result = await client.callTool({ name: toolName, arguments: args });
      const content = result.content as Array<{ type: string; text: string }>;
      if (!content || content.length === 0) {
        throw new Error(`MCP tool '${toolName}' returned no content`);
      }
      const text = content[0].text;
      if (result.isError) {
        throw new Error(`MCP tool '${toolName}' error: ${text}`);
      }
      return JSON.parse(text);
    };

    return callTool;
  } catch {
    // Connection failed — fall back to static-only mode silently.
    return undefined;
  }
}

// ── Bootstrap ────────────────────────────────────────────────────

const n8nHost = process.env.N8N_HOST;
const n8nMcpToken = process.env.N8N_MCP_TOKEN;
const n8nApiKey = process.env.N8N_API_KEY;

let callTool: McpToolCaller | undefined;
if (n8nHost && n8nMcpToken) {
  const mcpUrl = `${n8nHost.replace(/\/$/, '')}/mcp-server/http`;
  callTool = await connectToN8n(mcpUrl, n8nMcpToken);
}

const deps = buildDeps();
const server = createServer(deps, callTool, n8nHost, n8nApiKey);
const transport = new StdioServerTransport();
await server.connect(transport);
