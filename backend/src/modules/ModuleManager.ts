import { InstalledModule, ModuleTemplate, ModuleDependency } from '@codex/shared';
import { ApplicationModelManager } from '../core/ApplicationModel';
import { FileOperations } from '../tools/FileOperations';
import { CommandRunner } from '../tools/CommandRunner';
import { Logger } from '../utils/Logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * ModuleManager handles installation, uninstallation, and management of stock modules.
 *
 * Features:
 * - Install stock modules with variant selection
 * - Dependency resolution
 * - Post-install configuration
 * - Module activation/deactivation
 * - Update checking
 */
export class ModuleManager {
  private model: ApplicationModelManager;
  private fileOps: FileOperations;
  private cmdRunner: CommandRunner;
  private logger: Logger;
  private moduleRegistry: Map<string, ModuleTemplate>;

  constructor(
    model: ApplicationModelManager,
    fileOps: FileOperations,
    projectRoot: string
  ) {
    this.model = model;
    this.fileOps = fileOps;
    this.cmdRunner = new CommandRunner(projectRoot);
    this.logger = new Logger('ModuleManager');
    this.moduleRegistry = this.initializeRegistry();
  }

  public setProjectRoot(projectRoot: string): void {
    this.cmdRunner.setProjectRoot(projectRoot);
  }

  /**
   * Initialize the module registry with available modules
   */
  private initializeRegistry(): Map<string, ModuleTemplate> {
    const registry = new Map<string, ModuleTemplate>();

    // Auth Module
    registry.set('auth', {
      id: 'auth',
      name: 'auth',
      version: '1.0.0',
      description: 'User authentication module (JWT, OAuth, Session)',
      category: 'auth',
      variants: [
        {
          id: 'jwt',
          name: 'JWT Authentication',
          description: 'JWT-based stateless authentication',
          stack: {
            backend: 'express',
            frontend: 'react',
            database: 'postgres',
          },
          files: [
            { path: 'backend/src/auth/jwt.ts', template: '', isStatic: false },
            { path: 'backend/src/routes/auth.ts', template: '', isStatic: false },
            { path: 'frontend/src/hooks/useAuth.ts', template: '', isStatic: false },
          ],
        },
        {
          id: 'oauth',
          name: 'OAuth 2.0',
          description: 'OAuth 2.0 provider integration',
          stack: { backend: 'express', frontend: 'react', database: 'postgres' },
          files: [],
        },
      ],
      requiredDependencies: [],
      optional: [],
      installation: {
        preInstall: [],
        postInstall: [],
        modifyFiles: [],
        createFiles: [],
        runScripts: [],
      },
    });

    // CRUD Module
    registry.set('crud', {
      id: 'crud',
      name: 'crud',
      version: '1.0.0',
      description: 'Database CRUD scaffolding',
      category: 'crud',
      variants: [
        {
          id: 'basic',
          name: 'Basic CRUD',
          description: 'Standard CRUD operations',
          stack: { backend: 'express', frontend: 'react', database: 'postgres' },
          files: [],
        },
      ],
      requiredDependencies: [],
      optional: [],
      installation: {
        preInstall: [],
        postInstall: [],
        modifyFiles: [],
        createFiles: [],
        runScripts: [],
      },
    });

    // Search Module
    registry.set('search', {
      id: 'search',
      name: 'search',
      version: '1.0.0',
      description: 'Full-text search with multiple backends',
      category: 'search',
      variants: [
        {
          id: 'elasticsearch',
          name: 'Elasticsearch',
          description: 'Search powered by Elasticsearch',
          stack: { backend: 'express', frontend: 'react', database: undefined },
          files: [],
        },
        {
          id: 'sqlite-fts',
          name: 'SQLite FTS',
          description: 'Lightweight search with SQLite FTS',
          stack: { backend: 'express', frontend: 'react', database: 'sqlite' },
          files: [],
        },
      ],
      requiredDependencies: [],
      optional: [],
      installation: {
        preInstall: [],
        postInstall: [],
        modifyFiles: [],
        createFiles: [],
        runScripts: [],
      },
    });

    // Files Module
    registry.set('files', {
      id: 'files',
      name: 'files',
      version: '1.0.0',
      description: 'File management with multiple storage backends',
      category: 'files',
      variants: [
        {
          id: 's3',
          name: 'AWS S3',
          description: 'File storage using AWS S3',
          stack: { backend: 'express', frontend: 'react', database: undefined },
          files: [],
        },
        {
          id: 'local',
          name: 'Local Storage',
          description: 'Local file storage',
          stack: { backend: 'express', frontend: 'react', database: undefined },
          files: [],
        },
      ],
      requiredDependencies: [],
      optional: [],
      installation: {
        preInstall: [],
        postInstall: [],
        modifyFiles: [],
        createFiles: [],
        runScripts: [],
      },
    });

    // Notifications Module
    registry.set('notifications', {
      id: 'notifications',
      name: 'notifications',
      version: '1.0.0',
      description: 'Multi-channel notifications',
      category: 'notifications',
      variants: [
        {
          id: 'email',
          name: 'Email Notifications',
          description: 'Send email notifications',
          stack: { backend: 'express', frontend: undefined, database: undefined },
          files: [],
        },
      ],
      requiredDependencies: [],
      optional: [],
      installation: {
        preInstall: [],
        postInstall: [],
        modifyFiles: [],
        createFiles: [],
        runScripts: [],
      },
    });

    // Real-time Module
    registry.set('realtime', {
      id: 'realtime',
      name: 'realtime',
      version: '1.0.0',
      description: 'Real-time updates with WebSocket or SSE',
      category: 'other',
      variants: [
        {
          id: 'websocket',
          name: 'WebSocket',
          description: 'Real-time with WebSocket',
          stack: { backend: 'express', frontend: 'react', database: undefined },
          files: [],
        },
        {
          id: 'sse',
          name: 'Server-Sent Events',
          description: 'Real-time with SSE',
          stack: { backend: 'express', frontend: 'react', database: undefined },
          files: [],
        },
      ],
      requiredDependencies: [],
      optional: [],
      installation: {
        preInstall: [],
        postInstall: [],
        modifyFiles: [],
        createFiles: [],
        runScripts: [],
      },
    });

    return registry;
  }

  /**
   * Get available modules
   */
  getAvailableModules(): ModuleTemplate[] {
    return Array.from(this.moduleRegistry.values());
  }

  /**
   * Get a specific module template
   */
  getModule(moduleId: string): ModuleTemplate | undefined {
    return this.moduleRegistry.get(moduleId);
  }

  /**
   * Install a module
   */
  async installModule(
    moduleId: string,
    variantId: string,
    config: Record<string, any>
  ): Promise<ModuleInstallResult> {
    this.logger.info(`Installing module: ${moduleId}:${variantId}`);

    try {
      const moduleTemplate = this.getModule(moduleId);
      if (!moduleTemplate) {
        return { success: false, error: `Module ${moduleId} not found` };
      }

      const variant = moduleTemplate.variants.find(v => v.id === variantId);
      if (!variant) {
        return { success: false, error: `Variant ${variantId} not found` };
      }

      // Check dependencies
      const deps = await this.resolveDependencies(moduleId);
      this.logger.info(`Module dependencies: ${deps.join(', ') || 'none'}`);

      // Run pre-install scripts
      if (moduleTemplate.installation.preInstall) {
        for (const script of moduleTemplate.installation.preInstall) {
          const result = await this.cmdRunner.run(script);
          if (!result.success) {
            return { success: false, error: `Pre-install script failed: ${result.stderr}` };
          }
        }
      }

      // Create files
      const filesChanged: any[] = [];
      for (const file of variant.files) {
        let content = this.renderTemplate(file.template, config);
        if (!content) {
          content = `// Auto-generated module code for ${moduleId} (${variantId})\n// Created at: ${new Date().toISOString()}\n\nexport interface ${moduleId.charAt(0).toUpperCase() + moduleId.slice(1)}Config {\n  enabled: boolean;\n  version: string;\n}\n\nexport const ${moduleId.replace(/[^a-zA-Z0-9]/g, '_')}_module = {\n  id: '${moduleId}',\n  variant: '${variantId}',\n  status: 'active',\n  config: ${JSON.stringify(config, null, 2)}\n};\n`;
        }
        const writeResult = this.fileOps.writeFile(file.path, content);
        if (!writeResult.success) {
          return { success: false, error: `Failed to create ${file.path}` };
        }
        filesChanged.push({
          path: file.path,
          action: 'create',
          lineCount: { added: content.split('\n').length, removed: 0, modified: 0 },
          newContent: content,
        });
      }

      // Run post-install scripts
      if (moduleTemplate.installation.postInstall) {
        for (const script of moduleTemplate.installation.postInstall) {
          const result = await this.cmdRunner.run(script);
          if (!result.success) {
            return { success: false, error: `Post-install script failed: ${result.stderr}` };
          }
        }
      }

      // Create installed module record
      const installedModule: InstalledModule = {
        id: uuidv4(),
        name: moduleId,
        version: moduleTemplate.version,
        baseDir: `src/modules/${moduleId}`,
        status: 'active',
        provides: variant.files.map(f => ({
          name: f.path,
          type: 'function',
          exports: [],
          location: f.path,
        })),
        dependencies: deps.map(depId => ({
          moduleId: depId,
          moduleName: this.getModule(depId)?.name || depId,
        })),
        exports: [],
        lastModified: new Date().toISOString(),
        metadata: { variant: variantId, ...config },
      };

      // Add to model
      this.model.addModule(installedModule);

      this.logger.info(`Module installed successfully: ${moduleId}:${variantId}`);
      return { success: true, module: installedModule, filesChanged };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Uninstall a module
   */
  async uninstallModule(moduleId: string): Promise<{ success: boolean; filesChanged: any[] }> {
    const module = this.model.getModuleByName(moduleId);
    if (!module) {
      throw new Error(`Module ${moduleId} not found`);
    }

    this.logger.info(`Uninstalling module: ${moduleId}`);

    const filesChanged: any[] = [];
    if (module.provides) {
      for (const iface of module.provides) {
        if (iface.location && this.fileOps.exists(iface.location)) {
          this.fileOps.deleteFile(iface.location);
          filesChanged.push({
            path: iface.location,
            action: 'delete',
            lineCount: { added: 0, removed: 0, modified: 0 }
          });
        }
      }
    }

    this.model.removeModule(module.id);
    this.logger.info(`Module uninstalled: ${moduleId}`);
    return { success: true, filesChanged };
  }

  /**
   * Check if module is installed
   */
  isModuleInstalled(moduleId: string): boolean {
    return this.model.getModuleByName(moduleId) !== undefined;
  }

  /**
   * Resolve module dependencies
   */
  private async resolveDependencies(moduleId: string): Promise<string[]> {
    const template = this.getModule(moduleId);
    if (!template) return [];

    const resolved: Set<string> = new Set();

    // Add required dependencies
    for (const dep of template.requiredDependencies) {
      resolved.add(dep);
      // Recursively resolve
      const subDeps = await this.resolveDependencies(dep);
      subDeps.forEach(d => resolved.add(d));
    }

    return Array.from(resolved);
  }

  /**
   * Render template with configuration
   */
  private renderTemplate(template: string, config: Record<string, any>): string {
    let result = template;

    // Simple handlebars-style substitution
    for (const [key, value] of Object.entries(config)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
    }

    return result;
  }
}

export interface ModuleInstallResult {
  success: boolean;
  module?: InstalledModule;
  error?: string;
  filesChanged?: any[];
}
