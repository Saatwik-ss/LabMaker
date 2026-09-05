import React, { useState } from 'react';
import { useProject } from '../context/ProjectContext';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { Modal } from '../components/ui/Modal';
import { IconLayers, IconBox, IconCheck, IconCode, IconTrash } from '../components/ui/Icons';
import { Project } from '@codex/shared';

export const History: React.FC = () => {
  const { currentProject, projects, historicalProjects, selectProject, deleteProject } = useProject();
  const [search, setSearch] = useState('');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const handleDeleteProject = async (proj: Project) => {
    setDeleting(true);
    try {
      await deleteProject(proj.id);
      if (selectedProject?.id === proj.id) {
        setSelectedProject(null);
      }
      setToast(`Project "${proj.name}" deleted successfully.`);
      setProjectToDelete(null);
      setTimeout(() => setToast(null), 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to delete project');
    } finally {
      setDeleting(false);
    }
  };

  const allProjects = [...(currentProject ? [currentProject] : []), ...historicalProjects];
  // Deduplicate by ID
  const uniqueProjects = Array.from(new Map(allProjects.map(p => [p.id, p])).values());

  const filtered = uniqueProjects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.description?.toLowerCase().includes(search.toLowerCase())
  );

  const activeViewProject = selectedProject || currentProject || uniqueProjects[0];

  const handleUseAsContext = (proj: Project) => {
    const contextSummary = `Reference Pattern from "${proj.name}": Modules [${proj.model.modules.map(m => m.name).join(', ')}], Stack: [${proj.model.stack.frontend?.framework || 'React'} + ${proj.model.stack.backends.map(b => b.framework).join(', ')}]`;
    sessionStorage.setItem('codex_reference_context', contextSummary);
    window.dispatchEvent(new CustomEvent('nav-page', { detail: 'chat' }));
  };

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Application Project History & Reusable Context</h1>
          <p className="text-xs text-gray-400 mt-1">
            Access past application architectures, requirements, module designs, and historical configurations without losing context.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search past projects & modules..."
            className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 w-56"
          />
        </div>
      </div>

      {toast && (
        <div className="p-3 rounded-lg text-xs bg-green-950/60 border border-green-800 text-green-200 flex items-center justify-between">
          <span>{toast}</span>
          <button onClick={() => setToast(null)} className="text-gray-400 hover:text-white">&times;</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Project List Column */}
        <div className="space-y-3">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
            Projects Catalog ({filtered.length})
          </span>
          <div className="space-y-2">
            {filtered.map(proj => (
              <div
                key={proj.id}
                onClick={() => setSelectedProject(proj)}
                className={`p-4 rounded-lg border cursor-pointer transition-all ${
                  activeViewProject?.id === proj.id
                    ? 'bg-blue-950/40 border-blue-600 shadow-md'
                    : 'bg-gray-900 border-gray-800 hover:border-gray-700'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-sm text-white truncate">{proj.name}</div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant={proj.isCurrent ? 'success' : proj.status === 'historical' ? 'info' : 'default'}>
                      {proj.isCurrent ? 'Current' : proj.status}
                    </Badge>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setProjectToDelete(proj);
                      }}
                      className="text-gray-500 hover:text-red-400 p-1 rounded hover:bg-gray-800 transition-colors"
                      title={`Delete project "${proj.name}"`}
                    >
                      <IconTrash />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-1.5 line-clamp-2">{proj.description}</p>
                <div className="flex items-center gap-3 mt-3 text-[11px] text-gray-500 font-mono">
                  <span>{proj.model.modules.length} Modules</span>
                  <span>&bull;</span>
                  <span>{new Date(proj.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Project Details Panel */}
        {activeViewProject && (
          <div className="lg:col-span-2 space-y-5">
            <Card className="bg-gray-900 border-gray-800 p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-800 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-white">{activeViewProject.name}</h2>
                    <Badge variant={activeViewProject.isCurrent ? 'success' : 'info'}>
                      {activeViewProject.isCurrent ? 'Active Project' : 'Historical Reference'}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{activeViewProject.description}</p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {!activeViewProject.isCurrent && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => selectProject(activeViewProject.id)}
                    >
                      Make Active Workspace
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => handleUseAsContext(activeViewProject)}
                    className="flex items-center gap-1.5"
                  >
                    <IconCode />
                    <span>Use as AI Reference</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => setProjectToDelete(activeViewProject)}
                    className="flex items-center gap-1.5"
                    title={`Delete "${activeViewProject.name}" permanently`}
                  >
                    <IconTrash />
                    <span>Delete</span>
                  </Button>
                </div>
              </div>

              {/* Stack Spec */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-gray-950 p-3 rounded border border-gray-800">
                  <span className="text-gray-500 uppercase tracking-wider text-[10px] block">Frontend</span>
                  <strong className="text-blue-400 capitalize">{activeViewProject.model.stack.frontend?.framework || 'None'}</strong>
                </div>
                <div className="bg-gray-950 p-3 rounded border border-gray-800">
                  <span className="text-gray-500 uppercase tracking-wider text-[10px] block">Backend</span>
                  <strong className="text-green-400">{activeViewProject.model.stack.backends[0]?.framework || 'Express'}</strong>
                </div>
                <div className="bg-gray-950 p-3 rounded border border-gray-800">
                  <span className="text-gray-500 uppercase tracking-wider text-[10px] block">Databases</span>
                  <strong className="text-amber-400">{activeViewProject.model.stack.databases[0]?.type || 'PostgreSQL'}</strong>
                </div>
                <div className="bg-gray-950 p-3 rounded border border-gray-800">
                  <span className="text-gray-500 uppercase tracking-wider text-[10px] block">Modules</span>
                  <strong className="text-purple-400">{activeViewProject.model.modules.length} Components</strong>
                </div>
              </div>

              {/* Modules in this project */}
              <div>
                <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <IconBox />
                  <span>Modules & Components Defined ({activeViewProject.model.modules.length})</span>
                </h3>

                {activeViewProject.model.modules.length === 0 ? (
                  <p className="text-xs text-gray-500 italic">No modules registered in this project record.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {activeViewProject.model.modules.map(mod => (
                      <div key={mod.id} className="bg-gray-950 border border-gray-800 rounded p-3 text-xs space-y-2">
                        <div className="flex items-center justify-between">
                          <strong className="text-white capitalize">{mod.name}</strong>
                          <Badge variant={mod.health?.status === 'healthy' ? 'success' : 'info'}>
                            {mod.type || 'module'}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-gray-400">{mod.description || 'Module component'}</p>

                        {mod.requirements && mod.requirements.length > 0 && (
                          <div className="text-[10px] text-gray-500 border-t border-gray-800/80 pt-1.5 space-y-0.5">
                            <span className="font-semibold text-gray-400 block">Requirements:</span>
                            {mod.requirements.slice(0, 2).map((r, i) => (
                              <div key={i} className="truncate">- {r}</div>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-between text-[10px] text-gray-500 border-t border-gray-800/80 pt-1.5">
                          <span>Status: <strong className="text-gray-300">{mod.testStatus || 'untested'}</strong></span>
                          <span>{mod.version || 'v1.0.0'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Requirements & Specifications */}
              {activeViewProject.requirements && activeViewProject.requirements.length > 0 && (
                <div className="border-t border-gray-800 pt-4">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                    Project Architectural Requirements
                  </h3>
                  <ul className="space-y-1 text-xs text-gray-300">
                    {activeViewProject.requirements.map((req, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="text-blue-400">&bull;</span>
                        <span>{req}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* History / Audit Log */}
              {activeViewProject.history && activeViewProject.history.length > 0 && (
                <div className="border-t border-gray-800 pt-4">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                    Activity & Evolution Log
                  </h3>
                  <div className="space-y-2 max-h-36 overflow-y-auto font-mono text-[11px]">
                    {activeViewProject.history.map(h => (
                      <div key={h.id} className="p-2 bg-gray-950 rounded border border-gray-800/60 flex items-center justify-between">
                        <span className="text-gray-300">{h.description}</span>
                        <span className="text-gray-500 text-[10px]">{new Date(h.timestamp).toLocaleTimeString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>

      {/* Delete Project Confirmation Modal */}
      <Modal
        isOpen={!!projectToDelete}
        onClose={() => setProjectToDelete(null)}
        title="Delete Past Project"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-300 leading-relaxed">
            Are you sure you want to permanently delete project{' '}
            <strong className="text-white font-semibold">{projectToDelete?.name}</strong>?
          </p>
          <div className="bg-red-950/40 border border-red-900/60 rounded-lg p-3 text-xs text-red-300">
            This will permanently remove the project workspace repository files, module configurations, and historical metadata from the browser environment.
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setProjectToDelete(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => projectToDelete && handleDeleteProject(projectToDelete)}
              disabled={deleting}
              className="flex items-center gap-1.5"
            >
              {deleting ? <Spinner size="sm" /> : <IconTrash />}
              <span>{deleting ? 'Deleting...' : 'Delete Permanently'}</span>
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
