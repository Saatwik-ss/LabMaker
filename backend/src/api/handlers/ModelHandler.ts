import { Router, Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { CodexRuntime } from '../../core/CodexRuntime';
import { detectProjectDomain } from '@codex/ai-harness';

export function createModelHandler(runtime: CodexRuntime): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response, next: NextFunction) => {
    try {
      runtime.bindActive();
      res.json(runtime.projectManager.getCurrentProject().model);
    } catch (error) {
      next(error);
    }
  });

  router.get('/summary', (_req: Request, res: Response, next: NextFunction) => {
    try {
      runtime.bindActive();
      runtime.syncModelManager();
      res.json(runtime.modelManager.getSummary());
    } catch (error) {
      next(error);
    }
  });

  router.post('/discover', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const model = await runtime.refreshModelFromDiscovery();
      res.json(model);
    } catch (error) {
      next(error);
    }
  });

  router.put('/', (req: Request, res: Response, next: NextFunction) => {
    try {
      const modelData = req.body;
      const jsonString = typeof modelData === 'string' ? modelData : JSON.stringify(modelData);
      runtime.modelManager.loadFromJSON(jsonString);
      res.json({ success: true, model: runtime.persistCurrentModelFromManager() });
    } catch (error) {
      next(error);
    }
  });

  router.post('/architecture/nodes', async (req: Request, res: Response, next: NextFunction) => {
    try {
      runtime.bindActive();
      runtime.syncModelManager();
      const node = req.body;
      if (!node.id || !node.name || !node.type) {
        return res.status(400).json({ success: false, error: 'id, name, and type are required' });
      }
      runtime.modelManager.addService(node);
      const currentModel = runtime.persistCurrentModelFromManager();

      // Scaffold concrete code file in workspace
      const curr = runtime.projectManager.getCurrentProject();
      const wsRoot = runtime.projectManager.getWorkspaceRoot(curr.id);
      const cleanId = node.id.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const pascalId = cleanId.split(/[-_]/).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
      const domain = detectProjectDomain(`${curr.name} ${curr.description} ${node.name} ${node.type}`);
      const filesCreated: string[] = [];

      if (node.type === 'backend' || node.type === 'module') {
        const svcDir = path.join(wsRoot, 'src', 'services');
        fs.mkdirSync(svcDir, { recursive: true });
        const filePath = path.join(svcDir, `${cleanId}.ts`);
        const fileContent = `import { Router, Request, Response } from 'express';

/**
 * ${node.name} Service
 * Architecture Service Node: ${node.id} (${node.technology || 'Node/Express'})
 * Domain: ${domain.domain}
 */
export class ${pascalId}Service {
  private active = true;

  public getStatus() {
    return {
      nodeId: '${node.id}',
      name: '${node.name}',
      type: '${node.type}',
      status: this.active ? 'healthy' : 'inactive',
      port: ${node.port || 3001},
      technology: '${node.technology || 'Express / Node'}',
      domain: '${domain.domain}',
      timestamp: new Date().toISOString(),
    };
  }
}

export const ${cleanId.replace(/-/g, '_')}Service = new ${pascalId}Service();
export const ${cleanId.replace(/-/g, '_')}Router = Router();

${cleanId.replace(/-/g, '_')}Router.get('/status', (req: Request, res: Response) => {
  res.json({ success: true, service: ${cleanId.replace(/-/g, '_')}Service.getStatus() });
});
`;
        fs.writeFileSync(filePath, fileContent, 'utf8');
        filesCreated.push(`src/services/${cleanId}.ts`);

        // Mount in src/index.ts
        const rootIndexPath = path.join(wsRoot, 'src', 'index.ts');
        if (fs.existsSync(rootIndexPath)) {
          let rootIndex = fs.readFileSync(rootIndexPath, 'utf8');
          const imp = `import { ${cleanId.replace(/-/g, '_')}Router } from './services/${cleanId}';\n`;
          const mount = `\n// Architecture Node: ${node.name}\napp.use('/api/${cleanId}', ${cleanId.replace(/-/g, '_')}Router);\n`;
          if (!rootIndex.includes(`./services/${cleanId}`)) {
            rootIndex = imp + rootIndex;
          }
          if (!rootIndex.includes(`/api/${cleanId}`)) {
            if (rootIndex.includes('export function startServer') || rootIndex.includes('app.listen')) {
              rootIndex = rootIndex.replace(/(export function startServer|app\.listen)/, `${mount}\n$1`);
            } else {
              rootIndex += mount;
            }
          }
          fs.writeFileSync(rootIndexPath, rootIndex, 'utf8');
          filesCreated.push('src/index.ts');
        }
      } else if (node.type === 'database') {
        const dbDir = path.join(wsRoot, 'src', 'db');
        fs.mkdirSync(dbDir, { recursive: true });
        const filePath = path.join(dbDir, `${cleanId}.ts`);
        const fileContent = `/**
 * Architecture Database Node: ${node.id}
 * Name: ${node.name} (${node.technology || 'PostgreSQL'})
 */

export interface ${pascalId}Config {
  host: string;
  port: number;
  database: string;
  type: string;
}

export const ${cleanId.replace(/-/g, '_')}Config: ${pascalId}Config = {
  host: process.env.DB_HOST || 'localhost',
  port: ${node.port || 5432},
  database: '${cleanId}_db',
  type: '${node.technology || 'postgresql'}',
};

export class ${pascalId}Client {
  private connected = true;

  public async query(sql: string, params: any[] = []): Promise<any> {
    console.log(\`[${node.name}] Executing SQL query: \${sql}\`);
    return { rows: [], rowCount: 0, executed: true };
  }

  public isConnected(): boolean {
    return this.connected;
  }
}

export const ${cleanId.replace(/-/g, '_')}Db = new ${pascalId}Client();
`;
        fs.writeFileSync(filePath, fileContent, 'utf8');
        filesCreated.push(`src/db/${cleanId}.ts`);
      } else if (node.type === 'frontend') {
        const compDir = path.join(wsRoot, 'src', 'components');
        fs.mkdirSync(compDir, { recursive: true });
        const filePath = path.join(compDir, `${pascalId}.tsx`);
        const fileContent = `import React from 'react';

/**
 * Architecture Frontend Component Node: ${node.id}
 */
export interface ${pascalId}Props {
  title?: string;
}

export const ${pascalId}: React.FC<${pascalId}Props> = ({ title = '${node.name}' }) => {
  return (
    <div className="${cleanId}-panel p-4 bg-gray-900 border border-gray-800 rounded-lg shadow-sm">
      <h3 className="text-sm font-bold text-white tracking-wide">{title}</h3>
      <p className="text-xs text-gray-400 mt-1">Component node initialized and connected.</p>
    </div>
  );
};

export default ${pascalId};
`;
        fs.writeFileSync(filePath, fileContent, 'utf8');
        filesCreated.push(`src/components/${pascalId}.tsx`);
      } else if (node.type === 'external') {
        const intDir = path.join(wsRoot, 'src', 'integrations');
        fs.mkdirSync(intDir, { recursive: true });
        const filePath = path.join(intDir, `${cleanId}.ts`);
        const fileContent = `/**
 * Architecture External Service Adapter: ${node.id}
 */
export class ${pascalId}Adapter {
  public async ping(): Promise<{ ok: boolean; timestamp: string }> {
    return { ok: true, timestamp: new Date().toISOString() };
  }
}

export const ${cleanId.replace(/-/g, '_')}Client = new ${pascalId}Adapter();
`;
        fs.writeFileSync(filePath, fileContent, 'utf8');
        filesCreated.push(`src/integrations/${cleanId}.ts`);
      }

      try {
        await runtime.indexActive();
      } catch {
        /* best effort */
      }

      res.json({
        success: true,
        node,
        model: currentModel,
        filesCreated,
      });
    } catch (error) {
      next(error);
    }
  });

  router.put('/architecture/nodes/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      runtime.bindActive();
      runtime.syncModelManager();
      const { id } = req.params;
      const ok = runtime.modelManager.updateService(id, req.body);
      if (!ok) return res.status(404).json({ success: false, error: `Node ${id} not found` });
      res.json({ success: true, model: runtime.persistCurrentModelFromManager() });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/architecture/nodes/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      runtime.bindActive();
      runtime.syncModelManager();
      const { id } = req.params;
      const ok = runtime.modelManager.removeService(id);
      if (!ok) return res.status(404).json({ success: false, error: `Node ${id} not found` });
      res.json({ success: true, model: runtime.persistCurrentModelFromManager() });
    } catch (error) {
      next(error);
    }
  });

  router.post('/architecture/relationships', async (req: Request, res: Response, next: NextFunction) => {
    try {
      runtime.bindActive();
      runtime.syncModelManager();
      const rel = req.body;
      if (!rel.id || !rel.source || !rel.target || !rel.type) {
        return res.status(400).json({ success: false, error: 'id, source, target, and type are required' });
      }
      runtime.modelManager.addRelationship(rel);
      const currentModel = runtime.persistCurrentModelFromManager();

      // Wire relationship in workspace code
      const curr = runtime.projectManager.getCurrentProject();
      const wsRoot = runtime.projectManager.getWorkspaceRoot(curr.id);
      const cleanSource = rel.source.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const cleanTarget = rel.target.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const filesModified: string[] = [];

      // Check if source has a service file
      const sourceServicePath = path.join(wsRoot, 'src', 'services', `${cleanSource}.ts`);
      const targetDbPath = path.join(wsRoot, 'src', 'db', `${cleanTarget}.ts`);

      if (fs.existsSync(sourceServicePath) && fs.existsSync(targetDbPath)) {
        let content = fs.readFileSync(sourceServicePath, 'utf8');
        const dbImport = `import { ${cleanTarget.replace(/-/g, '_')}Db } from '../db/${cleanTarget}';\n`;
        const connectionComment = `\n  // Architecture Link (${rel.id}): queries database ${rel.target}\n  public async query${cleanTarget.replace(/-/g, '_')}() { return ${cleanTarget.replace(/-/g, '_')}Db.query('SELECT 1'); }\n`;
        if (!content.includes(`../db/${cleanTarget}`)) {
          content = dbImport + content;
        }
        if (!content.includes(rel.id)) {
          content = content.replace(/(public getStatus\(\))/, `${connectionComment}\n  $1`);
          fs.writeFileSync(sourceServicePath, content, 'utf8');
          filesModified.push(`src/services/${cleanSource}.ts`);
        }
      }

      // Update src/index.ts with relationship comment / link
      const rootIndexPath = path.join(wsRoot, 'src', 'index.ts');
      if (fs.existsSync(rootIndexPath)) {
        let rootIndex = fs.readFileSync(rootIndexPath, 'utf8');
        const relComment = `// Architecture Relationship [${rel.id}]: ${rel.source} -> ${rel.target} (${rel.type}: ${rel.label || 'connected'})\n`;
        if (!rootIndex.includes(`[${rel.id}]`)) {
          rootIndex += `\n${relComment}`;
          fs.writeFileSync(rootIndexPath, rootIndex, 'utf8');
          filesModified.push('src/index.ts');
        }
      }

      try {
        await runtime.indexActive();
      } catch {
        /* best effort */
      }

      res.json({
        success: true,
        relationship: rel,
        model: currentModel,
        filesModified,
      });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/architecture/relationships/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      runtime.bindActive();
      runtime.syncModelManager();
      const { id } = req.params;
      const ok = runtime.modelManager.removeRelationship(id);
      if (!ok) return res.status(404).json({ success: false, error: `Relationship ${id} not found` });
      res.json({ success: true, model: runtime.persistCurrentModelFromManager() });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
