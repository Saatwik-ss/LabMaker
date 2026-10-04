import { Router, Request, Response, NextFunction } from 'express';
import { AIHarness, normalizeLlmModel } from '@codex/ai-harness';
import { ProjectManager } from '../../core/ProjectManager';
import { CodexRuntime } from '../../core/CodexRuntime';

export interface ChatStreamRequestBody {
  message: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  /**
   * Unified entry point:
   * - 'auto' (default, recommended): single chat+agent mode. The LLM itself decides
   *   whether the query needs agentic mode and, if so, uses all MCP tools.
   *   Implemented by routing to the tool-capable agent loop, which answers
   *   directly (no tools) for pure Q&A and calls tools otherwise.
   * - 'chat' / 'agent': explicit manual overrides for the legacy split UI.
   */
  mode?: 'chat' | 'agent' | 'auto';
  model?: string;
  apiKey?: string;
  groqApiKey?: string;
  selectedFile?: string;
  selectedCode?: string;
  systemPrompt?: string;
  enablePlanning?: boolean;
}

const AVAILABLE_MODELS = [
  {
    id: 'llama-3.1-8b-instant',
    name: 'Llama 3.1 8B Instant',
    provider: 'Groq',
    default: true,
    description: 'Ultra-fast LPU inference (supported on all Groq tiers), instant code generation and reasoning.',
  },
  {
    id: 'llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B Versatile',
    provider: 'Groq',
    default: false,
    description: 'Deep reasoning, complex code generation and agent planning (Developer/Tier accounts).',
  },
  {
    id: 'mixtral-8x7b-32768',
    name: 'Mixtral 8x7B (32k)',
    provider: 'Groq',
    default: false,
    description: 'Mixture of Experts model with large 32k context window.',
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'Google',
    default: false,
    description: 'High-speed multimodal and complex code reasoning model.',
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenAI',
    default: false,
    description: 'Flagship reasoning and multi-step architecture planning model.',
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'OpenAI',
    default: false,
    description: 'Fast, lightweight general developer model.',
  },
];

export function createChatHandler(
  aiHarness: AIHarness,
  projectManager: ProjectManager,
  runtime?: CodexRuntime
): Router {
  const router = Router();

  // GET /api/chat/models - List supported LLM models
  router.get('/models', (req: Request, res: Response) => {
    res.json({
      models: AVAILABLE_MODELS,
      defaultModel: 'llama-3.3-70b-versatile',
    });
  });

  // POST /api/chat/stream - Server-Sent Events (SSE) streaming endpoint
  router.post('/stream', async (req: Request, res: Response, next: NextFunction) => {
    const body: ChatStreamRequestBody = req.body || {};
    const {
      message,
      conversationHistory = [],
      mode = 'auto',
      model = 'llama-3.1-8b-instant',
      apiKey,
      groqApiKey,
      selectedFile,
      selectedCode,
      systemPrompt,
      enablePlanning = false,
    } = body;

    const normalizedModel = normalizeLlmModel(model);

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Configure SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    let clientDisconnected = false;
    res.on('close', () => {
      if (!res.writableEnded) {
        clientDisconnected = true;
      }
    });

    const sendEvent = (event: any) => {
      if (clientDisconnected || res.writableEnded) return;
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch (err) {
        console.warn('Failed to send SSE chunk:', err);
      }
    };

    try {
      runtime?.bindActive();
      try {
        await runtime?.ensureIndexed();
      } catch {
        /* index is best-effort */
      }

      const activeProj = projectManager.getCurrentProject();
      const projectRoot = runtime?.projectManager.getWorkspaceRoot(activeProj.id);
      if (projectRoot) {
        aiHarness.setProjectRoot(projectRoot);
        aiHarness.setRepoId(activeProj.id);
      }

      const effectiveGroqKey = groqApiKey || activeProj?.credentials?.groqApiKey;
      if (effectiveGroqKey) {
        aiHarness.setCredentials({ groqApiKey: effectiveGroqKey });
      }
      if (apiKey) {
        aiHarness.setCredentials({ openaiApiKey: apiKey });
      }

      const isMutationRequest =
        /^(change|modify|update|edit|write|rewrite|replace)\s+(the\s+)?(content|text|code)\s+of\b/i.test(message.trim()) ||
        /^(create|write|add|delete|remove)\s+(a\s+|the\s+)?(file|component|route|service|module)\b/i.test(message.trim()) ||
        /^(change|update|edit|rewrite)\s+([a-zA-Z0-9_.-]+\.(md|ts|tsx|js|jsx|json|html|css))\b/i.test(message.trim());

      // Unified mode: 'auto' is the single chat+agent entry point. It always goes
      // through the tool-capable agent loop; the LLM decides per query whether
      // agentic mode is needed (tool calls) or a direct answer suffices (no tools).
      // Explicit 'agent' / legacy regex heuristics still force the agent path.
      const useAgentLoop = mode === 'auto' || mode === 'agent' || enablePlanning || isMutationRequest;

      if (useAgentLoop) {
        // UNIFIED / AGENT MODE: single tool-capable loop. The LLM decides whether
        // the query needs agentic tools or a direct answer.
        sendEvent({
          type: 'planning',
          content:
            mode === 'auto'
              ? 'Unified mode: LLM decides chat vs agentic path, with all MCP tools available...'
              : 'Starting Agent loop with codebase awareness...',
        });

        const agentResult = await aiHarness.executeCapability('cursor-agent', {
          prompt: message,
          type: 'feature',
          systemPrompt,
          model: normalizedModel,
          credentials: {
            openaiApiKey: apiKey,
            groqApiKey: effectiveGroqKey,
          },
          onChunk: (chunk: any) => {
            sendEvent(chunk);
          },
        });

        // Send changes diffs if present
        if (agentResult.changes && agentResult.changes.length > 0) {
          sendEvent({
            type: 'diffs',
            changes: agentResult.changes,
            summary: agentResult.summary,
            requestId: agentResult.requestId,
          });
        }

        sendEvent({
          type: 'end',
          summary: agentResult.summary,
          requestId: agentResult.requestId,
          changes: agentResult.changes || [],
        });
      } else {
        // CHAT / ASK MODE: Conversational assistant with token streaming
        sendEvent({
          type: 'planning',
          content: 'Analyzing codebase context...',
        });

        const chatOutput = await aiHarness.executeCapability('chat-assistant', {
          prompt: message,
          messages: conversationHistory,
          model: normalizedModel,
          apiKey,
          groqApiKey: effectiveGroqKey,
          selectedFile,
          selectedCode,
          systemPrompt,
          onChunk: (chunk: any) => {
            sendEvent(chunk);
          },
        });

        sendEvent({
          type: 'end',
          reply: chatOutput.reply,
          contextUsed: chatOutput.contextUsed,
          suggestedActions: chatOutput.suggestedActions,
        });
      }

      res.end();
    } catch (err: any) {
      if (!clientDisconnected) {
        sendEvent({
          type: 'error',
          error: err?.message || 'Chat stream failed',
        });
        res.end();
      }
    }
  });

  // POST /api/chat - Non-streaming JSON endpoint
  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body: ChatStreamRequestBody = req.body || {};
      const {
        message,
        conversationHistory = [],
        mode = 'auto',
        model = 'llama-3.1-8b-instant',
        apiKey,
        groqApiKey,
        selectedFile,
        selectedCode,
        systemPrompt,
      } = body;

      runtime?.bindActive();
      try {
        await runtime?.ensureIndexed();
      } catch {
        /* index is best-effort */
      }

      const activeProj = projectManager.getCurrentProject();
      const projectRoot = runtime?.projectManager.getWorkspaceRoot(activeProj.id);
      if (projectRoot) {
        aiHarness.setProjectRoot(projectRoot);
        aiHarness.setRepoId(activeProj.id);
      }

      const effectiveGroqKey = groqApiKey || activeProj?.credentials?.groqApiKey;
      if (effectiveGroqKey) {
        aiHarness.setCredentials({ groqApiKey: effectiveGroqKey });
      }
      if (apiKey) {
        aiHarness.setCredentials({ openaiApiKey: apiKey });
      }

      const normalizedModel = normalizeLlmModel(model);

      const isMutationRequest =
        /^(change|modify|update|edit|write|rewrite|replace)\s+(the\s+)?(content|text|code)\s+of\b/i.test(message.trim()) ||
        /^(create|write|add|delete|remove)\s+(a\s+|the\s+)?(file|component|route|service|module)\b/i.test(message.trim()) ||
        /^(change|update|edit|rewrite)\s+([a-zA-Z0-9_.-]+\.(md|ts|tsx|js|jsx|json|html|css))\b/i.test(message.trim());

      // Unified: 'auto' routes to the tool-capable loop; the LLM decides
      // chat (no tools) vs agentic (tools) per query.
      if (mode === 'auto' || mode === 'agent' || isMutationRequest) {
        const agentResult = await aiHarness.executeCapability('cursor-agent', {
          prompt: message,
          type: 'feature',
          systemPrompt,
          model: normalizedModel,
          credentials: {
            openaiApiKey: apiKey,
            groqApiKey: effectiveGroqKey,
          },
        });
        return res.json({ success: true, mode: 'auto', result: agentResult });
      }

      const chatOutput = await aiHarness.executeCapability('chat-assistant', {
        prompt: message,
        messages: conversationHistory,
        model: normalizedModel,
        apiKey,
        groqApiKey: effectiveGroqKey,
        selectedFile,
        selectedCode,
        systemPrompt,
      });

      return res.json({ success: true, ...chatOutput });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
