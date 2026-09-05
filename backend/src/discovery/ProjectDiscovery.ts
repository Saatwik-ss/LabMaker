import {
  FrontendStack,
  Backend,
  Database,
  APIRoute,
  Relationship,
  InstalledModule,
} from '@codex/shared';
import { ApplicationModelManager } from '../core/ApplicationModel';
import { Logger } from '../utils/Logger';
import * as fs from 'fs';
import * as path from 'path';

export class ProjectDiscovery {
  private projectRoot: string;
  private manager: ApplicationModelManager;
  private logger: Logger;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.manager = new ApplicationModelManager();
    this.logger = new Logger('ProjectDiscovery');
  }

  public setProjectRoot(projectRoot: string): void {
    this.projectRoot = projectRoot;
    this.manager = new ApplicationModelManager();
  }

  public async discover(): Promise<ApplicationModelManager> {
    this.logger.info(`Starting discovery for workspace`);
    this.manager = new ApplicationModelManager();
    const ignoreList = ['node_modules', '.git', 'dist', 'build', '.codex', 'scratch'];
    const allFiles = this.walkDirectory(this.projectRoot, ignoreList);

    this.detectFrameworks(allFiles);
    this.detectDatabases(allFiles);
    this.detectModules(allFiles);
    this.detectRoutes(allFiles);
    this.inferRelationships();

    const model = this.manager.getModel();
    model.files.projectRoot = '.';
    return this.manager;
  }

  private walkDirectory(dir: string, ignore: string[] = []): string[] {
    let results: string[] = [];
    if (!fs.existsSync(dir)) return results;

    const list = fs.readdirSync(dir);
    for (const file of list) {
      if (ignore.includes(file)) continue;

      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat && stat.isDirectory()) {
        results = results.concat(this.walkDirectory(filePath, ignore));
      } else {
        results.push(filePath);
      }
    }
    return results;
  }

  private detectFrameworks(files: string[]): void {
    const packageJsonFiles = files.filter((f) => f.endsWith('package.json'));
    for (const pkgFile of packageJsonFiles) {
      try {
        const pkgContent = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
        this.detectJavaScriptFrameworks(pkgContent);
      } catch (err) {
        this.logger.error(`Error parsing ${pkgFile}`, err);
      }
    }
    this.detectPythonFrameworks(files);
  }

  private detectJavaScriptFrameworks(packageJson: any): void {
    const deps = { ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) };

    if (deps['react']) {
      const isNext = !!deps['next'];
      const isVite = !!deps['vite'];
      const stack: FrontendStack = {
        framework: isNext ? 'next.js' : 'react',
        versionManager: isNext ? 'next' : isVite ? 'vite' : null,
        language: 'typescript',
        components: [],
      };
      this.manager.setFrontendStack(stack);
    } else if (deps['vue']) {
      const stack: FrontendStack = {
        framework: 'vue',
        versionManager: deps['vite'] ? 'vite' : null,
        language: 'typescript',
        components: [],
      };
      this.manager.setFrontendStack(stack);
    }

    if (deps['express']) {
      const backend: Backend = {
        id: 'express-backend',
        name: 'Express Backend',
        framework: 'express',
        language: 'typescript',
        port: 3001,
        routes: [],
        middleware: [],
        services: [],
      };
      this.manager.addBackend(backend);
    }
  }

  private detectPythonFrameworks(files: string[]): void {
    const pyFiles = files.filter((f) => f.endsWith('.py'));
    let hasFastAPI = false;
    let hasFlask = false;

    for (const f of pyFiles) {
      try {
        const content = fs.readFileSync(f, 'utf8');
        if (content.includes('from fastapi import') || content.includes('import fastapi')) {
          hasFastAPI = true;
        }
        if (content.includes('from flask import') || content.includes('import flask')) {
          hasFlask = true;
        }
      } catch {
        // Ignore read errors
      }
    }

    if (hasFastAPI) {
      const backend: Backend = {
        id: 'fastapi-backend',
        name: 'FastAPI Backend',
        framework: 'fastapi',
        language: 'python',
        port: 8000,
        routes: [],
        middleware: [],
        services: [],
      };
      this.manager.addBackend(backend);
    }
    if (hasFlask) {
      const backend: Backend = {
        id: 'flask-backend',
        name: 'Flask Backend',
        framework: 'flask',
        language: 'python',
        port: 5000,
        routes: [],
        middleware: [],
        services: [],
      };
      this.manager.addBackend(backend);
    }
  }

  private detectDatabases(files: string[]): void {
    let hasPg = false;
    let hasSqlite = false;
    let hasMongo = false;

    const packageJsonFiles = files.filter((f) => f.endsWith('package.json'));
    for (const pkgFile of packageJsonFiles) {
      try {
        const pkgContent = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
        const deps = { ...(pkgContent.dependencies || {}), ...(pkgContent.devDependencies || {}) };
        if (deps['pg'] || deps['typeorm'] || deps['prisma']) hasPg = true;
        if (deps['sqlite3']) hasSqlite = true;
        if (deps['mongoose'] || deps['mongodb']) hasMongo = true;
      } catch {
        // Ignore errors
      }
    }

    if (hasPg) {
      const db: Database = {
        id: 'db-postgres',
        type: 'postgresql',
        name: 'PostgreSQL Database',
        host: 'localhost',
        port: 5432,
      };
      this.manager.addDatabase(db);
    }
    if (hasSqlite) {
      const db: Database = {
        id: 'db-sqlite',
        type: 'sqlite',
        name: 'SQLite Database',
        host: 'localhost',
      };
      this.manager.addDatabase(db);
    }
    if (hasMongo) {
      const db: Database = {
        id: 'db-mongo',
        type: 'mongodb',
        name: 'MongoDB Database',
        host: 'localhost',
        port: 27017,
      };
      this.manager.addDatabase(db);
    }
  }

  private detectModules(files: string[]): void {
    const authFiles = files.filter(
      (f) => f.includes('auth.ts') || f.includes('authService') || f.includes('login')
    );
    if (authFiles.length > 0) {
      const mod: InstalledModule = {
        id: 'auth-module',
        name: 'auth',
        status: 'active',
        version: '1.0.0',
        baseDir: 'src/modules/auth',
        provides: [],
        dependencies: [],
        exports: ['login', 'logout', 'register'],
        lastModified: new Date().toISOString(),
      };
      this.manager.addModule(mod);
    }
  }

  private detectRoutes(files: string[]): void {
    for (const f of files) {
      try {
        if (f.endsWith('.ts') || f.endsWith('.js')) {
          const content = fs.readFileSync(f, 'utf8');
          const routes = this.detectExpressRoutes(content, f);
          const backends = this.manager.getBackends();
          const expressBackend = backends.find((b) => b.framework === 'express');
          if (expressBackend) {
            expressBackend.routes.push(...routes);
          }
        } else if (f.endsWith('.py')) {
          const content = fs.readFileSync(f, 'utf8');
          const routes = this.detectFastAPIRoutes(content, f);
          const backends = this.manager.getBackends();
          const pyBackend = backends.find((b) => b.framework === 'fastapi' || b.framework === 'flask');
          if (pyBackend) {
            pyBackend.routes.push(...routes);
          }
        }
      } catch {
        // Ignore file read errors
      }
    }
  }

  private detectExpressRoutes(fileContent: string, filePath: string): APIRoute[] {
    const routes: APIRoute[] = [];
    const regex = /router\.(get|post|put|delete|patch)\(['"`](.*?)['"`]/g;
    let match;
    while ((match = regex.exec(fileContent)) !== null) {
      routes.push({
        method: match[1].toUpperCase() as APIRoute['method'],
        path: match[2],
        handler: filePath,
      });
    }
    return routes;
  }

  private detectFastAPIRoutes(fileContent: string, filePath: string): APIRoute[] {
    const routes: APIRoute[] = [];
    const regex = /@app\.(get|post|put|delete|patch)\(['"`](.*?)['"`]/g;
    let match;
    while ((match = regex.exec(fileContent)) !== null) {
      routes.push({
        method: match[1].toUpperCase() as APIRoute['method'],
        path: match[2],
        handler: filePath,
      });
    }
    return routes;
  }

  private inferRelationships(): void {
    const backends = this.manager.getBackends();
    const dbs = this.manager.getDatabases();

    if (backends.length > 0 && dbs.length > 0) {
      const rel: Relationship = {
        id: 'rel-backend-db',
        source: backends[0].id,
        target: dbs[0].id,
        type: 'database',
        label: 'Connects to Database',
      };
      this.manager.addRelationship(rel);
    }
  }
}
