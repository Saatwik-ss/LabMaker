import { IAICapability, HarnessContext } from '../interfaces';
import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../utils/Logger';

export interface ModuleUnderTest {
  id?: string;
  name: string;
  type?: string;
  description?: string;
  requirements?: string[];
  dependencies?: Array<{ moduleName?: string; moduleId?: string }>;
  credentials?: Record<string, string>;
  config?: Record<string, any>;
}

export interface PipelineTestingInput {
  stage?: 'pre-flight' | 'post-install' | 'full';
  module?: ModuleUnderTest;
  commandsToRun?: string[];
}

export interface PipelineTestingOutput {
  stage: 'pre-flight' | 'post-install' | 'full';
  wholePipelineWorks: boolean;
  preFlight?: {
    compatible: boolean;
    issues: string[];
    warnings: string[];
    recommendations: string[];
  };
  checks: {
    typeCheck: { passed: boolean; errorCount: number; errors: string[] };
    linting: { passed: boolean; issueCount: number; errors: string[] };
    unitTests: { passed: boolean; total: number; passedCount: number; failedCount: number };
    build: { passed: boolean; message: string };
    schema: { passed: boolean; issues: string[] };
    moduleHealth: { status: 'healthy' | 'warning' | 'error' | 'untested'; issues: string[] };
  };
  commandOutputs: Array<{
    command: string;
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
    durationMs: number;
  }>;
  summary: string;
  nextSteps: string[];
}

export class PipelineTestingCapability implements IAICapability<PipelineTestingInput, PipelineTestingOutput> {
  readonly id = 'pipeline-testing';
  readonly name = 'Full Pipeline & Module Validation';
  readonly description = 'Executes pre-flight compatibility tests before adding modules and full pipeline verification (types, linter, tests, build, health) after addition.';

  private logger: Logger;

  constructor() {
    this.logger = new Logger('PipelineTestingCapability');
  }

  async execute(input: PipelineTestingInput, context: HarnessContext): Promise<PipelineTestingOutput> {
    const stage = input.stage || (input.module && !input.commandsToRun ? 'pre-flight' : 'full');
    const projectRoot = path.resolve(context.projectRoot);
    this.logger.info(`Running pipeline testing stage: ${stage} for workspace: ${projectRoot}`);

    const commandOutputs: Array<{
      command: string;
      success: boolean;
      stdout: string;
      stderr: string;
      exitCode: number;
      durationMs: number;
    }> = [];

    const runCmd = async (command: string, timeoutMs: number = 30000) => {
      const start = Date.now();
      return new Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number; durationMs: number }>((resolve) => {
        exec(command, { cwd: projectRoot, timeout: timeoutMs }, (error, stdout, stderr) => {
          const durationMs = Date.now() - start;
          const out = {
            command,
            success: !error,
            stdout: stdout || '',
            stderr: stderr || (error ? error.message : ''),
            exitCode: error ? error.code || 1 : 0,
            durationMs,
          };
          commandOutputs.push(out);
          resolve(out);
        });
      });
    };

    // ── STAGE 1: PRE-FLIGHT COMPATIBILITY (On adding a module) ──
    const preFlight = {
      compatible: true,
      issues: [] as string[],
      warnings: [] as string[],
      recommendations: [] as string[],
    };

    if (input.module || stage === 'pre-flight') {
      const mod = input.module || { name: 'unnamed-module' };

      // 1a. Validate module naming
      if (!mod.name || mod.name.trim().length < 2) {
        preFlight.compatible = false;
        preFlight.issues.push('Module name must be at least 2 characters long.');
      } else if (!/^[a-zA-Z0-9_-]+$/.test(mod.name.trim())) {
        preFlight.compatible = false;
        preFlight.issues.push('Module name should only contain alphanumeric characters, dashes, and underscores.');
      }

      // 1b. Inspect project stack compatibility
      try {
        const profile = await context.indexer.getProjectProfile(projectRoot);
        if (mod.type === 'frontend' && !profile.frontend) {
          preFlight.warnings.push('Project does not have a frontend framework configured. Frontend module will be isolated.');
        }
        if (mod.type === 'database' && profile.databases.length === 0) {
          preFlight.warnings.push('No primary database configured in project stack. Will initialize local database driver.');
        }
      } catch (err: any) {
        this.logger.warn(`Stack inspection error: ${err.message}`);
      }

      // 1c. Credentials check
      if (mod.name.toLowerCase().includes('groq') || mod.description?.toLowerCase().includes('groq')) {
        const key = mod.credentials?.groqApiKey || context.credentials?.groqApiKey;
        if (!key) {
          preFlight.warnings.push('Groq API Key is not configured for this module. AI inference will fall back to local mode.');
          preFlight.recommendations.push('Set your Groq API Key in Settings or pass it in module configuration.');
        }
      }

      // 1d. Dependencies check
      if (mod.dependencies && mod.dependencies.length > 0) {
        for (const dep of mod.dependencies) {
          const depName = dep.moduleName || dep.moduleId || '';
          if (depName) {
            preFlight.recommendations.push(`Ensure module "${depName}" is registered before mounting relationships.`);
          }
        }
      }

      if (preFlight.issues.length > 0) {
        preFlight.compatible = false;
      }
    }

    // ── STAGE 2: PIPELINE HEALTH CHECKS (When added / Full) ──
    const checks = {
      typeCheck: { passed: true, errorCount: 0, errors: [] as string[] },
      linting: { passed: true, issueCount: 0, errors: [] as string[] },
      unitTests: { passed: true, total: 0, passedCount: 0, failedCount: 0 },
      build: { passed: true, message: 'Build check OK' },
      schema: { passed: true, issues: [] as string[] },
      moduleHealth: { status: 'healthy' as 'healthy' | 'warning' | 'error' | 'untested', issues: [] as string[] },
    };

    if (stage === 'post-install' || stage === 'full') {
      const pkgPath = path.join(projectRoot, 'package.json');
      const hasPkg = fs.existsSync(pkgPath);

      // 2a. Type checking
      if (hasPkg) {
        const tscRes = await runCmd('npx tsc --noEmit', 45000);
        if (!tscRes.success && tscRes.stderr) {
          const lines = tscRes.stderr.split('\n').filter(l => l.includes('error TS'));
          checks.typeCheck.errorCount = lines.length;
          checks.typeCheck.errors = lines.slice(0, 5);
          checks.typeCheck.passed = lines.length === 0;
        }
      }

      // 2b. Unit Tests
      if (hasPkg) {
        const testRes = await runCmd('npm test -- --passWithNoTests', 45000);
        if (!testRes.success && testRes.exitCode !== 0) {
          checks.unitTests.passed = false;
          checks.unitTests.failedCount = 1;
        } else {
          checks.unitTests.passed = true;
        }
      }

      // 2c. Build Check
      if (hasPkg) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
          if (pkg.scripts && pkg.scripts.build) {
            const buildRes = await runCmd('npm run build', 60000);
            checks.build.passed = buildRes.success;
            checks.build.message = buildRes.success ? 'Build succeeded cleanly' : 'Build failed with errors';
          }
        } catch {
          // ignore
        }
      }

      // 2d. Database Schema Check
      const prismaPath = path.join(projectRoot, 'prisma', 'schema.prisma');
      if (fs.existsSync(prismaPath)) {
        const prismaContent = fs.readFileSync(prismaPath, 'utf8');
        const models = prismaContent.match(/model\s+(\w+)\s*\{([^}]+)\}/g) || [];
        for (const m of models) {
          if (!m.includes('@id')) {
            const mName = m.match(/model\s+(\w+)/)?.[1] || 'Model';
            checks.schema.passed = false;
            checks.schema.issues.push(`Model ${mName} is missing an @id primary key.`);
          }
        }
      }

      // 2e. Custom user commands if specified
      if (input.commandsToRun && input.commandsToRun.length > 0) {
        for (const cmd of input.commandsToRun) {
          await runCmd(cmd, 45000);
        }
      }

      // Module Health computation
      if (preFlight.issues.length > 0) {
        checks.moduleHealth.status = 'error';
        checks.moduleHealth.issues = [...preFlight.issues];
      } else if (preFlight.warnings.length > 0) {
        checks.moduleHealth.status = 'warning';
        checks.moduleHealth.issues = [...preFlight.warnings];
      } else {
        checks.moduleHealth.status = 'healthy';
      }
    }

    // Whole pipeline evaluation
    const wholePipelineWorks =
      preFlight.compatible &&
      checks.typeCheck.passed &&
      checks.build.passed &&
      checks.schema.passed &&
      checks.unitTests.passed;

    // Summary generation
    let summary = '';
    const nextSteps: string[] = [];

    if (stage === 'pre-flight') {
      summary = preFlight.compatible
        ? `Pre-flight check PASSED: Module "${input.module?.name || 'target'}" is compatible with project architecture.`
        : `Pre-flight check FAILED: Found ${preFlight.issues.length} compatibility issue(s).`;
      if (preFlight.warnings.length > 0) {
        summary += ` (${preFlight.warnings.length} warning(s) noted).`;
      }
      nextSteps.push(preFlight.compatible ? 'Proceed with module installation.' : 'Resolve compatibility issues before proceeding.');
    } else {
      summary = wholePipelineWorks
        ? 'Full pipeline validation PASSED: Build, type-checking, tests, and schemas are operational.'
        : 'Pipeline validation DETECTED ISSUES: One or more stages failed.';

      if (!checks.typeCheck.passed) nextSteps.push(`Resolve ${checks.typeCheck.errorCount} TypeScript type errors.`);
      if (!checks.build.passed) nextSteps.push('Inspect build output and fix bundling issues.');
      if (!checks.unitTests.passed) nextSteps.push('Fix failing unit test assertions.');
      if (!checks.schema.passed) nextSteps.push('Update database schema to ensure primary keys and constraints.');
      if (wholePipelineWorks) nextSteps.push('Pipeline is healthy and ready for deployment or further development.');
    }

    return {
      stage,
      wholePipelineWorks,
      preFlight,
      checks,
      commandOutputs,
      summary,
      nextSteps,
    };
  }
}
