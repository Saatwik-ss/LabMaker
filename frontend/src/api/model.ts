import { fetchApi } from './client';

export interface ApplicationModel {
  metadata: {
    name: string;
    description: string;
    version: string;
    createdAt: string;
    updatedAt: string;
  };
  stack: {
    frontend: { framework: string; versionManager: string; language: string; components: any[] } | null;
    backends: { id: string; name: string; framework: string; language: string; port: number; routes: any[]; middleware: any[]; services: any[] }[];
    databases: any[];
    ai: any[];
  };
  modules: any[];
  architecture: {
    services: { id: string; name: string; type: 'frontend' | 'backend' | 'database' | 'external' | 'module'; technology: string; port: number }[];
    relationships: { id: string; source: string; target: string; type: string; label: string }[];
    dataFlow: any[];
  };
  files: { projectRoot: string; importantPaths: string[]; moduleRoots: string[]; configFiles: string[] };
  discoveryMetadata: any;
}

export interface ModelSummary {
  name: string;
  description: string;
  version: string;
  frontend: string;
  backendCount: number;
  databaseCount: number;
  moduleCount: number;
  serviceCount: number;
  relationshipCount: number;
  updatedAt: string;
}

export const getModel = (): Promise<ApplicationModel> => {
  return fetchApi<ApplicationModel>('/model');
};

export const getModelSummary = (): Promise<ModelSummary> => {
  return fetchApi<ModelSummary>('/model/summary');
};

export const discoverProject = (): Promise<ApplicationModel> => {
  return fetchApi<ApplicationModel>('/model/discover', { method: 'POST' });
};

export const addArchitectureNode = (node: {
  id: string;
  name: string;
  type: string;
  technology?: string;
  port?: number;
}): Promise<{ success: boolean; model: ApplicationModel }> => {
  return fetchApi<{ success: boolean; model: ApplicationModel }>('/model/architecture/nodes', {
    method: 'POST',
    body: JSON.stringify(node),
  });
};

export const updateArchitectureNode = (
  id: string,
  updates: Record<string, any>
): Promise<{ success: boolean; model: ApplicationModel }> => {
  return fetchApi<{ success: boolean; model: ApplicationModel }>(`/model/architecture/nodes/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
};

export const deleteArchitectureNode = (
  id: string
): Promise<{ success: boolean; model: ApplicationModel }> => {
  return fetchApi<{ success: boolean; model: ApplicationModel }>(`/model/architecture/nodes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
};

export const addArchitectureRelationship = (rel: {
  id: string;
  source: string;
  target: string;
  type: string;
  label?: string;
}): Promise<{ success: boolean; model: ApplicationModel }> => {
  return fetchApi<{ success: boolean; model: ApplicationModel }>('/model/architecture/relationships', {
    method: 'POST',
    body: JSON.stringify(rel),
  });
};

export const deleteArchitectureRelationship = (
  id: string
): Promise<{ success: boolean; model: ApplicationModel }> => {
  return fetchApi<{ success: boolean; model: ApplicationModel }>(`/model/architecture/relationships/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
};

