import { fetchApi } from './client';
import { Project, ProjectSummary } from '@codex/shared';

export const getProjects = (): Promise<ProjectSummary[]> => {
  return fetchApi<ProjectSummary[]>('/projects');
};

export const getCurrentProject = (): Promise<Project> => {
  return fetchApi<Project>('/projects/current');
};

export const selectProject = (id: string): Promise<Project> => {
  return fetchApi<Project>(`/projects/${id}/select`, {
    method: 'POST',
  });
};

export const createProject = (data: {
  name: string;
  description?: string;
  preset?: string;
}): Promise<Project> => {
  return fetchApi<Project>('/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const getHistoricalProjects = (): Promise<Project[]> => {
  return fetchApi<Project[]>('/projects/history');
};

export const deleteProject = (id: string): Promise<{ success: boolean; message: string; activeProject?: Project }> => {
  return fetchApi<{ success: boolean; message: string; activeProject?: Project }>(`/projects/${id}`, {
    method: 'DELETE',
  });
};

export const createExternalModule = (
  projectId: string,
  moduleData: Record<string, any>
): Promise<{ success: boolean; message: string; module: any }> => {
  return fetchApi(`/projects/${projectId}/modules`, {
    method: 'POST',
    body: JSON.stringify(moduleData),
  });
};

export function normalizeImportPaths(paths: string[]): string[] {
  if (paths.length < 2) {
    return paths.map((p) => {
      const parts = p.replace(/\\/g, '/').split('/');
      return parts.length > 1 ? parts.slice(1).join('/') : p;
    });
  }
  const normalized = paths.map((p) => p.replace(/\\/g, '/'));
  const first = normalized[0].split('/')[0];
  if (first && normalized.every((p) => p.startsWith(first + '/'))) {
    return normalized.map((p) => p.slice(first.length + 1));
  }
  return normalized;
}

export async function importProjectFolder(fileList: FileList | File[]): Promise<any> {
  const files = Array.from(fileList);
  const rawPaths = files.map((f) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name);
  const paths = normalizeImportPaths(rawPaths);
  const form = new FormData();
  files.forEach((file) => form.append('files', file, file.name));
  form.append('paths', JSON.stringify(paths));

  const response = await fetch('/api/projects/current/import', {
    method: 'POST',
    body: form,
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function indexCurrentProject(): Promise<any> {
  return fetchApi('/projects/current/index', { method: 'POST' });
}

export const testProjectModule = (
  projectId: string,
  moduleId: string
): Promise<{ success: boolean; health: any }> => {
  return fetchApi(`/projects/${projectId}/modules/${moduleId}/test`, {
    method: 'POST',
  });
};
