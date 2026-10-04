import * as fs from 'fs';
import * as path from 'path';
import { WorkspaceFs } from '../tools/WorkspaceFs';

export interface CatalogFile {
  source: string;
  target: string;
}

export interface CatalogVariant {
  id: string;
  name: string;
  description: string;
  stack: { backend?: string; frontend?: string; database?: string };
  requiredPackages?: string[];
  files: CatalogFile[];
  tests?: string[];
}

export interface CatalogModule {
  id: string;
  name: string;
  version: string;
  description: string;
  category: string;
  variants: CatalogVariant[];
}

export type ImplementationStatus = 'ready' | 'stub' | 'incomplete';
export type ConflictStatus = 'compatible' | 'conflict' | 'missing_impl';

export interface CatalogPlan {
  module: CatalogModule;
  variant: CatalogVariant;
  compatible: boolean;
  issues: string[];
  requiredPackages: string[];
  files: CatalogFile[];
  implementationStatus: ImplementationStatus;
  conflictStatus: ConflictStatus;
  mergeChoices: Array<'keep' | 'merge' | 'replace' | 'cancel'>;
}

export class ModuleCatalogIndex {
  constructor(private catalogRoot: string) {}

  public setCatalogRoot(catalogRoot: string): void {
    this.catalogRoot = catalogRoot;
  }

  public getCatalogRoot(): string {
    return this.catalogRoot;
  }

  list(): CatalogModule[] {
    if (!this.catalogRoot || !fs.existsSync(this.catalogRoot)) return [];
    return this.findManifests(this.catalogRoot).flatMap((manifestPath) => {
      try {
        return [JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as CatalogModule];
      } catch {
        return [];
      }
    });
  }

  get(id: string): CatalogModule | undefined {
    const needle = (id || '').toLowerCase();
    return this.list().find((m) => m.id.toLowerCase() === needle || m.name.toLowerCase() === needle);
  }

  search(query: string): CatalogModule[] {
    const terms = (query || '').toLowerCase().split(/\s+/).filter((t) => t.length > 1);
    if (terms.length === 0) return this.list();
    return this.list().filter((m) => {
      const hay = `${m.id} ${m.name} ${m.description} ${m.category} ${m.variants.map((v) => `${v.id} ${v.name} ${JSON.stringify(v.stack)}`).join(' ')}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }

  plan(id: string, variantId: string, projectRoot: string): CatalogPlan {
    const module = this.get(id);
    if (!module) throw new Error(`Catalog module '${id}' was not found`);
    const variant = module.variants.find((candidate) => candidate.id === variantId) || module.variants[0];
    if (!variant) throw new Error(`Variant '${variantId}' was not found for module '${id}'`);

    const issues: string[] = [];
    const packageJsonPath = path.join(projectRoot, 'package.json');
    const packageJson = fs.existsSync(packageJsonPath)
      ? JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
      : {};
    const installedPackages = { ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) };
    const requiredPackages = (variant.requiredPackages || []).filter((pkg) => !installedPackages[pkg]);

    const moduleDir = this.moduleDirectory(module.id);
    let missingSources = 0;
    for (const file of variant.files) {
      const sourcePath = path.join(moduleDir, file.source);
      if (!fs.existsSync(sourcePath)) {
        missingSources += 1;
        issues.push(`Catalog source is missing: ${file.source}`);
      }
      if (path.isAbsolute(file.target) || file.target.split(/[\\/]+/).includes('..')) {
        issues.push(`Unsafe module target: ${file.target}`);
      }
    }

    const implementationStatus: ImplementationStatus =
      variant.files.length === 0 ? 'stub' : missingSources > 0 ? 'incomplete' : 'ready';

    if (implementationStatus === 'stub') {
      issues.push('Module is a catalog stub: source files are not authored yet. Install will register placement and scaffold a placeholder.');
    }

    const conflictStatus: ConflictStatus =
      implementationStatus === 'stub' || implementationStatus === 'incomplete' ? 'missing_impl' : 'compatible';

    const unsafe = issues.some((i) => i.startsWith('Unsafe'));
    const compatible = !unsafe && (implementationStatus === 'ready' || implementationStatus === 'stub');

    return {
      module,
      variant,
      compatible,
      issues,
      requiredPackages,
      files: variant.files,
      implementationStatus,
      conflictStatus,
      mergeChoices: ['keep', 'merge', 'replace', 'cancel'],
    };
  }

  install(plan: CatalogPlan, fileOps: WorkspaceFs): Array<{ path: string; action: 'create' | 'modify'; newContent: string }> {
    if (plan.issues.some((i) => i.startsWith('Unsafe'))) {
      throw new Error(plan.issues.join('; '));
    }

    const written: Array<{ path: string; action: 'create' | 'modify'; newContent: string }> = [];
    const moduleDir = this.moduleDirectory(plan.module.id);

    if (plan.implementationStatus === 'ready') {
      for (const file of plan.files) {
        const content = fs.readFileSync(path.join(moduleDir, file.source), 'utf8');
        const result = fileOps.writeFile(file.target, content);
        if (!result.success) throw new Error(result.error || `Could not write ${file.target}`);
        written.push({ path: file.target, action: 'create', newContent: content });
      }
      return written;
    }

    const placeholderPath = `src/modules/${plan.module.id}/README.md`;
    const placeholder = `# ${plan.module.name}

Catalog stub (${plan.variant.id}). Implementation source will be added later.

${plan.module.description}

Stack: ${JSON.stringify(plan.variant.stack)}
Required packages: ${(plan.variant.requiredPackages || []).join(', ') || 'none'}
`;
    fileOps.writeFile(placeholderPath, placeholder);
    written.push({ path: placeholderPath, action: 'create', newContent: placeholder });
    return written;
  }

  private moduleDirectory(id: string): string {
    const manifest = this.findManifests(this.catalogRoot).find((file) => {
      try {
        return JSON.parse(fs.readFileSync(file, 'utf8')).id === id;
      } catch {
        return false;
      }
    });
    if (!manifest) throw new Error(`Catalog module '${id}' was not found`);
    return path.dirname(manifest);
  }

  private findManifests(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const child = path.join(dir, entry.name);
      if (entry.isDirectory()) return this.findManifests(child);
      return entry.name === 'module.json' ? [child] : [];
    });
  }
}
