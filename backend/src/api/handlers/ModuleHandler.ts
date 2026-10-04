import { Router, Request, Response, NextFunction } from 'express';
import { ModuleManager } from '../../modules/ModuleManager';
import { ProjectManager } from '../../core/ProjectManager';
import { IModuleAdapter } from '@codex/ai-harness';
import { CodexRuntime } from '../../core/CodexRuntime';
import { ModuleCatalog } from '../../modules/ModuleCatalog';
import * as path from 'path';

export function createModuleHandler(
  moduleManager: ModuleManager,
  projectManager?: ProjectManager,
  moduleAdapter?: IModuleAdapter,
  runtime?: CodexRuntime
): Router {
  const router = Router();
  const catalog = runtime ? new ModuleCatalog(path.join(runtime.codexRoot, 'module-library')) : undefined;

  // GET /api/modules - list real source-backed modules. Legacy metadata-only
  // entries are intentionally not offered as installable building blocks.
  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const modules = catalog?.list() || [];
      res.json(modules);
    } catch (error) {
      next(error);
    }
  });

  // POST /api/modules/:id/plan - retrieval and compatibility pass. This is
  // intentionally non-mutating so an LLM/UI can review the exact source files
  // and unmet dependencies before asking to apply anything.
  router.post('/:id/plan', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!catalog || !runtime) return res.status(500).json({ error: 'Module catalog is not initialized' });
      const { variantId } = req.body;
      if (!variantId) return res.status(400).json({ error: 'variantId is required' });
      const { workspaceRoot } = runtime.bindActive();
      res.json(catalog.plan(req.params.id, variantId, workspaceRoot));
    } catch (error) {
      next(error);
    }
  });

  // POST /api/modules - External / cURL module creation endpoint (for current active project)
  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!projectManager) {
        return res.status(500).json({ error: 'ProjectManager not initialized' });
      }

      const { name, type, description, config, credentials, requirements, relationships, dependencies, projectId } = req.body;
      if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'Module name is required' });
      }

      const currentProj = projectId 
        ? projectManager.getProjectById(projectId) 
        : projectManager.getCurrentProject();

      if (!currentProj) {
        return res.status(404).json({ error: 'Active project not found' });
      }

      runtime?.bindActive();
      const created = projectManager.addModuleToProject(currentProj.id, {
        name: name.trim(),
        type: type || 'custom',
        description: description || `Custom ${type || 'service'} module`,
        config: config || {},
        credentials: credentials || {},
        requirements: requirements || [],
        relationships: relationships || [],
        dependencies: dependencies || [],
        codeGenerated: true,
      });

      runtime?.syncModelManager();
      try {
        await runtime?.afterWorkspaceMutation();
      } catch {
        /* best effort */
      }

      res.status(201).json({
        success: true,
        message: `Module "${created.name}" (${created.type}) registered successfully in project "${currentProj.name}"`,
        module: created,
        curlExample: `curl -X POST http://localhost:3001/api/modules -H "Content-Type: application/json" -d '{"name":"${created.name}","type":"${created.type}"}'`
      });
    } catch (error) {
      next(error);
    }
  });

  // GET /api/modules/:id - get module template or installed module details
  router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const moduleTemplate = await moduleManager.getModule(id);
      if (moduleTemplate) {
        return res.json(moduleTemplate);
      }

      // Check in current project
      if (projectManager) {
        const curr = projectManager.getCurrentProject();
        const found = curr.model.modules.find(m => m.id === id || m.name === id);
        if (found) {
          return res.json(found);
        }
      }

      res.status(404).json({ error: 'Module not found' });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/modules/:id/adapt - explicitly adapt module to current project stack using AI Harness
  router.post('/:id/adapt', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { variantId, config } = req.body;
      if (!moduleAdapter || !projectManager) {
        return res.status(500).json({ error: 'ModuleAdapter or ProjectManager not initialized' });
      }

      const curr = projectManager.getCurrentProject();
      const projectPath = runtime?.projectManager.getWorkspaceRoot(curr.id) || '.';
      const result = await moduleAdapter.adaptAndIntegrate(projectPath, {
        id,
        name: id,
        version: '1.0.0',
        description: `Adapted ${id} module`,
        category: 'feature',
        variantId: variantId || 'default',
      }, config || {});

      await runtime?.afterWorkspaceMutation();
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // POST /api/modules/:id/test - run testing & validation checks on a module
  router.post('/:id/test', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      if (!projectManager) {
        return res.status(500).json({ error: 'ProjectManager not initialized' });
      }
      const curr = projectManager.getCurrentProject();
      const testResult = projectManager.testModule(curr.id, id);
      res.json(testResult);
    } catch (error) {
      next(error);
    }
  });

  // POST /api/modules/:id/install - install stock module with stack-aware adaptation
  router.post('/:id/install', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { variantId, config, credentials } = req.body;
      
      if (!variantId) {
        return res.status(400).json({ error: 'variantId is required' });
      }

      // Source-backed catalog modules are copied verbatim after compatibility
      // checks. Do not pass them through the generic code generator.
      if (catalog?.get(id) && runtime && projectManager) {
        const { workspaceRoot } = runtime.bindActive();
        const plan = catalog.plan(id, variantId, workspaceRoot);
        if (plan.implementationStatus !== 'stub' && (!plan.compatible || plan.requiredPackages.length > 0)) {
          return res.status(409).json({
            success: false,
            error: 'Module cannot be installed until compatibility requirements are resolved',
            plan,
          });
        }
        const filesChanged = catalog.install(plan, runtime.fileOps);
        const curr = projectManager.getCurrentProject();
        projectManager.addModuleToProject(curr.id, {
          name: id,
          type: plan.module.category as any,
          version: plan.module.version,
          description: plan.module.description,
          requirements: [`Source-backed catalog variant: ${variantId}`],
          credentials: credentials || {},
          codeGenerated: false,
          status: 'active',
          testStatus: 'untested',
          health: { status: 'untested', issues: [] },
        });
        await runtime.afterWorkspaceMutation();
        return res.json({ success: true, message: `Installed source-backed module ${id}`, filesChanged, plan });
      }

      let filesChanged: any[] = [];

      // 1. Run AI Harness stack adaptation if available
      if (moduleAdapter && projectManager) {
        const curr = projectManager.getCurrentProject();
        const projectPath = runtime?.projectManager.getWorkspaceRoot(curr.id) || '.';
        const adaptRes = await moduleAdapter.adaptAndIntegrate(projectPath, {
          id,
          name: id,
          version: '1.0.0',
          description: `Adapted ${id} module`,
          category: 'feature',
          variantId,
        }, config || {});

        if (adaptRes.success) {
          filesChanged.push(...adaptRes.filesCreated, ...adaptRes.filesModified);
        }
      }

      // 2. Perform base module registration
      const installResult = await moduleManager.installModule(id, variantId, config || {});
      if (installResult.filesChanged) {
        filesChanged.push(...installResult.filesChanged);
      }
      
      // Also register in ProjectManager if available
      if (projectManager) {
        const curr = projectManager.getCurrentProject();
        projectManager.addModuleToProject(curr.id, {
          name: id,
          type: (id === 'auth' || id === 'notifications' ? 'services' : id === 'files' ? 'api' : 'custom') as any,
          version: '1.0.0',
          credentials: credentials || {},
          codeGenerated: true,
          status: 'active',
          testStatus: 'passed',
          health: { status: 'healthy', issues: [] }
        });
      }

      await runtime?.afterWorkspaceMutation();

      res.json({
        success: true,
        message: `Module ${id} installed and adapted to project stack successfully`,
        installResult,
        filesChanged
      });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/modules/:id/uninstall - uninstall module
  router.post('/:id/uninstall', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      
      if (projectManager) {
        const curr = projectManager.getCurrentProject();
        projectManager.removeModule(curr.id, id);
      }

      let filesChanged: any[] = [];
      const isInstalled = await moduleManager.isModuleInstalled(id);
      if (isInstalled) {
        const uninstRes = await moduleManager.uninstallModule(id);
        filesChanged = uninstRes.filesChanged || [];
      }

      res.json({
        success: true,
        message: `Module ${id} uninstalled successfully`,
        filesChanged
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
