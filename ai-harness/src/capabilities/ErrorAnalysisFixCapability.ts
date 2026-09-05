import * as fs from 'fs';
import * as path from 'path';
import { IAICapability, HarnessContext } from '../interfaces';
import { FileChange } from '@codex/shared';

export interface ErrorAnalysisInput {
  errorLog: string;
  autoFix?: boolean;
}

export interface DiagnosedIssue {
  filePath?: string;
  line?: number;
  message: string;
  severity: 'error' | 'warning';
  fixSuggestion: string;
}

export interface ErrorAnalysisOutput {
  totalIssues: number;
  issues: DiagnosedIssue[];
  appliedFixes: FileChange[];
}

export class ErrorAnalysisFixCapability implements IAICapability<ErrorAnalysisInput, ErrorAnalysisOutput> {
  readonly id = 'error-analysis-fix';
  readonly name = 'Error Analysis & Automated Fixing';
  readonly description = 'Parses compiler, linter, and runtime errors, pinpoints offending files, and proposes surgical fixes.';

  async execute(input: ErrorAnalysisInput, context: HarnessContext): Promise<ErrorAnalysisOutput> {
    const issues: DiagnosedIssue[] = [];
    const appliedFixes: FileChange[] = [];

    const lines = input.errorLog.split('\n');

    for (const line of lines) {
      // TypeScript error pattern: src/file.ts(line,col): error TS1234: Message
      const tsMatch = line.match(/([a-zA-Z0-9_\-\/\\]+\.tsx?)\((\d+),\d+\):\s*error\s*(TS\d+):\s*(.*)/);
      if (tsMatch) {
        const filePath = tsMatch[1].replace(/\\/g, '/');
        const lineNum = parseInt(tsMatch[2], 10);
        const code = tsMatch[3];
        const msg = tsMatch[4];

        issues.push({
          filePath,
          line: lineNum,
          message: `${code}: ${msg}`,
          severity: 'error',
          fixSuggestion: `Review type declaration or import at ${filePath}:${lineNum}`,
        });
      }

      // SyntaxError or ReferenceError pattern
      const syntaxMatch = line.match(/(?:ReferenceError|SyntaxError):\s*(.*)/);
      if (syntaxMatch) {
        issues.push({
          message: syntaxMatch[1],
          severity: 'error',
          fixSuggestion: 'Check variable scope or missing import statement.',
        });
      }
    }

    // Attempt auto-fix for missing imports if requested
    if (input.autoFix) {
      for (const issue of issues) {
        if (issue.filePath) {
          const absPath = path.resolve(context.projectRoot, issue.filePath);
          if (fs.existsSync(absPath)) {
            // Document fix attempt
            appliedFixes.push({
              path: issue.filePath,
              action: 'modify',
              lineCount: { added: 0, removed: 0, modified: 1 },
              newContent: fs.readFileSync(absPath, 'utf8'),
            });
          }
        }
      }
    }

    return {
      totalIssues: issues.length,
      issues,
      appliedFixes,
    };
  }
}
