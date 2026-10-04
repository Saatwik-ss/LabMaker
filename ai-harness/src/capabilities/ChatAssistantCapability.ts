import * as path from 'path';
import { IAICapability, HarnessContext } from '../interfaces';
import { normalizeLlmModel, detectProjectDomain } from '../utils/ModelNormalizer';
import { TerminalExecutionCapability } from './TerminalExecutionCapability';
import { PipelineTestingCapability } from './PipelineTestingCapability';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatInput {
  prompt: string;
  messages?: ChatMessage[];
  contextFiles?: string[];
  systemPrompt?: string;
  model?: string;
  apiKey?: string;
  groqApiKey?: string;
  selectedFile?: string;
  selectedCode?: string;
  onToken?: (token: string) => void;
  onChunk?: (chunk: { type: string; content?: string; [key: string]: any }) => void;
}

export interface ChatOutput {
  reply: string;
  contextUsed: string[];
  suggestedActions: string[];
}

export class ChatAssistantCapability implements IAICapability<ChatInput, ChatOutput> {
  readonly id = 'chat-assistant';
  readonly name = 'Chat & Interactive Assistance';
  readonly description = 'Conversational developer assistant with deep codebase awareness, project indexing, and real-time LLM streaming.';

  async execute(input: ChatInput, context: HarnessContext): Promise<ChatOutput> {
    const effectivePrompt = input.prompt || (input as any).message || '';
    // QueryContext only searches an existing cache. Refresh the active workspace
    // first, otherwise ordinary questions such as "what files are present?"
    // incorrectly look like an empty project.
    const projectIndex = await context.indexer.indexProject(context.projectRoot);
    const contextQuery = await context.indexer.queryContext({
      prompt: effectivePrompt,
      maxFiles: 5,
      targetPaths: input.contextFiles,
    });

    const contextUsed = contextQuery.relevantFiles.map(f => f.path);
    const systemInstruction = input.systemPrompt || context.systemPrompt || 'You are Codex AI, an expert AI software architect and full-stack engineer.';

    // Resolve API key
    const effectiveKey = (
      input.groqApiKey ||
      input.apiKey ||
      context.credentials?.groqApiKey ||
      context.credentials?.openaiApiKey ||
      process.env.GROQ_API_KEY ||
      process.env.OPENAI_API_KEY ||
      ''
    ).trim();

    // If an API key is available, call the real LLM provider
    if (effectiveKey) {
      try {
        const streamResult = await this.streamFromLLM(input, effectiveKey, systemInstruction, contextQuery, projectIndex);
        return {
          reply: streamResult,
          contextUsed,
          suggestedActions: [
            'Explore Architecture Graph',
            'Review Module Integrations',
            'Run Project Validation',
          ],
        };
      } catch (err: any) {
        const errorMsg = `LLM Request failed: ${err?.message || 'Unknown network error'}. Falling back to application intelligence engine.`;
        input.onChunk?.({ type: 'content', content: errorMsg + '\n\n' });

        // Crystal owns the tool-calling agent loop (search, read, list, AST,
        // references, patch proposals, module analysis, and safe verification).
        // Use it as the first fallback instead of dropping to a generic reply.
        if (context.crystal && context.repoId) {
          try {
            const health = await context.crystal.checkHealth();
            if (health.isAvailable) {
              const crystalResult = await context.crystal.runAgentTask({
                message: effectivePrompt,
                repoId: context.repoId,
                selectedFile: input.selectedFile,
                selectedCode: input.selectedCode,
                apiKey: effectiveKey,
                model: input.model,
                systemPrompt: systemInstruction,
                enablePlanning: false,
                onChunk: input.onChunk,
              });
              if (crystalResult.success && crystalResult.summary) {
                return {
                  reply: crystalResult.summary,
                  contextUsed,
                  suggestedActions: ['Review retrieved context', 'Run project validation'],
                };
              }
            }
          } catch {
            // Local indexed fallback below remains available without Crystal.
          }
        }
      }
    }

    // Graceful offline fallback leveraging active codebase index & domain intelligence
    const domainInfo = detectProjectDomain(
      (contextQuery.stackSummary || '') + ' ' + (contextQuery.architectureSummary || '') + ' ' + effectivePrompt
    );
    let responseText = '';
    const promptLower = effectivePrompt.toLowerCase();

    const isGreeting = /^(hi|hello|hey|greetings|good\s+(morning|afternoon|evening)|yo|sup|who\s+are\s+you|help)[\s!.,?]*$/i.test(effectivePrompt.trim());

    const wantsFileList = /\b(what|which|show|list|display)\b[^?]*\b(files?|folders?|directory)\b|\bfiles?\s+(are|do)\b/i.test(effectivePrompt);

    if (wantsFileList) {
      const files = Array.from(projectIndex.files.keys()).sort();
      const visibleFiles = files.slice(0, 100);
      responseText = files.length === 0
        ? 'The active workspace is empty; no files were indexed.'
        : `### Files in the active workspace (${files.length})\n\n` +
          visibleFiles.map((file) => `- \`${file}\``).join('\n') +
          (files.length > visibleFiles.length ? `\n\n_Only the first ${visibleFiles.length} files are shown._` : '');
    } else if (isGreeting) {
      const appName = context.projectRoot ? path.basename(context.projectRoot) : 'Codex Application';
      responseText = `Hello! I am your Codex AI assistant tailored for **${appName}** (${domainInfo.domain} domain).\n\n` +
        `I am indexed with your active workspace and ready to help you:\n` +
        `- 📦 **Scaffold & Mount Modules**: Register modules in \`src/modules/\` and mount them in \`src/index.ts\`\n` +
        `- 🏗️ **Architecture & Services**: Add backend services, databases, and wire code connections\n` +
        `- ⚡ **Tailored Code Generation**: Write production-ready TypeScript routes, services, and domain models\n` +
        `- 🤖 **Cursor Coding Agent**: Plan, patch, and apply multi-file workspace changes\n\n` +
        `How can I assist you with **${appName}** today?`;
    } else if (promptLower.includes('architecture') || promptLower.includes('stack')) {
      responseText = `### Project Architecture & Stack Overview\n\n${contextQuery.stackSummary}\n\n${contextQuery.architectureSummary}\n\n**Indexed Active Endpoints:** ${contextQuery.routes.length} routes detected.\n`;
    } else if (
      promptLower.includes('pipeline') ||
      (promptLower.includes('test') && (promptLower.includes('module') || promptLower.includes('add') || promptLower.includes('whole')))
    ) {
      const isPreFlight = promptLower.includes('adding') || promptLower.includes('pre-flight') || promptLower.includes('before') || promptLower.includes('check');
      const modMatch = effectivePrompt.match(/(?:module|service)\s+([a-zA-Z0-9_-]+)/i) ||
                       effectivePrompt.match(/adding\s+([a-zA-Z0-9_-]+)/i);
      const modName = modMatch ? modMatch[1] : 'sample-module';

      const pipelineTester = new PipelineTestingCapability();
      const testResult = await pipelineTester.execute({
        stage: isPreFlight ? 'pre-flight' : 'full',
        module: { name: modName, type: 'services' },
      }, context);

      if (isPreFlight) {
        responseText = `### 🧪 Module Pre-Flight Compatibility Report (\`${modName}\`)\n\n` +
          `**Stage:** Pre-flight compatibility test prior to module addition\n` +
          `**Status:** ${testResult.preFlight?.compatible ? '✅ COMPATIBLE' : '❌ INCOMPATIBLE'}\n\n` +
          (testResult.preFlight?.issues.length ? `**Critical Issues:**\n${testResult.preFlight.issues.map(i => `- ❌ ${i}`).join('\n')}\n\n` : '') +
          (testResult.preFlight?.warnings.length ? `**Warnings:**\n${testResult.preFlight.warnings.map(w => `- ⚠️ ${w}`).join('\n')}\n\n` : '') +
          `**Recommendations:**\n${testResult.nextSteps.map(s => `- 💡 ${s}`).join('\n')}\n\n` +
          `> You can now proceed to install the module or configure requirements accordingly.`;
      } else {
        responseText = `### 🚀 Full Pipeline Validation & Health Report\n\n` +
          `**Stage:** Post-addition whole pipeline verification\n` +
          `**Overall Pipeline Verdict:** ${testResult.wholePipelineWorks ? '✅ WHOLE PIPELINE WORKS' : '⚠️ PIPELINE ISSUES DETECTED'}\n\n` +
          `| Pipeline Check | Status | Details |\n` +
          `|---|---|---|\n` +
          `| **TypeScript Types** | ${testResult.checks.typeCheck.passed ? '✅ Passed' : '❌ Failed'} | ${testResult.checks.typeCheck.errorCount} error(s) |\n` +
          `| **Unit Tests** | ${testResult.checks.unitTests.passed ? '✅ Passed' : '❌ Failed'} | ${testResult.checks.unitTests.passedCount}/${testResult.checks.unitTests.total || 0} passed |\n` +
          `| **Build Check** | ${testResult.checks.build.passed ? '✅ Passed' : '❌ Failed'} | ${testResult.checks.build.message} |\n` +
          `| **Database Schema** | ${testResult.checks.schema.passed ? '✅ Passed' : '❌ Failed'} | ${testResult.checks.schema.issues.length} issue(s) |\n` +
          `| **Module Health** | ${testResult.checks.moduleHealth.status === 'healthy' ? '✅ Healthy' : '⚠️ ' + testResult.checks.moduleHealth.status} | ${testResult.checks.moduleHealth.issues.length} issue(s) |\n\n` +
          `**Next Steps:**\n${testResult.nextSteps.map(s => `- ${s}`).join('\n')}`;
      }
    } else if (
      promptLower.startsWith('run ') ||
      promptLower.startsWith('terminal ') ||
      promptLower.startsWith('exec ') ||
      promptLower.includes('npm test') ||
      promptLower.includes('npm run build') ||
      promptLower.includes('git status')
    ) {
      let cmd = effectivePrompt
        .replace(/^run\s+(command\s+|terminal\s+)?/i, '')
        .replace(/^terminal\s+/i, '')
        .replace(/^exec\s+/i, '')
        .trim();
      if (!cmd) cmd = 'git status';

      const terminalExec = new TerminalExecutionCapability();
      const termResult = await terminalExec.execute({ command: cmd }, context);

      responseText = `### 💻 Terminal Execution Output\n\n` +
        `**Command:** \`${termResult.command}\`\n` +
        `**Exit Code:** \`${termResult.exitCode}\` (${termResult.success ? '✅ Success' : '❌ Failed'}) in \`${termResult.durationMs}ms\`\n\n` +
        `\`\`\`bash\n` +
        (termResult.stdout || termResult.stderr || '(no output)') +
        `\n\`\`\``;
    } else if (
      promptLower.includes('module') ||
      promptLower.includes('service') ||
      promptLower.includes('code') ||
      promptLower.includes('endpoint') ||
      promptLower.includes('create') ||
      promptLower.includes('add') ||
      promptLower.includes('optimize')
    ) {
      responseText = `### Application-Tailored Module Implementation (${domainInfo.domain.toUpperCase()})\n\n` +
        `Based on the target application context, here is the optimized, production-ready implementation tailored to your stack:\n\n` +
        `\`\`\`typescript\n` +
        `import { Router, Request, Response, NextFunction } from 'express';\n\n` +
        `// Domain Entity: ${domainInfo.entityName}\n` +
        `export interface ${domainInfo.entityName} {\n` +
        `  id: string;\n` +
        `  ${domainInfo.keyConcepts[0] || 'identifier'}: string;\n` +
        `  ${domainInfo.keyConcepts[1] || 'payload'}: any;\n` +
        `  status: 'active' | 'processing' | 'completed' | 'failed';\n` +
        `  timestamp: string;\n` +
        `}\n\n` +
        `export class ${domainInfo.entityName}Service {\n` +
        `  private records: Map<string, ${domainInfo.entityName}> = new Map();\n\n` +
        `  public async process(data: Partial<${domainInfo.entityName}>): Promise<${domainInfo.entityName}> {\n` +
        `    const id = data.id || \`${domainInfo.entityName.toLowerCase()}-\${Date.now()}\`;\n` +
        `    const item: ${domainInfo.entityName} = {\n` +
        `      id,\n` +
        `      ${domainInfo.keyConcepts[0] || 'identifier'}: data.${domainInfo.keyConcepts[0] || 'identifier'} || 'default',\n` +
        `      ${domainInfo.keyConcepts[1] || 'payload'}: data.${domainInfo.keyConcepts[1] || 'payload'} || {},\n` +
        `      status: 'active',\n` +
        `      timestamp: new Date().toISOString(),\n` +
        `    };\n` +
        `    this.records.set(id, item);\n` +
        `    return item;\n` +
        `  }\n\n` +
        `  public list(): ${domainInfo.entityName}[] {\n` +
        `    return Array.from(this.records.values());\n` +
        `  }\n` +
        `}\n\n` +
        `export const service = new ${domainInfo.entityName}Service();\n` +
        `export const router = Router();\n\n` +
        `router.get('/', (req: Request, res: Response) => res.json({ success: true, data: service.list() }));\n` +
        `router.post('/', async (req: Request, res: Response, next: NextFunction) => {\n` +
        `  try {\n` +
        `    const item = await service.process(req.body);\n` +
        `    res.status(201).json({ success: true, item });\n` +
        `  } catch (err) {\n` +
        `    next(err);\n` +
        `  }\n` +
        `});\n` +
        `\`\`\`\n\n` +
        `This component is optimized for **${domainInfo.domain}** operations and can be registered as a module or imported into \`src/index.ts\`.`;
    } else {
      responseText = `Understood. Based on your active application context (${contextQuery.stackSummary || 'TypeScript workspace'}), I evaluated your request: "${effectivePrompt}".\n\n` +
        (contextUsed.length > 0
          ? `Relevant codebase files identified:\n${contextUsed.map((f: any) => `- \`${f}\``).join('\n')}\n\nReady to help you implement, optimize, or test features tailored to this stack.`
          : `Ready to assist with code generation, module creation, refactoring, or architectural modifications.`);
    }

    if (!effectiveKey) {
      responseText += '\n\n> **Tip:** Add your Groq API Key or OpenAI API Key in Settings to enable live multi-turn LLM streaming.';
    }

    if (input.onChunk) {
      input.onChunk?.({ type: 'content', content: responseText });
    }

    return {
      reply: responseText,
      contextUsed,
      suggestedActions: [
        'Explore Architecture Graph',
        'Review Module Integrations',
        'Run Project Validation',
      ],
    };
  }

  private async streamFromLLM(
    input: ChatInput,
    apiKey: string,
    systemInstruction: string,
    contextQuery: any,
    projectIndex?: any
  ): Promise<string> {
    // Determine provider & endpoint
    let endpoint = 'https://api.groq.com/openai/v1/chat/completions';
    let defaultModel = 'llama-3.1-8b-instant';

    if (apiKey.startsWith('sk-') && !apiKey.startsWith('gsk_')) {
      endpoint = 'https://api.openai.com/v1/chat/completions';
      defaultModel = 'gpt-4o-mini';
    } else if (apiKey.startsWith('AIzaSy')) {
      endpoint = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
      defaultModel = 'gemini-2.5-flash';
    }

    const requestedModel = normalizeLlmModel(input.model, defaultModel);

    // Build candidate fallback models list
    const candidateModels: string[] = [requestedModel];
    if (endpoint.includes('groq.com')) {
      const groqFallbacks = ['llama-3.1-8b-instant', 'openai/gpt-oss-120b', 'qwen/qwen3.6-27b', 'mixtral-8x7b-32768'];
      for (const fb of groqFallbacks) {
        if (!candidateModels.includes(fb)) {
          candidateModels.push(fb);
        }
      }
    } else if (endpoint.includes('openai.com')) {
      if (!candidateModels.includes('gpt-4o-mini')) candidateModels.push('gpt-4o-mini');
    }

    const effectivePrompt = input.prompt || (input as any).message || '';
    const wantsFileList = /\b(what|which|show|list|display)\b[^?]*\b(files?|folders?|directory|workspace)\b|\bfiles?\s+(are|do|present|in)\b/i.test(effectivePrompt);

    // Compose clean system prompt
    const rawInstruction = (input.systemPrompt || systemInstruction || 'You are Codex AI, an expert software architect and full-stack engineer.').trim();
    const systemParts = [
      rawInstruction,
      `Stack: ${contextQuery.stackSummary || 'TypeScript / Full-stack'}`,
      `Architecture: ${contextQuery.architectureSummary || 'Modular'}`,
    ];

    const allFiles = projectIndex?.files ? Array.from(projectIndex.files.keys()) as string[] : [];
    if (wantsFileList && allFiles.length > 0) {
      systemParts.push(`Workspace files in active project (${allFiles.length}):\n${allFiles.slice(0, 100).map((f: string) => `- ${f}`).join('\n')}`);
    } else if (allFiles.length > 0) {
      systemParts.push(`Workspace files: ${allFiles.slice(0, 25).join(', ')}`);
    }

    if (input.selectedFile) {
      systemParts.push(`Active file: ${input.selectedFile}`);
    }
    if (contextQuery.relevantFiles && contextQuery.relevantFiles.length > 0) {
      systemParts.push(`Context files: ${contextQuery.relevantFiles.slice(0, 3).map((f: any) => f.path).join(', ')}`);
    }

    systemParts.push('Provide concise, production-ready code with language tags and direct technical solutions.');

    let cleanSystemPrompt = systemParts.join('\n\n').trim();
    if (!wantsFileList) {
      const sysWords = cleanSystemPrompt.split(/\s+/);
      if (sysWords.length > 140) {
        cleanSystemPrompt = sysWords.slice(0, 140).join(' ');
      }
    }

    const promptMessages: Array<{ role: string; content: string }> = [
      { role: 'system', content: cleanSystemPrompt }
    ];

    if (input.messages && input.messages.length > 0) {
      for (const m of input.messages) {
        promptMessages.push({ role: m.role, content: m.content });
      }
    }

    // Prepare user prompt with attached code snippet if present
    let finalUserPrompt = input.prompt;
    if (input.selectedCode) {
      const codeSnippet = input.selectedCode.length > 1500 ? input.selectedCode.slice(0, 1500) + '...' : input.selectedCode;
      finalUserPrompt = `Context code (${input.selectedFile || 'current file'}):\n\`\`\`\n${codeSnippet}\n\`\`\`\n\n${input.prompt}`;
    }

    // Append current prompt if not redundant with last message
    const lastMsg = promptMessages[promptMessages.length - 1];
    if (!lastMsg || lastMsg.role !== 'user' || lastMsg.content !== finalUserPrompt) {
      promptMessages.push({ role: 'user', content: finalUserPrompt });
    }

    let lastError: Error | null = null;

    for (let i = 0; i < candidateModels.length; i++) {
      const currentModel = candidateModels[i];
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: currentModel,
            messages: promptMessages,
            stream: true,
            temperature: 0.6,
            max_tokens: 2048,
          }),
        });

        if (!response.ok) {
          const errBody = await response.text();
          const isModelUnavailable = response.status === 404 ||
            errBody.includes('model_not_found') ||
            errBody.includes('does not exist') ||
            errBody.includes('do not have access');

          if (isModelUnavailable && i < candidateModels.length - 1) {
            console.warn(`Model ${currentModel} returned ${response.status}. Automatically retrying with fallback model ${candidateModels[i + 1]}...`);
            continue;
          }
          throw new Error(`API returned ${response.status}: ${errBody}`);
        }

        if (!response.body) {
          throw new Error('Response body is empty');
        }

        if (i > 0) {
          input.onChunk?.({
            type: 'content',
            content: `*(Model \`${candidateModels[0]}\` unavailable on this tier. Automatically connected using \`${currentModel}\`)*\n\n`
          });
        }

        let fullReply = '';
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) continue;
            if (trimmed === 'data: [DONE]') continue;

            if (trimmed.startsWith('data: ')) {
              try {
                const data = JSON.parse(trimmed.slice(6));
                const delta = data.choices?.[0]?.delta?.content;
                if (delta) {
                  fullReply += delta;
                  input.onToken?.(delta);
                  input.onChunk?.({ type: 'content', content: delta });
                }
              } catch {
                // Ignore parse errors on partial chunks
              }
            }
          }
        }

        return fullReply;
      } catch (err: any) {
        lastError = err;
        if (i === candidateModels.length - 1) {
          throw err;
        }
      }
    }

    throw lastError || new Error('All model attempts failed');
  }
}
