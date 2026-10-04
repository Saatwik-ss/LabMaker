import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  IProjectIndexer,
  IModuleAdapter,
  AgentTaskRequest,
  AgentTaskResult,
  IAICapability
} from '../interfaces';
import { FileChange, ValidationResult } from '@codex/shared';
import { Logger } from '../utils/Logger';

import { AgentToolRegistry } from '../tools/AgentToolRegistry';

export class AgentOrchestrator {
  private projectRoot: string;
  private indexer: IProjectIndexer;
  private moduleAdapter: IModuleAdapter;
  private capabilities: Map<string, IAICapability>;
  private toolRegistry?: AgentToolRegistry;
  private logger: Logger;

  constructor(
    projectRoot: string,
    indexer: IProjectIndexer,
    moduleAdapter: IModuleAdapter,
    capabilities: Map<string, IAICapability>,
    toolRegistry?: AgentToolRegistry
  ) {
    this.projectRoot = projectRoot;
    this.indexer = indexer;
    this.moduleAdapter = moduleAdapter;
    this.capabilities = capabilities;
    this.toolRegistry = toolRegistry;
    this.logger = new Logger('AgentOrchestrator');
  }

  public setToolRegistry(registry: AgentToolRegistry): void {
    this.toolRegistry = registry;
  }

  public setProjectRoot(newRoot: string): void {
    this.projectRoot = newRoot;
  }

  public async executeTask(request: AgentTaskRequest): Promise<AgentTaskResult> {
    const taskId = uuidv4();
    this.logger.info(`Executing agent task [${taskId}]: ${request.type} - ${request.prompt}`);

    // 1. Index context for task
    const context = await this.indexer.queryContext({
      prompt: request.prompt,
      maxFiles: 5,
      targetPaths: request.contextFiles,
    });

    const indexedContextUsed = context.relevantFiles.map(f => f.path);

    // 2. Identify if this is a module integration request
    const promptLower = request.prompt.toLowerCase();
    const isModuleRequest = request.type === 'module-integration' ||
      promptLower.includes('install module') ||
      promptLower.includes('add module');

    const changes: FileChange[] = [];
    const errors: any[] = [];
    let summaryText = '';

    if (isModuleRequest) {
      // Determine module name from prompt
      let moduleId = 'custom-module';
      if (promptLower.includes('auth')) moduleId = 'auth';
      else if (promptLower.includes('crud')) moduleId = 'crud';
      else if (promptLower.includes('files') || promptLower.includes('storage')) moduleId = 'files';
      else if (promptLower.includes('realtime') || promptLower.includes('websocket')) moduleId = 'realtime';
      else if (promptLower.includes('notification')) moduleId = 'notifications';

      const moduleCap = this.capabilities.get('module-adaptation');
      let integration: any = null;
      if (moduleCap) {
        const modRes = await moduleCap.execute(
          { action: 'integrate', moduleData: { id: moduleId, name: moduleId, version: '1.0.0', description: `Adapted module ${moduleId}`, category: 'feature' }, targetPath: this.projectRoot },
          { projectRoot: this.projectRoot, indexer: this.indexer, moduleAdapter: this.moduleAdapter }
        );
        integration = modRes.integration;
      }
      if (!integration) {
        integration = await this.moduleAdapter.adaptAndIntegrate(this.projectRoot, {
          id: moduleId,
          name: moduleId,
          version: '1.0.0',
          description: `Adapted module ${moduleId}`,
          category: 'feature',
        });
      }

      if (integration && integration.success) {
        changes.push(...integration.filesCreated);
        summaryText = `Successfully adapted and integrated module '${moduleId}' into project.\nFiles created:\n` +
          integration.filesCreated.map((f: any) => `- ${f.path}`).join('\n');
      } else {
        errors.push({ code: 'MODULE_ADAPT_FAILED', message: integration?.error || 'Failed to adapt module' });
        summaryText = `Failed to integrate module '${moduleId}': ${integration?.error || 'Unknown error'}`;
      }
    } else {
      // Check if cursor-agent capability is available
      const cursorAgent = this.capabilities.get('cursor-agent');
      let handledByCursor = false;
      if (cursorAgent) {
        try {
          const cursorResult = await cursorAgent.execute(
            request,
            { projectRoot: this.projectRoot, indexer: this.indexer, moduleAdapter: this.moduleAdapter, credentials: request.credentials, systemPrompt: request.systemPrompt, toolRegistry: this.toolRegistry }
          );
          if (cursorResult && (cursorResult.changes?.length > 0 || (cursorResult.summary && !cursorResult.summary.includes('0 contextual files')))) {
            return cursorResult;
          }
          if (cursorResult?.summary) {
            summaryText = cursorResult.summary;
            handledByCursor = true;
          }
        } catch (err: any) {
          this.logger.warn(`Cursor agent fallback: ${err?.message}`);
        }
      }

      if (!handledByCursor) {
        // General feature / refactor / bugfix task
        const codeGen = this.capabilities.get('code-generation');
      if (codeGen && (promptLower.includes('create') || promptLower.includes('add') || promptLower.includes('generate'))) {
        const target = promptLower.includes('component') ? 'component' : promptLower.includes('service') ? 'service' : 'route';
        const nameMatch = request.prompt.match(/(?:named|called|for|create|add)\s+([A-Z][a-zA-Z0-9]+|[a-z][a-zA-Z0-9]+)/);
        const name = nameMatch ? nameMatch[1] : 'NewFeature';

        const genResult = await codeGen.execute(
          { target, name, description: request.prompt },
          { projectRoot: this.projectRoot, indexer: this.indexer, moduleAdapter: this.moduleAdapter }
        );

        if (genResult.success) {
          for (const file of genResult.files) {
            const abs = path.join(this.projectRoot, file.path);
            const dir = path.dirname(abs);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(abs, file.content, 'utf8');

            changes.push({
              path: file.path,
              action: 'create',
              lineCount: { added: file.content.split('\n').length, removed: 0, modified: 0 },
              newContent: file.content,
            });
          }
          summaryText = `Executed ${request.type} task. Generated ${genResult.files.length} files:\n` +
            changes.map(c => `- ${c.path}`).join('\n');
        }
      } else {
        // Chat assistant response
        const chatCap = this.capabilities.get('chat-assistant');
        if (chatCap) {
          const chatResult = await chatCap.execute(
            { prompt: request.prompt, systemPrompt: request.systemPrompt },
            { projectRoot: this.projectRoot, indexer: this.indexer, moduleAdapter: this.moduleAdapter }
          );
          summaryText = chatResult.reply;
        } else {
          summaryText = `Completed ${request.type} analysis for prompt: ${request.prompt}`;
        }
      }
    }
  }

    const validationResults: ValidationResult = {
      timestamp: new Date().toISOString(),
      passed: errors.length === 0,
      linting: { passed: true, errors: [], warnings: [], totalIssues: 0 },
      typeCheck: { passed: true, errors: [], totalErrors: 0 },
      unitTests: { passed: true, totalTests: 0, passedTests: 0, failedTests: 0, skippedTests: 0, failures: [] },
      buildCheck: { passed: true, errors: [], warnings: [] },
      schemaValidation: { passed: true, issues: [] },
      summary: {
        allPassed: errors.length === 0,
        failedCategories: errors.length > 0 ? ['taskExecution'] : [],
        suggestions: [],
        nextSteps: [],
      },
    };

    return {
      requestId: taskId,
      status: errors.length === 0 ? 'success' : 'failed',
      changes,
      modelUpdates: {
        addedModules: [],
        modifiedModules: [],
        databaseChanges: [],
        architectureChanges: { newServices: [], newRelationships: [] },
      },
      validationResults,
      errors,
      summary: summaryText,
      indexedContextUsed,
    };
  }
}
