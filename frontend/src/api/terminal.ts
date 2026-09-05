import { fetchApi } from './client';

export interface TerminalExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  cwd: string;
  projectId?: string;
  error?: string;
}

export interface QuickCommand {
  label: string;
  command: string;
  description: string;
}

export interface PipelineTestResult {
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

export const executeTerminalCommand = (
  command: string,
  cwd?: string,
  timeoutMs: number = 30000
): Promise<TerminalExecutionResult> => {
  return fetchApi<TerminalExecutionResult>('/terminal/exec', {
    method: 'POST',
    body: JSON.stringify({ command, cwd, timeoutMs }),
  });
};

export const getQuickCommands = (): Promise<{ commands: QuickCommand[]; cwd: string }> => {
  return fetchApi<{ commands: QuickCommand[]; cwd: string }>('/terminal/quick-commands');
};

export const runPipelineTest = (
  stage: 'pre-flight' | 'post-install' | 'full' = 'full',
  moduleData?: any
): Promise<PipelineTestResult> => {
  return fetchApi<PipelineTestResult>('/ai/pipeline/test', {
    method: 'POST',
    body: JSON.stringify({ stage, module: moduleData }),
  });
};
