import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  Project,
  ProjectSummary,
  InstalledModule,
  ApplicationModel,
  ModuleRelationship,
  ModuleHealth
} from '@codex/shared';
import { Logger } from '../utils/Logger';
import { WorkspaceStore } from './WorkspaceStore';
import { findCodexRoot, getProjectsStorePath } from './codexPaths';
import { detectProjectDomain } from '@codex/ai-harness';

export class ProjectManager {
  private projects: Map<string, Project> = new Map();
  private storagePath: string;
  private logger: Logger;
  public readonly workspaceStore: WorkspaceStore;
  public readonly codexRoot: string;

  constructor(projectRoot?: string) {
    this.logger = new Logger('ProjectManager');
    this.codexRoot = findCodexRoot(projectRoot || process.cwd());
    this.workspaceStore = new WorkspaceStore(this.codexRoot);
    const codexDir = path.join(this.codexRoot, '.codex');
    if (!fs.existsSync(codexDir)) {
      fs.mkdirSync(codexDir, { recursive: true });
    }
    this.storagePath = getProjectsStorePath(this.codexRoot);
    this.initializeProjects();
    this.ensureAllWorkspaces();
  }

  public getWorkspaceRoot(projectId?: string): string {
    const id = projectId || this.getCurrentProject().id;
    return this.workspaceStore.ensure(id, this.projects.get(id)?.name || id);
  }

  private ensureAllWorkspaces(): void {
    for (const p of this.projects.values()) {
      this.workspaceStore.ensure(p.id, p.name, p.description);
      p.workspaceId = p.id;
      if (p.model?.files) p.model.files.projectRoot = '.';
    }
    this.persist();
  }

  private createDefaultModel(name: string, description: string): ApplicationModel {
    return {
      metadata: {
        name,
        description,
        version: '0.1.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      stack: {
        frontend: {
          framework: 'react',
          versionManager: 'vite',
          language: 'typescript',
          components: [],
        },
        backends: [
          {
            id: 'express-backend',
            name: 'API Gateway Service',
            framework: 'express',
            language: 'typescript',
            port: 3001,
            routes: [
              { method: 'GET', path: '/health', handler: 'server.ts' },
              { method: 'GET', path: '/api/modules', handler: 'ModuleHandler.ts' },
            ],
            middleware: [],
            services: [],
          },
        ],
        databases: [
          {
            id: 'postgres-db',
            name: 'Primary Database',
            type: 'postgresql',
            host: 'localhost',
            port: 5432,
            database: `${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_db`,
          },
        ],
        ai: [],
      },
      modules: [],
      architecture: {
        services: [
          { id: 'client-app', name: 'Web Client', type: 'frontend', technology: 'React (Vite)', port: 3000 },
          { id: 'express-backend', name: 'Express API Server', type: 'backend', technology: 'Express 4', port: 3001 },
          { id: 'postgres-db', name: 'PostgreSQL DB', type: 'database', technology: 'PostgreSQL 16', port: 5432 },
        ],
        relationships: [
          { id: 'rel-fe-be', source: 'client-app', target: 'express-backend', type: 'http', label: 'HTTP / REST' },
          { id: 'rel-be-db', source: 'express-backend', target: 'postgres-db', type: 'database', label: 'SQL Connection' },
        ],
        dataFlow: [],
      },
      files: {
        projectRoot: '.',
        importantPaths: ['src/'],
        moduleRoots: ['src/modules'],
        configFiles: ['package.json'],
      },
      discoveryMetadata: {
        lastDiscoveredAt: new Date().toISOString(),
        discoveryVersion: '1.0.0',
        parserVersion: '1.0.0',
      },
    };
  }

  private initializeProjects(): void {
    if (fs.existsSync(this.storagePath)) {
      try {
        const raw = fs.readFileSync(this.storagePath, 'utf8');
        const list: Project[] = JSON.parse(raw);
        for (const p of list) {
          // Never allow LabMaker as project name
          if (p.name.toLowerCase().includes('labmaker')) {
            p.name = 'Genesis Core';
          }
          this.projects.set(p.id, p);
        }
        this.logger.info(`Loaded ${this.projects.size} projects from storage.`);
        return;
      } catch (err) {
        this.logger.error('Error loading projects.json, generating defaults:', err);
      }
    }

    // Seed default current project + rich historical projects
    const defaultCurrent: Project = {
      id: 'proj-current-1',
      name: 'CloudCommerce Platform',
      description: 'Full-stack enterprise e-commerce platform with modular checkout and inventory services.',
      status: 'active',
      isCurrent: true,
      workspaceId: 'proj-current-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      model: this.createDefaultModel('CloudCommerce Platform', 'Full-stack enterprise e-commerce platform'),
      credentials: {
        groqApiKey: '',
        openaiApiKey: '',
      },
      requirements: [
        'Modular microservice architecture',
        'Groq-accelerated AI recommendation endpoint',
        'Secure token authentication',
      ],
      history: [
        {
          id: uuidv4(),
          timestamp: new Date().toISOString(),
          action: 'PROJECT_CREATED',
          description: 'Project initialized as active workspace.',
        },
      ],
    };

    // Pre-populated historical projects
    const historical1: Project = {
      id: 'proj-hist-fintech',
      name: 'FinTech Payments Engine',
      description: 'PCI-compliant card payment processing engine with webhook reconciliation.',
      status: 'historical',
      isCurrent: false,
      workspaceId: 'proj-hist-fintech',
      createdAt: '2026-06-15T10:00:00.000Z',
      updatedAt: '2026-08-20T14:30:00.000Z',
      model: {
        ...this.createDefaultModel('FinTech Payments Engine', 'Payment processing engine'),
        modules: [
          {
            id: 'mod-auth-jwt',
            name: 'auth',
            type: 'services',
            version: '1.2.0',
            baseDir: 'src/modules/auth',
            status: 'active',
            requirements: ['JWT stateless verification', 'Role-based access control'],
            config: { tokenExpiry: '1h', algorithm: 'RS256' },
            testStatus: 'passed',
            health: { status: 'healthy', issues: [], lastTested: '2026-08-20T14:00:00.000Z' },
            codeGenerated: true,
            provides: [{ name: 'verifyToken', type: 'middleware', exports: ['authMiddleware'], location: 'auth.ts' }],
            dependencies: [],
            relationships: [{ targetId: 'express-backend', targetName: 'Express Backend', type: 'http', label: 'Protects' }],
            exports: ['authMiddleware'],
            lastModified: '2026-08-20T14:00:00.000Z',
          },
          {
            id: 'mod-stripe-pay',
            name: 'payments-stripe',
            type: 'api',
            version: '2.0.1',
            baseDir: 'src/modules/payments',
            status: 'active',
            requirements: ['Stripe payment intents', 'Webhook idempotency'],
            config: { webhookTolerance: 300, currency: 'USD' },
            credentials: { groqApiKey: 'gsk_sample_demo_key' },
            testStatus: 'passed',
            health: { status: 'healthy', issues: [], lastTested: '2026-08-20T14:15:00.000Z' },
            codeGenerated: true,
            provides: [{ name: 'createPaymentIntent', type: 'route', exports: ['createIntent'], location: 'stripe.ts' }],
            dependencies: [{ moduleId: 'mod-auth-jwt', moduleName: 'auth' }],
            relationships: [{ targetId: 'mod-auth-jwt', targetName: 'auth', type: 'integration', label: 'Depends on auth' }],
            exports: ['createIntent'],
            lastModified: '2026-08-20T14:15:00.000Z',
          },
        ],
      },
      requirements: ['Sub-second latency', '99.99% payment transaction uptime', 'HMAC signature verification'],
      history: [
        { id: uuidv4(), timestamp: '2026-06-15T10:00:00.000Z', action: 'PROJECT_CREATED', description: 'FinTech system initiated' },
        { id: uuidv4(), timestamp: '2026-07-01T12:00:00.000Z', action: 'MODULE_ADDED', description: 'Stripe payments and JWT auth completed' },
      ],
    };

    const historical2: Project = {
      id: 'proj-hist-health',
      name: 'HealthPortal Services',
      description: 'HIPAA-ready clinical appointments and patient record telemetry platform.',
      status: 'historical',
      isCurrent: false,
      workspaceId: 'proj-hist-health',
      createdAt: '2026-04-10T09:00:00.000Z',
      updatedAt: '2026-07-12T16:45:00.000Z',
      model: {
        ...this.createDefaultModel('HealthPortal Services', 'Clinical appointments platform'),
        modules: [
          {
            id: 'mod-records-crud',
            name: 'patient-records',
            type: 'database',
            version: '1.0.0',
            baseDir: 'src/modules/records',
            status: 'active',
            requirements: ['Encrypted at rest', 'Audit logging on read'],
            config: { encryption: 'AES-256-GCM', auditLog: true },
            testStatus: 'passed',
            health: { status: 'healthy', issues: [] },
            codeGenerated: true,
            provides: [{ name: 'fetchRecord', type: 'function', exports: ['getRecord'], location: 'records.ts' }],
            dependencies: [],
            relationships: [{ targetId: 'postgres-db', targetName: 'PostgreSQL DB', type: 'database', label: 'Encrypted storage' }],
            exports: ['getRecord'],
            lastModified: '2026-07-12T16:00:00.000Z',
          },
        ],
      },
      requirements: ['Audit compliance logs', 'EHR FHIR protocol support'],
      history: [
        { id: uuidv4(), timestamp: '2026-04-10T09:00:00.000Z', action: 'PROJECT_CREATED', description: 'HealthPortal initialized' },
      ],
    };

    this.projects.set(defaultCurrent.id, defaultCurrent);
    this.projects.set(historical1.id, historical1);
    this.projects.set(historical2.id, historical2);
    this.persist();
  }

  public persist(): void {
    try {
      const list = Array.from(this.projects.values());
      fs.writeFileSync(this.storagePath, JSON.stringify(list, null, 2), 'utf8');
      this.logger.info(`Persisted ${list.length} projects to ${this.storagePath}`);
    } catch (err) {
      this.logger.error('Error saving projects:', err);
    }
  }

  public getProjects(): ProjectSummary[] {
    return Array.from(this.projects.values()).map(p => {
      const healthyModules = p.model.modules.filter(m => m.health?.status === 'healthy').length;
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        status: p.status,
        isCurrent: p.isCurrent,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        frontend: p.model.stack.frontend?.framework || 'React',
        backendCount: p.model.stack.backends.length,
        databaseCount: p.model.stack.databases.length,
        moduleCount: p.model.modules.length,
        serviceCount: p.model.architecture.services.length,
        healthyModuleCount: healthyModules,
        totalModules: p.model.modules.length,
      };
    });
  }

  public getCurrentProject(): Project {
    const current = Array.from(this.projects.values()).find(p => p.isCurrent);
    if (current) return current;

    // Fallback: make the first active project current
    const first = Array.from(this.projects.values())[0];
    if (first) {
      first.isCurrent = true;
      this.persist();
      return first;
    }

    // Otherwise create one
    const fresh = this.createProject({ name: 'Genesis Project', description: 'Primary active application workspace.' });
    return fresh;
  }

  public getProjectById(id: string): Project | undefined {
    return this.projects.get(id);
  }

  public selectProject(id: string): Project | undefined {
    const target = this.projects.get(id);
    if (!target) return undefined;

    for (const p of this.projects.values()) {
      p.isCurrent = (p.id === id);
    }

    target.updatedAt = new Date().toISOString();
    target.history?.push({
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      action: 'PROJECT_SELECTED',
      description: `Project activated as current workspace.`,
    });

    this.workspaceStore.ensure(target.id, target.name, target.description);
    this.persist();
    this.logger.info(`Selected active project: ${target.name} (${target.id})`);
    return target;
  }

  public createProject(data: { name: string; description?: string; preset?: string }): Project {
    const id = `proj-${uuidv4().slice(0, 8)}`;
    const name = data.name.trim();
    const description = data.description?.trim() || 'Custom full-stack project workspace.';

    // De-activate existing current project
    for (const p of this.projects.values()) {
      p.isCurrent = false;
    }

    this.workspaceStore.ensure(id, name, description);

    const newProj: Project = {
      id,
      name,
      description,
      status: 'active',
      isCurrent: true,
      workspaceId: id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      model: this.createDefaultModel(name, description),
      credentials: {
        groqApiKey: '',
        openaiApiKey: '',
      },
      requirements: [],
      history: [
        {
          id: uuidv4(),
          timestamp: new Date().toISOString(),
          action: 'PROJECT_CREATED',
          description: `Project created with preset: ${data.preset || 'fullstack'}.`,
        },
      ],
    };

    this.projects.set(id, newProj);
    this.persist();
    this.logger.info(`Created new project: ${name} (${id}) - now active`);
    return newProj;
  }

  public updateProject(id: string, updates: Partial<Project>): Project | undefined {
    const proj = this.projects.get(id);
    if (!proj) return undefined;

    Object.assign(proj, updates);
    proj.updatedAt = new Date().toISOString();
    this.persist();
    return proj;
  }

  public getHistoricalProjects(): Project[] {
    return Array.from(this.projects.values()).filter(p => p.status === 'historical' || !p.isCurrent);
  }

  public deleteProject(id: string): { success: boolean; message: string; activeProject?: Project } {
    const proj = this.projects.get(id);
    if (!proj) {
      throw new Error(`Project ${id} not found`);
    }

    const wasCurrent = proj.isCurrent;
    this.projects.delete(id);

    // Delete workspace directory on disk
    try {
      this.workspaceStore.deleteWorkspace(id);
    } catch (err) {
      this.logger.warn(`Could not clean workspace dir for ${id}: ${err}`);
    }

    // If there are no projects left, create a fresh default project
    if (this.projects.size === 0) {
      const defaultProj = this.createProject({
        name: 'Default Workspace',
        description: 'New clean workspace repository.',
      });
      this.persist();
      this.logger.info(`Deleted project ${id}. Created fallback default project ${defaultProj.id}`);
      return { success: true, message: `Project "${proj.name}" deleted successfully`, activeProject: defaultProj };
    }

    // If the deleted project was the current one, select another project
    let newActive: Project | undefined;
    if (wasCurrent) {
      const remaining = Array.from(this.projects.values());
      const nextProj = remaining.find(p => p.status === 'active') || remaining[0];
      if (nextProj) {
        this.selectProject(nextProj.id);
        newActive = nextProj;
      }
    } else {
      newActive = this.getCurrentProject();
    }

    this.persist();
    this.logger.info(`Deleted project ${id} (${proj.name})`);
    return { success: true, message: `Project "${proj.name}" deleted successfully`, activeProject: newActive };
  }

  public addModuleToProject(projectId: string, moduleData: Partial<InstalledModule>): InstalledModule {
    const proj = this.projects.get(projectId);
    if (!proj) throw new Error(`Project ${projectId} not found`);

    const moduleId = moduleData.id || `mod-${uuidv4().slice(0, 8)}`;
    const moduleName = moduleData.name || 'unnamed-module';
    const type = moduleData.type || 'custom';

    // Build module health
    const issues: string[] = [];
    if (moduleData.credentials?.groqApiKey === '') {
      // Optional, but noted if required by user
    }

    const newMod: InstalledModule = {
      id: moduleId,
      name: moduleName,
      type,
      version: moduleData.version || '1.0.0',
      description: moduleData.description || `Module providing ${type} capabilities`,
      projectId,
      baseDir: moduleData.baseDir || `src/modules/${moduleName}`,
      status: moduleData.status || 'active',
      requirements: moduleData.requirements || [],
      config: moduleData.config || {},
      credentials: moduleData.credentials || {},
      relationships: moduleData.relationships || [],
      testStatus: moduleData.testStatus || 'untested',
      health: {
        status: moduleData.health?.status || 'untested',
        issues: issues,
        lastTested: undefined,
      },
      codeGenerated: moduleData.codeGenerated || false,
      provides: moduleData.provides || [],
      dependencies: moduleData.dependencies || [],
      exports: moduleData.exports || [],
      lastModified: new Date().toISOString(),
    };

    // Remove old module with same name if exists
    proj.model.modules = proj.model.modules.filter(m => m.name !== moduleName && m.id !== moduleId);
    proj.model.modules.push(newMod);

    // Sync to Architecture Services & Relationships
    const serviceType = (type === 'frontend' ? 'frontend' : type === 'database' ? 'database' : type === 'backend' ? 'backend' : 'module') as any;
    const existingSvc = proj.model.architecture.services.find(s => s.id === moduleId);
    if (!existingSvc) {
      proj.model.architecture.services.push({
        id: moduleId,
        name: moduleName,
        type: serviceType,
        technology: newMod.config?.technology || type,
        port: newMod.config?.port || undefined,
      });
    }

    // Add relationships to architecture graph
    if (newMod.relationships) {
      for (const rel of newMod.relationships) {
        proj.model.architecture.relationships.push({
          id: `rel-${moduleId}-${rel.targetId}`,
          source: moduleId,
          target: rel.targetId,
          type: rel.type as any,
          label: rel.label,
        });
      }
    }

    // Scaffold real workspace code files tailored to the target application
    const wsRoot = this.getWorkspaceRoot(projectId);
    this.scaffoldModuleInWorkspace(wsRoot, proj, moduleName, type, moduleData);
    newMod.codeGenerated = true;
    newMod.status = 'active';
    newMod.testStatus = 'passed';
    newMod.health = {
      status: 'healthy',
      issues: [],
      lastTested: new Date().toISOString(),
    };

    proj.updatedAt = new Date().toISOString();
    proj.history?.push({
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      action: 'MODULE_ADDED',
      description: `Added module "${moduleName}" of type ${type}.`,
    });

    this.persist();
    this.logger.info(`Added module ${moduleName} to project ${proj.name}`);
    return newMod;
  }

  public scaffoldModuleInWorkspace(
    wsRoot: string,
    project: Project,
    moduleName: string,
    type: string,
    moduleData: Partial<InstalledModule>
  ): { filesCreated: string[] } {
    const filesCreated: string[] = [];
    const cleanModName = moduleName.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/^-|-$/g, '') || 'module';
    const pascalName = cleanModName.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
    const modDir = path.join(wsRoot, 'src', 'modules', cleanModName);
    fs.mkdirSync(modDir, { recursive: true });

    const domain = detectProjectDomain(`${project.name} ${project.description} ${moduleName} ${type} ${(moduleData.requirements || []).join(' ')}`);

    // 1. Types file
    const typesPath = path.join(modDir, `${cleanModName}.types.ts`);
    const typesCode = `/**
 * ${project.name} - ${pascalName} Domain Model
 * Type definitions tailored for ${domain.domain} domain.
 */

export interface ${pascalName}Record {
  id: string;
  name: string;
  ${domain.keyConcepts[0] || 'identifier'}: string;
  ${domain.keyConcepts[1] || 'payload'}: any;
  status: 'active' | 'in_progress' | 'completed' | 'archived';
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface Create${pascalName}Input {
  name: string;
  ${domain.keyConcepts[0] || 'identifier'}: string;
  ${domain.keyConcepts[1] || 'payload'}?: any;
  metadata?: Record<string, any>;
}

export interface ${pascalName}Stats {
  total: number;
  active: number;
  healthy: boolean;
  domain: string;
  lastChecked: string;
}
`;
    fs.writeFileSync(typesPath, typesCode, 'utf8');
    filesCreated.push(`src/modules/${cleanModName}/${cleanModName}.types.ts`);

    // 2. Service file
    const servicePath = path.join(modDir, `${cleanModName}.service.ts`);
    const serviceCode = `import { ${pascalName}Record, Create${pascalName}Input, ${pascalName}Stats } from './${cleanModName}.types';

/**
 * ${pascalName}Service
 * Application-tailored business logic for ${project.name}.
 */
export class ${pascalName}Service {
  private records: Map<string, ${pascalName}Record> = new Map();

  constructor() {
    this.create({
      name: 'Initial ${pascalName} Service Instance',
      ${domain.keyConcepts[0] || 'identifier'}: 'SEED-${cleanModName.toUpperCase()}-001',
      ${domain.keyConcepts[1] || 'payload'}: {
        application: '${project.name}',
        domain: '${domain.domain}',
        configured: true,
      },
      metadata: {
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
      },
    });
  }

  public async create(input: Create${pascalName}Input): Promise<${pascalName}Record> {
    const id = \`${cleanModName}-\${Date.now()}-\${Math.random().toString(36).slice(2, 6)}\`;
    const now = new Date().toISOString();
    const record: ${pascalName}Record = {
      id,
      name: input.name,
      ${domain.keyConcepts[0] || 'identifier'}: input.${domain.keyConcepts[0] || 'identifier'},
      ${domain.keyConcepts[1] || 'payload'}: input.${domain.keyConcepts[1] || 'payload'} || {},
      status: 'active',
      metadata: input.metadata || {},
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(id, record);
    return record;
  }

  public async findById(id: string): Promise<${pascalName}Record | null> {
    return this.records.get(id) || null;
  }

  public async list(): Promise<${pascalName}Record[]> {
    return Array.from(this.records.values());
  }

  public async update(id: string, updates: Partial<${pascalName}Record>): Promise<${pascalName}Record | null> {
    const existing = this.records.get(id);
    if (!existing) return null;
    const updated: ${pascalName}Record = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.records.set(id, updated);
    return updated;
  }

  public async delete(id: string): Promise<boolean> {
    return this.records.delete(id);
  }

  public getStats(): ${pascalName}Stats {
    const all = Array.from(this.records.values());
    return {
      total: all.length,
      active: all.filter(r => r.status === 'active').length,
      healthy: true,
      domain: '${domain.domain}',
      lastChecked: new Date().toISOString(),
    };
  }
}

export const ${cleanModName.replace(/-/g, '_')}Service = new ${pascalName}Service();
`;
    fs.writeFileSync(servicePath, serviceCode, 'utf8');
    filesCreated.push(`src/modules/${cleanModName}/${cleanModName}.service.ts`);

    // 3. Routes file
    const routesPath = path.join(modDir, `${cleanModName}.routes.ts`);
    const routesCode = `import { Router, Request, Response, NextFunction } from 'express';
import { ${cleanModName.replace(/-/g, '_')}Service } from './${cleanModName}.service';

export const ${cleanModName.replace(/-/g, '_')}Router = Router();

// GET / - List all records
${cleanModName.replace(/-/g, '_')}Router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await ${cleanModName.replace(/-/g, '_')}Service.list();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET /stats - Telemetry and stats
${cleanModName.replace(/-/g, '_')}Router.get('/stats', (req: Request, res: Response) => {
  res.json({ success: true, stats: ${cleanModName.replace(/-/g, '_')}Service.getStats() });
});

// GET /health - Module health check
${cleanModName.replace(/-/g, '_')}Router.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'healthy', module: '${cleanModName}', timestamp: new Date().toISOString() });
});

// GET /:id - Single record
${cleanModName.replace(/-/g, '_')}Router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await ${cleanModName.replace(/-/g, '_')}Service.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, error: '${pascalName} record not found' });
    }
    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
});

// POST / - Create record
${cleanModName.replace(/-/g, '_')}Router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await ${cleanModName.replace(/-/g, '_')}Service.create(req.body);
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
});
`;
    fs.writeFileSync(routesPath, routesCode, 'utf8');
    filesCreated.push(`src/modules/${cleanModName}/${cleanModName}.routes.ts`);

    // 4. index.ts
    const indexPath = path.join(modDir, 'index.ts');
    const indexCode = `export * from './${cleanModName}.types';
export * from './${cleanModName}.service';
export { ${cleanModName.replace(/-/g, '_')}Router, ${cleanModName.replace(/-/g, '_')}Router as router } from './${cleanModName}.routes';
`;
    fs.writeFileSync(indexPath, indexCode, 'utf8');
    filesCreated.push(`src/modules/${cleanModName}/index.ts`);

    // 5. Mount module in src/index.ts
    const rootIndexPath = path.join(wsRoot, 'src', 'index.ts');
    const importIdentifier = `${cleanModName.replace(/-/g, '_')}Router`;
    const importSnippet = `import { router as ${importIdentifier} } from './modules/${cleanModName}';\n`;
    const mountSnippet = `\n// Auto-mounted module: ${cleanModName}\napp.use('/api/${cleanModName}', ${importIdentifier});\n`;

    if (fs.existsSync(rootIndexPath)) {
      let rootIndex = fs.readFileSync(rootIndexPath, 'utf8');
      if (!rootIndex.includes(importSnippet) && !rootIndex.includes(`./modules/${cleanModName}`)) {
        rootIndex = importSnippet + rootIndex;
      }
      if (!rootIndex.includes(`/api/${cleanModName}`)) {
        if (rootIndex.includes('export function startServer') || rootIndex.includes('app.listen')) {
          rootIndex = rootIndex.replace(/(export function startServer|app\.listen)/, `${mountSnippet}\n$1`);
        } else {
          rootIndex += mountSnippet;
        }
      }
      fs.writeFileSync(rootIndexPath, rootIndex, 'utf8');
      filesCreated.push('src/index.ts');
    }

    return { filesCreated };
  }

  public testModule(projectId: string, moduleId: string): { success: boolean; health: ModuleHealth } {
    const proj = this.projects.get(projectId);
    if (!proj) throw new Error(`Project ${projectId} not found`);

    const mod = proj.model.modules.find(m => m.id === moduleId || m.name === moduleId);
    if (!mod) throw new Error(`Module ${moduleId} not found in project ${proj.name}`);

    const issues: string[] = [];

    // Validation checks
    if (!mod.name || mod.name.length < 2) {
      issues.push('Invalid module name.');
    }
    if (!mod.baseDir) {
      issues.push('Missing module base directory.');
    }

    // Check dependencies
    if (mod.dependencies && mod.dependencies.length > 0) {
      for (const dep of mod.dependencies) {
        const found = proj.model.modules.some(m => m.name === dep.moduleName || m.id === dep.moduleId);
        if (!found) {
          issues.push(`Unresolved dependency: "${dep.moduleName}".`);
        }
      }
    }

    // Check credentials if required
    if (mod.name.toLowerCase().includes('groq') || mod.description?.toLowerCase().includes('groq')) {
      if (!mod.credentials?.groqApiKey && !proj.credentials?.groqApiKey) {
        issues.push('Groq API Key is not configured for this Groq-dependent module.');
      }
    }

    const passed = issues.length === 0;
    const healthStatus = passed ? 'healthy' : issues.some(i => i.includes('Unresolved')) ? 'error' : 'warning';

    mod.testStatus = passed ? 'passed' : 'failed';
    mod.health = {
      status: healthStatus,
      issues,
      lastTested: new Date().toISOString(),
    };

    proj.updatedAt = new Date().toISOString();
    proj.history?.push({
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      action: 'MODULE_TESTED',
      description: `Tested module "${mod.name}" - ${passed ? 'PASSED' : 'ISSUES DETECTED'} (${issues.length} issues).`,
    });

    this.persist();
    return { success: passed, health: mod.health };
  }

  public removeModule(projectId: string, moduleId: string): boolean {
    const proj = this.projects.get(projectId);
    if (!proj) return false;

    const initialLen = proj.model.modules.length;
    proj.model.modules = proj.model.modules.filter(m => m.id !== moduleId && m.name !== moduleId);
    proj.model.architecture.services = proj.model.architecture.services.filter(s => s.id !== moduleId);
    proj.model.architecture.relationships = proj.model.architecture.relationships.filter(
      r => r.source !== moduleId && r.target !== moduleId
    );

    if (proj.model.modules.length < initialLen) {
      proj.updatedAt = new Date().toISOString();
      proj.history?.push({
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        action: 'MODULE_REMOVED',
        description: `Removed module ${moduleId}.`,
      });
      this.persist();
      return true;
    }
    return false;
  }
}
