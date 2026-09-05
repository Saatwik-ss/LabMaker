import { fetchApi } from './client';

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
}

export interface FileOperationResult {
  success: boolean;
  content?: string;
  error?: string;
}

export const getFileTree = (path?: string): Promise<FileEntry[]> => {
  const url = path ? `/files/tree?path=${encodeURIComponent(path)}` : '/files/tree';
  return fetchApi<FileEntry[]>(url);
};

export const readFile = (path: string): Promise<FileOperationResult> => {
  return fetchApi<FileOperationResult>(`/files/read?path=${encodeURIComponent(path)}`);
};

export const writeFile = (path: string, content: string): Promise<FileOperationResult> => {
  return fetchApi<FileOperationResult>('/files/write', {
    method: 'POST',
    body: JSON.stringify({ path, content }),
  });
};

export const getDownloadUrl = (path?: string): string => {
  const baseUrl = '/api/files/download';
  return path ? `${baseUrl}?path=${encodeURIComponent(path)}` : baseUrl;
};

export const downloadFileOrFolder = (path?: string, customName?: string): void => {
  const url = getDownloadUrl(path);
  const a = document.createElement('a');
  a.href = url;
  if (customName) {
    a.download = customName;
  }
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

export const createFileOrDirectory = (path: string, isDirectory: boolean): Promise<FileOperationResult> => {
  return fetchApi<FileOperationResult>('/files/create', {
    method: 'POST',
    body: JSON.stringify({ path, isDirectory }),
  });
};

export const uploadFile = (path: string, content: string, isBase64: boolean = false): Promise<FileOperationResult> => {
  return fetchApi<FileOperationResult>('/files/upload', {
    method: 'POST',
    body: JSON.stringify({ path, content, isBase64 }),
  });
};

