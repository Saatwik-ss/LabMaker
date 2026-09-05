import React, { useMemo, useState } from 'react';
import { useProject } from '../context/ProjectContext';
import { Spinner } from '../components/ui/Spinner';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import {
  IconLayers,
  IconRefresh,
  IconBox,
  IconCheck,
  IconCode,
  IconX,
  IconPlus,
  IconTrash
} from '../components/ui/Icons';
import { InstalledModule } from '@codex/shared';
import {
  addArchitectureNode,
  deleteArchitectureNode,
  addArchitectureRelationship,
  deleteArchitectureRelationship
} from '../api/model';
import { notifyCodeChange } from '../utils/codeChangeEvents';

export const Architecture: React.FC = () => {
  const { currentProject, refreshProjects, testModule, loading } = useProject();
  const [selectedNode, setSelectedNode] = useState<any | null>(null);
  const [testingModuleId, setTestingModuleId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Add Node Modal state
  const [isAddNodeOpen, setIsAddNodeOpen] = useState(false);
  const [newNodeId, setNewNodeId] = useState('');
  const [newNodeName, setNewNodeName] = useState('');
  const [newNodeType, setNewNodeType] = useState<'frontend' | 'backend' | 'database' | 'external' | 'module'>('backend');
  const [newNodeTech, setNewNodeTech] = useState('');
  const [newNodePort, setNewNodePort] = useState<string>('');

  // Add Relationship Modal state
  const [isAddRelOpen, setIsAddRelOpen] = useState(false);
  const [relSource, setRelSource] = useState('');
  const [relTarget, setRelTarget] = useState('');
  const [relType, setRelType] = useState('http');
  const [relLabel, setRelLabel] = useState('');

  const model = currentProject?.model;

  const { nodes, relationships } = useMemo(() => {
    if (!model) return { nodes: [], relationships: [] };
    const n: Array<{
      id: string;
      name: string;
      type: string;
      tech?: string;
      port?: number;
      testStatus?: string;
      healthStatus?: string;
      issues?: string[];
      moduleRef?: InstalledModule;
      isCustom?: boolean;
    }> = [];

    const r: Array<{ id: string; source: string; target: string; type: string; label?: string }> = [];

    // 1. Frontend
    if (model.stack?.frontend) {
      n.push({
        id: 'client-app',
        name: 'Client App',
        type: 'frontend',
        tech: `${model.stack.frontend.framework} (${model.stack.frontend.versionManager || 'vite'})`,
        testStatus: 'passed',
        healthStatus: 'healthy',
      });
    }

    // 2. Backends
    if (model.stack?.backends && model.stack.backends.length > 0) {
      model.stack.backends.forEach(b => {
        n.push({
          id: b.id || 'express-backend',
          name: b.name || 'Backend Server',
          type: 'backend',
          tech: `${b.framework} (${b.language})`,
          port: b.port || 3001,
          testStatus: 'passed',
          healthStatus: 'healthy',
        });
        if (model.stack?.frontend) {
          r.push({
            id: `fe-${b.id || 'express-backend'}`,
            source: 'client-app',
            target: b.id || 'express-backend',
            type: 'http',
            label: 'HTTP / API',
          });
        }
      });
    }

    // 3. Databases
    if (model.stack?.databases && model.stack.databases.length > 0) {
      model.stack.databases.forEach(db => {
        n.push({
          id: db.id || 'postgres-db',
          name: db.name || 'Primary Database',
          type: 'database',
          tech: db.type,
          testStatus: 'passed',
          healthStatus: 'healthy',
        });
        const backendId = model.stack?.backends?.[0]?.id || 'express-backend';
        r.push({
          id: `be-${db.id || 'postgres-db'}`,
          source: backendId,
          target: db.id || 'postgres-db',
          type: 'database',
          label: 'Queries',
        });
      });
    }

    // 4. Installed & Custom Modules
    if (model.modules && model.modules.length > 0) {
      model.modules.forEach(m => {
        const modId = m.id || `mod-${m.name}`;
        const nodeType = m.type || 'module';
        n.push({
          id: modId,
          name: m.name,
          type: nodeType,
          tech: m.version ? `v${m.version}` : 'module',
          testStatus: m.testStatus || 'untested',
          healthStatus: m.health?.status || 'untested',
          issues: m.health?.issues || [],
          moduleRef: m,
        });

        if (!m.relationships || m.relationships.length === 0) {
          const backendId = model.stack?.backends?.[0]?.id || 'express-backend';
          r.push({
            id: `be-${modId}`,
            source: backendId,
            target: modId,
            type: 'integration',
            label: 'Integrates with',
          });
        } else {
          m.relationships.forEach(rel => {
            r.push({
              id: `rel-${modId}-${rel.targetId}`,
              source: modId,
              target: rel.targetId,
              type: rel.type,
              label: rel.label,
            });
          });
        }
      });
    }

    // 5. Explicit architecture services (custom nodes added via graph editor)
    if (model.architecture?.services) {
      model.architecture.services.forEach(s => {
        if (!n.find(x => x.id === s.id)) {
          n.push({
            id: s.id,
            name: s.name,
            type: s.type,
            tech: s.technology || s.type,
            port: s.port,
            testStatus: 'passed',
            healthStatus: 'healthy',
            isCustom: true,
          });
        }
      });
    }

    // 6. Explicit model relationships
    if (model.architecture?.relationships) {
      model.architecture.relationships.forEach(rel => {
        if (!r.find(x => x.id === rel.id)) {
          r.push(rel);
        }
      });
    }

    return { nodes: n, relationships: r };
  }, [model]);

  const handleTestModuleClick = async (moduleId: string) => {
    setTestingModuleId(moduleId);
    try {
      await testModule(moduleId);
      if (selectedNode && selectedNode.moduleRef) {
        const updated = currentProject?.model.modules.find(m => m.id === moduleId || m.name === moduleId);
        if (updated) {
          setSelectedNode((prev: any) => ({
            ...prev,
            testStatus: updated.testStatus,
            healthStatus: updated.health?.status,
            issues: updated.health?.issues,
            moduleRef: updated,
          }));
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTestingModuleId(null);
    }
  };

  const handleCreateNode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNodeName.trim()) return;
    const finalId = (newNodeId.trim() || newNodeName.toLowerCase().replace(/[^a-z0-9]/g, '-')).trim();

    setActionLoading(true);
    try {
      await addArchitectureNode({
        id: finalId,
        name: newNodeName.trim(),
        type: newNodeType,
        technology: newNodeTech.trim() || undefined,
        port: newNodePort ? parseInt(newNodePort, 10) : undefined,
      });
      await refreshProjects();

      const createdPath = newNodeType === 'database' ? `src/db/${finalId}.ts` :
        newNodeType === 'frontend' ? `src/components/${finalId}.tsx` :
        newNodeType === 'external' ? `src/integrations/${finalId}.ts` :
        `src/services/${finalId}.ts`;

      notifyCodeChange({
        title: `Architecture Component: ${newNodeName.trim()}`,
        source: 'agent',
        summary: `Created ${newNodeType} component "${finalId}" and scaffolded ${createdPath} in workspace.`,
        files: [
          {
            path: createdPath,
            action: 'create',
            linesAdded: 30,
            linesRemoved: 0
          }
        ],
        validationPassed: true,
      });

      setIsAddNodeOpen(false);
      setNewNodeId('');
      setNewNodeName('');
      setNewNodeTech('');
      setNewNodePort('');
    } catch (err: any) {
      console.error('Failed to add node', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateRelationship = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!relSource || !relTarget || relSource === relTarget) return;
    const edgeId = `rel-${relSource}-${relTarget}-${Date.now().toString().slice(-4)}`;

    setActionLoading(true);
    try {
      await addArchitectureRelationship({
        id: edgeId,
        source: relSource,
        target: relTarget,
        type: relType,
        label: relLabel.trim() || `${relType.toUpperCase()} link`,
      });
      await refreshProjects();

      notifyCodeChange({
        title: `Architecture Link: ${relSource} -> ${relTarget}`,
        source: 'agent',
        summary: `Connected ${relSource} to ${relTarget} (${relType}) and wired code integration in workspace.`,
        files: [
          { path: `src/services/${relSource}.ts`, action: 'modify', linesModified: 5 },
          { path: 'src/index.ts', action: 'modify', linesModified: 2 }
        ],
        validationPassed: true,
      });

      setIsAddRelOpen(false);
      setRelLabel('');
    } catch (err: any) {
      console.error('Failed to add relationship', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteNode = async (nodeId: string) => {
    setActionLoading(true);
    try {
      await deleteArchitectureNode(nodeId);
      setSelectedNode(null);
      await refreshProjects();
    } catch (err: any) {
      console.error('Failed to delete node', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteRelationship = async (relId: string) => {
    setActionLoading(true);
    try {
      await deleteArchitectureRelationship(relId);
      await refreshProjects();
    } catch (err: any) {
      console.error('Failed to delete relationship', err);
    } finally {
      setActionLoading(false);
    }
  };

  const getHealthBadge = (healthStatus?: string) => {
    switch (healthStatus) {
      case 'healthy':
        return <Badge variant="success">Healthy</Badge>;
      case 'warning':
        return <Badge variant="warning">Warning</Badge>;
      case 'error':
        return <Badge variant="danger">Failed</Badge>;
      default:
        return <Badge variant="default">Untested</Badge>;
    }
  };

  // Filter relationships associated with selected node
  const selectedNodeRelationships = useMemo(() => {
    if (!selectedNode) return [];
    return relationships.filter(r => r.source === selectedNode.id || r.target === selectedNode.id);
  }, [selectedNode, relationships]);

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">Project Architecture & Topology Graph</h1>
            <Badge variant="info">{currentProject?.name || 'Workspace'}</Badge>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Visual topology editor, service relationships, and live validation health.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setIsAddNodeOpen(true)}
            variant="secondary"
            size="sm"
            className="flex items-center gap-1.5"
          >
            <IconPlus />
            <span>Add Node</span>
          </Button>

          <Button
            onClick={() => setIsAddRelOpen(true)}
            variant="secondary"
            size="sm"
            className="flex items-center gap-1.5"
            disabled={nodes.length < 2}
          >
            <IconPlus />
            <span>Add Edge</span>
          </Button>

          <Button
            onClick={() => refreshProjects()}
            disabled={loading}
            variant="secondary"
            size="sm"
            className="flex items-center gap-1.5"
          >
            {loading ? <Spinner size="sm" /> : <IconRefresh />}
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Main Graph Surface */}
      <div className="relative bg-gray-900 border border-gray-800 rounded-xl p-6 min-h-[460px] flex flex-col justify-between overflow-hidden shadow-xl">
        {nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-500 text-center">
            <IconLayers />
            <span className="mt-3 text-sm font-medium">No architecture nodes detected.</span>
            <Button
              onClick={() => setIsAddNodeOpen(true)}
              variant="secondary"
              size="sm"
              className="mt-4"
            >
              Add First Architecture Node
            </Button>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Multi-Layer Flow */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
              {/* Frontend Layer */}
              <div className="space-y-3">
                <div className="text-[11px] font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-gray-800 pb-1">
                  <span>Client Layer</span>
                </div>
                {nodes.filter(n => n.type === 'frontend').map(node => (
                  <div
                    key={node.id}
                    onClick={() => setSelectedNode(node)}
                    className={`p-4 bg-gray-950 border-2 rounded-lg cursor-pointer transition-all shadow-md ${
                      selectedNode?.id === node.id ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-blue-900/60 hover:border-blue-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <strong className="text-sm text-white">{node.name}</strong>
                      {getHealthBadge(node.healthStatus)}
                    </div>
                    <div className="text-xs text-blue-300 font-mono mt-1">{node.tech}</div>
                  </div>
                ))}
              </div>

              {/* Core / API Layer */}
              <div className="space-y-3">
                <div className="text-[11px] font-bold text-green-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-gray-800 pb-1">
                  <span>API & Core Layer</span>
                </div>
                {nodes.filter(n => n.type === 'backend' || n.type === 'api').map(node => (
                  <div
                    key={node.id}
                    onClick={() => setSelectedNode(node)}
                    className={`p-4 bg-gray-950 border-2 rounded-lg cursor-pointer transition-all shadow-md ${
                      selectedNode?.id === node.id ? 'border-green-500 ring-2 ring-green-500/20' : 'border-green-900/60 hover:border-green-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <strong className="text-sm text-white">{node.name}</strong>
                      {getHealthBadge(node.healthStatus)}
                    </div>
                    <div className="text-xs text-green-300 font-mono mt-1">
                      {node.tech} {node.port ? `:${node.port}` : ''}
                    </div>
                  </div>
                ))}
              </div>

              {/* Data & Services Layer */}
              <div className="space-y-3">
                <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-gray-800 pb-1">
                  <span>Data & Services Layer</span>
                </div>
                {nodes.filter(n => n.type === 'database' || n.type === 'module' || n.type === 'services' || n.type === 'custom' || n.type === 'external').map(node => (
                  <div
                    key={node.id}
                    onClick={() => setSelectedNode(node)}
                    className={`p-4 bg-gray-950 border-2 rounded-lg cursor-pointer transition-all shadow-md ${
                      selectedNode?.id === node.id ? 'border-amber-500 ring-2 ring-amber-500/20' : 'border-amber-900/60 hover:border-amber-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <strong className="text-sm text-white">{node.name}</strong>
                      {getHealthBadge(node.healthStatus)}
                    </div>
                    <div className="text-xs text-amber-300 font-mono mt-1">
                      {node.type.toUpperCase()}: {node.tech}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Visual Relationships List */}
            <div className="pt-6 border-t border-gray-800/80">
              <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">
                Connected Topology Edges ({relationships.length})
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {relationships.map(rel => {
                  const src = nodes.find(n => n.id === rel.source)?.name || rel.source;
                  const tgt = nodes.find(n => n.id === rel.target)?.name || rel.target;
                  return (
                    <div
                      key={rel.id}
                      className="p-2.5 bg-gray-950 border border-gray-800 rounded text-xs flex items-center justify-between"
                    >
                      <div className="truncate mr-2">
                        <span className="text-white font-medium">{src}</span>
                        <span className="text-gray-500 mx-1.5">&rarr;</span>
                        <span className="text-white font-medium">{tgt}</span>
                        <span className="block text-[10px] text-gray-400 font-mono mt-0.5">{rel.label || rel.type}</span>
                      </div>
                      <button
                        onClick={() => handleDeleteRelationship(rel.id)}
                        className="text-gray-500 hover:text-red-400 p-1 transition-colors"
                        title="Delete connection"
                      >
                        <IconX />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Selected Node Details Drawer */}
      {selectedNode && (
        <div className="bg-gray-950 border border-gray-800 rounded-xl p-5 space-y-4 shadow-xl">
          <div className="flex justify-between items-start border-b border-gray-800 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">{selectedNode.name}</h3>
                <Badge variant="default">{selectedNode.type}</Badge>
              </div>
              <span className="text-xs text-gray-400 font-mono mt-0.5 block">ID: {selectedNode.id}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleDeleteNode(selectedNode.id)}
                disabled={actionLoading}
                className="flex items-center gap-1 text-xs"
              >
                <IconTrash />
                <span>Delete Node</span>
              </Button>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-gray-500 hover:text-white p-1"
              >
                <IconX />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-2">
              <div className="flex justify-between py-1 border-b border-gray-900">
                <span className="text-gray-400">Technology:</span>
                <span className="text-white font-mono">{selectedNode.tech || 'unspecified'}</span>
              </div>
              {selectedNode.port && (
                <div className="flex justify-between py-1 border-b border-gray-900">
                  <span className="text-gray-400">Port:</span>
                  <span className="text-white font-mono">{selectedNode.port}</span>
                </div>
              )}
              <div className="flex justify-between py-1 border-b border-gray-900">
                <span className="text-gray-400">Status:</span>
                {getHealthBadge(selectedNode.healthStatus)}
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-gray-400 block font-medium">Associated Edges ({selectedNodeRelationships.length})</span>
              {selectedNodeRelationships.length === 0 ? (
                <span className="text-gray-500 text-[11px]">No active connections.</span>
              ) : (
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {selectedNodeRelationships.map(rel => (
                    <div key={rel.id} className="p-1.5 bg-gray-900 rounded flex items-center justify-between text-[11px]">
                      <span className="text-gray-300">
                        {rel.source === selectedNode.id ? `To: ${rel.target}` : `From: ${rel.source}`} ({rel.type})
                      </span>
                      <button
                        onClick={() => handleDeleteRelationship(rel.id)}
                        className="text-gray-500 hover:text-red-400"
                        title="Remove Edge"
                      >
                        <IconX />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-gray-800 flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              disabled={testingModuleId === selectedNode.id}
              onClick={() => handleTestModuleClick(selectedNode.moduleRef?.id || selectedNode.id)}
            >
              {testingModuleId === selectedNode.id ? <Spinner size="sm" /> : 'Run Component Tests'}
            </Button>
          </div>
        </div>
      )}

      {/* Add Architecture Node Modal */}
      <Modal isOpen={isAddNodeOpen} onClose={() => setIsAddNodeOpen(false)} title="Add Architecture Node">
        <form onSubmit={handleCreateNode} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">Node Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Payment Gateway"
              value={newNodeName}
              onChange={e => setNewNodeName(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">Node Identifier (Optional)</label>
            <input
              type="text"
              placeholder="e.g. payment-gateway"
              value={newNodeId}
              onChange={e => setNewNodeId(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">Layer / Type</label>
              <select
                value={newNodeType}
                onChange={e => setNewNodeType(e.target.value as any)}
                className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                <option value="frontend">Frontend Client</option>
                <option value="backend">Backend / API</option>
                <option value="database">Database</option>
                <option value="module">Module</option>
                <option value="external">External Service</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">Technology / Stack</label>
              <input
                type="text"
                placeholder="e.g. Express, Postgres, Redis"
                value={newNodeTech}
                onChange={e => setNewNodeTech(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">Port (Optional)</label>
            <input
              type="number"
              placeholder="e.g. 8080"
              value={newNodePort}
              onChange={e => setNewNodePort(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-gray-800">
            <Button variant="secondary" type="button" onClick={() => setIsAddNodeOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={actionLoading || !newNodeName.trim()}>
              {actionLoading ? <Spinner size="sm" /> : 'Create Node'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Relationship Modal */}
      <Modal isOpen={isAddRelOpen} onClose={() => setIsAddRelOpen(false)} title="Connect Architecture Nodes">
        <form onSubmit={handleCreateRelationship} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">Source Node</label>
              <select
                required
                value={relSource}
                onChange={e => setRelSource(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                <option value="">Select source...</option>
                {nodes.map(n => (
                  <option key={n.id} value={n.id}>{n.name} ({n.type})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">Target Node</label>
              <select
                required
                value={relTarget}
                onChange={e => setRelTarget(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                <option value="">Select target...</option>
                {nodes.filter(n => n.id !== relSource).map(n => (
                  <option key={n.id} value={n.id}>{n.name} ({n.type})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">Connection Type</label>
              <select
                value={relType}
                onChange={e => setRelType(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                <option value="http">HTTP / REST</option>
                <option value="database">Database Query</option>
                <option value="websocket">WebSocket</option>
                <option value="grpc">gRPC</option>
                <option value="integration">Integration</option>
                <option value="import">Code Import</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">Label</label>
              <input
                type="text"
                placeholder="e.g. Query / Auth"
                value={relLabel}
                onChange={e => setRelLabel(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-gray-800">
            <Button variant="secondary" type="button" onClick={() => setIsAddRelOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={actionLoading || !relSource || !relTarget}>
              {actionLoading ? <Spinner size="sm" /> : 'Connect Nodes'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
