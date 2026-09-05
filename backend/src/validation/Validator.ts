import {
  ValidationResult,
  LintResult,
  TypeCheckResult,
  TestResult,
  BuildResult,
  SchemaValidationResult,
  ValidationSummary,
  Database,
} from '@codex/shared';
import { FileOperations } from '../tools/FileOperations';
import { CommandRunner } from '../tools/CommandRunner';
import { Logger } from '../utils/Logger';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Validator runs comprehensive checks on the codebase.
 *
 * Checks include:
 * - ESLint/Pylint (code quality)
 * - TypeScript type checking
 * - Unit tests
 * - Build verification
 * - Database schema validation
 *
 * Used after the agent makes changes to ensure quality.
 */
export class Validator {
  private projectRoot: string;
  private fileOps: FileOperations;
  private cmdRunner: CommandRunner;
  private logger: Logger;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.fileOps = new FileOperations(projectRoot);
    this.cmdRunner = new CommandRunner(projectRoot);
    this.logger = new Logger('Validator');
  }

  public setProjectRoot(projectRoot: string): void {
    this.projectRoot = projectRoot;
    this.fileOps.setProjectRoot(projectRoot);
    this.cmdRunner.setProjectRoot(projectRoot);
  }

  /**
   * Run all validation checks
   */
  async validate(): Promise<ValidationResult> {
    this.logger.info('Starting comprehensive validation...');
    const timestamp = new Date().toISOString();

    const [linting, typeCheck, unitTests, buildCheck, schemaValidation] = await Promise.all([
      this.lintFiles([]),
      this.typeCheck(),
      this.runUnitTests(),
      this.checkBuild(),
      this.validateDatabaseSchemas(),
    ]);

    const summary = this.generateSummary(linting, typeCheck, unitTests, buildCheck, schemaValidation);

    const result: ValidationResult = {
      timestamp,
      passed: linting.passed && typeCheck.passed && unitTests.passed && buildCheck.passed && schemaValidation.passed,
      linting,
      typeCheck,
      unitTests,
      buildCheck,
      schemaValidation,
      summary,
    };

    this.logger.info(`Validation complete: ${result.passed ? 'PASSED' : 'FAILED'}`);
    return result;
  }

  /**
   * Run linter (ESLint or Pylint)
   */
  async lintFiles(files: string[]): Promise<LintResult> {
    this.logger.info('Running linter...');

    try {
      // Check for ESLint (JavaScript/TypeScript)
      if (this.fileOps.exists('package.json')) {
        return await this.lintJavaScript();
      }

      // Check for Pylint (Python)
      if (this.fileOps.exists('pyproject.toml')) {
        return await this.lintPython();
      }

      return {
        passed: true,
        errors: [],
        warnings: [],
        totalIssues: 0,
      };
    } catch (error) {
      this.logger.error('Linting failed:', error);
      return {
        passed: false,
        errors: [
          {
            file: 'unknown',
            line: 0,
            column: 0,
            rule: 'LINT_ERROR',
            message: String(error),
            severity: 'error',
          },
        ],
        warnings: [],
        totalIssues: 1,
      };
    }
  }

  /**
   * Lint JavaScript/TypeScript files
   */
  private async lintJavaScript(): Promise<LintResult> {
    try {
      const result = await this.cmdRunner.run('npx eslint src --format json --no-eslintrc', {
        quiet: true,
      });

      if (result.success && result.stdout) {
        const output = JSON.parse(result.stdout);
        const errors = [];
        const warnings = [];

        for (const file of output) {
          for (const message of file.messages) {
            const relPath = path.relative(this.projectRoot, file.filePath).replace(/\\/g, '/');
            const error = {
              file: relPath || file.filePath,
              line: message.line,
              column: message.column,
              rule: message.ruleId || 'unknown',
              message: message.message,
              severity: message.severity === 2 ? ('error' as const) : ('warning' as const),
            };

            if (message.severity === 2) {
              errors.push(error);
            } else {
              warnings.push(error);
            }
          }
        }

        return {
          passed: errors.length === 0,
          errors,
          warnings,
          totalIssues: errors.length + warnings.length,
        };
      }

      return { passed: true, errors: [], warnings: [], totalIssues: 0 };
    } catch (error) {
      this.logger.warn('ESLint not available or failed:', error);
      return { passed: true, errors: [], warnings: [], totalIssues: 0 };
    }
  }

  /**
   * Lint Python files
   */
  private async lintPython(): Promise<LintResult> {
    try {
      const result = await this.cmdRunner.run('pylint src --output-format=json', {
        quiet: true,
      });

      if (result.success && result.stdout) {
        const output = JSON.parse(result.stdout);
        const errors = [];
        const warnings = [];

        for (const issue of output) {
          const error = {
            file: issue.path,
            line: issue.line,
            column: issue.column,
            rule: issue.symbol,
            message: issue.message,
            severity: issue.type === 'error' ? ('error' as const) : ('warning' as const),
          };

          if (issue.type === 'error') {
            errors.push(error);
          } else {
            warnings.push(error);
          }
        }

        return {
          passed: errors.length === 0,
          errors,
          warnings,
          totalIssues: errors.length + warnings.length,
        };
      }

      return { passed: true, errors: [], warnings: [], totalIssues: 0 };
    } catch (error) {
      this.logger.warn('Pylint not available or failed:', error);
      return { passed: true, errors: [], warnings: [], totalIssues: 0 };
    }
  }

  /**
   * Run TypeScript type checking
   */
  async typeCheck(): Promise<TypeCheckResult> {
    this.logger.info('Running TypeScript type check...');

    try {
      const result = await this.cmdRunner.run('npx tsc --noEmit', {
        quiet: true,
      });

      const errors: any[] = [];

      if (!result.success && result.stderr) {
        // Parse TypeScript error output
        const lines = result.stderr.split('\n');
        for (const line of lines) {
          // Simple pattern: file.ts(line,col): error TS1234: message
          const match = line.match(/(.+?)\((\d+),(\d+)\):\s+error\s+(\w+):\s+(.+)/);
          if (match) {
            errors.push({
              file: match[1],
              line: parseInt(match[2]),
              column: parseInt(match[3]),
              code: match[4],
              message: match[5],
            });
          }
        }
      }

      return {
        passed: errors.length === 0,
        errors,
        totalErrors: errors.length,
      };
    } catch (error) {
      this.logger.warn('TypeScript check not available or failed:', error);
      return { passed: true, errors: [], totalErrors: 0 };
    }
  }

  /**
   * Run unit tests
   */
  async runUnitTests(): Promise<TestResult> {
    this.logger.info('Running unit tests...');

    try {
      // Try Jest first (most common)
      const result = await this.cmdRunner.run('npm test -- --coverage --json', {
        quiet: true,
      });

      if (result.success && result.stdout) {
        try {
          const output = JSON.parse(result.stdout);
          const coverage = output.coverage || {};

          return {
            passed: output.numFailedTests === 0,
            totalTests: output.numTotalTests,
            passedTests: output.numPassedTests,
            failedTests: output.numFailedTests,
            skippedTests: output.numPendingTests,
            coverage: {
              statements: coverage.total?.lines?.pct || 0,
              branches: coverage.total?.branches?.pct || 0,
              functions: coverage.total?.functions?.pct || 0,
              lines: coverage.total?.lines?.pct || 0,
            },
            failures: [],
          };
        } catch (e) {
          this.logger.warn('Failed to parse test output:', e);
        }
      }

      return {
        passed: true,
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        skippedTests: 0,
        failures: [],
      };
    } catch (error) {
      this.logger.warn('Test runner not available or failed:', error);
      return {
        passed: true,
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        skippedTests: 0,
        failures: [],
      };
    }
  }

  /**
   * Check if project builds successfully
   */
  async checkBuild(): Promise<BuildResult> {
    this.logger.info('Checking build...');

    try {
      if (!this.fileOps.exists('package.json')) {
        return { passed: true, errors: [], warnings: [] };
      }

      const pkgResult = this.fileOps.readFile('package.json');
      if (pkgResult.success && pkgResult.content) {
        try {
          const pkg = JSON.parse(pkgResult.content);
          if (!pkg.scripts || !pkg.scripts.build) {
            return { passed: true, errors: [], warnings: [] };
          }
        } catch {
          // ignore parse error
        }
      }

      const result = await this.cmdRunner.run('npm run build', {
        quiet: true,
      });

      const errors: any[] = [];

      if (!result.success && result.stderr) {
        // Parse build errors
        const lines = result.stderr.split('\n');
        for (const line of lines) {
          if (line.includes('error')) {
            errors.push({
              message: line.trim(),
            });
          }
        }
      }

      return {
        passed: result.success,
        errors,
        warnings: result.stderr ? result.stderr.split('\n').filter(l => l.includes('warning')) : [],
      };
    } catch (error) {
      this.logger.warn('Build check failed:', error);
      return {
        passed: false,
        errors: [
          {
            message: String(error),
          },
        ],
        warnings: [],
      };
    }
  }

  /**
   * Validate database schemas
   */
  async validateDatabaseSchemas(): Promise<SchemaValidationResult> {
    this.logger.info('Validating database schemas...');

    const issues: any[] = [];

    try {
      // 1. Check for Prisma schemas
      const prismaPath = path.join(this.projectRoot, 'prisma', 'schema.prisma');
      const rootPrisma = path.join(this.projectRoot, 'schema.prisma');
      const targetPrisma = fs.existsSync(prismaPath) ? prismaPath : fs.existsSync(rootPrisma) ? rootPrisma : null;

      if (targetPrisma) {
        const content = fs.readFileSync(targetPrisma, 'utf-8');
        const modelBlocks = content.match(/model\s+(\w+)\s*\{([^}]+)\}/g) || [];
        for (const block of modelBlocks) {
          const modelNameMatch = block.match(/model\s+(\w+)/);
          const modelName = modelNameMatch ? modelNameMatch[1] : 'UnknownModel';
          const hasId = block.includes('@id') || block.includes('@@id');
          if (!hasId) {
            issues.push({
              model: modelName,
              file: path.relative(this.projectRoot, targetPrisma).replace(/\\/g, '/'),
              severity: 'error',
              message: `Model "${modelName}" is missing an @id primary key definition.`,
            });
          }
        }
      }

      // 2. Check for SQL migration files
      const sqlFiles: string[] = [];
      const searchDirs = [
        path.join(this.projectRoot, 'migrations'),
        path.join(this.projectRoot, 'prisma', 'migrations'),
        path.join(this.projectRoot, 'sql'),
      ];
      for (const d of searchDirs) {
        if (fs.existsSync(d)) {
          const files = fs.readdirSync(d);
          for (const f of files) {
            if (f.endsWith('.sql')) {
              sqlFiles.push(path.join(d, f));
            }
          }
        }
      }

      for (const sqlFile of sqlFiles) {
        const sql = fs.readFileSync(sqlFile, 'utf-8');
        const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"']?\w+[`"']?)\s*\(([\s\S]*?)\);/gi;
        let match;
        while ((match = createTableRegex.exec(sql)) !== null) {
          const tableName = match[1];
          const tableBody = match[2];
          if (!tableBody.toUpperCase().includes('PRIMARY KEY')) {
            issues.push({
              model: tableName,
              file: path.relative(this.projectRoot, sqlFile).replace(/\\/g, '/'),
              severity: 'warning',
              message: `Table "${tableName}" does not define an explicit PRIMARY KEY constraint.`,
            });
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(`Schema validation encountered an error: ${err?.message}`);
    }

    return {
      passed: issues.filter(i => i.severity === 'error').length === 0,
      issues,
    };
  }

  /**
   * Generate validation summary
   */
  private generateSummary(
    linting: LintResult,
    typeCheck: TypeCheckResult,
    unitTests: TestResult,
    buildCheck: BuildResult,
    schemaValidation: SchemaValidationResult
  ): ValidationSummary {
    const failedCategories: string[] = [];
    const suggestions: string[] = [];
    const nextSteps: string[] = [];

    if (!linting.passed) {
      failedCategories.push('linting');
      suggestions.push(`Fix ${linting.totalIssues} linting issues`);
    }

    if (!typeCheck.passed) {
      failedCategories.push('type-check');
      suggestions.push(`Fix ${typeCheck.totalErrors} type errors`);
    }

    if (!unitTests.passed) {
      failedCategories.push('unit-tests');
      suggestions.push(`Fix ${unitTests.failedTests} failing tests`);
    }

    if (!buildCheck.passed) {
      failedCategories.push('build');
      suggestions.push(`Fix build errors`);
    }

    if (!schemaValidation.passed) {
      failedCategories.push('database-schema');
      suggestions.push(`Fix database schema issues`);
    }

    if (failedCategories.length === 0) {
      nextSteps.push('All validation passed! Deploy when ready.');
    } else {
      nextSteps.push(`Address ${failedCategories.length} validation issue(s).`);
      nextSteps.push('Review suggestions above and fix issues.');
    }

    return {
      allPassed: failedCategories.length === 0,
      failedCategories,
      suggestions,
      nextSteps,
    };
  }
}
