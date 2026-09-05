import * as fs from 'fs';
import * as path from 'path';

/**
 * Resolve the Codex monorepo root (not backend cwd).
 * Absolute OS paths stay server-side only.
 */
export function findCodexRoot(start: string = process.cwd()): string {
  if (process.env.CODEX_ROOT) {
    return path.resolve(process.env.CODEX_ROOT);
  }

  let dir = path.resolve(start);
  for (let i = 0; i < 10; i++) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.name === 'codex' && Array.isArray(pkg.workspaces)) {
          return dir;
        }
      } catch {
        /* continue */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  if (path.basename(path.resolve(start)) === 'backend') {
    return path.resolve(start, '..');
  }

  return path.resolve(start);
}

export function getCodexDir(codexRoot: string): string {
  return path.join(codexRoot, '.codex');
}

export function getProjectsStorePath(codexRoot: string): string {
  return path.join(getCodexDir(codexRoot), 'projects.json');
}

export function getWorkspacesRoot(codexRoot: string): string {
  return path.join(getCodexDir(codexRoot), 'workspaces');
}

export function getWorkspacePath(codexRoot: string, projectId: string): string {
  const safeId = projectId.replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.join(getWorkspacesRoot(codexRoot), safeId);
}
