import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import packageJson from '../../package.json';
import {
  createFingerBrowserMcpLocalApiClient,
  registerFingerBrowserMcpTools,
  resolveFingerBrowserMcpConfig,
  type FingerBrowserMcpToolRegistrar
} from './domain/mcp-local-api';

async function main(): Promise<void> {
  const config = resolveFingerBrowserMcpConfig({
    env: process.env,
    readFile: (filePath) => readFileSync(filePath, 'utf8')
  });
  const server = new McpServer({
    name: 'fingerbrowser',
    version: packageJson.version
  });
  const client = createFingerBrowserMcpLocalApiClient(config);

  registerFingerBrowserMcpTools(server as FingerBrowserMcpToolRegistrar, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`FingerBrowser MCP server connected to ${config.baseUrl}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'FingerBrowser MCP server failed');
  process.exit(1);
});
