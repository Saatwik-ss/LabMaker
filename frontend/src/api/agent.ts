import { fetchApi } from './client';
import { ValidationResult } from './validation';

export interface AgentRequest {
  type: 'feature' | 'bugfix' | 'refactor' | 'module-integration' | 'architecture-change';
  prompt: string;
  targetModules?: string[];
  context?: Record<string, any>;
}

export interface FileChange {
  path: string;
  action: 'create' | 'modify' | 'delete';
  newContent?: string;
}

export interface AgentResult {
  requestId: string;
  status: 'success' | 'partial' | 'failed' | 'cancelled';
  changes: FileChange[];
  modelUpdates: {
    addedModules: string[];
    modifiedModules: string[];
    databaseChanges: any[];
    architectureChanges: any;
  };
  validationResults: ValidationResult;
  errors: string[];
  summary: string;
}

export const requestAgent = (request: AgentRequest): Promise<AgentResult> => {
  return fetchApi<AgentResult>('/agent/request', {
    method: 'POST',
    body: JSON.stringify(request),
  });
};
