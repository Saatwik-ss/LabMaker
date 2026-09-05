import { Router, Request, Response, NextFunction } from 'express';
import { CodexRuntime } from '../core/CodexRuntime';

import { createAgentHandler } from './handlers/AgentHandler';
import { createModelHandler } from './handlers/ModelHandler';
import { createModuleHandler } from './handlers/ModuleHandler';
import { createFileHandler } from './handlers/FileHandler';
import { createValidationHandler } from './handlers/ValidationHandler';
import { createSettingsHandler } from './handlers/SettingsHandler';
import { createProjectHandler } from './handlers/ProjectHandler';
import { createChatHandler } from './handlers/ChatHandler';
import { createTerminalHandler } from './handlers/TerminalHandler';

export function createApiRouter(): Router {
  const router = Router();
  const runtime = new CodexRuntime();
  const {
    projectManager,
    fileOperations,
    orchestrator,
    moduleManager,
    validator,
    aiHarness,
    editSnapshots,
  } = {
    projectManager: runtime.projectManager,
    fileOperations: runtime.fileOps,
    orchestrator: runtime.orchestrator,
    moduleManager: runtime.moduleManager,
    validator: runtime.validator,
    aiHarness: runtime.aiHarness,
    editSnapshots: runtime.editSnapshots,
  };

  runtime.bindActive();

  router.use((req, _res, next) => {
    runtime.bindActive();
    next();
  });

  router.use('/projects', createProjectHandler(projectManager, runtime));
  router.use('/chat', createChatHandler(aiHarness, projectManager, runtime));
  router.use('/agent', createAgentHandler(orchestrator, aiHarness));
  router.use('/model', createModelHandler(runtime));
  router.use('/modules', createModuleHandler(moduleManager, projectManager, aiHarness.moduleAdapter, runtime));
  router.use('/files', createFileHandler(fileOperations, editSnapshots));
  router.use('/validate', createValidationHandler(validator));
  router.use('/settings', createSettingsHandler(runtime.codexRoot));
  router.use('/terminal', createTerminalHandler(runtime));

  const aiRouter = Router();
  aiRouter.get('/capabilities', (_req: Request, res: Response) => {
    res.json({ capabilities: aiHarness.listCapabilities() });
  });

  // The same schemas Crystal gives its function-calling agent. The UI can use
  // these to explain exactly which workspace actions the active LLM may take.
  aiRouter.get('/tools', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const health = await aiHarness.crystal.checkHealth();
      if (health.isAvailable) {
        return res.json({ source: 'crystal', tools: await aiHarness.crystal.getAgentTools() });
      }
      return res.json({ source: 'harness', tools: aiHarness.listCapabilities() });
    } catch (err) {
      next(err);
    }
  });

  aiRouter.post('/capabilities/:id/execute', async (req: Request, res: Response, next: NextFunction) => {
    try {
      runtime.bindActive();
      const { id } = req.params;
      const output = await aiHarness.executeCapability(id, req.body);
      res.json({ success: true, capabilityId: id, output });
    } catch (err) {
      next(err);
    }
  });

  aiRouter.post('/index', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await runtime.indexActive();
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  });

  aiRouter.get('/index-status', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const { repoId } = runtime.bindActive();
      try {
        const status = await aiHarness.crystal.getIndexStatus(repoId);
        return res.json(status);
      } catch {
        return res.json({ status: 'unknown', repo_id: repoId });
      }
    } catch (err) {
      next(err);
    }
  });

  aiRouter.get('/context', async (req: Request, res: Response, next: NextFunction) => {
    try {
      runtime.bindActive();
      const q = (req.query.q as string) || '';
      const context = await aiHarness.indexer.queryContext({ prompt: q });
      res.json(context);
    } catch (err) {
      next(err);
    }
  });

  aiRouter.get('/architecture', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const { workspaceRoot } = runtime.bindActive();
      const graph = await aiHarness.indexer.getArchitectureGraph(workspaceRoot);
      res.json(graph);
    } catch (err) {
      next(err);
    }
  });

  aiRouter.get('/health', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const health = await aiHarness.crystal.checkHealth();
      res.json(health);
    } catch (err) {
      next(err);
    }
  });

  aiRouter.post('/complete', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { repoId, workspaceRoot } = runtime.bindActive();
      const { filePath, prefix, suffix, language, line, column } = req.body || {};

      const crystalHealth = await aiHarness.crystal.checkHealth();
      if (crystalHealth.isAvailable && prefix) {
        const crystal = await aiHarness.crystal.completeCode({
          repoId,
          prompt: prefix,
          filePath,
          language,
          suffix,
        });
        if (crystal.text) {
          return res.json({ text: crystal.text, source: 'crystal' });
        }
      }

      const output = await aiHarness.executeCapability('autocomplete', {
        filePath: filePath || 'src/index.ts',
        prefix: prefix || '',
        line: line || 1,
        column: column || 1,
      });
      const text = output?.suggestions?.[0]?.text || '';
      res.json({ text, suggestions: output?.suggestions || [], source: 'harness', workspace: workspaceRoot ? true : false });
    } catch (err) {
      next(err);
    }
  });

  aiRouter.post('/edits/apply', async (req: Request, res: Response, next: NextFunction) => {
    try {
      runtime.bindActive();
      const { requestId, edits } = req.body;
      const result = editSnapshots.apply(fileOperations, requestId || `req-${Date.now()}`, edits || []);
      await runtime.indexActive();
      await runtime.refreshModelFromDiscovery();
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  aiRouter.post('/edits/undo', async (req: Request, res: Response, next: NextFunction) => {
    try {
      runtime.bindActive();
      const { requestId } = req.body;
      const result = editSnapshots.undo(fileOperations, requestId);
      await runtime.indexActive();
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  aiRouter.post('/modules/analyze', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { workspaceRoot } = runtime.bindActive();
      const output = await aiHarness.executeCapability('module-adaptation', {
        action: 'analyze',
        moduleData: req.body.module,
        targetPath: workspaceRoot,
      });
      res.json(output.analysis || output);
    } catch (err) {
      next(err);
    }
  });

  aiRouter.post('/modules/adapt', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { workspaceRoot } = runtime.bindActive();
      const output = await aiHarness.executeCapability('module-adaptation', {
        action: 'integrate',
        moduleData: req.body.module,
        targetPath: workspaceRoot,
        config: req.body.config,
      });
      await runtime.refreshModelFromDiscovery();
      res.json(output.integration || output);
    } catch (err) {
      next(err);
    }
  });

  aiRouter.post('/pipeline/test', async (req: Request, res: Response, next: NextFunction) => {
    try {
      runtime.bindActive();
      const output = await aiHarness.executeCapability('pipeline-testing', req.body || {});
      res.json(output);
    } catch (err) {
      next(err);
    }
  });

  aiRouter.post('/terminal/exec', async (req: Request, res: Response, next: NextFunction) => {
    try {
      runtime.bindActive();
      const output = await aiHarness.executeCapability('terminal-execution', req.body || {});
      res.json(output);
    } catch (err) {
      next(err);
    }
  });

  router.use('/ai', aiRouter);
  return router;
}
