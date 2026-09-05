import React from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { useModel } from '../hooks/useModel';
import { useProject } from '../context/ProjectContext';
import { IconRefresh, IconCode, IconBox, IconLayers } from '../components/ui/Icons';

export const Dashboard = () => {
  const { summary, loading: modelLoading, error, discoverProject } = useModel();
  const { currentProject, refreshProjects, loading: projLoading } = useProject();

  const loading = modelLoading || projLoading;
  const projectName = currentProject?.name || summary?.name || 'Active Project';
  const projectDesc = currentProject?.description || summary?.description || 'Full-stack AI-native workspace and service architecture.';
  const backendCount = currentProject?.model?.stack?.backends?.length ?? summary?.backendCount ?? 1;
  const databaseCount = currentProject?.model?.stack?.databases?.length ?? summary?.databaseCount ?? 0;
  const moduleCount = currentProject?.model?.modules?.length ?? summary?.moduleCount ?? 0;
  const serviceCount = currentProject?.model?.architecture?.services?.length ?? summary?.serviceCount ?? 0;
  const relationshipCount = currentProject?.model?.architecture?.relationships?.length ?? summary?.relationshipCount ?? 0;

  if (loading && !currentProject && !summary) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in space-y-8 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-800 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-white tracking-tight">
              {projectName}
            </h1>
            <Badge variant={currentProject?.status === 'active' ? 'success' : 'info'}>
              {currentProject?.status || 'Active'}
            </Badge>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            {projectDesc}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="secondary" 
            size="sm"
            onClick={() => { discoverProject(); refreshProjects(); }} 
            disabled={loading}
            className="flex items-center gap-1.5"
          >
            {loading ? <Spinner size="sm" /> : <IconRefresh />}
            <span>{loading ? 'Discovering...' : 'Scan Project'}</span>
          </Button>
        </div>
      </div>
      
      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="bg-gray-900 border-gray-800 p-4">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Frontend</div>
          <div className="text-xl font-bold text-blue-400 mt-1 capitalize truncate">
            {summary?.frontend || 'React'}
          </div>
        </Card>
        <Card className="bg-gray-900 border-gray-800 p-4">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Backends</div>
          <div className="text-xl font-bold text-green-400 mt-1">{backendCount}</div>
        </Card>
        <Card className="bg-gray-900 border-gray-800 p-4">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Databases</div>
          <div className="text-xl font-bold text-amber-400 mt-1">{databaseCount}</div>
        </Card>
        <Card className="bg-gray-900 border-gray-800 p-4">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Modules</div>
          <div className="text-xl font-bold text-purple-400 mt-1">{moduleCount}</div>
        </Card>
        <Card className="bg-gray-900 border-gray-800 p-4">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Services</div>
          <div className="text-xl font-bold text-white mt-1">{serviceCount}</div>
        </Card>
        <Card className="bg-gray-900 border-gray-800 p-4">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Relations</div>
          <div className="text-xl font-bold text-white mt-1">{relationshipCount}</div>
        </Card>
      </div>

      {/* Project Status Panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-gray-900 border-gray-800 p-5 space-y-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <IconLayers />
            <span>Stack Overview</span>
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center py-2 border-b border-gray-800/80">
              <span className="text-gray-400">Client Framework</span>
              <span className="font-mono text-white capitalize">{summary?.frontend || 'React Vite'}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-800/80">
              <span className="text-gray-400">Server Runtime</span>
              <span className="font-mono text-white">Express (Node.js)</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-800/80">
              <span className="text-gray-400">Language Standard</span>
              <span className="font-mono text-white">TypeScript 5</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-gray-400">Last Model Update</span>
              <span className="font-mono text-gray-300">
                {summary?.updatedAt ? new Date(summary.updatedAt).toLocaleString() : 'Recently'}
              </span>
            </div>
          </div>
        </Card>

        <Card className="bg-gray-900 border-gray-800 p-5 space-y-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <IconBox />
            <span>Quick Navigation</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <a 
              href="#editor" 
              onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('nav-page', { detail: 'editor' })); }}
              className="p-3 bg-gray-950 border border-gray-800 hover:border-blue-500 rounded flex items-center gap-2.5 transition-colors text-gray-300 hover:text-white"
            >
              <IconCode />
              <span>Project Editor</span>
            </a>
            <a 
              href="#modules" 
              onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('nav-page', { detail: 'modules' })); }}
              className="p-3 bg-gray-950 border border-gray-800 hover:border-purple-500 rounded flex items-center gap-2.5 transition-colors text-gray-300 hover:text-white"
            >
              <IconBox />
              <span>Manage Modules</span>
            </a>
            <a 
              href="#architecture" 
              onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('nav-page', { detail: 'architecture' })); }}
              className="p-3 bg-gray-950 border border-gray-800 hover:border-amber-500 rounded flex items-center gap-2.5 transition-colors text-gray-300 hover:text-white"
            >
              <IconLayers />
              <span>Architecture Graph</span>
            </a>
            <a 
              href="#chat" 
              onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('nav-page', { detail: 'chat' })); }}
              className="p-3 bg-gray-950 border border-gray-800 hover:border-green-500 rounded flex items-center gap-2.5 transition-colors text-gray-300 hover:text-white"
            >
              <IconRefresh />
              <span>AI Code Assistant</span>
            </a>
          </div>
        </Card>
      </div>
    </div>
  );
};
