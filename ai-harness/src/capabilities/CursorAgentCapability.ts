import { IAICapability, HarnessContext, AgentTaskRequest, AgentTaskResult } from '../interfaces';
import { CrystalBridge, AgentStreamChunk } from '../crystal/CrystalBridge';
import { Logger } from '../utils/Logger';
import { normalizeLlmModel } from '../utils/ModelNormalizer';
import { AgentToolRegistry } from '../tools/AgentToolRegistry';
import { ValidationResult, FileChange } from '@codex/shared';

export interface CursorAgentInput extends AgentTaskRequest {
  onChunk?: (chunk: AgentStreamChunk) => void;
  model?: string;
}

const MAX_TOOL_ROUNDS = 12;
const MAX_VALIDATE_RETRIES = 3;

interface ChatMsg {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
}

export class CursorAgentCapability implements IAICapability<CursorAgentInput, AgentTaskResult> {
  readonly id = 'cursor-agent';
  readonly name = 'Cursor Coding Agent';
  readonly description = 'Autonomous tool-calling agent: retrieve related files/modules, read/write workspace code, run tests, adapt catalog modules.';

  private crystal: CrystalBridge;
  private logger: Logger;

  constructor(crystalBridge?: CrystalBridge) {
    this.crystal = crystalBridge || new CrystalBridge();
    this.logger = new Logger('CursorAgentCapability');
  }

  async execute(input: CursorAgentInput, context: HarnessContext): Promise<AgentTaskResult> {
    const requestId = `agent-${Date.now()}`;
    const registry = context.toolRegistry as AgentToolRegistry | undefined;
    if (!registry) {
      return this.failed(requestId, 'Agent tool registry is not attached');
    }

    input.onChunk?.({
      type: 'planning',
      content: 'Retrieving related project files and catalog modules...',
    });

    const related = await registry.execute('query_context', { prompt: input.prompt, max_files: 8 });
    const modules = await registry.execute('search_modules', { query: input.prompt });

    input.onChunk?.({
      type: 'planning',
      goal: input.prompt,
      todos: [
        { id: '1', title: 'Retrieve related files and stock modules', status: 'completed' },
        { id: '2', title: 'Apply minimal file/module changes via tools', status: 'in_progress' },
        { id: '3', title: 'Validate (lint, types, tests) and retry if needed', status: 'pending' },
      ],
    });

    const key = (
      input.credentials?.groqApiKey ||
      input.credentials?.openaiApiKey ||
      context.credentials?.groqApiKey ||
      context.credentials?.openaiApiKey ||
      process.env.GROQ_API_KEY ||
      process.env.OPENAI_API_KEY ||
      ''
    ).trim();

    const changes: FileChange[] = [];
    let summary = '';
    let validation = this.emptyValidation(false, 'Validation not run yet');

    if (!key) {
      summary = 'No LLM API key configured. Retrieved context only — set a Groq or OpenAI key to let the agent write files.';
      input.onChunk?.({ type: 'message', content: summary + '\n\nRelated context:\n' + related.content.slice(0, 4000) });
      return this.result(requestId, 'failed', changes, summary, validation, [related.content, modules.content]);
    }

    const system = input.systemPrompt || context.systemPrompt || this.defaultSystem();
    const messages: ChatMsg[] = [
      { role: 'system', content: system },
      {
        role: 'user',
        content:
          `Task:\n${input.prompt}\n\n` +
          `Related project files (truncated JSON):\n${related.content.slice(0, 12000)}\n\n` +
          `Matching catalog modules:\n${modules.content.slice(0, 4000)}\n\n` +
          `UNIFIED MODE: decide first whether this needs agentic mode. If it is a pure question, answer directly with no tools.` +
          ` If it needs code/module/graph changes, use AGENTIC MODE with all 22 MCP tools: recall via query_context/search_modules/get_module, define placement via analyze_module, install via adapt_module/install_module with minimal fitting edits via edit_file (prefer over write_file), sync via update_architecture,` +
          ` then validate via run_typecheck and run_tests (21 MCP tools total, same list as tools/list).`,
      },
    ];

    const tools = registry.listDefinitions();
    const requestedModel = typeof input.model === 'string' ? input.model : undefined;
    const { endpoint, headers, model } = this.resolveProvider(key, requestedModel);

    let wrote = false;
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const assistant = await this.complete(endpoint, headers, model, messages, tools);
      if (!assistant) break;

      const toolCalls = assistant.tool_calls || [];
      messages.push({
        role: 'assistant',
        content: assistant.content || null,
        tool_calls: toolCalls.length ? toolCalls : undefined,
      });

      if (assistant.content) {
        input.onChunk?.({ type: 'message', content: assistant.content });
        summary = assistant.content;
      }

      if (!toolCalls.length) break;

      for (const call of toolCalls) {
        const name = call.function?.name || call.name;
        let args: Record<string, unknown> = {};
        try {
          args = typeof call.function?.arguments === 'string'
            ? JSON.parse(call.function.arguments || '{}')
            : (call.function?.arguments || call.arguments || {});
        } catch {
          args = {};
        }
        input.onChunk?.({ type: 'tool_call', name, arguments: args });
        const toolResult = await registry.execute(name, args);
        input.onChunk?.({ type: 'tool_result', name, result: toolResult.content.slice(0, 4000) });
        if (toolResult.diff) {
          const action = (toolResult.diff.action || 'modify') as 'create' | 'modify' | 'delete';
          const newContent = toolResult.diff.newContent;
          changes.push({
            path: toolResult.diff.path,
            action,
            newContent,
            lineCount: {
              added: newContent ? newContent.split('\n').length : 0,
              removed: 0,
              modified: action === 'modify' ? 1 : 0,
            },
          });
          wrote = true;
          input.onChunk?.({
            type: 'diff',
            path: toolResult.diff.path,
            proposed: newContent,
            action,
          });
        }
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          name,
          content: toolResult.content.slice(0, 12000),
        });
      }
    }

    if (wrote) {
      validation = await this.validateWithRetries(registry, input, messages, endpoint, headers, model, tools);
    } else {
      validation = this.emptyValidation(true, 'No file mutations; skipped validation');
    }

    if (changes.length) {
      input.onChunk?.({
        type: 'diffs',
        changes,
        summary: summary || `Applied ${changes.length} file change(s).`,
        requestId,
      });
    }

    input.onChunk?.({
      type: 'message',
      content: validation.passed
        ? `### Agent completed\n\n${summary || 'Changes applied.'}\n\nValidation passed.`
        : `### Agent completed with validation issues\n\n${validation.summary.suggestions.join('\n')}`,
    });

    return this.result(
      requestId,
      validation.passed || changes.length ? 'success' : 'failed',
      changes,
      summary || `Agent finished (${changes.length} file changes)`,
      validation,
      []
    );
  }

  private defaultSystem(): string {
    return [
      'You are Codex, a unified chat + autonomous coding agent with 21 workspace tools. You decide per query whether agentic mode is needed.',
      'MODE DECISION (do this first, every turn):',
      '- Pure Q&A / explanation / architecture overview / "what files exist" -> answer DIRECTLY with no tool calls, using the Related project files + Matching catalog modules context already provided.',
      '- Anything that creates, modifies, deletes, installs, adapts, validates, or inspects beyond the provided context -> AGENTIC MODE: you MUST use tools. Never just print code when the user asked to add/change it; call the tools.',
      '',
      'TOOL RETENTION — all 21 tools are always available, grouped as:',
      '- File ops: read_file, write_file (new files/full rewrites only), edit_file (PREFER for existing files: exact-substring minimal diffs), delete_file, list_directory.',
      '- Recall / intel (ALWAYS prefer over guessing): query_context (top related project files for a prompt), search_symbol, get_imports_exports, find_routes, get_application_model (stack, modules, architecture, incl. graph-added nodes).',
      '- Modules (building blocks — prefer over writing big blocks yourself): search_modules (keyword/stack search over catalog + installed), get_module (variants + status), analyze_module (compatibility scan + plan + conflicts), install_module (copy source when ready; stub registers placement), adapt_module (minimal path/import adaptation, then install).',
      '- App model: update_architecture (record graph/code-added nodes: add_node/add_edge/remove_node).',
      '- Execution / validation: run_command (sandboxed), run_typecheck, run_tests, run_linter, run_build.',
      '',
      'MINIMAL-CHANGE MODULE WORKFLOW (mandatory when the request involves a stock module, by graph, code, or chat):',
      '1. query_context + search_modules to recall top related project files AND top related catalog modules.',
      '2. get_module for the best candidate (check variants/stack/fileCount).',
      '3. analyze_module to define its place: compatibility, conflicts, required packages, merge choices (keep/merge/replace/cancel). If conflict, surface merge_choice and never silently overwrite.',
      '4. Prefer adapt_module/install_module over hand-writing the module. Then make only the minimal fitting edits with edit_file (imports, mount snippet, paths) so it fits the current project.',
      '5. After any write/edit/install/adapt: run_typecheck then run_tests (then run_linter/run_build when relevant). Fix failures with further minimal edit_file calls (max 3 retries).',
      '6. Call update_architecture when you added/removed a service, module, or relationship so graph, editor, and modules stay in sync.',
      '',
      'RULES:',
      '- Always use relative workspace paths (e.g. README.md, src/index.ts). Never invent absolute paths.',
      '- Use read_file/list_directory before editing files you have not seen via query_context.',
      '- Prefer edit_file over write_file for existing files.',
      '- You may call multiple tools per round; chain: recall -> analyze -> install/adapt -> edit -> validate.',
      '- If no file mutation occurred, skip validation and answer conversationally.',
    ].join('\n');
  }

  private resolveProvider(apiKey: string, requestedModel?: string): { endpoint: string; headers: Record<string, string>; model: string } {
    const model = normalizeLlmModel(requestedModel || 'llama-3.1-8b-instant');
    const isOpenAi = model.startsWith('gpt-') || apiKey.startsWith('sk-') && !apiKey.startsWith('gsk_');
    if (isOpenAi && (model.startsWith('gpt-') || requestedModel?.startsWith('gpt-'))) {
      return {
        endpoint: 'https://api.openai.com/v1/chat/completions',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        model: model.startsWith('gpt-') ? model : 'gpt-4o-mini',
      };
    }
    return {
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      model: model.startsWith('gpt-') ? 'llama-3.1-8b-instant' : model,
    };
  }

  private async complete(
    endpoint: string,
    headers: Record<string, string>,
    model: string,
    messages: ChatMsg[],
    tools: unknown[]
  ): Promise<{ content?: string; tool_calls?: any[] } | null> {
    const candidateModels = [model];
    if (endpoint.includes('groq.com')) {
      const groqFallbacks = ['llama-3.1-8b-instant', 'openai/gpt-oss-120b', 'qwen/qwen3.6-27b', 'llama-3.3-70b-versatile', 'mixtral-8x7b-32768'];
      for (const fb of groqFallbacks) {
        if (!candidateModels.includes(fb)) candidateModels.push(fb);
      }
    } else if (endpoint.includes('openai.com')) {
      if (!candidateModels.includes('gpt-4o-mini')) candidateModels.push('gpt-4o-mini');
    }

    let lastError: Error | null = null;
    for (let i = 0; i < candidateModels.length; i++) {
      const currentModel = candidateModels[i];
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: currentModel,
            messages,
            tools,
            tool_choice: 'auto',
            temperature: 0.2,
            max_tokens: 4096,
          }),
        });
        if (!response.ok) {
          const text = await response.text();
          const isModelUnavailable = response.status === 404 ||
            text.includes('model_not_found') ||
            text.includes('does not exist') ||
            text.includes('do not have access') ||
            text.includes('deprecated');
          if (isModelUnavailable && i < candidateModels.length - 1) {
            this.logger.warn(`Model ${currentModel} returned ${response.status}. Retrying with fallback ${candidateModels[i + 1]}...`);
            continue;
          }
          this.logger.warn(`LLM error ${response.status}: ${text.slice(0, 400)}`);
          throw new Error(`LLM request failed (${response.status}): ${text.slice(0, 200)}`);
        }
        const data = await response.json();
        return data.choices?.[0]?.message || null;
      } catch (err: any) {
        lastError = err;
        if (i === candidateModels.length - 1) {
          throw err;
        }
      }
    }
    throw lastError || new Error('All model attempts failed');
  }

  private async validateWithRetries(
    registry: AgentToolRegistry,
    input: CursorAgentInput,
    messages: ChatMsg[],
    endpoint: string,
    headers: Record<string, string>,
    model: string,
    tools: unknown[]
  ): Promise<ValidationResult> {
    let last = await this.runValidation(registry, input);
    for (let attempt = 0; attempt < MAX_VALIDATE_RETRIES && !last.passed; attempt++) {
      input.onChunk?.({
        type: 'planning',
        content: `Validation failed (attempt ${attempt + 1}/${MAX_VALIDATE_RETRIES}). Asking the model to fix errors.`,
      });
      messages.push({
        role: 'user',
        content: `Validation failed. Fix the errors with minimal edits, then re-run tools.\n${JSON.stringify({
          lint: last.linting,
          typeCheck: last.typeCheck,
          tests: last.unitTests,
        }).slice(0, 8000)}`,
      });
      const assistant = await this.complete(endpoint, headers, model, messages, tools);
      if (!assistant) break;
      const toolCalls = assistant.tool_calls || [];
      messages.push({ role: 'assistant', content: assistant.content || null, tool_calls: toolCalls.length ? toolCalls : undefined });
      if (!toolCalls.length) break;
      for (const call of toolCalls) {
        const name = call.function?.name || call.name;
        let args: Record<string, unknown> = {};
        try {
          args = typeof call.function?.arguments === 'string' ? JSON.parse(call.function.arguments || '{}') : {};
        } catch {
          args = {};
        }
        const toolResult = await registry.execute(name, args);
        messages.push({ role: 'tool', tool_call_id: call.id, name, content: toolResult.content.slice(0, 8000) });
      }
      last = await this.runValidation(registry, input);
    }
    return last;
  }

  private async runValidation(registry: AgentToolRegistry, input: CursorAgentInput): Promise<ValidationResult> {
    const typeCheck = JSON.parse((await registry.execute('run_typecheck', {})).content);
    const tests = JSON.parse((await registry.execute('run_tests', {})).content);
    const lint = JSON.parse((await registry.execute('run_linter', {})).content);

    input.onChunk?.({
      type: 'terminal',
      terminal: {
        command: typeCheck.command || 'npx tsc --noEmit',
        returncode: typeCheck.exitCode ?? (typeCheck.passed ? 0 : 1),
        stdout: (typeCheck.stdout || '').slice(0, 2000),
        stderr: (typeCheck.stderr || '').slice(0, 2000),
      },
    });

    const typePassed = !!typeCheck.passed;
    const testPassed = !!tests.passed;
    const lintPassed = !!lint.passed;
    const passed = typePassed && testPassed && lintPassed;
    const failedCategories: string[] = [];
    if (!lintPassed) failedCategories.push('lint');
    if (!typePassed) failedCategories.push('typecheck');
    if (!testPassed) failedCategories.push('tests');

    const typeErrors = String(typeCheck.stderr || typeCheck.stdout || '')
      .split('\n')
      .filter((l: string) => l.includes('error TS'))
      .map((message: string) => ({ file: '', line: 0, column: 0, code: 'TS', message }));

    return {
      timestamp: new Date().toISOString(),
      passed,
      linting: {
        passed: lintPassed,
        errors: lintPassed ? [] : [{ file: 'workspace', line: 0, column: 0, rule: 'lint', message: (lint.stderr || lint.error || 'lint failed').slice(0, 500), severity: 'error' }],
        warnings: [],
        totalIssues: lintPassed ? 0 : 1,
      },
      typeCheck: { passed: typePassed, errors: typeErrors, totalErrors: typeErrors.length },
      unitTests: {
        passed: testPassed,
        totalTests: testPassed ? 1 : 1,
        passedTests: testPassed ? 1 : 0,
        failedTests: testPassed ? 0 : 1,
        skippedTests: 0,
        failures: testPassed ? [] : [{ testName: 'npm test', error: (tests.stderr || 'tests failed').slice(0, 500) }],
      },
      buildCheck: { passed: true, errors: [], warnings: ['Build not run in the default validation loop'] },
      schemaValidation: { passed: true, issues: [] },
      summary: {
        allPassed: passed,
        failedCategories,
        suggestions: failedCategories.map((c) => `Fix ${c} failures reported by the validator.`),
        nextSteps: passed ? ['Review diffs in the editor and architecture graph.'] : ['Inspect tool output and retry.'],
      },
    };
  }

  private emptyValidation(passed: boolean, note: string): ValidationResult {
    return {
      timestamp: new Date().toISOString(),
      passed,
      linting: { passed, errors: [], warnings: [], totalIssues: 0 },
      typeCheck: { passed, errors: [], totalErrors: 0 },
      unitTests: { passed, totalTests: 0, passedTests: 0, failedTests: 0, skippedTests: 0, failures: [] },
      buildCheck: { passed, errors: [], warnings: [] },
      schemaValidation: { passed: true, issues: [] },
      summary: {
        allPassed: passed,
        failedCategories: passed ? [] : ['setup'],
        suggestions: [note],
        nextSteps: [],
      },
    };
  }

  private failed(requestId: string, message: string): AgentTaskResult {
    return this.result(requestId, 'failed', [], message, this.emptyValidation(false, message), []);
  }

  private result(
    requestId: string,
    status: 'success' | 'failed' | 'partial',
    changes: AgentTaskResult['changes'],
    summary: string,
    validationResults: ValidationResult,
    indexed: string[]
  ): AgentTaskResult {
    return {
      requestId,
      status,
      changes,
      modelUpdates: {
        addedModules: [],
        modifiedModules: [],
        databaseChanges: [],
        architectureChanges: { newServices: [], newRelationships: [] },
      },
      validationResults,
      errors: status === 'failed' ? [{ code: 'AGENT_ERROR', message: summary, severity: 'error' }] : [],
      summary,
      indexedContextUsed: indexed,
    };
  }
}
