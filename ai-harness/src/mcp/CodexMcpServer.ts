import { AgentToolRegistry, OpenAiToolDefinition } from '../tools/AgentToolRegistry';
import { Logger } from '../utils/Logger';
import * as readline from 'readline';

/**
 * Minimal MCP JSON-RPC server over stdio.
 * Same tool list as the in-app agent. Configure Cursor with:
 *
 * {
 *   "mcpServers": {
 *     "codex": {
 *       "command": "node",
 *       "args": ["ai-harness/dist/mcp/stdio.js"],
 *       "env": { "CODEX_PROJECT_ROOT": "<workspace>", "CODEX_CATALOG_ROOT": "<repo>/module-library" }
 *     }
 *   }
 * }
 */
export class CodexMcpServer {
  private logger = new Logger('CodexMcpServer');

  constructor(private registry: AgentToolRegistry) {}

  public toolsForMcp(): Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> {
    return this.registry.listDefinitions().map((def: OpenAiToolDefinition) => ({
      name: def.function.name,
      description: def.function.description,
      inputSchema: def.function.parameters,
    }));
  }

  public async handleRequest(message: any): Promise<any> {
    const id = message?.id;
    const method = message?.method;
    if (method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'codex-harness', version: '0.1.0' },
        },
      };
    }
    if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
      return null;
    }
    if (method === 'tools/list') {
      return { jsonrpc: '2.0', id, result: { tools: this.toolsForMcp() } };
    }
    if (method === 'tools/call') {
      const name = message?.params?.name;
      const args = message?.params?.arguments || {};
      const result = await this.registry.execute(name, args);
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: result.content }],
          isError: result.content.includes('"error"'),
        },
      };
    }
    if (method === 'ping') {
      return { jsonrpc: '2.0', id, result: {} };
    }
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    };
  }

  public startStdio(): void {
    this.logger.info('Codex MCP server listening on stdio');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
    rl.on('line', async (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let message: any;
      try {
        message = JSON.parse(trimmed);
      } catch {
        return;
      }
      const response = await this.handleRequest(message);
      if (response) {
        process.stdout.write(JSON.stringify(response) + '\n');
      }
    });
  }
}
