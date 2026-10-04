import * as fs from 'fs';
import * as path from 'path';

export interface WorkspaceWriteResult {
  success: boolean;
  error?: string;
  content?: string;
}

/**
 * Workspace-scoped filesystem with the same path-escape rules as backend FileOperations.
 * Lives in the harness so MCP/stdio and the agent loop do not import the backend package.
 */
export class WorkspaceFs {
  constructor(private projectRoot: string) {}

  public setProjectRoot(projectRoot: string): void {
    this.projectRoot = projectRoot;
  }

  public getProjectRoot(): string {
    return this.projectRoot;
  }

  private toRelativeInput(filePath: string): string {
    let p = (filePath || '.').replace(/\\/g, '/');
    if (path.win32.isAbsolute(filePath) || path.posix.isAbsolute(filePath) || /^[a-zA-Z]:/.test(filePath)) {
      throw new Error('Absolute filesystem paths are not allowed');
    }
    p = p.replace(/^\/+/, '');
    if (p === '') p = '.';
    return p;
  }

  public resolvePath(filePath: string): string {
    const rel = this.toRelativeInput(filePath);
    const root = path.resolve(this.projectRoot);
    const resolved = path.resolve(root, rel);
    const prefix = root.endsWith(path.sep) ? root : root + path.sep;
    if (resolved !== root && !resolved.startsWith(prefix)) {
      throw new Error('Path escapes the active workspace');
    }
    return resolved;
  }

  public toPublicPath(absPath: string): string {
    const rel = path.relative(this.projectRoot, absPath).replace(/\\/g, '/');
    return rel || '.';
  }

  public readFile(filePath: string): WorkspaceWriteResult {
    try {
      const fullPath = this.resolvePath(filePath);
      if (!fs.existsSync(fullPath)) return { success: false, error: 'File not found' };
      return { success: true, content: fs.readFileSync(fullPath, 'utf8') };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public writeFile(filePath: string, content: string): WorkspaceWriteResult {
    try {
      const fullPath = this.resolvePath(filePath);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fullPath, content, 'utf8');
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public replaceInFile(filePath: string, search: string, replace: string): WorkspaceWriteResult {
    try {
      const fullPath = this.resolvePath(filePath);
      if (!fs.existsSync(fullPath)) return { success: false, error: 'File not found' };
      const content = fs.readFileSync(fullPath, 'utf8');
      if (!content.includes(search)) {
        return { success: false, error: 'Search string not found in file' };
      }
      fs.writeFileSync(fullPath, content.replace(search, replace), 'utf8');
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public deleteFile(filePath: string): WorkspaceWriteResult {
    try {
      const fullPath = this.resolvePath(filePath);
      if (!fs.existsSync(fullPath)) return { success: false, error: 'File not found' };
      fs.unlinkSync(fullPath);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public listDirectory(dirPath: string): Array<{ name: string; path: string; isDirectory: boolean }> {
    const fullPath = this.resolvePath(dirPath);
    if (!fs.existsSync(fullPath)) return [];
    const skip = new Set(['node_modules', '.git', 'dist', '.codex']);
    return fs.readdirSync(fullPath, { withFileTypes: true })
      .filter((e) => !skip.has(e.name))
      .map((e) => ({
        name: e.name,
        path: this.toPublicPath(path.join(fullPath, e.name)),
        isDirectory: e.isDirectory(),
      }));
  }

  public exists(filePath: string): boolean {
    try {
      return fs.existsSync(this.resolvePath(filePath));
    } catch {
      return false;
    }
  }
}
