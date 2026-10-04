import { IAICapability, HarnessContext } from '../interfaces';
import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../utils/Logger';

export interface TerminalExecutionInput {
  command: string;
  timeoutMs?: number;
  cwd?: string;
  reason?: string;
}

export interface TerminalExecutionOutput {
  success: boolean;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  cwd: string;
}

export class TerminalExecutionCapability implements IAICapability<TerminalExecutionInput, TerminalExecutionOutput> {
  readonly id = 'terminal-execution';
  readonly name = 'Terminal Command Execution';
  readonly description = 'Executes shell commands in the sandboxed active project workspace for testing, building, and validation.';

  private logger: Logger;

  constructor() {
    this.logger = new Logger('TerminalExecutionCapability');
  }

  async execute(input: TerminalExecutionInput, context: HarnessContext): Promise<TerminalExecutionOutput> {
    const rawCmd = (input.command || '').trim();
    if (!rawCmd) {
      throw new Error('Command is required');
    }

    const timeoutMs = Math.min(input.timeoutMs || 30000, 120000);
    const workspaceRoot = path.resolve(context.projectRoot);

    // Sandbox check: verify cwd stays within workspaceRoot
    let targetCwd = workspaceRoot;
    if (input.cwd) {
      const safeRel = input.cwd.replace(/\\/g, '/').replace(/^\/+/, '');
      const candidate = path.resolve(workspaceRoot, safeRel);
      if (candidate.startsWith(workspaceRoot) && fs.existsSync(candidate)) {
        targetCwd = candidate;
      }
    }

    // Safety guard against dangerous destructive commands
    const blockedPatterns = [
      /rm\s+-rf\s+[\/\\]/i,
      /format\s+[a-z]:/i,
      /mkfs/i,
      /:(){ :|:& };:/,
    ];
    for (const pat of blockedPatterns) {
      if (pat.test(rawCmd)) {
        return {
          success: false,
          command: rawCmd,
          stdout: '',
          stderr: 'Execution denied: command blocked by security sandbox.',
          exitCode: 126,
          durationMs: 0,
          cwd: path.relative(workspaceRoot, targetCwd).replace(/\\/g, '/') || '.',
        };
      }
    }

    this.logger.info(`LLM executing terminal command: "${rawCmd}" in ${targetCwd}`);
    const startTime = Date.now();

    return new Promise<TerminalExecutionOutput>((resolve) => {
      exec(
        rawCmd,
        {
          cwd: targetCwd,
          timeout: timeoutMs,
          maxBuffer: 10 * 1024 * 1024,
        },
        (error, stdout, stderr) => {
          const durationMs = Date.now() - startTime;
          const relativeCwd = path.relative(workspaceRoot, targetCwd).replace(/\\/g, '/') || '.';

          if (error) {
            resolve({
              success: false,
              command: rawCmd,
              stdout: stdout || '',
              stderr: stderr || error.message,
              exitCode: error.code || 1,
              durationMs,
              cwd: relativeCwd,
            });
          } else {
            resolve({
              success: true,
              command: rawCmd,
              stdout: stdout || '',
              stderr: stderr || '',
              exitCode: 0,
              durationMs,
              cwd: relativeCwd,
            });
          }
        }
      );
    });
  }
}
