import { fetchApi } from './client';

export interface AiHealthStatus {
  isAvailable: boolean;
  version?: string;
  provider?: string;
  baseUrl?: string;
}

export interface ModuleAnalysisResult {
  compatible: boolean;
  issues: string[];
  conflicts: Array<{ type: string; details: string; severity: string }>;
  required_packages: string[];
}

export async function getAiHealth(): Promise<AiHealthStatus> {
  try {
    return await fetchApi<AiHealthStatus>('/ai/health');
  } catch {
    return { isAvailable: false };
  }
}

export async function analyzeModuleCompatibility(moduleData: any): Promise<ModuleAnalysisResult> {
  return fetchApi<ModuleAnalysisResult>('/ai/modules/analyze', {
    method: 'POST',
    body: JSON.stringify({ module: moduleData }),
  });
}

export async function adaptAndIntegrateModule(moduleData: any, config?: any): Promise<any> {
  return fetchApi<any>('/ai/modules/adapt', {
    method: 'POST',
    body: JSON.stringify({ module: moduleData, config }),
  });
}

export async function applyAiEdits(
  requestId: string,
  edits: Array<{ file_path: string; proposed: string }>
): Promise<any> {
  return fetchApi<any>('/ai/edits/apply', {
    method: 'POST',
    body: JSON.stringify({ requestId, edits }),
  });
}

export async function undoAiEdits(requestId: string): Promise<any> {
  return fetchApi<any>('/ai/edits/undo', {
    method: 'POST',
    body: JSON.stringify({ requestId }),
  });
}

export async function getIndexStatus(): Promise<any> {
  return fetchApi<any>('/ai/index-status');
}

export async function requestCompletion(params: {
  filePath?: string;
  prefix: string;
  suffix?: string;
  language?: string;
  line?: number;
  column?: number;
}): Promise<{ text: string; suggestions?: any[] }> {
  return fetchApi('/ai/complete', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}
