import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/Logger';
import { findCodexRoot, getWorkspacePath, getWorkspacesRoot } from './codexPaths';

export interface ImportedFile {
  relativePath: string;
  content: Buffer;
}

export class WorkspaceStore {
  readonly codexRoot: string;
  private logger: Logger;

  constructor(codexRoot?: string) {
    this.codexRoot = findCodexRoot(codexRoot || process.cwd());
    this.logger = new Logger('WorkspaceStore');
    const root = getWorkspacesRoot(this.codexRoot);
    if (!fs.existsSync(root)) {
      fs.mkdirSync(root, { recursive: true });
    }
  }

  public getPath(projectId: string): string {
    return getWorkspacePath(this.codexRoot, projectId);
  }

  public ensure(projectId: string, name: string, description?: string): string {
    const dir = this.getPath(projectId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      this.scaffold(projectId, name, description);
    }
    return dir;
  }

  public scaffold(projectId: string, name: string, description?: string): void {
    const dir = this.getPath(projectId);
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });

    const readmePath = path.join(dir, 'README.md');
    if (!fs.existsSync(readmePath)) {
      fs.writeFileSync(
        readmePath,
        `# ${name}\n\n${description || 'Codex workspace'}\n\nThis repository is managed in the browser. Edit files, chat with the assistant, and install modules here.\n`,
        'utf8'
      );
    }

    const pkgPath = path.join(dir, 'package.json');
    if (!fs.existsSync(pkgPath)) {
      fs.writeFileSync(
        pkgPath,
        JSON.stringify(
          {
            name: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace',
            version: '0.1.0',
            private: true,
            description: description || '',
            scripts: {
              start: 'node src/index.js',
              test: 'echo "No tests yet"',
            },
          },
          null,
          2
        ),
        'utf8'
      );
    }

    const indexPath = path.join(dir, 'src', 'index.ts');
    if (!fs.existsSync(indexPath)) {
      fs.writeFileSync(
        indexPath,
        `import express from 'express';

export const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// Base Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    application: '${name}',
    description: '${(description || '').replace(/'/g, "\\'")}',
    timestamp: new Date().toISOString(),
  });
});

export function startServer() {
  return app.listen(PORT, () => {
    console.log(\`${name} running on http://127.0.0.1:\${PORT}\`);
  });
}

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export default app;
`,
        'utf8'
      );
    }

    this.logger.info(`Scaffolded workspace for ${projectId} at ${dir}`);
  }

  public writeImportedFiles(projectId: string, files: ImportedFile[]): number {
    const root = this.ensure(projectId, projectId);
    let written = 0;
    for (const file of files) {
      const rel = this.sanitizeRelative(file.relativePath);
      if (!rel) continue;
      const dest = path.join(root, rel);
      const resolvedRoot = path.resolve(root);
      const resolvedDest = path.resolve(dest);
      if (!resolvedDest.startsWith(resolvedRoot + path.sep) && resolvedDest !== resolvedRoot) {
        continue;
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, file.content);
      written += 1;
    }
    this.logger.info(`Imported ${written} files into workspace ${projectId}`);
    return written;
  }

  public sanitizeRelative(input: string): string {
    let p = (input || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!p || p.includes('\0')) return '';
    const parts = p.split('/').filter((seg) => seg && seg !== '.' && seg !== '..');
    if (parts.some((seg) => seg === 'node_modules' && false)) {
      /* keep user node_modules out of import by skip below */
    }
    const skipped = new Set(['.git', 'node_modules', 'dist', '.codex']);
    if (parts.some((seg) => skipped.has(seg))) return '';
    return parts.join('/');
  }

  public deleteWorkspace(projectId: string): boolean {
    const dir = this.getPath(projectId);
    if (fs.existsSync(dir)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
        this.logger.info(`Deleted workspace directory for ${projectId} at ${dir}`);
        return true;
      } catch (err) {
        this.logger.error(`Failed to delete workspace directory for ${projectId}`, err);
        return false;
      }
    }
    return false;
  }
}
