import { Router, Request, Response, NextFunction } from 'express';
import { CodexRuntime } from '../../core/CodexRuntime';
import * as path from 'path';
import * as fs from 'fs';

export function createTerminalHandler(runtime: CodexRuntime): Router {
  const router = Router();

  // POST /api/terminal/exec - Execute terminal command in active project workspace
  router.post('/exec', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { command, timeoutMs = 30000, cwd } = req.body || {};

      if (!command || typeof command !== 'string' || !command.trim()) {
        return res.status(400).json({ success: false, error: 'Command is required' });
      }

      const trimmedCmd = command.trim();

      // Guard against dangerous escape attempts or catastrophic disk deletion
      const dangerousPatterns = [
        /rm\s+-rf\s+[\/\\]/i,
        /format\s+[a-z]:/i,
        /mkfs/i,
        /:(){ :|:& };:/, // Fork bomb
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(trimmedCmd)) {
          return res.status(403).json({
            success: false,
            error: 'Command blocked by security sandbox policies.',
            exitCode: 126,
            stdout: '',
            stderr: 'Execution denied: command matches blocked destructive pattern.',
          });
        }
      }

      const { workspaceRoot, project } = runtime.bindActive();

      // Calculate working directory safely sandboxed inside workspaceRoot
      let targetCwd = workspaceRoot;
      if (cwd && typeof cwd === 'string') {
        const safeRel = cwd.replace(/\\/g, '/').replace(/^\/+/, '');
        const resolved = path.resolve(workspaceRoot, safeRel);
        if (resolved.startsWith(workspaceRoot) && fs.existsSync(resolved)) {
          targetCwd = resolved;
        }
      }

      const startTime = Date.now();
      const result = await runtime.cmdRunner.runWithTimeout(trimmedCmd, Math.min(timeoutMs, 120000), {
        cwd: targetCwd,
      });
      const durationMs = Date.now() - startTime;

      // Ensure no raw host paths are leaked in output if we can make it relative
      const relativeCwd = path.relative(workspaceRoot, targetCwd).replace(/\\/g, '/') || '.';

      res.json({
        success: result.success,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        exitCode: result.exitCode ?? (result.success ? 0 : 1),
        durationMs,
        cwd: relativeCwd,
        projectId: project.id,
      });
    } catch (err: any) {
      next(err);
    }
  });

  // GET /api/terminal/quick-commands - Suggest standard development commands
  router.get('/quick-commands', (req: Request, res: Response) => {
    try {
      const { workspaceRoot } = runtime.bindActive();
      const commands = [
        { label: 'Run Tests', command: 'npm test', description: 'Run workspace unit tests' },
        { label: 'Type Check', command: 'npx tsc --noEmit', description: 'Run TypeScript compiler type check' },
        { label: 'Build Project', command: 'npm run build', description: 'Compile production build artifacts' },
        { label: 'Lint Codebase', command: 'npm run lint', description: 'Execute linter checks' },
        { label: 'Git Status', command: 'git status', description: 'Inspect git working tree state' },
        { label: 'List Files', command: process.platform === 'win32' ? 'dir /b' : 'ls -la', description: 'List workspace contents' },
      ];

      res.json({ commands, cwd: '.' });
    } catch (err: any) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
