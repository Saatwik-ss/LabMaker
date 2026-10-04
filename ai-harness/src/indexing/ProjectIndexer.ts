import * as fs from 'fs';
import * as path from 'path';
import {
  IProjectIndexer,
  ProjectIndex,
  FileIndex,
  CodeSymbol,
  ProjectStackProfile,
  ContextQuery,
  RetrievedContext,
  ArchitectureGraphData
} from '../interfaces';
import { APIRoute, Relationship, FrontendStack, Backend, Database } from '@codex/shared';
import { Logger } from '../utils/Logger';

export class ProjectIndexer implements IProjectIndexer {
  private logger: Logger;
  private cache: Map<string, ProjectIndex> = new Map();
  private defaultIgnore = [
    'node_modules',
    '.git',
    'dist',
    'build',
    '.next',
    'coverage',
    '.codex',
    'scratch',
    // Generated runtime/index data is neither useful context for an LLM nor a
    // meaningful answer to a workspace-file query.
    'chroma_db',
    '__pycache__',
    '.pytest_cache'
  ];

  constructor() {
    this.logger = new Logger('ProjectIndexer');
  }

  public async indexProject(projectRoot: string): Promise<ProjectIndex> {
    this.logger.info(`Indexing project at: ${projectRoot}`);
    const resolvedRoot = path.resolve(projectRoot);
    const allFilePaths = this.walkDirectory(resolvedRoot);

    const filesMap = new Map<string, FileIndex>();
    for (const filePath of allFilePaths) {
      const fileIndex = await this.indexFile(filePath, resolvedRoot);
      if (fileIndex) {
        filesMap.set(fileIndex.relativePath, fileIndex);
      }
    }

    const profile = await this.detectProjectProfile(resolvedRoot, allFilePaths);
    const routes = this.detectRoutes(filesMap);
    const relationships = this.inferRelationships(profile, routes);

    const projectIndex: ProjectIndex = {
      projectRoot: resolvedRoot,
      indexedAt: new Date().toISOString(),
      totalFiles: filesMap.size,
      profile,
      files: filesMap,
      routes,
      relationships,
    };

    this.cache.set(resolvedRoot, projectIndex);
    this.logger.info(`Indexed ${filesMap.size} files, ${routes.length} routes, ${relationships.length} relationships`);
    return projectIndex;
  }

  public async indexDirectory(dirPath: string): Promise<FileIndex[]> {
    const resolvedDir = path.resolve(dirPath);
    const filePaths = this.walkDirectory(resolvedDir);
    const result: FileIndex[] = [];
    for (const fp of filePaths) {
      const fi = await this.indexFile(fp, resolvedDir);
      if (fi) result.push(fi);
    }
    return result;
  }

  public async indexFile(filePath: string, rootDir?: string): Promise<FileIndex | null> {
    try {
      const absPath = path.resolve(filePath);
      if (!fs.existsSync(absPath)) return null;
      const stat = fs.statSync(absPath);
      if (!stat.isFile()) return null;

      const baseRoot = rootDir ? path.resolve(rootDir) : path.dirname(absPath);
      const relativePath = path.relative(baseRoot, absPath).replace(/\\/g, '/');
      const ext = path.extname(absPath).toLowerCase();
      const content = fs.readFileSync(absPath, 'utf8');

      const isTest = relativePath.includes('.test.') || relativePath.includes('.spec.') || relativePath.startsWith('tests/');
      const isConfig = relativePath.endsWith('config.json') || relativePath.endsWith('config.ts') || relativePath.endsWith('config.js') || relativePath.endsWith('.env');
      const isRoute = relativePath.includes('route') || relativePath.includes('controller') || relativePath.includes('api/');
      const isComponent = (ext === '.tsx' || ext === '.jsx' || ext === '.vue') && !isTest;

      const symbols = this.extractSymbols(content, ext);
      const imports = this.extractImports(content);
      const exports = symbols.filter(s => s.exported).map(s => s.name);

      return {
        relativePath,
        absolutePath: absPath,
        extension: ext,
        size: stat.size,
        lastModified: stat.mtime.toISOString(),
        symbols,
        imports,
        exports,
        isTest,
        isComponent,
        isRoute,
        isConfig
      };
    } catch (err: any) {
      this.logger.warn(`Failed to index file ${filePath}: ${err.message}`);
      return null;
    }
  }

  public async queryContext(query: ContextQuery): Promise<RetrievedContext> {
    const promptTerms = query.prompt.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    let projectIndex: ProjectIndex | undefined;
    if (query.projectRoot) {
      const resolved = path.resolve(query.projectRoot);
      projectIndex = this.cache.get(resolved);
      if (!projectIndex) {
        projectIndex = await this.indexProject(resolved);
      }
    } else {
      const allIndices = Array.from(this.cache.values());
      projectIndex = allIndices[allIndices.length - 1];
    }

    if (!projectIndex) {
      return {
        relevantFiles: [],
        stackSummary: 'No project indexed yet',
        architectureSummary: 'No architecture data',
        routes: []
      };
    }

    const scoredFiles: Array<{ path: string; content: string; relevanceScore: number; symbols: string[] }> = [];

    projectIndex.files.forEach((fileIndex) => {
      let score = 0;
      const relPathLower = fileIndex.relativePath.toLowerCase();

      for (const term of promptTerms) {
        if (relPathLower.includes(term)) score += 5;
        if (fileIndex.symbols.some(s => s.name.toLowerCase().includes(term))) score += 4;
        if (fileIndex.imports.some(imp => imp.toLowerCase().includes(term))) score += 2;
      }

      if (query.targetPaths && query.targetPaths.some(tp => fileIndex.relativePath.startsWith(tp))) {
        score += 10;
      }

      if (score > 0) {
        try {
          const content = fs.readFileSync(fileIndex.absolutePath, 'utf8');
          scoredFiles.push({
            path: fileIndex.relativePath,
            content: content.slice(0, 3000), // Limit per file snippet
            relevanceScore: score,
            symbols: fileIndex.symbols.map(s => s.name)
          });
        } catch {}
      }
    });

    scoredFiles.sort((a, b) => b.relevanceScore - a.relevanceScore);
    const maxFiles = query.maxFiles || 8;
    const relevantFiles = scoredFiles.slice(0, maxFiles);

    const stack = projectIndex.profile;
    const stackSummary = `Stack: Frontend=${stack.frontend?.framework || 'none'}, Backend=${stack.backends.map(b => b.framework).join(', ') || 'none'}, DB=${stack.databases.map(d => d.type).join(', ') || 'none'}, Lang=${stack.language}`;
    const architectureSummary = `${projectIndex.relationships.length} architectural relationships detected across ${projectIndex.totalFiles} files.`;

    return {
      relevantFiles,
      stackSummary,
      architectureSummary,
      routes: projectIndex.routes
    };
  }

  public async getArchitectureGraph(projectRoot: string): Promise<ArchitectureGraphData> {
    const index = this.cache.get(path.resolve(projectRoot)) || await this.indexProject(projectRoot);
    const nodes: ArchitectureGraphData['nodes'] = [];

    if (index.profile.frontend) {
      nodes.push({
        id: 'client-layer',
        name: 'Client Application',
        type: 'frontend',
        technology: `${index.profile.frontend.framework} (${index.profile.frontend.versionManager || 'vite'})`,
        status: 'active'
      });
    }

    index.profile.backends.forEach(b => {
      nodes.push({
        id: b.id,
        name: b.name,
        type: 'backend',
        technology: `${b.framework} (${b.language})`,
        port: b.port,
        status: 'active'
      });
    });

    index.profile.databases.forEach(db => {
      nodes.push({
        id: db.id,
        name: db.name,
        type: 'database',
        technology: db.type,
        status: 'active'
      });
    });

    return {
      nodes,
      relationships: index.relationships
    };
  }

  public async getProjectProfile(projectRoot: string): Promise<ProjectStackProfile> {
    const index = this.cache.get(path.resolve(projectRoot));
    if (index) return index.profile;
    const newlyIndexed = await this.indexProject(projectRoot);
    return newlyIndexed.profile;
  }

  // Internal discovery helpers
  private walkDirectory(dir: string): string[] {
    let results: string[] = [];
    if (!fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (this.defaultIgnore.includes(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results = results.concat(this.walkDirectory(fullPath));
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
    return results;
  }

  private extractSymbols(content: string, ext: string): CodeSymbol[] {
    const symbols: CodeSymbol[] = [];
    if (!['.ts', '.tsx', '.js', '.jsx', '.py'].includes(ext)) return symbols;

    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const isExport = line.trim().startsWith('export ');

      // Function detection
      const funcMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_]+)/);
      if (funcMatch) {
        symbols.push({ name: funcMatch[1], kind: 'function', line: lineNum, exported: isExport });
      }

      // Class detection
      const classMatch = line.match(/(?:export\s+)?class\s+([a-zA-Z0-9_]+)/);
      if (classMatch) {
        symbols.push({ name: classMatch[1], kind: 'class', line: lineNum, exported: isExport });
      }

      // Interface detection
      const ifaceMatch = line.match(/(?:export\s+)?interface\s+([a-zA-Z0-9_]+)/);
      if (ifaceMatch) {
        symbols.push({ name: ifaceMatch[1], kind: 'interface', line: lineNum, exported: isExport });
      }

      // Arrow function component
      const constMatch = line.match(/(?:export\s+)?const\s+([a-zA-Z0-9_]+)\s*[:=]\s*(?:React\.FC|\(?\s*\w*\s*\)?\s*=>)/);
      if (constMatch) {
        symbols.push({ name: constMatch[1], kind: 'component', line: lineNum, exported: isExport });
      }
    });

    return symbols;
  }

  private extractImports(content: string): string[] {
    const imports: string[] = [];
    const importRegex = /(?:import\s+.*?from\s+['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\))/g;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1] || match[2]);
    }
    return imports;
  }

  private async detectProjectProfile(projectRoot: string, files: string[]): Promise<ProjectStackProfile> {
    let language: ProjectStackProfile['language'] = 'typescript';
    let frontend: FrontendStack | undefined;
    const backends: Backend[] = [];
    const databases: Database[] = [];
    let packageManager: 'npm' | 'yarn' | 'pnpm' = 'npm';
    let hasTailwind = false;

    // Check lockfiles
    if (fs.existsSync(path.join(projectRoot, 'pnpm-lock.yaml'))) packageManager = 'pnpm';
    else if (fs.existsSync(path.join(projectRoot, 'yarn.lock'))) packageManager = 'yarn';

    // Inspect package.json
    const pkgFiles = files.filter(f => f.endsWith('package.json'));
    for (const pkgFile of pkgFiles) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
        const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

        if (deps['tailwindcss']) hasTailwind = true;

        if (deps['react']) {
          frontend = {
            framework: deps['next'] ? 'next.js' : 'react',
            versionManager: deps['vite'] ? 'vite' : deps['next'] ? 'next' : null,
            language: 'typescript',
            components: []
          };
        } else if (deps['vue']) {
          frontend = {
            framework: 'vue',
            versionManager: deps['vite'] ? 'vite' : null,
            language: 'typescript',
            components: []
          };
        }

        if (deps['express']) {
          backends.push({
            id: 'express-server',
            name: 'Express API Server',
            framework: 'express',
            language: 'typescript',
            port: 3001,
            routes: [],
            middleware: [],
            services: []
          });
        }

        if (deps['pg'] || deps['postgres']) {
          databases.push({ id: 'postgres-db', name: 'PostgreSQL Database', type: 'postgresql', host: 'localhost', tables: [] });
        } else if (deps['mongodb'] || deps['mongoose']) {
          databases.push({ id: 'mongo-db', name: 'MongoDB Database', type: 'mongodb', host: 'localhost', tables: [] });
        } else if (deps['sqlite3'] || deps['better-sqlite3']) {
          databases.push({ id: 'sqlite-db', name: 'SQLite Database', type: 'sqlite', host: 'localhost', tables: [] });
        }
      } catch {}
    }

    return {
      projectRoot,
      language,
      frontend,
      backends,
      databases,
      packageManager,
      hasTailwind,
      namingConvention: 'camelCase',
      apiStructure: 'express-router'
    };
  }

  private detectRoutes(files: Map<string, FileIndex>): APIRoute[] {
    const routes: APIRoute[] = [];
    files.forEach((file) => {
      if (!file.isRoute) return;
      try {
        const content = fs.readFileSync(file.absolutePath, 'utf8');
        const routeRegex = /router\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/g;
        let match: RegExpExecArray | null;
        while ((match = routeRegex.exec(content)) !== null) {
          routes.push({
            path: match[2],
            method: match[1].toUpperCase() as any,
            handler: file.relativePath
          });
        }
      } catch {}
    });
    return routes;
  }

  private inferRelationships(profile: ProjectStackProfile, routes: APIRoute[]): Relationship[] {
    const relationships: Relationship[] = [];
    if (profile.frontend && profile.backends.length > 0) {
      relationships.push({
        id: 'rel-fe-be',
        source: 'client-layer',
        target: profile.backends[0].id,
        type: 'http',
        label: `HTTP API (${routes.length} routes)`
      });
    }

    if (profile.backends.length > 0 && profile.databases.length > 0) {
      relationships.push({
        id: 'rel-be-db',
        source: profile.backends[0].id,
        target: profile.databases[0].id,
        type: 'database',
        label: 'SQL Queries / State'
      });
    }

    return relationships;
  }
}
