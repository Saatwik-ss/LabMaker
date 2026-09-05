import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { ProjectManager } from '../../core/ProjectManager';
import { CodexRuntime } from '../../core/CodexRuntime';
import { toPublicProject } from '../../core/publicProject';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 200 },
});

export function createProjectHandler(
  projectManager: ProjectManager,
  runtime?: CodexRuntime
): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    try {
      res.json(projectManager.getProjects());
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.post('/current/index', async (_req: Request, res: Response) => {
    try {
      const result = await runtime?.indexActive();
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.post('/current/import', upload.array('files', 200), async (req: Request, res: Response) => {
    try {
      runtime?.bindActive();
      const files = (req.files as Express.Multer.File[]) || [];
      const pathsField = req.body.paths;
      let pathList: string[] = [];
      if (typeof pathsField === 'string') {
        try {
          pathList = JSON.parse(pathsField);
        } catch {
          pathList = [pathsField];
        }
      } else if (Array.isArray(pathsField)) {
        pathList = pathsField;
      }
      const mapped = files.map((f, i) => ({
        relativePath: (pathList[i] || f.originalname || 'file').replace(/\\/g, '/'),
        content: f.buffer,
      }));
      const result = await runtime?.importFiles(mapped);
      res.json({
        success: true,
        ...result,
        project: toPublicProject(projectManager.getCurrentProject()),
      });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.get('/current', (_req: Request, res: Response) => {
    try {
      runtime?.bindActive();
      res.json(toPublicProject(projectManager.getCurrentProject()));
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.get('/history', (_req: Request, res: Response) => {
    try {
      res.json(projectManager.getHistoricalProjects().map(toPublicProject));
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.post('/', async (req: Request, res: Response) => {
    try {
      const { name, description, preset } = req.body;
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'Project name is required' });
      }

      const created = projectManager.createProject({
        name: name.trim(),
        description,
        preset,
      });
      runtime?.bindActive();
      await runtime?.indexActive();
      res.status(201).json(toPublicProject(created));
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.post('/:id/select', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const selected = projectManager.selectProject(id);
      if (!selected) {
        return res.status(404).json({ error: `Project ${id} not found` });
      }
      runtime?.bindActive();
      await runtime?.indexActive();
      res.json(toPublicProject(selected));
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.get('/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const proj = projectManager.getProjectById(id);
      if (!proj) {
        return res.status(404).json({ error: `Project ${id} not found` });
      }
      res.json(toPublicProject(proj));
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const result = projectManager.deleteProject(id);
      runtime?.bindActive();
      try {
        await runtime?.indexActive();
      } catch {
        /* best effort */
      }
      res.json({
        success: true,
        message: result.message,
        activeProject: result.activeProject ? toPublicProject(result.activeProject) : undefined,
      });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.post('/:id/modules', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const moduleData = req.body;

      if (!moduleData.name || typeof moduleData.name !== 'string') {
        return res.status(400).json({ error: 'Module name is required' });
      }

      runtime?.bindActive();
      const createdModule = projectManager.addModuleToProject(id, moduleData);
      runtime?.syncModelManager();
      try {
        await runtime?.indexActive();
      } catch {
        /* best effort */
      }

      res.status(201).json({
        success: true,
        message: `Module "${createdModule.name}" successfully created in project`,
        module: createdModule,
      });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.post('/:id/modules/:moduleId/test', (req: Request, res: Response) => {
    try {
      const { id, moduleId } = req.params;
      const result = projectManager.testModule(id, moduleId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.delete('/:id/modules/:moduleId', (req: Request, res: Response) => {
    try {
      const { id, moduleId } = req.params;
      const removed = projectManager.removeModule(id, moduleId);
      if (!removed) {
        return res.status(404).json({ error: `Module ${moduleId} not found` });
      }
      res.json({ success: true, message: `Module ${moduleId} removed` });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  return router;
}
