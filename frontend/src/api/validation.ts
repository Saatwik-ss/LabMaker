import { fetchApi } from './client';

export interface ValidationResult {
  timestamp: string;
  passed: boolean;
  linting: { passed: boolean; errors: any[]; warnings: any[]; totalIssues: number };
  typeCheck: { passed: boolean; errors: any[]; totalErrors: number };
  unitTests: { passed: boolean; totalTests: number; passedTests: number; failedTests: number; skippedTests: number; failures: any[] };
  buildCheck: { passed: boolean; errors: any[]; warnings: any[] };
  schemaValidation: { passed: boolean; issues: any[] };
  summary: { allPassed: boolean; failedCategories: string[]; suggestions: string[]; nextSteps: string[] };
}

export const runValidation = (): Promise<ValidationResult> => {
  return fetchApi<ValidationResult>('/validate', { method: 'POST' });
};
