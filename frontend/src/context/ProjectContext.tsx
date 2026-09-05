import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Project, ProjectSummary } from '@codex/shared';
import {
  getProjects,
  getCurrentProject,
  selectProject as apiSelectProject,
  createProject as apiCreateProject,
  deleteProject as apiDeleteProject,
  getHistoricalProjects,
  createExternalModule,
  testProjectModule,
  importProjectFolder
} from '../api/projects';

interface ProjectContextType {
  currentProject: Project | null;
  projects: ProjectSummary[];
  historicalProjects: Project[];
  loading: boolean;
  error: string | null;
  selectProject: (id: string) => Promise<void>;
  createProject: (name: string, description?: string, preset?: string) => Promise<Project>;
  deleteProject: (id: string) => Promise<{ success: boolean; message: string; activeProject?: Project }>;
  refreshProjects: () => Promise<void>;
  addModule: (moduleData: any) => Promise<any>;
  testModule: (moduleId: string) => Promise<any>;
  importFolder: (files: FileList | File[]) => Promise<any>;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [historicalProjects, setHistoricalProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refreshProjects = useCallback(async () => {
    setLoading(true);
    try {
      const [list, curr, hist] = await Promise.all([
        getProjects(),
        getCurrentProject(),
        getHistoricalProjects(),
      ]);
      setProjects(list);
      setCurrentProject(curr);
      setHistoricalProjects(hist);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  const selectProject = async (id: string) => {
    setLoading(true);
    try {
      const selected = await apiSelectProject(id);
      setCurrentProject(selected);
      window.dispatchEvent(new CustomEvent('codex-project-changed', { detail: selected.id }));
      // Reload project list to update isCurrent badges
      const list = await getProjects();
      setProjects(list);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to switch project');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const createProject = async (name: string, description?: string, preset?: string) => {
    setLoading(true);
    try {
      const created = await apiCreateProject({ name, description, preset });
      window.dispatchEvent(new CustomEvent('codex-project-changed', { detail: created.id }));
      await refreshProjects();
      return created;
    } catch (err: any) {
      setError(err.message || 'Failed to create project');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const addModule = async (moduleData: any) => {
    if (!currentProject) throw new Error('No active project');
    const res = await createExternalModule(currentProject.id, moduleData);
    await refreshProjects();
    return res;
  };

  const testModule = async (moduleId: string) => {
    if (!currentProject) throw new Error('No active project');
    const res = await testProjectModule(currentProject.id, moduleId);
    await refreshProjects();
    return res;
  };

  const importFolder = async (files: FileList | File[]) => {
    setLoading(true);
    try {
      const res = await importProjectFolder(files);
      await refreshProjects();
      window.dispatchEvent(new CustomEvent('codex-files-imported'));
      return res;
    } catch (err: any) {
      setError(err.message || 'Failed to import folder');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const deleteProject = async (id: string) => {
    setLoading(true);
    try {
      const res = await apiDeleteProject(id);
      if (res.activeProject) {
        setCurrentProject(res.activeProject);
        window.dispatchEvent(new CustomEvent('codex-project-changed', { detail: res.activeProject.id }));
      }
      await refreshProjects();
      return res;
    } catch (err: any) {
      setError(err.message || 'Failed to delete project');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProjectContext.Provider
      value={{
        currentProject,
        projects,
        historicalProjects,
        loading,
        error,
        selectProject,
        createProject,
        deleteProject,
        refreshProjects,
        addModule,
        testModule,
        importFolder,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
};

export const useProject = (): ProjectContextType => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
};
