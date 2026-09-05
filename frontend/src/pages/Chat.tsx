import React, { useState, useEffect, useRef } from 'react';
import { useProject } from '../context/ProjectContext';
import { getSettings } from '../api/settings';
import { getAiHealth, applyAiEdits, undoAiEdits, AiHealthStatus } from '../api/ai';
import {
  getAvailableModels,
  streamChatMessage,
  ChatModelInfo,
  TodoItem,
  TerminalLog,
  ProposedChange,
} from '../api/chat';
import { MarkdownRenderer } from '../components/ui/MarkdownRenderer';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import {
  IconMessage,
  IconSparkles,
  IconBot,
  IconUser,
  IconListTodo,
  IconTerminal,
  IconTrash,
  IconSend,
  IconStop,
  IconPaperclip,
  IconX,
  IconCheck,
  IconUndo,
  IconFile,
} from '../components/ui/Icons';
import { notifyCodeChange } from '../utils/codeChangeEvents';
import { getFileTree, FileEntry } from '../api/files';

export interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  mode?: 'chat' | 'agent';
  timestamp: string;
  agentPlan?: {
    goal?: string;
    todos: TodoItem[];
  };
  terminalLogs?: TerminalLog[];
  changes?: ProposedChange[];
  requestId?: string;
  patchApplied?: boolean;
}

export const Chat: React.FC = () => {
  const { currentProject, refreshProjects } = useProject();
  const projectId = currentProject?.id || 'default';
  const historyKey = `codex_chat_history_${projectId}`;
  const draftKey = `codex_chat_draft_${projectId}`;

  // Mode and Model State
  const [chatMode, setChatMode] = useState<'chat' | 'agent'>('chat');
  const [models, setModels] = useState<ChatModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('llama-3.1-8b-instant');

  // Input and History
  const [prompt, setPrompt] = useState(() => localStorage.getItem(draftKey) || '');
  const [history, setHistory] = useState<ChatMessageItem[]>(() => {
    try {
      const saved = localStorage.getItem(historyKey);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Attached Context (from Editor or User Selection)
  const [activeFile, setActiveFile] = useState<string | null>(() => sessionStorage.getItem('codex_active_file'));
  const [selectedCode, setSelectedCode] = useState<string | null>(() => sessionStorage.getItem('codex_selected_code'));
  const [referenceContext, setReferenceContext] = useState<string | null>(() => sessionStorage.getItem('codex_reference_context'));

  // Live Streaming State
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [statusLine, setStatusLine] = useState('');
  const [activePlan, setActivePlan] = useState<{ goal?: string; todos: TodoItem[] } | null>(null);
  const [activeTerminalLogs, setActiveTerminalLogs] = useState<TerminalLog[]>([]);
  const [activeChanges, setActiveChanges] = useState<ProposedChange[]>([]);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);

  // File Picker Modal
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [projectFiles, setProjectFiles] = useState<FileEntry[]>([]);

  // Health and UI State
  const [aiHealth, setAiHealth] = useState<AiHealthStatus | null>(null);
  const [expandedDiffs, setExpandedDiffs] = useState<Record<string, boolean>>({});
  const [patchStatus, setPatchStatus] = useState<Record<string, 'applied' | 'undone'>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Check health & fetch models on mount
  useEffect(() => {
    getAiHealth().then(setAiHealth).catch(() => setAiHealth({ isAvailable: false }));
    getAvailableModels().then(mList => {
      const normalizedList = mList.map(m => {
        if (m.id.includes('llama-3.1-70b') || m.id === 'llama3-70b-8192') {
          return { ...m, id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile' };
        }
        return m;
      });
      setModels(normalizedList);
      const defaultMod = normalizedList.find(m => m.default)?.id || normalizedList[0]?.id || 'llama-3.3-70b-versatile';
      setSelectedModel(defaultMod);
    });
  }, []);

  // Sync context from session storage on mount/focus
  useEffect(() => {
    const syncContext = () => {
      setActiveFile(sessionStorage.getItem('codex_active_file'));
      setSelectedCode(sessionStorage.getItem('codex_selected_code'));
      setReferenceContext(sessionStorage.getItem('codex_reference_context'));
    };
    syncContext();
    window.addEventListener('storage', syncContext);
    window.addEventListener('focus', syncContext);
    return () => {
      window.removeEventListener('storage', syncContext);
      window.removeEventListener('focus', syncContext);
    };
  }, []);

  // Persist history per project
  useEffect(() => {
    try {
      if (history.length > 0) {
        localStorage.setItem(historyKey, JSON.stringify(history));
      } else {
        localStorage.removeItem(historyKey);
      }
    } catch (e) {
      console.warn('Failed to save history:', e);
    }
  }, [history, historyKey]);

  // Switch chat when project changes
  useEffect(() => {
    try {
      const saved = localStorage.getItem(historyKey);
      setHistory(saved ? JSON.parse(saved) : []);
    } catch {
      setHistory([]);
    }
    setPrompt(localStorage.getItem(draftKey) || '');
  }, [projectId]);

  // Scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [history, streamingContent, statusLine, activePlan, activeTerminalLogs, activeChanges]);

  // Load project files for picker
  const handleOpenPicker = async () => {
    try {
      const tree = await getFileTree();
      setProjectFiles(tree.filter(f => !f.isDirectory));
      setIsPickerOpen(true);
    } catch {
      setIsPickerOpen(true);
    }
  };

  const handleClearHistory = () => {
    localStorage.removeItem(historyKey);
    setHistory([]);
  };

  const handlePromptChange = (val: string) => {
    setPrompt(val);
    if (val) {
      localStorage.setItem(draftKey, val);
    } else {
      localStorage.removeItem(draftKey);
    }
  };

  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setStatusLine('');
  };

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isStreaming) return;

    const userText = textToSend.trim();
    setPrompt('');
    localStorage.removeItem(draftKey);

    const userMessage: ChatMessageItem = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: userText,
      mode: chatMode,
      timestamp: new Date().toISOString(),
    };

    setHistory(prev => [...prev, userMessage]);

    // Prepare streaming state
    setIsStreaming(true);
    setStreamingContent('');
    setStatusLine(chatMode === 'agent' ? 'Initializing agent planner...' : 'Connecting to AI model...');
    setActivePlan(null);
    setActiveTerminalLogs([]);
    setActiveChanges([]);
    setActiveRequestId(null);

    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;

    const settings = getSettings();
    const effectiveApiKey = settings.groqApiKey || settings.openaiApiKey || settings.anthropicApiKey || '';
    const effectiveGroqKey = currentProject?.credentials?.groqApiKey || settings.groqApiKey;

    // Convert history for API
    const conversationHistory = history.map(h => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    }));

    let accumulatedContent = '';
    let currentPlan: { goal?: string; todos: TodoItem[] } | null = null;
    let terminalLogs: TerminalLog[] = [];
    let proposedChanges: ProposedChange[] = [];
    let assignedRequestId = `req-${Date.now()}`;

    try {
      await streamChatMessage(
        {
          message: userText,
          conversationHistory,
          mode: chatMode,
          model: selectedModel.includes('llama-3.1-70b') || selectedModel === 'llama3-70b-8192' ? 'llama-3.3-70b-versatile' : selectedModel,
          apiKey: effectiveApiKey,
          groqApiKey: effectiveGroqKey,
          selectedFile: activeFile || undefined,
          selectedCode: selectedCode || undefined,
          systemPrompt: settings.systemPrompt,
          enablePlanning: chatMode === 'agent',
          signal: abortCtrl.signal,
        },
        event => {
          if (event.type === 'planning') {
            if (event.content) setStatusLine(event.content);
            if (event.goal || event.todos) {
              currentPlan = {
                goal: event.goal || currentPlan?.goal,
                todos: event.todos || currentPlan?.todos || [],
              };
              setActivePlan({ ...currentPlan });
            }
          } else if (event.type === 'content') {
            if (event.content) {
              accumulatedContent += event.content;
              setStreamingContent(accumulatedContent);
            }
          } else if (event.type === 'message') {
            if (event.content) {
              accumulatedContent += event.content;
              setStreamingContent(accumulatedContent);
            }
          } else if (event.type === 'tool_call') {
            setStatusLine(`Agent executing: ${event.tool || 'tool'}...`);
          } else if (event.type === 'tool_result') {
            if (event.terminal) {
              terminalLogs = [...terminalLogs, event.terminal];
              setActiveTerminalLogs([...terminalLogs]);
            }
          } else if (event.type === 'diff' || event.type === 'diffs') {
            if (event.changes && Array.isArray(event.changes)) {
              proposedChanges = event.changes;
              setActiveChanges([...proposedChanges]);
            } else if (event.path) {
              proposedChanges.push({
                path: event.path,
                action: 'modify',
                newContent: event.proposed || event.diff,
              });
              setActiveChanges([...proposedChanges]);
            }
          } else if (event.type === 'end' || event.type === 'finish') {
            if (event.reply && !accumulatedContent) {
              accumulatedContent = event.reply;
              setStreamingContent(accumulatedContent);
            }
            if (event.requestId) {
              assignedRequestId = event.requestId;
              setActiveRequestId(event.requestId);
            }
            if (event.changes && Array.isArray(event.changes) && event.changes.length > 0) {
              proposedChanges = event.changes;
              setActiveChanges([...proposedChanges]);
            }
          } else if (event.type === 'error') {
            accumulatedContent += `\n\n[Error: ${event.error || 'Operation failed'}]`;
            setStreamingContent(accumulatedContent);
          }
        }
      );
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        accumulatedContent += `\n\n*Error encountered:* ${err.message || 'Stream connection interrupted'}`;
      }
    } finally {
      setIsStreaming(false);
      setStatusLine('');
      abortControllerRef.current = null;

      // Commit assistant message to history
      const assistantMessage: ChatMessageItem = {
        id: `asst-${Date.now()}`,
        role: 'assistant',
        content: accumulatedContent || (chatMode === 'agent' ? 'Agent task completed.' : 'Ready for next instruction.'),
        mode: chatMode,
        timestamp: new Date().toISOString(),
        agentPlan: currentPlan || undefined,
        terminalLogs: terminalLogs.length > 0 ? terminalLogs : undefined,
        changes: proposedChanges.length > 0 ? proposedChanges : undefined,
        requestId: assignedRequestId,
      };

      setHistory(prev => [...prev, assistantMessage]);
      setStreamingContent('');
      setActivePlan(null);
      setActiveTerminalLogs([]);
      setActiveChanges([]);

      // Prompt code change notification if files were modified
      if (proposedChanges.length > 0) {
        notifyCodeChange({
          title: `AI Assistant: ${chatMode === 'agent' ? 'Agent Proposed Edits' : 'Code Changes Generated'}`,
          source: 'agent',
          summary: `Generated proposals for ${proposedChanges.length} file(s).`,
          files: proposedChanges.map(c => ({
            path: c.path,
            action: c.action,
            linesAdded: c.linesAdded || (c.newContent ? c.newContent.split('\n').length : 0),
            linesRemoved: c.linesRemoved || 0,
            linesModified: 0,
            newContent: c.newContent,
          })),
        });
      }

      await refreshProjects();
    }
  };

  const handleApplyEdits = async (reqId: string, changes: ProposedChange[]) => {
    try {
      const edits = changes.map(c => ({ file_path: c.path, proposed: c.newContent || '' }));
      await applyAiEdits(reqId, edits);
      setPatchStatus(prev => ({ ...prev, [reqId]: 'applied' }));

      notifyCodeChange({
        title: 'AI Assistant: Changes Applied to Disk',
        source: 'agent',
        summary: `Applied edits to ${changes.length} file(s).`,
        files: changes.map(c => ({
          path: c.path,
          action: c.action,
          linesAdded: c.newContent ? c.newContent.split('\n').length : 0,
          linesRemoved: 0,
          linesModified: 0,
          newContent: c.newContent,
        })),
      });

      await refreshProjects();
    } catch (err: any) {
      console.warn('Apply edits error:', err);
    }
  };

  const handleUndoEdits = async (reqId: string) => {
    try {
      await undoAiEdits(reqId);
      setPatchStatus(prev => ({ ...prev, [reqId]: 'undone' }));
      await refreshProjects();
    } catch (err: any) {
      console.warn('Undo edits error:', err);
    }
  };

  const toggleDiff = (key: string) => {
    setExpandedDiffs(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const samplePrompts = [
    '🧪 Test adding a module and check pipeline compatibility',
    '⚡ Verify if the whole pipeline works (build, tests & types)',
    '💻 Run terminal command: npm test',
    'Explain the architecture and main components of this repository',
  ];

  return (
    <div className="flex flex-col h-full max-w-5xl mx-auto w-full animate-fade-in font-sans">
      {/* Top Persistent Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800 bg-gray-950 text-xs shrink-0 select-none">
        <div className="flex items-center gap-3">
          {/* AI Harness / Crystal Engine Status */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-gray-900 border border-gray-800 text-[11px]">
            <span className={`w-2 h-2 rounded-full ${aiHealth?.isAvailable ? 'bg-emerald-400 animate-pulse' : 'bg-blue-400'}`} />
            <span className="text-gray-300 font-medium">
              {aiHealth?.isAvailable ? 'AI Harness: Crystal Agent' : 'AI Harness: Active'}
            </span>
          </div>

          <span className="text-gray-400 hidden sm:inline">
            Project: <strong className="text-white">{currentProject?.name || 'Active Workspace'}</strong>
          </span>
        </div>

        {/* Mode & Model Controls */}
        <div className="flex items-center gap-2">
          {/* Dual Mode Switcher */}
          <div className="flex items-center bg-gray-900 border border-gray-800 rounded p-0.5">
            <button
              onClick={() => setChatMode('chat')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                chatMode === 'chat' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
              title="Chat / Ask Mode: Instant explanations, code snippets, architectural Q&A"
            >
              <IconSparkles className="w-3.5 h-3.5" />
              <span>Ask</span>
            </button>
            <button
              onClick={() => setChatMode('agent')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                chatMode === 'agent' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
              title="Agent Mode: Autonomous plan checklist, tool calls, and proposed file diffs"
            >
              <IconListTodo className="w-3.5 h-3.5" />
              <span>Agent</span>
            </button>
          </div>

          {/* Model Selector */}
          <select
            value={selectedModel}
            onChange={e => setSelectedModel(e.target.value)}
            className="bg-gray-900 border border-gray-800 text-gray-300 text-xs rounded px-2.5 py-1 focus:outline-none focus:border-blue-500 max-w-[180px] truncate"
            title="Select AI Inference Model"
          >
            {models.map(m => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.provider})
              </option>
            ))}
          </select>

          {/* Clear Chat */}
          <button
            onClick={handleClearHistory}
            disabled={history.length === 0 && !streamingContent}
            className="p-1.5 text-gray-400 hover:text-red-400 rounded hover:bg-gray-900 transition-colors disabled:opacity-40"
            title="Clear conversation history"
          >
            <IconTrash />
          </button>
        </div>
      </div>

      {/* Context Pills Bar (Crystal Feature) */}
      {(activeFile || selectedCode || referenceContext) && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-gray-900/60 border-b border-gray-800/80 text-xs overflow-x-auto select-none">
          <span className="text-gray-400 text-[11px] font-semibold uppercase tracking-wider shrink-0">
            Attached Context:
          </span>

          {activeFile && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-950/70 border border-blue-800/60 text-blue-200 text-xs shrink-0 font-mono">
              <IconFile />
              <span className="truncate max-w-[200px]">{activeFile}</span>
              <button
                onClick={() => {
                  sessionStorage.removeItem('codex_active_file');
                  setActiveFile(null);
                }}
                className="text-blue-400 hover:text-white ml-0.5"
                title="Remove file context"
              >
                <IconX />
              </button>
            </div>
          )}

          {selectedCode && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-purple-950/70 border border-purple-800/60 text-purple-200 text-xs shrink-0 font-mono">
              <span>Code: {selectedCode.split('\n').length} lines</span>
              <button
                onClick={() => {
                  sessionStorage.removeItem('codex_selected_code');
                  setSelectedCode(null);
                }}
                className="text-purple-400 hover:text-white ml-0.5"
                title="Remove selected code"
              >
                <IconX />
              </button>
            </div>
          )}

          {referenceContext && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-950/70 border border-amber-800/60 text-amber-200 text-xs shrink-0">
              <span className="truncate max-w-[180px]">Ref: {referenceContext}</span>
              <button
                onClick={() => {
                  sessionStorage.removeItem('codex_reference_context');
                  setReferenceContext(null);
                }}
                className="text-amber-400 hover:text-white ml-0.5"
                title="Remove reference"
              >
                <IconX />
              </button>
            </div>
          )}

          <button
            onClick={handleOpenPicker}
            className="text-xs text-gray-400 hover:text-white px-2 py-0.5 rounded hover:bg-gray-800 flex items-center gap-1 ml-auto shrink-0"
          >
            <IconPaperclip />
            <span>Attach File</span>
          </button>
        </div>
      )}

      {/* Main Message Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {history.length === 0 && !isStreaming && (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-6">
            <div className="w-14 h-14 rounded-2xl bg-gray-900 border border-gray-800 flex items-center justify-center text-blue-400 shadow-lg">
              {chatMode === 'agent' ? <IconListTodo className="w-7 h-7" /> : <IconSparkles className="w-7 h-7" />}
            </div>
            <div className="max-w-md space-y-2">
              <h3 className="text-lg font-bold text-white">
                {chatMode === 'agent' ? 'Autonomous Coding Agent' : 'Codex AI Developer Assistant'}
              </h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                {chatMode === 'agent'
                  ? 'Autonomous multi-step planner. Generates plans, inspects repository files, proposes code diffs, and validates changes.'
                  : 'Ask any question about your codebase, stack, or architecture. Real-time streaming powered by fast LPU inference.'}
              </p>
            </div>

            {/* Quick Suggestions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-xl text-left">
              {samplePrompts.map((p, i) => (
                <button
                  key={i}
                  onClick={() => handleSendMessage(p)}
                  className="p-3 rounded-lg border border-gray-800/80 bg-gray-900/50 hover:bg-gray-850 hover:border-gray-700 text-xs text-gray-300 hover:text-white transition-all text-left flex items-start gap-2 group"
                >
                  <span className="text-blue-400 mt-0.5 group-hover:translate-x-0.5 transition-transform">
                    &rarr;
                  </span>
                  <span className="leading-snug">{p}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Render History Messages */}
        {history.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center text-blue-400 shrink-0 mt-0.5">
                {msg.mode === 'agent' ? <IconBot className="w-4 h-4" /> : <IconSparkles className="w-4 h-4" />}
              </div>
            )}

            <div
              className={`max-w-2xl rounded-xl p-4 text-sm ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-none shadow-md'
                  : 'bg-gray-900 border border-gray-800 text-gray-200 rounded-bl-none shadow-md w-full'
              }`}
            >
              {msg.role === 'user' ? (
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              ) : (
                <div className="space-y-3">
                  {/* Agent Plan Section if available */}
                  {msg.agentPlan && (
                    <div className="rounded-lg border border-purple-900/60 bg-purple-950/20 p-3 space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-300 uppercase tracking-wider">
                        <IconListTodo className="w-3.5 h-3.5" />
                        <span>Execution Plan</span>
                      </div>
                      {msg.agentPlan.goal && (
                        <p className="text-xs text-gray-300 italic">{msg.agentPlan.goal}</p>
                      )}
                      <ul className="space-y-1.5 pt-1">
                        {msg.agentPlan.todos.map((todo) => (
                          <li key={todo.id} className="flex items-start gap-2 text-xs text-gray-300">
                            <span
                              className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[10px] shrink-0 mt-0.5 border ${
                                todo.status === 'completed'
                                  ? 'bg-emerald-900/80 border-emerald-600 text-emerald-300'
                                  : todo.status === 'in_progress'
                                  ? 'bg-blue-900/80 border-blue-600 text-blue-300'
                                  : 'border-gray-700 text-transparent'
                              }`}
                            >
                              {todo.status === 'completed' ? '✓' : todo.status === 'in_progress' ? '…' : ''}
                            </span>
                            <span className={todo.status === 'completed' ? 'text-gray-400' : 'text-gray-200'}>
                              {todo.title}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Message Content */}
                  <MarkdownRenderer content={msg.content} />

                  {/* Terminal Execution Logs if available */}
                  {msg.terminalLogs && msg.terminalLogs.length > 0 && (
                    <div className="rounded-lg border border-gray-800 bg-gray-950 overflow-hidden text-xs font-mono">
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-900/80 border-b border-gray-800 text-gray-400">
                        <IconTerminal className="w-3.5 h-3.5" />
                        <span>Terminal Execution Log</span>
                      </div>
                      <div className="p-3 space-y-2 max-h-48 overflow-y-auto">
                        {msg.terminalLogs.map((log, i) => (
                          <div key={i} className="space-y-1">
                            <div className="flex items-center justify-between text-[11px] text-gray-400">
                              <span className="text-blue-400 font-semibold">$ {log.command}</span>
                              <span>exit {log.returncode ?? 0}</span>
                            </div>
                            {(log.stdout || log.stderr || log.error) && (
                              <pre className="text-[11px] text-gray-300 whitespace-pre-wrap break-words">
                                {log.stdout || log.stderr || log.error}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Proposed Edits Card (Crystal Feature) */}
                  {msg.changes && msg.changes.length > 0 && (
                    <div className="rounded-lg border border-gray-700 bg-gray-950/80 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-200">
                          <IconCheck className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Proposed File Edits ({msg.changes.length})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleDiff(msg.id)}
                            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            {expandedDiffs[msg.id] ? 'Collapse Diffs' : 'View Diffs'}
                          </button>
                          {msg.requestId && (
                            <>
                              <button
                                onClick={() => handleApplyEdits(msg.requestId!, msg.changes!)}
                                disabled={patchStatus[msg.requestId] === 'applied'}
                                className="text-xs bg-emerald-900 border border-emerald-700 hover:bg-emerald-800 text-emerald-200 px-2.5 py-1 rounded transition-colors disabled:opacity-50"
                              >
                                {patchStatus[msg.requestId] === 'applied' ? 'Applied' : 'Apply Edits'}
                              </button>
                              {patchStatus[msg.requestId] === 'applied' && (
                                <button
                                  onClick={() => handleUndoEdits(msg.requestId!)}
                                  className="text-xs bg-amber-900 border border-amber-700 hover:bg-amber-800 text-amber-200 px-2.5 py-1 rounded transition-colors"
                                >
                                  Undo
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2 pt-1">
                        {msg.changes.map((c, idx) => (
                          <div key={idx} className="rounded border border-gray-800 bg-gray-900/60 overflow-hidden">
                            <div className="flex items-center justify-between px-2.5 py-1.5 text-xs font-mono text-gray-300 bg-gray-850">
                              <span className="truncate">{c.path}</span>
                              <Badge variant={c.action === 'create' ? 'success' : 'info'}>
                                {c.action}
                              </Badge>
                            </div>
                            {expandedDiffs[msg.id] && c.newContent && (
                              <pre className="p-3 text-[11px] font-mono text-gray-300 max-h-56 overflow-y-auto whitespace-pre bg-gray-950/90 border-t border-gray-800">
                                {c.newContent}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-1 mt-1 text-[10px] opacity-40">
                <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
              </div>
            </div>

            {msg.role === 'user' && (
              <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white shrink-0 mt-0.5 shadow">
                <IconUser className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

        {/* Live Streaming Message Box */}
        {isStreaming && (
          <div className="flex gap-3 justify-start">
            <div className="w-7 h-7 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center text-blue-400 shrink-0 mt-0.5 animate-pulse">
              {chatMode === 'agent' ? <IconBot className="w-4 h-4" /> : <IconSparkles className="w-4 h-4" />}
            </div>

            <div className="max-w-2xl rounded-xl p-4 bg-gray-900 border border-gray-800 text-gray-200 rounded-bl-none shadow-md w-full space-y-3">
              {/* Status Line */}
              {statusLine && (
                <div className="flex items-center gap-2 text-xs text-blue-400/90 font-mono">
                  <Spinner size="sm" />
                  <span>{statusLine}</span>
                </div>
              )}

              {/* Active Plan in Progress */}
              {activePlan && (
                <div className="rounded-lg border border-purple-900/60 bg-purple-950/20 p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-300 uppercase tracking-wider">
                    <IconListTodo className="w-3.5 h-3.5" />
                    <span>Active Agent Plan</span>
                  </div>
                  {activePlan.goal && (
                    <p className="text-xs text-gray-300 italic">{activePlan.goal}</p>
                  )}
                  <ul className="space-y-1.5 pt-1">
                    {activePlan.todos.map((todo) => (
                      <li key={todo.id} className="flex items-start gap-2 text-xs text-gray-300">
                        <span
                          className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[10px] shrink-0 mt-0.5 border ${
                            todo.status === 'completed'
                              ? 'bg-emerald-900/80 border-emerald-600 text-emerald-300'
                              : todo.status === 'in_progress'
                              ? 'bg-blue-900/80 border-blue-600 text-blue-300 animate-pulse'
                              : 'border-gray-700 text-transparent'
                          }`}
                        >
                          {todo.status === 'completed' ? '✓' : todo.status === 'in_progress' ? '…' : ''}
                        </span>
                        <span>{todo.title}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Accumulated Content Stream */}
              {streamingContent ? (
                <div>
                  <MarkdownRenderer content={streamingContent} />
                  <span className="inline-block w-2 h-4 bg-blue-400 ml-1 animate-pulse align-middle" />
                </div>
              ) : !statusLine ? (
                <div className="flex items-center gap-2 text-gray-400 text-xs">
                  <Spinner size="sm" />
                  <span>Generating response...</span>
                </div>
              ) : null}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Composer */}
      <div className="p-4 bg-gray-950 border-t border-gray-800 shrink-0">
        <form
          onSubmit={e => {
            e.preventDefault();
            handleSendMessage(prompt);
          }}
          className="space-y-2"
        >
          {/* Quick Action Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] select-none">
            <span className="text-gray-500 font-medium shrink-0">Quick:</span>
            <button
              type="button"
              onClick={() => handleSendMessage('🧪 Test adding a module and check pipeline compatibility')}
              disabled={isStreaming}
              className="px-2 py-0.5 rounded-full bg-gray-900 border border-gray-800 text-gray-300 hover:border-gray-700 hover:text-white shrink-0 transition-colors disabled:opacity-50"
            >
              🧪 Test adding module
            </button>
            <button
              type="button"
              onClick={() => handleSendMessage('⚡ Verify if the whole pipeline works (run build, tests & types)')}
              disabled={isStreaming}
              className="px-2 py-0.5 rounded-full bg-gray-900 border border-gray-800 text-gray-300 hover:border-gray-700 hover:text-white shrink-0 transition-colors disabled:opacity-50"
            >
              ⚡ Test whole pipeline
            </button>
            <button
              type="button"
              onClick={() => handleSendMessage('💻 Run terminal command: npm test')}
              disabled={isStreaming}
              className="px-2 py-0.5 rounded-full bg-gray-900 border border-gray-800 text-gray-300 hover:border-gray-700 hover:text-white shrink-0 transition-colors disabled:opacity-50"
            >
              💻 Terminal: npm test
            </button>
            <button
              type="button"
              onClick={() => handleSendMessage('🔍 Run TypeScript check: npx tsc --noEmit')}
              disabled={isStreaming}
              className="px-2 py-0.5 rounded-full bg-gray-900 border border-gray-800 text-gray-300 hover:border-gray-700 hover:text-white shrink-0 transition-colors disabled:opacity-50"
            >
              🔍 Check types
            </button>
          </div>

          <div className="relative flex items-end gap-2 bg-gray-900 border border-gray-800 rounded-xl p-2 focus-within:border-blue-500 transition-colors">
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={e => handlePromptChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(prompt);
                }
              }}
              placeholder={
                chatMode === 'agent'
                  ? 'Give an autonomous task (e.g. create a feature, fix errors, refactor modules)...'
                  : `Ask anything about ${currentProject?.name || 'the codebase'}...`
              }
              rows={2}
              className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 resize-none focus:outline-none px-2 py-1 min-h-[44px] max-h-36 leading-relaxed"
            />

            <div className="flex items-center gap-1.5 pb-1 pr-1 shrink-0">
              <button
                type="button"
                onClick={handleOpenPicker}
                className="p-1.5 text-gray-400 hover:text-white rounded hover:bg-gray-800 transition-colors"
                title="Attach file from project"
              >
                <IconPaperclip className="w-4 h-4" />
              </button>

              {isStreaming ? (
                <button
                  type="button"
                  onClick={handleStopStreaming}
                  className="p-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors flex items-center justify-center shadow"
                  title="Stop generation"
                >
                  <IconStop className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!prompt.trim()}
                  className="p-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded-lg transition-colors flex items-center justify-center shadow"
                  title="Send message (Enter)"
                >
                  <IconSend className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-gray-500 px-1">
            <span>
              Mode: <strong className="text-gray-400 uppercase">{chatMode}</strong> | Model: {selectedModel}
            </span>
            <span>Press Enter to send, Shift+Enter for new line</span>
          </div>
        </form>
      </div>

      {/* Attach File Modal */}
      <Modal isOpen={isPickerOpen} onClose={() => setIsPickerOpen(false)} title="Attach File Context to Chat">
        <div className="space-y-3">
          <p className="text-xs text-gray-400">
            Select a project file to provide direct context to the AI assistant:
          </p>
          <div className="max-h-60 overflow-y-auto space-y-1 rounded border border-gray-800 bg-gray-950 p-2 font-mono text-xs">
            {projectFiles.length === 0 ? (
              <p className="text-gray-500 p-2">No files available or loading tree...</p>
            ) : (
              projectFiles.map(file => (
                <button
                  key={file.path}
                  onClick={() => {
                    sessionStorage.setItem('codex_active_file', file.path);
                    setActiveFile(file.path);
                    setIsPickerOpen(false);
                  }}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-800 text-gray-300 hover:text-white flex items-center gap-2 truncate"
                >
                  <IconFile />
                  <span className="truncate">{file.path}</span>
                </button>
              ))
            )}
          </div>
          <div className="flex justify-end">
            <Button variant="secondary" size="sm" onClick={() => setIsPickerOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
