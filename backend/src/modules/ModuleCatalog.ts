import * as fs from 'fs';
import * as path from 'path';
import { FileOperations } from '../tools/FileOperations';

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

export interface ModulePlan {
  module: CatalogModule;
  variant: CatalogVariant;
  compatible: boolean;
  issues: string[];
  requiredPackages: string[];
  files: Array<{ source: string; target: string }>;
  implementationStatus: 'ready' | 'stub' | 'incomplete';
  conflictStatus: 'compatible' | 'conflict' | 'missing_impl';
  mergeChoices: Array<'keep' | 'merge' | 'replace' | 'cancel'>;
}

/**
 * Reads real, versioned module source from module-library/.  This deliberately
 * does not generate implementation code: a catalog entry is installable only
 * when its manifest names concrete source files.
 */
export class ModuleCatalog {
  constructor(private readonly catalogRoot: string) {}

  list(): CatalogModule[] {
    if (!fs.existsSync(this.catalogRoot)) return [];
    const manifests = this.findManifests(this.catalogRoot);
    return manifests.flatMap((manifestPath) => {
      try {
        return [JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as CatalogModule];
      } catch {
        return [];
      }
    });
  }

  get(id: string): CatalogModule | undefined {
    return this.list().find((module) => module.id === id);
  }

  plan(id: string, variantId: string, projectRoot: string): ModulePlan {
    const module = this.get(id);
    if (!module) throw new Error(`Source-backed module '${id}' was not found`);
    const variant = module.variants.find((candidate) => candidate.id === variantId);
    if (!variant) throw new Error(`Variant '${variantId}' was not found for module '${id}'`);

    const issues: string[] = [];
    const packageJsonPath = path.join(projectRoot, 'package.json');
    const packageJson = fs.existsSync(packageJsonPath)
      ? JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
      : {};
    const installedPackages = { ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) };
    const requiredPackages = (variant.requiredPackages || []).filter((pkg) => !installedPackages[pkg]);

    let missingSources = 0;
    for (const file of variant.files) {
      const sourcePath = path.join(this.moduleDirectory(id), file.source);
      if (!fs.existsSync(sourcePath)) {
        missingSources += 1;
        issues.push(`Catalog source is missing: ${file.source}`);
      }
      if (path.isAbsolute(file.target) || file.target.split(/[\\/]+/).includes('..')) {
        issues.push(`Unsafe module target: ${file.target}`);
      }
    }

    const implementationStatus: ModulePlan['implementationStatus'] =
      variant.files.length === 0 ? 'stub' : missingSources > 0 ? 'incomplete' : 'ready';
    if (implementationStatus === 'stub') {
      issues.push('Module is a catalog stub: source files are not authored yet.');
    }
    const unsafe = issues.some((i) => i.startsWith('Unsafe'));
    const conflictStatus: ModulePlan['conflictStatus'] =
      implementationStatus === 'stub' || implementationStatus === 'incomplete' ? 'missing_impl' : 'compatible';

    return {
      module,
      variant,
      compatible: !unsafe && (implementationStatus === 'ready' || implementationStatus === 'stub'),
      issues,
      requiredPackages,
      files: variant.files,
      implementationStatus,
      conflictStatus,
      mergeChoices: ['keep', 'merge', 'replace', 'cancel'],
    };
  }

  install(plan: ModulePlan, fileOps: FileOperations): Array<{ path: string; action: 'create'; newContent: string; lineCount: { added: number; removed: number; modified: number } }> {
    if (plan.issues.some((i) => i.startsWith('Unsafe'))) throw new Error(plan.issues.join('; '));
    if (plan.implementationStatus === 'stub' || plan.files.length === 0) {
      const placeholder = `# ${plan.module.name}\n\nCatalog stub (${plan.variant.id}). Implementation source will be added later.\n\n${plan.module.description}\n`;
      const target = `src/modules/${plan.module.id}/README.md`;
      const result = fileOps.writeFile(target, placeholder);
      if (!result.success) throw new Error(result.error || `Could not write ${target}`);
      return [{ path: target, action: 'create' as const, newContent: placeholder, lineCount: { added: placeholder.split('\n').length, removed: 0, modified: 0 } }];
    }
    if (!plan.compatible) throw new Error(plan.issues.join('; '));
    if (plan.requiredPackages.length > 0) {
      throw new Error(`Install blocked until required packages are available: ${plan.requiredPackages.join(', ')}`);
    }
    return plan.files.map((file) => {
      const content = fs.readFileSync(path.join(this.moduleDirectory(plan.module.id), file.source), 'utf8');
      const result = fileOps.writeFile(file.target, content);
      if (!result.success) throw new Error(result.error || `Could not write ${file.target}`);
      return { path: file.target, action: 'create' as const, newContent: content, lineCount: { added: content.split('\n').length, removed: 0, modified: 0 } };
    });
  }

  private moduleDirectory(id: string): string {
    const manifest = this.findManifests(this.catalogRoot).find((file) => {
      try { return JSON.parse(fs.readFileSync(file, 'utf8')).id === id; } catch { return false; }
    });
    if (!manifest) throw new Error(`Source-backed module '${id}' was not found`);
    return path.dirname(manifest);
  }

  private findManifests(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const child = path.join(dir, entry.name);
      if (entry.isDirectory()) return this.findManifests(child);
      return entry.name === 'module.json' ? [child] : [];
    });
  }
}
