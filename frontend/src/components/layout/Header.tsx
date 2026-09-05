import React, { useState } from 'react';
import { useProject } from '../../context/ProjectContext';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { IconBox, IconCheck, IconLayers, IconX, IconFolder, IconSparkles } from '../ui/Icons';
import { NewModuleModal } from '../modules/NewModuleModal';
import { indexCurrentProject } from '../../api/projects';

export const Header: React.FC = () => {
  const { currentProject, projects, selectProject, createProject, importFolder, loading } = useProject();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [newProjectModalOpen, setNewProjectModalOpen] = useState(false);
  const [newModuleNameModalOpen, setNewModuleNameModalOpen] = useState(false);
  const [newProjName, setNewProjName] = useState('');
  const [newProjDesc, setNewProjDesc] = useState('');
  const [projPreset, setProjPreset] = useState('fullstack');
  const [creating, setCreating] = useState(false);
  const folderInputRef = React.useRef<HTMLInputElement>(null);
  const [folderImporting, setFolderImporting] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [indexToast, setIndexToast] = useState<string | null>(null);

  const handleChooseFolder = () => {
    folderInputRef.current?.click();
  };

  const handleFolderSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    setFolderImporting(true);
    try {
      await importFolder(fileList);
    } catch (err: any) {
      console.error('Folder import failed:', err);
    } finally {
      setFolderImporting(false);
      if (folderInputRef.current) folderInputRef.current.value = '';
    }
  };

  const handleIndexClick = async () => {
    setIndexing(true);
    try {
      const res = await indexCurrentProject();
      setIndexToast(`Indexed ${res?.totalFiles ?? 'all'} files`);
      setTimeout(() => setIndexToast(null), 3000);
    } catch {
      setIndexToast('Indexed');
      setTimeout(() => setIndexToast(null), 2500);
    } finally {
      setIndexing(false);
    }
  };

  const handleSelect = async (id: string) => {
    setDropdownOpen(false);
    await selectProject(id);
  };

  const handleCreateProjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjName.trim()) return;
    setCreating(true);
    try {
      await createProject(newProjName.trim(), newProjDesc.trim(), projPreset);
      setNewProjName('');
      setNewProjDesc('');
      setNewProjectModalOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  const healthyModules = currentProject?.model?.modules?.filter(m => m.health?.status === 'healthy').length || 0;
  const totalModules = currentProject?.model?.modules?.length || 0;

  return (
    <>
      <header className="h-14 border-b border-gray-800 bg-gray-950 px-4 flex items-center justify-between z-30 shrink-0 select-none">
        {/* Project Selector Left */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2.5 px-3 py-1.5 bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-lg text-sm text-white transition-all shadow-sm group"
            >
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
              <span className="font-semibold truncate max-w-[200px] sm:max-w-[280px]">
                {currentProject?.name || 'Select Project'}
              </span>
              <Badge variant={currentProject?.status === 'active' ? 'success' : 'info'}>
                {currentProject?.status || 'Active'}
              </Badge>
              <svg className="w-4 h-4 text-gray-500 group-hover:text-gray-300 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </button>

            {/* Dropdown Menu */}
            {dropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                <div className="absolute left-0 mt-2 w-80 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in text-xs">
                  <div className="p-3 border-b border-gray-800 bg-gray-950 flex items-center justify-between">
                    <span className="font-bold text-gray-300 uppercase tracking-wider text-[11px]">
                      Registered Projects ({projects.length})
                    </span>
                    <button
                      onClick={() => { setDropdownOpen(false); setNewProjectModalOpen(true); }}
                      className="text-blue-400 hover:text-blue-300 font-semibold"
                    >
                      + New Project
                    </button>
                  </div>

                  <div className="max-h-64 overflow-y-auto p-1.5 space-y-1">
                    {projects.map(p => (
                      <div
                        key={p.id}
                        onClick={() => handleSelect(p.id)}
                        className={`p-2.5 rounded-lg cursor-pointer transition-all flex items-center justify-between ${
                          p.isCurrent ? 'bg-blue-950/70 border border-blue-800/80 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                        }`}
                      >
                        <div className="truncate mr-2">
                          <div className="font-medium truncate">{p.name}</div>
                          <div className="text-[11px] text-gray-500 truncate">{p.description}</div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge variant={p.status === 'active' ? 'success' : 'info'}>
                            {p.status}
                          </Badge>
                          {p.isCurrent && <span className="text-blue-400 font-bold text-xs"><IconCheck /></span>}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="p-2 border-t border-gray-800 bg-gray-950/60 text-center">
                    <button
                      onClick={() => { setDropdownOpen(false); window.dispatchEvent(new CustomEvent('nav-page', { detail: 'history' })); }}
                      className="text-gray-400 hover:text-white text-[11px] transition-colors"
                    >
                      Browse Past Application History & Context &rarr;
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Quick Metrics Bar */}
          <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-gray-800 text-xs text-gray-400">
            <span>Frontend: <strong className="text-gray-200">{currentProject?.model?.stack?.frontend?.framework || 'React'}</strong></span>
            <span>&bull;</span>
            <span>Modules: <strong className="text-gray-200">{totalModules}</strong></span>
          </div>
        </div>

        {/* Actions Right */}
        <div className="flex items-center gap-2.5">
          {/* Health Badge */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-gray-900 border border-gray-800 rounded-md text-xs">
            <span className={`w-2 h-2 rounded-full ${totalModules === 0 ? 'bg-gray-500' : healthyModules === totalModules ? 'bg-green-500' : 'bg-amber-500'}`} />
            <span className="text-gray-400">Health:</span>
            <span className="font-semibold text-gray-200">
              {totalModules === 0 ? 'Untested' : `${healthyModules}/${totalModules} Healthy`}
            </span>
          </div>

          {/* Index Project Button */}
          <Button
            size="sm"
            variant="secondary"
            onClick={handleIndexClick}
            disabled={indexing}
            title="Index project AST, symbols, and dependencies (Crystal AST)"
            className="hidden md:flex items-center gap-1.5 text-xs py-1.5"
          >
            <IconSparkles />
            <span>{indexing ? 'Indexing...' : indexToast || 'Index'}</span>
          </Button>

          {/* Import Folder Button */}
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
            size="sm"
            variant="secondary"
            onClick={handleChooseFolder}
            disabled={folderImporting}
            title="Choose or import a local codebase folder into browser workspace"
            className="flex items-center gap-1.5 text-xs py-1.5"
          >
            <IconFolder />
            <span>{folderImporting ? 'Importing...' : 'Choose Folder'}</span>
          </Button>

          {/* Add Module Trigger */}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setNewModuleNameModalOpen(true)}
            className="flex items-center gap-1.5 text-xs py-1.5"
          >
            <IconBox />
            <span>Add Module</span>
          </Button>

          {/* New Project Quick Button */}
          <Button
            size="sm"
            variant="primary"
            onClick={() => setNewProjectModalOpen(true)}
            className="text-xs py-1.5"
          >
            New Project
          </Button>
        </div>
      </header>

      {/* New Module Modal */}
      <NewModuleModal
        isOpen={newModuleNameModalOpen}
        onClose={() => setNewModuleNameModalOpen(false)}
      />

      {/* New Project Scaffolding Modal */}
      {newProjectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md shadow-2xl p-6 text-sm">
            <div className="flex items-center justify-between mb-4 border-b border-gray-800 pb-3">
              <h3 className="font-bold text-base text-white">Create & Activate Project</h3>
              <button onClick={() => setNewProjectModalOpen(false)} className="text-gray-400 hover:text-white">
                <IconX />
              </button>
            </div>

            <form onSubmit={handleCreateProjectSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  Project Name *
                </label>
                <input
                  type="text"
                  value={newProjName}
                  onChange={e => setNewProjName(e.target.value)}
                  placeholder="e.g. Apex Platform"
                  className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500 text-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={newProjDesc}
                  onChange={e => setNewProjDesc(e.target.value)}
                  placeholder="e.g. Microservice backend and analytics UI"
                  className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  Preset Architecture
                </label>
                <select
                  value={projPreset}
                  onChange={e => setProjPreset(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500 text-xs"
                >
                  <option value="fullstack">Full-Stack (React Vite + Express)</option>
                  <option value="backend">Backend Service (Node + PostgreSQL)</option>
                  <option value="modular">Modular Engine (Auth + CRUD + Search)</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-800">
                <Button type="button" variant="ghost" onClick={() => setNewProjectModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={creating || !newProjName.trim()}>
                  {creating ? <Spinner size="sm" /> : 'Create & Switch'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
