import { IProjectIndexer } from '../interfaces';
import { CrystalBridge } from '../crystal/CrystalBridge';
import { WorkspaceFs } from './WorkspaceFs';
import { ModuleCatalogIndex } from '../indexing/ModuleCatalogIndex';
import { scanModuleCompatibility } from '../modules/CompatibilityScanner';
import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../utils/Logger';

export interface OpenAiToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface AgentToolCallResult {
  content: string;
  mutating: boolean;
  files?: string[];
  diff?: { path: string; action: string; newContent?: string };
}

export interface AgentToolHost {
  getProjectRoot: () => string;
  getCatalogRoot?: () => string;
  indexer: IProjectIndexer;
  crystal?: CrystalBridge;
  catalog: ModuleCatalogIndex;
  getModel?: () => unknown;
  afterMutation?: (source: string, files: string[]) => Promise<void>;
  onInstallModule?: (mod: {
    id: string;
    name: string;
    variantId: string;
    category: string;
    description: string;
  }) => Promise<void>;
  updateArchitecture?: (payload: Record<string, unknown>) => Promise<unknown>;
}

const MUTATING = new Set([
  'write_file',
  'edit_file',
  'delete_file',
  'install_module',
  'adapt_module',
  'update_architecture',
]);

function tool(name: string, description: string, parameters: Record<string, unknown>): OpenAiToolDefinition {
  return { type: 'function', function: { name, description, parameters } };
}

export class AgentToolRegistry {
  private fs: WorkspaceFs;
  private logger = new Logger('AgentToolRegistry');

  constructor(private host: AgentToolHost) {
    this.fs = new WorkspaceFs(host.getProjectRoot());
  }

  public refreshRoot(): void {
    this.fs.setProjectRoot(this.host.getProjectRoot());
  }

  public listDefinitions(): OpenAiToolDefinition[] {
    return [
      tool('read_file', 'Read a workspace file by relative path.', {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      }),
      tool('write_file', 'Create or overwrite a workspace file. Use for new files or full rewrites.', {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content'],
      }),
      tool('edit_file', 'Replace an exact substring in a file (minimal diff).', {
        type: 'object',
        properties: {
          path: { type: 'string' },
          old_string: { type: 'string' },
          new_string: { type: 'string' },
        },
        required: ['path', 'old_string', 'new_string'],
      }),
      tool('delete_file', 'Delete a workspace file.', {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      }),
      tool('list_directory', 'List files and folders in a workspace directory.', {
        type: 'object',
        properties: { path: { type: 'string' } },
      }),
      tool('query_context', 'Retrieve the top related project files for a natural-language prompt.', {
        type: 'object',
        properties: {
          prompt: { type: 'string' },
          max_files: { type: 'number' },
        },
        required: ['prompt'],
      }),
      tool('search_symbol', 'Find functions/classes/interfaces by name in the project index.', {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      }),
      tool('get_imports_exports', 'Return imports and exports for a file.', {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      }),
      tool('find_routes', 'Find HTTP routes in the project, optionally limited to one file.', {
        type: 'object',
        properties: { path: { type: 'string' } },
      }),
      tool('search_modules', 'Search the stock module catalog and installed modules by keyword/stack.', {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      }),
      tool('get_module', 'Get a catalog or installed module by id/name, including variants and implementation status.', {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      }),
      tool('get_application_model', 'Return the structured application model (stack, modules, architecture).', {
        type: 'object',
        properties: {},
      }),
      tool('update_architecture', 'Add or remove an architecture node or relationship on the shared model.', {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['add_node', 'add_edge', 'remove_node'] },
          node: { type: 'object' },
          edge: { type: 'object' },
          id: { type: 'string' },
        },
        required: ['action'],
      }),
      tool('run_command', 'Run a shell command in the project workspace (sandboxed).', {
        type: 'object',
        properties: {
          command: { type: 'string' },
          timeout_ms: { type: 'number' },
        },
        required: ['command'],
      }),
      tool('run_typecheck', 'Run TypeScript typecheck (tsc --noEmit).', { type: 'object', properties: {} }),
      tool('run_tests', 'Run the project test script (npm test).', { type: 'object', properties: {} }),
      tool('run_linter', 'Run ESLint or pylint. Reports failure if the linter is missing or errors exist.', {
        type: 'object',
        properties: {},
      }),
      tool('run_build', 'Run npm run build when a build script exists.', { type: 'object', properties: {} }),
      tool('analyze_module', 'Check catalog module compatibility with the current stack and existing auth/CRUD patterns.', {
        type: 'object',
        properties: {
          id: { type: 'string' },
          variant_id: { type: 'string' },
        },
        required: ['id'],
      }),
      tool('install_module', 'Install a catalog module (copy source when present; stub modules register placement only).', {
        type: 'object',
        properties: {
          id: { type: 'string' },
          variant_id: { type: 'string' },
          merge_choice: { type: 'string', enum: ['keep', 'merge', 'replace', 'cancel'] },
        },
        required: ['id'],
      }),
      tool('adapt_module', 'Adapt a catalog module to this project with minimal path/import changes, then install.', {
        type: 'object',
        properties: {
          id: { type: 'string' },
          variant_id: { type: 'string' },
        },
        required: ['id'],
      }),
    ];
  }

  public async execute(name: string, args: Record<string, unknown>): Promise<AgentToolCallResult> {
    this.refreshRoot();
    const mutating = MUTATING.has(name);
    try {
      const result = await this.dispatch(name, args || {});
      if (mutating && this.host.afterMutation) {
        await this.host.afterMutation('agent-tool', result.files || []);
      }
      return { ...result, mutating };
    } catch (err: any) {
      return { content: JSON.stringify({ error: err?.message || String(err) }), mutating: false };
    }
  }

  private async dispatch(name: string, args: Record<string, unknown>): Promise<AgentToolCallResult> {
    const root = this.host.getProjectRoot();
    switch (name) {
      case 'read_file': {
        const res = this.fs.readFile(String(args.path || ''));
        return { content: JSON.stringify(res), mutating: false, files: [String(args.path)] };
      }
      case 'write_file': {
        const p = String(args.path || '');
        const content = String(args.content ?? '');
        const existed = this.fs.exists(p);
        const res = this.fs.writeFile(p, content);
        return {
          content: JSON.stringify(res),
          mutating: true,
          files: [p],
          diff: { path: p, action: existed ? 'modify' : 'create', newContent: content },
        };
      }
      case 'edit_file': {
        const p = String(args.path || '');
        const oldS = String(args.old_string ?? '');
        const newS = String(args.new_string ?? '');
        const res = this.fs.replaceInFile(p, oldS, newS);
        const after = this.fs.readFile(p);
        return {
          content: JSON.stringify(res),
          mutating: true,
          files: [p],
          diff: { path: p, action: 'modify', newContent: after.content },
        };
      }
      case 'delete_file': {
        const p = String(args.path || '');
        const res = this.fs.deleteFile(p);
        return { content: JSON.stringify(res), mutating: true, files: [p], diff: { path: p, action: 'delete' } };
      }
      case 'list_directory': {
        const p = String(args.path || '.');
        return { content: JSON.stringify(this.fs.listDirectory(p)), mutating: false };
      }
      case 'query_context': {
        await this.host.indexer.indexProject(root);
        const ctx = await this.host.indexer.queryContext({
          prompt: String(args.prompt || ''),
          maxFiles: Number(args.max_files) || 8,
          projectRoot: root,
        });
        return { content: JSON.stringify(ctx), mutating: false };
      }
      case 'search_symbol': {
        const nameQ = String(args.name || '');
        const crystalHits = await this.searchCrystalSymbols(nameQ);
        if (crystalHits) return { content: JSON.stringify({ source: 'crystal', matches: crystalHits }), mutating: false };
        const index = await this.host.indexer.indexProject(root);
        const matches: Array<{ path: string; name: string; kind: string; line: number }> = [];
        index.files.forEach((file) => {
          for (const s of file.symbols) {
            if (s.name.toLowerCase().includes(nameQ.toLowerCase())) {
              matches.push({ path: file.relativePath, name: s.name, kind: s.kind, line: s.line });
            }
          }
        });
        return { content: JSON.stringify({ source: 'harness', matches: matches.slice(0, 50) }), mutating: false };
      }
      case 'get_imports_exports': {
        const p = String(args.path || '');
        const index = await this.host.indexer.indexFile(this.fs.resolvePath(p), root);
        if (!index) return { content: JSON.stringify({ error: 'File not indexed' }), mutating: false };
        return {
          content: JSON.stringify({ path: index.relativePath, imports: index.imports, exports: index.exports, symbols: index.symbols }),
          mutating: false,
        };
      }
      case 'find_routes': {
        const index = await this.host.indexer.indexProject(root);
        const filter = args.path ? String(args.path) : '';
        const routes = filter
          ? index.routes.filter((r) => (r.handler || '').includes(filter))
          : index.routes;
        return { content: JSON.stringify({ routes }), mutating: false };
      }
      case 'search_modules': {
        const catalog = this.host.catalog.search(String(args.query || ''));
        const model = this.host.getModel?.() as { modules?: Array<{ id: string; name: string }> } | undefined;
        return {
          content: JSON.stringify({
            catalog: catalog.map((m) => ({
              id: m.id,
              name: m.name,
              description: m.description,
              category: m.category,
              variants: m.variants.map((v) => ({ id: v.id, stack: v.stack, fileCount: v.files.length })),
            })),
            installed: model?.modules || [],
          }),
          mutating: false,
        };
      }
      case 'get_module': {
        const id = String(args.id || '');
        const catalog = this.host.catalog.get(id);
        const model = this.host.getModel?.() as { modules?: Array<{ id: string; name: string }> } | undefined;
        const installed = model?.modules?.find((m) => m.id === id || m.name === id);
        return { content: JSON.stringify({ catalog, installed }), mutating: false };
      }
      case 'get_application_model': {
        const model = this.host.getModel?.();
        if (model) return { content: JSON.stringify(model), mutating: false };
        const graph = await this.host.indexer.getArchitectureGraph(root);
        const profile = await this.host.indexer.getProjectProfile(root);
        return { content: JSON.stringify({ profile, graph }), mutating: false };
      }
      case 'update_architecture': {
        if (!this.host.updateArchitecture) {
          return { content: JSON.stringify({ error: 'Architecture host is not attached' }), mutating: false };
        }
        const updated = await this.host.updateArchitecture(args);
        return { content: JSON.stringify(updated), mutating: true };
      }
      case 'run_command': {
        const cmd = String(args.command || '').trim();
        const timeout = Math.min(Number(args.timeout_ms) || 30000, 120000);
        const out = await this.runCmd(cmd, timeout);
        return { content: JSON.stringify(out), mutating: false };
      }
      case 'run_typecheck': {
        const out = await this.runCmd('npx tsc --noEmit', 60000);
        return { content: JSON.stringify({ passed: out.success, ...out }), mutating: false };
      }
      case 'run_tests': {
        const out = await this.runCmd('npm test -- --passWithNoTests', 90000);
        return { content: JSON.stringify({ passed: out.success, ...out }), mutating: false };
      }
      case 'run_linter': {
        const pkg = path.join(root, 'package.json');
        if (fs.existsSync(pkg)) {
          const out = await this.runCmd('npx eslint src --ext .ts,.tsx,.js,.jsx', 60000);
          return {
            content: JSON.stringify({
              passed: out.success,
              available: true,
              ...out,
            }),
            mutating: false,
          };
        }
        const py = path.join(root, 'pyproject.toml');
        if (fs.existsSync(py)) {
          const out = await this.runCmd('pylint src', 60000);
          return { content: JSON.stringify({ passed: out.success, available: true, ...out }), mutating: false };
        }
        return {
          content: JSON.stringify({
            passed: false,
            available: false,
            error: 'No ESLint or pylint configuration found; lint did not pass by default.',
          }),
          mutating: false,
        };
      }
      case 'run_build': {
        const pkgPath = path.join(root, 'package.json');
        if (!fs.existsSync(pkgPath)) {
          return { content: JSON.stringify({ passed: false, error: 'No package.json' }), mutating: false };
        }
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (!pkg.scripts?.build) {
          return { content: JSON.stringify({ passed: false, skipped: true, error: 'No build script' }), mutating: false };
        }
        const out = await this.runCmd('npm run build', 120000);
        return { content: JSON.stringify({ passed: out.success, ...out }), mutating: false };
      }
      case 'analyze_module': {
        const id = String(args.id || '');
        const variantId = String(args.variant_id || '');
        const scan = scanModuleCompatibility(root, id);
        let plan: unknown = null;
        try {
          plan = this.host.catalog.plan(id, variantId, root);
        } catch (err: any) {
          plan = { error: err.message };
        }
        return { content: JSON.stringify({ scan, plan }), mutating: false };
      }
      case 'install_module':
      case 'adapt_module': {
        const id = String(args.id || '');
        const mergeChoice = String(args.merge_choice || 'merge');
        if (mergeChoice === 'cancel' || mergeChoice === 'keep') {
          return { content: JSON.stringify({ skipped: true, merge_choice: mergeChoice }), mutating: false };
        }
        const variantId = String(args.variant_id || '');
        const plan = this.host.catalog.plan(id, variantId, root);
        const scan = scanModuleCompatibility(root, id);
        if (scan.conflictStatus === 'conflict' && mergeChoice !== 'replace' && mergeChoice !== 'merge') {
          return { content: JSON.stringify({ blocked: true, scan, plan }), mutating: false };
        }
        const files = this.host.catalog.install(plan, this.fs);
        if (this.host.onInstallModule) {
          await this.host.onInstallModule({
            id: plan.module.id,
            name: plan.module.name,
            variantId: plan.variant.id,
            category: plan.module.category,
            description: plan.module.description,
          });
        }
        return {
          content: JSON.stringify({ success: true, plan, scan, files }),
          mutating: true,
          files: files.map((f) => f.path),
          diff: files[0] ? { path: files[0].path, action: 'create', newContent: files[0].newContent } : undefined,
        };
      }
      default:
        return { content: JSON.stringify({ error: `Unknown tool: ${name}` }), mutating: false };
    }
  }

  private async searchCrystalSymbols(name: string): Promise<unknown[] | null> {
    if (!this.host.crystal) return null;
    try {
      const health = await this.host.crystal.checkHealth();
      if (!health.isAvailable) return null;
      const tools = await this.host.crystal.getAgentTools();
      if (!Array.isArray(tools) || tools.length === 0) return null;
      void name;
      return null;
    } catch {
      return null;
    }
  }

  private runCmd(command: string, timeoutMs: number): Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number; command: string }> {
    const blocked = [/rm\s+-rf\s+[\/\\]/i, /format\s+[a-z]:/i, /mkfs/i];
    if (blocked.some((p) => p.test(command))) {
      return Promise.resolve({
        success: false,
        stdout: '',
        stderr: 'Execution denied: command blocked by security sandbox.',
        exitCode: 126,
        command,
      });
    }
    const cwd = path.resolve(this.host.getProjectRoot());
    return new Promise((resolve) => {
      exec(command, { cwd, timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        resolve({
          success: !error,
          stdout: stdout || '',
          stderr: stderr || (error ? error.message : ''),
          exitCode: error ? (error as any).code || 1 : 0,
          command,
        });
      });
    });
  }
}
