import { fetchApi } from './client';

export interface ModuleVariant {
  id: string;
  name: string;
  description: string;
  stack?: any;
  files?: any[];
}

export interface ModuleTemplate {
  id: string;
  name: string;
  version: string;
  description: string;
  category: string;
  variants: ModuleVariant[];
  requiredDependencies?: string[];
  optional?: string[];
  installation?: any;
}

export interface ModuleFileChange {
  path: string;
  action: 'create' | 'modify' | 'delete';
  lineCount?: { added: number; removed: number; modified: number };
  newContent?: string;
}

export interface ModuleMutationResponse {
  success: boolean;
  message?: string;
  error?: string;
  filesChanged?: ModuleFileChange[];
}

export const getModules = (): Promise<ModuleTemplate[]> => {
  return fetchApi<ModuleTemplate[]>('/modules');
};

export const installModule = (id: string, variantId: string, config: Record<string, any> = {}): Promise<ModuleMutationResponse> => {
  return fetchApi(`/modules/${id}/install`, {
    method: 'POST',
    body: JSON.stringify({ variantId, config }),
  });
};

export const uninstallModule = (id: string): Promise<ModuleMutationResponse> => {
  return fetchApi(`/modules/${id}/uninstall`, {
    method: 'POST',
  });
};
