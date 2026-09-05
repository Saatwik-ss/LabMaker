import { FileOperationResult, FileEntry, FileStats } from '@codex/shared';
import { Logger } from '../utils/Logger';
import * as fs from 'fs';
import * as path from 'path';

export class FileOperations {
  private projectRoot: string;
  private operationLog: Array<{ operation: string; path: string; timestamp: string }>;
  private logger: Logger;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.operationLog = [];
    this.logger = new Logger('FileOperations');
  }

  public setProjectRoot(projectRoot: string): void {
    this.projectRoot = projectRoot;
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

  private resolvePath(filePath: string): string {
    const rel = this.toRelativeInput(filePath);
    const root = path.resolve(this.projectRoot);
    const resolved = path.resolve(root, rel);
    const prefix = root.endsWith(path.sep) ? root : root + path.sep;
    if (resolved !== root && !resolved.startsWith(prefix)) {
      throw new Error('Path escapes the active workspace');
    }
    return resolved;
  }

  private toPublicPath(absPath: string): string {
    const rel = path.relative(this.projectRoot, absPath).replace(/\\/g, '/');
    return rel || '.';
  }

  private logOp(operation: string, filePath: string): void {
    this.operationLog.push({ operation, path: filePath, timestamp: new Date().toISOString() });
    this.logger.info(`FileOperation: ${operation} on ${filePath}`);
  }

  public readFile(filePath: string): FileOperationResult {
    const fullPath = this.resolvePath(filePath);
    try {
      this.logOp('readFile', fullPath);
      if (!fs.existsSync(fullPath)) return { success: false, error: 'File not found' };
      const content = fs.readFileSync(fullPath, 'utf8');
      return { success: true, content };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public writeFile(filePath: string, content: string): FileOperationResult {
    const fullPath = this.resolvePath(filePath);
    try {
      this.logOp('writeFile', fullPath);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fullPath, content, 'utf8');
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public editFile(filePath: string, edits: Array<{ line: number; content: string }>): FileOperationResult {
    const fullPath = this.resolvePath(filePath);
    try {
      this.logOp('editFile', fullPath);
      if (!fs.existsSync(fullPath)) return { success: false, error: 'File not found' };

      const lines = fs.readFileSync(fullPath, 'utf8').split('\n');
      for (const edit of edits) {
        if (edit.line >= 0 && edit.line < lines.length) {
          lines[edit.line] = edit.content;
        }
      }
      fs.writeFileSync(fullPath, lines.join('\n'), 'utf8');
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public replaceInFile(filePath: string, search: string, replace: string): FileOperationResult {
    const fullPath = this.resolvePath(filePath);
    try {
      this.logOp('replaceInFile', fullPath);
      if (!fs.existsSync(fullPath)) return { success: false, error: 'File not found' };

      let content = fs.readFileSync(fullPath, 'utf8');
      content = content.replace(new RegExp(search, 'g'), replace);
      fs.writeFileSync(fullPath, content, 'utf8');
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public deleteFile(filePath: string): FileOperationResult {
    const fullPath = this.resolvePath(filePath);
    try {
      this.logOp('deleteFile', fullPath);
      if (!fs.existsSync(fullPath)) return { success: false, error: 'File not found' };
      fs.unlinkSync(fullPath);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public createDirectory(dirPath: string): FileOperationResult {
    const fullPath = this.resolvePath(dirPath);
    try {
      this.logOp('createDirectory', fullPath);
      if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public listDirectory(dirPath: string): FileEntry[] {
    const fullPath = this.resolvePath(dirPath);
    try {
      this.logOp('listDirectory', fullPath);
      if (!fs.existsSync(fullPath)) return [];

      const skip = new Set(['node_modules', '.git', 'dist', '.codex']);
      const entries = fs.readdirSync(fullPath, { withFileTypes: true });
      return entries
        .filter((e) => !skip.has(e.name))
        .map((e) => {
          const itemPath = path.join(fullPath, e.name);
          return {
            name: e.name,
            path: this.toPublicPath(itemPath),
            isDirectory: e.isDirectory(),
            size: e.isFile() ? fs.statSync(itemPath).size : 0,
          };
        });
    } catch (e) {
      this.logger.error('Error listing directory', e);
      return [];
    }
  }

  public exists(filePath: string): boolean {
    const fullPath = this.resolvePath(filePath);
    this.logOp('exists', fullPath);
    return fs.existsSync(fullPath);
  }

  public getStats(filePath: string): FileStats | null {
    const fullPath = this.resolvePath(filePath);
    try {
      this.logOp('getStats', fullPath);
      if (!fs.existsSync(fullPath)) return null;
      const stats = fs.statSync(fullPath);
      return {
        size: stats.size,
        createdAt: stats.birthtime.toISOString(),
        modifiedAt: stats.mtime.toISOString(),
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
      };
    } catch {
      return null;
    }
  }

  public copyFile(source: string, destination: string): FileOperationResult {
    const srcPath = this.resolvePath(source);
    const destPath = this.resolvePath(destination);
    try {
      this.logOp('copyFile', `${srcPath} -> ${destPath}`);
      if (!fs.existsSync(srcPath)) return { success: false, error: 'Source not found' };
      const dir = path.dirname(destPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(srcPath, destPath);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public appendToFile(filePath: string, content: string): FileOperationResult {
    const fullPath = this.resolvePath(filePath);
    try {
      this.logOp('appendToFile', fullPath);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(fullPath, content, 'utf8');
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public findFiles(pattern: string, directory: string = ''): string[] {
    const startPath = this.resolvePath(directory);
    this.logOp('findFiles', `${pattern} in ${startPath}`);

    const results: string[] = [];
    try {
      if (!fs.existsSync(startPath)) return results;

      const walk = (dir: string) => {
        const list = fs.readdirSync(dir);
        for (const file of list) {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);
          if (stat && stat.isDirectory()) {
            walk(filePath);
          } else {
            // basic pattern matching
            const regexPattern = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
            if (regexPattern.test(file) || file.includes(pattern.replace(/\*/g, ''))) {
              results.push(filePath);
            }
          }
        }
      };
      walk(startPath);
    } catch (e) {
      this.logger.error('Error finding files', e);
    }
    return results;
  }

  public getOperationLog(): Array<{ operation: string; path: string; timestamp: string }> {
    return this.operationLog;
  }

  public getProjectRoot(): string {
    return this.projectRoot;
  }

  public getAbsolutePath(filePath: string): string {
    return this.resolvePath(filePath);
  }
}

