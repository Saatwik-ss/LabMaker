import React, { useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { useProject } from '../context/ProjectContext';
import {
  IconDashboard,
  IconCode,
  IconMessage,
  IconLayers,
  IconBox,
  IconCheck,
  IconFolder,
  IconTrash
} from '../components/ui/Icons';

export const Home = ({ onNavigate }: { onNavigate: (page: string) => void }) => {
  const { currentProject, projects, historicalProjects, createProject, selectProject, deleteProject, importFolder, loading } = useProject();
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [newProjectType, setNewProjectType] = useState('fullstack');
  const [creating, setCreating] = useState(false);
  const [createSuccess, setCreateSuccess] = useState(false);
  const folderInputRef = React.useRef<HTMLInputElement>(null);
  const [folderImporting, setFolderImporting] = useState(false);

  const handleFolderSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    setFolderImporting(true);
    try {
      await importFolder(fileList);
      onNavigate('editor');
    } catch (err) {
      console.error('Folder import error:', err);
    } finally {
      setFolderImporting(false);
      if (folderInputRef.current) folderInputRef.current.value = '';
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    setCreating(true);
    try {
      await createProject(newProjectName.trim(), newProjectDesc.trim(), newProjectType);
      setCreateSuccess(true);
      setTimeout(() => {
        onNavigate('dashboard');
      }, 800);
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  const handleSwitchProject = async (id: string) => {
    await selectProject(id);
    onNavigate('dashboard');
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 animate-fade-in space-y-10 font-sans">
      {/* Hero Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-950/60 border border-blue-800/80 rounded-full text-xs text-blue-300 font-medium">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
          <span>Multi-Project Full-Stack Development Environment</span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight">
          Codex Workspace
        </h1>
        <p className="text-base sm:text-lg text-gray-400 max-w-2xl mx-auto">
          Scaffold, manage, and orchestrate projects with requirements-first module design, Groq-accelerated AI assistance, and interactive connected topology.
        </p>
      </div>

      {/* Main Choice Cards: Start New Project vs Open Project */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: Start a New Project */}
        <Card className="bg-gray-900 border-gray-800 hover:border-gray-700 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3 border-b border-gray-800 pb-3">
              <h2 className="text-xl font-bold text-white">Start a New Project</h2>
              <Badge variant="info">Scaffold & Activate</Badge>
            </div>
            <p className="text-sm text-gray-400 mb-5">
              Initialize a fresh project workspace. It will immediately become globally active and visible across all dashboards, editors, graphs, and modules.
            </p>

            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  Project Name *
                </label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="e.g. Apex Commerce Platform"
                  className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 font-sans"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  placeholder="e.g. Next-gen modular retail platform"
                  className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 font-sans"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  Architecture Blueprint
                </label>
                <select
                  value={newProjectType}
                  onChange={(e) => setNewProjectType(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 font-sans"
                >
                  <option value="fullstack">Full-Stack (React Vite + Express API Gateway)</option>
                  <option value="backend">Microservices Backend (Node + PostgreSQL DB)</option>
                  <option value="modular">Modular System (Auth + Payments + Search)</option>
                </select>
              </div>

              {createSuccess ? (
                <div className="p-2.5 bg-green-950/60 border border-green-800 rounded text-xs text-green-200 flex items-center gap-2">
                  <IconCheck />
                  <span>Project created and activated globally!</span>
                </div>
              ) : (
                <Button
                  type="submit"
                  variant="primary"
                  disabled={creating || !newProjectName.trim()}
                  className="w-full mt-2"
                >
                  {creating ? <Spinner size="sm" /> : 'Create & Activate Project'}
                </Button>
              )}
            </form>
          </div>
        </Card>

        {/* Card 2: Current Active Project & Historical Workspaces */}
        <Card className="bg-gray-900 border-gray-800 hover:border-gray-700 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3 border-b border-gray-800 pb-3">
              <h2 className="text-xl font-bold text-white">Current Active Workspace</h2>
              <Badge variant="success">Active</Badge>
            </div>

            {loading && !currentProject ? (
              <div className="py-8 flex items-center justify-center">
                <Spinner size="md" />
              </div>
            ) : currentProject ? (
              <div className="space-y-4">
                <div className="bg-gray-950 border border-gray-800 rounded-lg p-3 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Project Name:</span>
                    <strong className="text-white font-semibold">{currentProject.name}</strong>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Frontend Stack:</span>
                    <span className="text-blue-400 font-mono capitalize">
                      {currentProject.model.stack.frontend?.framework || 'React'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Backend Services:</span>
                    <span className="text-green-400 font-mono">{currentProject.model.stack.backends.length} service(s)</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Registered Modules:</span>
                    <span className="text-purple-400 font-mono">{currentProject.model.modules.length} active</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="primary"
                    onClick={() => onNavigate('dashboard')}
                    className="flex items-center justify-center gap-1.5 text-xs py-2"
                  >
                    <IconDashboard />
                    <span>Open Dashboard</span>
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => onNavigate('architecture')}
                    className="flex items-center justify-center gap-1.5 text-xs py-2"
                  >
                    <IconLayers />
                    <span>View Graph</span>
                  </Button>
                </div>

                <div className="pt-2 border-t border-gray-800">
                  <input
                    type="file"
                    ref={folderInputRef}
                    // @ts-ignore
                    webkitdirectory=""
                    directory=""
                    multiple
                    onChange={handleFolderSelected}
                    className="hidden"
                  />
                  <Button
                    variant="secondary"
                    onClick={() => folderInputRef.current?.click()}
                    disabled={folderImporting}
                    className="w-full flex items-center justify-center gap-2 text-xs py-2"
                  >
                    <IconFolder />
                    <span>{folderImporting ? 'Importing Folder...' : 'Import Local Folder into Browser Workspace'}</span>
                  </Button>
                </div>

                {/* Historical Projects Mini-List */}
                <div className="border-t border-gray-800 pt-3">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-2">
                    Available Previous / Historical Projects ({historicalProjects.length}):
                  </span>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {historicalProjects.slice(0, 3).map(hp => (
                      <div
                        key={hp.id}
                        className="flex items-center justify-between p-2 bg-gray-950 rounded border border-gray-800 hover:border-gray-700 text-xs"
                      >
                        <div className="truncate mr-2">
                          <span className="font-semibold text-gray-300">{hp.name}</span>
                          <span className="text-[10px] text-gray-500 block truncate">{hp.model.modules.length} modules</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleSwitchProject(hp.id)}
                            className="text-blue-400 hover:text-blue-300 text-[11px] font-medium"
                          >
                            Switch &rarr;
                          </button>
                          <button
                            onClick={async () => {
                              if (window.confirm(`Delete past project "${hp.name}"?`)) {
                                await deleteProject(hp.id);
                              }
                            }}
                            className="text-gray-500 hover:text-red-400 p-1 rounded hover:bg-gray-900 transition-colors"
                            title={`Delete past project "${hp.name}"`}
                          >
                            <IconTrash />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => onNavigate('history')}
                    className="w-full text-center text-xs text-gray-400 hover:text-white pt-2.5 block transition-colors"
                  >
                    Explore all previous application projects & history &rarr;
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      {/* Core Workflow Nav Cards */}
      <div>
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
          Development Workflows
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div
            onClick={() => onNavigate('chat')}
            className="p-4 bg-gray-900 border border-gray-800 hover:border-blue-500/60 rounded-lg cursor-pointer transition-all group"
          >
            <div className="text-blue-400 group-hover:scale-110 transition-transform mb-2">
              <IconMessage />
            </div>
            <h4 className="font-semibold text-sm text-white">AI Assistant</h4>
            <p className="text-xs text-gray-400 mt-1">Requirements gathering, Groq integration, and prompt planning.</p>
          </div>

          <div
            onClick={() => onNavigate('editor')}
            className="p-4 bg-gray-900 border border-gray-800 hover:border-blue-500/60 rounded-lg cursor-pointer transition-all group"
          >
            <div className="text-green-400 group-hover:scale-110 transition-transform mb-2">
              <IconCode />
            </div>
            <h4 className="font-semibold text-sm text-white">Project Editor</h4>
            <p className="text-xs text-gray-400 mt-1">Inspect installed module code, edit files, and build.</p>
          </div>

          <div
            onClick={() => onNavigate('modules')}
            className="p-4 bg-gray-900 border border-gray-800 hover:border-blue-500/60 rounded-lg cursor-pointer transition-all group"
          >
            <div className="text-purple-400 group-hover:scale-110 transition-transform mb-2">
              <IconBox />
            </div>
            <h4 className="font-semibold text-sm text-white">Module Registry</h4>
            <p className="text-xs text-gray-400 mt-1">Add custom modules, configure Groq keys, test, and generate cURL.</p>
          </div>

          <div
            onClick={() => onNavigate('architecture')}
            className="p-4 bg-gray-900 border border-gray-800 hover:border-blue-500/60 rounded-lg cursor-pointer transition-all group"
          >
            <div className="text-amber-400 group-hover:scale-110 transition-transform mb-2">
              <IconLayers />
            </div>
            <h4 className="font-semibold text-sm text-white">Topology Graph</h4>
            <p className="text-xs text-gray-400 mt-1">Visual directional edges, service communication, and live health.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
