import { execSync, exec } from 'child_process';
import { Logger } from '../utils/Logger';

/**
 * CommandRunner executes shell commands in the project context.
 * Used for running linters, tests, builds, etc.
 */
export class CommandRunner {
  private projectRoot: string;
  private logger: Logger;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.logger = new Logger('CommandRunner');
  }

  public setProjectRoot(projectRoot: string): void {
    this.projectRoot = projectRoot;
  }

  /**
   * Run a command synchronously (blocking)
   */
  runSync(command: string, options: CommandOptions = {}): CommandResult {
    try {
      this.logger.info(`Running: ${command}`);

      const result = execSync(command, {
        cwd: this.projectRoot,
        encoding: 'utf-8',
        stdio: options.quiet ? 'pipe' : 'inherit',
      });

      return {
        success: true,
        stdout: result,
        stderr: '',
        exitCode: 0,
      };
    } catch (error: any) {
      this.logger.error(`Command failed: ${command}`, error.message);
      return {
        success: false,
        stdout: error.stdout || '',
        stderr: error.stderr || String(error.message),
        exitCode: error.status || 1,
      };
    }
  }

  /**
   * Run a command asynchronously (non-blocking)
   */
  async run(command: string, options: CommandOptions = {}): Promise<CommandResult> {
    return new Promise((resolve) => {
      this.logger.info(`Running async: ${command}`);

      exec(
        command,
        {
          cwd: this.projectRoot,
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        },
        (error, stdout, stderr) => {
          if (error) {
            this.logger.error(`Command failed: ${command}`, stderr);
            resolve({
              success: false,
              stdout,
              stderr,
              exitCode: error.code || 1,
            });
          } else {
            this.logger.info(`Command succeeded: ${command}`);
            resolve({
              success: true,
              stdout,
              stderr,
              exitCode: 0,
            });
          }
        }
      );
    });
  }

  /**
   * Run a command with timeout
   */
  async runWithTimeout(
    command: string,
    timeoutMs: number = 30000,
    options: CommandOptions = {}
  ): Promise<CommandResult> {
    return Promise.race([
      this.run(command, options),
      new Promise<CommandResult>((resolve) => {
        setTimeout(() => {
          resolve({
            success: false,
            stdout: '',
            stderr: `Command timed out after ${timeoutMs}ms`,
            exitCode: -1,
          });
        }, timeoutMs);
      }),
    ]);
  }

  /**
   * Check if a command exists
   */
  commandExists(command: string): boolean {
    try {
      const checkCommand = process.platform === 'win32' ? `where ${command}` : `which ${command}`;
      execSync(checkCommand, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Install npm packages
   */
  async installPackages(packages: string[], isDev: boolean = false): Promise<CommandResult> {
    const devFlag = isDev ? '--save-dev' : '--save';
    const command = `npm install ${packages.join(' ')} ${devFlag}`;
    return this.run(command);
  }

  /**
   * Uninstall npm packages
   */
  async uninstallPackages(packages: string[]): Promise<CommandResult> {
    const command = `npm uninstall ${packages.join(' ')}`;
    return this.run(command);
  }

  /**
   * Get npm package version
   */
  getPackageVersion(packageName: string): string | null {
    try {
      const result = execSync(`npm list ${packageName} --depth=0`, {
        cwd: this.projectRoot,
        encoding: 'utf-8',
        stdio: 'pipe',
      });

      const match = result.match(/([0-9.]+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }
}

export interface CommandOptions {
  quiet?: boolean;
  cwd?: string;
  env?: Record<string, string>;
}

export interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}
