import React, { useRef, useState } from 'react';
import { useEditor } from '../hooks/useEditor';
import { useModel } from '../hooks/useModel';
import { Spinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { 
  IconFile, 
  IconFolder, 
  IconBox, 
  IconChevronRight, 
  IconChevronDown, 
  IconRefresh, 
  IconSave,
  IconDownload,
  IconPlus,
  IconTrash,
  IconMessage,
  IconSparkles
} from '../components/ui/Icons';
import { FileEntry, downloadFileOrFolder, createFileOrDirectory, uploadFile } from '../api/files';
import { useProject } from '../context/ProjectContext';
import { requestCompletion } from '../api/ai';
import { indexCurrentProject } from '../api/projects';
import { Terminal } from '../components/terminal/Terminal';

export const Editor = () => {
  const [terminalOpen, setTerminalOpen] = useState(false);
  const { 
    files, 
    subtrees, 
    expandedDirs, 
    loading, 
    saving, 
    error, 
    currentFile, 
    fileContent, 
    isDirty, 
    loadTree, 
    toggleDir, 
    openFile, 
    updateContent, 
    saveFile 
  } = useEditor();

  const { model } = useModel();
  const [activeTab, setActiveTab] = useState<'files' | 'modules'>('files');
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  // New File/Folder Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newItemPath, setNewItemPath] = useState('');
  const [isDirToCreate, setIsDirToCreate] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);

  // Upload Local File Modal
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadDestPath, setUploadDestPath] = useState('');
  const [selectedFileObj, setSelectedFileObj] = useState<File | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);

  // Folder Import & Indexing State
  const { importFolder } = useProject();
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [folderImporting, setFolderImporting] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [indexMessage, setIndexMessage] = useState<string | null>(null);

  // Autocomplete State
  const [suggestions, setSuggestions] = useState<Array<{ text: string; kind?: string; detail?: string }>>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [completionLoading, setCompletionLoading] = useState<boolean>(false);
  const autocompleteTimerRef = useRef<any>(null);

  const handleChooseFolder = () => {
    folderInputRef.current?.click();
  };

  const handleFolderSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    setFolderImporting(true);
    try {
      await importFolder(fileList);
      await loadTree();
    } catch (err: any) {
      console.error('Folder import failed:', err);
    } finally {
      setFolderImporting(false);
      if (folderInputRef.current) folderInputRef.current.value = '';
    }
  };

  const handleTriggerIndex = async () => {
    setIndexing(true);
    setIndexMessage('Indexing codebase...');
    try {
      const res = await indexCurrentProject();
      setIndexMessage(`Indexed ${res?.totalFiles ?? 'all'} files`);
      setTimeout(() => setIndexMessage(null), 3000);
    } catch {
      setIndexMessage('Index updated');
      setTimeout(() => setIndexMessage(null), 2500);
    } finally {
      setIndexing(false);
    }
  };

  const fetchAutocomplete = async (explicit = false) => {
    const el = textAreaRef.current;
    if (!el || !currentFile) return;
    const pos = el.selectionStart;
    const textBefore = el.value.slice(0, pos);
    const textAfter = el.value.slice(pos);
    const linesBefore = textBefore.split('\n');
    const currentLine = linesBefore.length;
    const currentColumn = linesBefore[linesBefore.length - 1].length;
    const lastWordMatch = textBefore.match(/([a-zA-Z0-9_$]+)$/);
    const lastWord = lastWordMatch ? lastWordMatch[1] : '';

    if (!explicit && lastWord.length < 2) {
      setShowSuggestions(false);
      return;
    }

    setCompletionLoading(true);
    try {
      const ext = currentFile.split('.').pop() || 'ts';
      const lang = ext === 'ts' || ext === 'tsx' ? 'typescript' : ext === 'js' || ext === 'jsx' ? 'javascript' : ext === 'py' ? 'python' : 'plaintext';
      const res = await requestCompletion({
        filePath: currentFile,
        prefix: textBefore.slice(-500),
        suffix: textAfter.slice(0, 500),
        language: lang,
        line: currentLine,
        column: currentColumn,
      });

      const list: Array<{ text: string; kind?: string; detail?: string }> = [];
      if (res.text && res.text.trim()) {
        list.push({ text: res.text, kind: 'ai', detail: 'Crystal / LLM Completion' });
      }
      if (res.suggestions && Array.isArray(res.suggestions)) {
        res.suggestions.forEach((s: any) => {
          if (!list.some(item => item.text === s.text)) {
            list.push({ text: s.text, kind: s.kind || 'symbol', detail: s.detail });
          }
        });
      }
      if (list.length > 0) {
        setSuggestions(list);
        setSelectedIndex(0);
        setShowSuggestions(true);
      } else {
        setShowSuggestions(false);
      }
    } catch (err) {
      console.warn('Autocomplete error:', err);
      setShowSuggestions(false);
    } finally {
      setCompletionLoading(false);
    }
  };

  const insertSuggestion = (sug: { text: string; kind?: string }) => {
    const el = textAreaRef.current;
    if (!el) return;
    const pos = el.selectionStart;
    const textBefore = el.value.slice(0, pos);
    const textAfter = el.value.slice(el.selectionEnd);

    let insertText = sug.text;
    let replaceStart = pos;

    if (sug.kind !== 'ai') {
      const lastWordMatch = textBefore.match(/([a-zA-Z0-9_$]+)$/);
      if (lastWordMatch) {
        replaceStart = pos - lastWordMatch[1].length;
      }
    }

    const newFullText = el.value.slice(0, replaceStart) + insertText + textAfter;
    updateContent(newFullText);
    setShowSuggestions(false);

    setTimeout(() => {
      if (textAreaRef.current) {
        const newCursor = replaceStart + insertText.length;
        textAreaRef.current.selectionStart = newCursor;
        textAreaRef.current.selectionEnd = newCursor;
        textAreaRef.current.focus();
      }
    }, 10);
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        insertSuggestion(suggestions[selectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowSuggestions(false);
        return;
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key === ' ') {
      e.preventDefault();
      fetchAutocomplete(true);
      return;
    }

    if (e.key === 'Tab' && !showSuggestions) {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const val = el.value;
      updateContent(val.substring(0, start) + '  ' + val.substring(end));
      setTimeout(() => {
        if (textAreaRef.current) {
          textAreaRef.current.selectionStart = start + 2;
          textAreaRef.current.selectionEnd = start + 2;
        }
      }, 0);
    }
  };

  const handleContentChange = (newVal: string) => {
    updateContent(newVal);
    if (autocompleteTimerRef.current) clearTimeout(autocompleteTimerRef.current);
    autocompleteTimerRef.current = setTimeout(() => {
      fetchAutocomplete(false);
    }, 500);
  };

  const handleScroll = () => {
    if (textAreaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textAreaRef.current.scrollTop;
    }
  };

  React.useEffect(() => {
    const checkTarget = (e?: any) => {
      const target = e?.detail || sessionStorage.getItem('codex_editor_open_file');
      if (target) {
        sessionStorage.removeItem('codex_editor_open_file');
        openFile(target);
      }
    };
    checkTarget();
    window.addEventListener('codex-open-editor-file', checkTarget);
    const handleFilesImported = () => { loadTree(); };
    window.addEventListener('codex-files-imported', handleFilesImported);
    return () => {
      window.removeEventListener('codex-open-editor-file', checkTarget);
      window.removeEventListener('codex-files-imported', handleFilesImported);
    };
  }, [openFile, loadTree]);

  React.useEffect(() => {
    if (currentFile) {
      sessionStorage.setItem('codex_active_file', currentFile);
    }
  }, [currentFile]);

  const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const sel = el.value.substring(el.selectionStart, el.selectionEnd);
    if (sel && sel.trim().length > 0) {
      sessionStorage.setItem('codex_selected_code', sel);
    }
  };

  const lineCount = fileContent ? fileContent.split('\n').length : 1;
  const lines = Array.from({ length: lineCount }, (_, i) => i + 1);
  const installedModules = model?.modules || [];

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemPath.trim()) return;
    setCreateLoading(true);
    try {
      await createFileOrDirectory(newItemPath.trim(), isDirToCreate);
      await loadTree();
      setIsCreateOpen(false);
      setNewItemPath('');
      if (!isDirToCreate) {
        openFile(newItemPath.trim());
      }
    } catch (err: any) {
      console.error('Failed to create file/folder', err);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFileObj) return;

    setUploadLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const textContent = reader.result as string;
        const targetFilename = uploadDestPath.trim() 
          ? (uploadDestPath.endsWith('/') ? `${uploadDestPath}${selectedFileObj.name}` : uploadDestPath)
          : selectedFileObj.name;

        await uploadFile(targetFilename, textContent);
        await loadTree();
        setIsUploadOpen(false);
        setSelectedFileObj(null);
        setUploadDestPath('');
        openFile(targetFilename);
      };
      reader.readAsText(selectedFileObj);
    } catch (err: any) {
      console.error('Upload failed', err);
    } finally {
      setUploadLoading(false);
    }
  };

  const renderFileList = (entries: FileEntry[], depth = 0) => {
    return entries.map((file, idx) => {
      const isExpanded = expandedDirs.has(file.path);
      const isSelected = currentFile === file.path;
      const children = subtrees[file.path] || [];

      return (
        <div key={idx} className="select-none">
          <div 
            onClick={() => file.isDirectory ? toggleDir(file.path) : openFile(file.path)}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
            className={`flex items-center justify-between py-1 pr-2 text-xs rounded cursor-pointer transition-colors group ${
              isSelected ? 'bg-blue-900/60 text-blue-200' : 'text-gray-300 hover:bg-gray-800 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-1.5 truncate">
              {file.isDirectory && (
                <span className="text-gray-500">
                  {isExpanded ? <IconChevronDown /> : <IconChevronRight />}
                </span>
              )}
              <span className={file.isDirectory ? 'text-blue-400' : 'text-gray-400 ml-3'}>
                {file.isDirectory ? <IconFolder /> : <IconFile />}
              </span>
              <span className={`truncate ${file.isDirectory ? 'font-medium' : ''}`}>{file.name}</span>
            </div>

            {/* Quick Download Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                downloadFileOrFolder(file.path, file.isDirectory ? `${file.name}.zip` : file.name);
              }}
              title={file.isDirectory ? `Download zipped ${file.name}` : `Download ${file.name}`}
              className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-500 hover:text-blue-400 transition-opacity"
            >
              <IconDownload />
            </button>
          </div>

          {file.isDirectory && isExpanded && (
            <div>
              {children.length === 0 ? (
                <div style={{ paddingLeft: `${(depth + 1) * 12 + 16}px` }} className="text-[10px] text-gray-600 py-0.5 italic">
                  (empty or loading...)
                </div>
              ) : (
                renderFileList(children, depth + 1)
              )}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="flex h-full border-t border-gray-800 bg-gray-900 overflow-hidden animate-fade-in font-sans">
      {/* Sidebar: Explorer & Installed Modules */}
      <div className="w-72 border-r border-gray-800 bg-gray-950 flex flex-col hidden md:flex">
        {/* Tab Switcher */}
        <div className="flex border-b border-gray-800 bg-gray-900/50">
          <button 
            onClick={() => setActiveTab('files')}
            className={`flex-1 py-2 text-xs font-semibold tracking-wider text-center uppercase transition-colors ${
              activeTab === 'files' ? 'text-blue-400 border-b-2 border-blue-500 bg-gray-900' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Files
          </button>
          <button 
            onClick={() => setActiveTab('modules')}
            className={`flex-1 py-2 text-xs font-semibold tracking-wider text-center uppercase transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'modules' ? 'text-blue-400 border-b-2 border-blue-500 bg-gray-900' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <span>Modules</span>
            {installedModules.length > 0 && (
              <span className="px-1.5 py-0.2 bg-blue-900 text-blue-200 rounded-full text-[10px]">{installedModules.length}</span>
            )}
          </button>
        </div>

        {/* Sidebar Body */}
        <div className="flex-1 overflow-y-auto p-2">
          {activeTab === 'files' ? (
            <div>
              <div className="flex items-center justify-between px-2 py-1 mb-2">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">PROJECT EXPLORER</span>
                <div className="flex items-center gap-1">
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
                  <button 
                    onClick={() => { setIsDirToCreate(false); setIsCreateOpen(true); }}
                    title="New File"
                    className="p-1 text-gray-500 hover:text-gray-200 rounded hover:bg-gray-800"
                  >
                    <IconPlus />
                  </button>
                  <button 
                    onClick={handleChooseFolder}
                    disabled={folderImporting}
                    title="Import / Choose Local Folder into Browser Workspace"
                    className="p-1 text-gray-500 hover:text-blue-400 rounded hover:bg-gray-800 text-[11px] font-medium"
                  >
                    {folderImporting ? '...' : '+Folder'}
                  </button>
                  <button 
                    onClick={() => setIsUploadOpen(true)}
                    title="Upload Single File"
                    className="p-1 text-gray-500 hover:text-gray-200 rounded hover:bg-gray-800 text-[11px] font-mono"
                  >
                    +Upload
                  </button>
                  <button 
                    onClick={handleTriggerIndex}
                    disabled={indexing}
                    title="Index Project Codebase & Symbols (Crystal AST)"
                    className="p-1 text-gray-500 hover:text-amber-400 rounded hover:bg-gray-800 text-[11px] font-medium"
                  >
                    {indexing ? '...' : 'Index'}
                  </button>
                  <button 
                    onClick={() => loadTree()} 
                    title="Refresh File Tree"
                    className="p-1 text-gray-500 hover:text-gray-300 rounded hover:bg-gray-800"
                  >
                    <IconRefresh />
                  </button>
                  <button
                    onClick={() => downloadFileOrFolder('.', 'workspace.zip')}
                    title="Download entire project as zip"
                    className="p-1 text-gray-500 hover:text-blue-400 rounded hover:bg-gray-800"
                  >
                    <IconDownload />
                  </button>
                </div>
              </div>
              {indexMessage && (
                <div className="mx-2 mb-2 p-1.5 bg-blue-950/70 border border-blue-800 text-blue-300 text-[11px] rounded flex items-center justify-between">
                  <span>{indexMessage}</span>
                  <button onClick={() => setIndexMessage(null)} className="text-gray-400 hover:text-white">&times;</button>
                </div>
              )}

              {loading && !files.length && (
                <div className="p-4 flex items-center justify-center">
                  <Spinner size="sm" />
                </div>
              )}
              {error && <div className="p-2 text-xs text-red-400 bg-red-950/40 rounded border border-red-900 mb-2">{error}</div>}
              
              {renderFileList(files)}
            </div>
          ) : (
            <div>
              <div className="px-2 py-1 mb-2">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">INSTALLED MODULES ({installedModules.length})</span>
              </div>

              {installedModules.length === 0 ? (
                <div className="p-4 text-center">
                  <div className="text-gray-600 mb-2 flex justify-center"><IconBox /></div>
                  <p className="text-xs text-gray-500">No modules installed in this project.</p>
                  <p className="text-[11px] text-gray-600 mt-1">Install authentication, CRUD, search, or storage from the Modules page.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {installedModules.map((mod: any) => (
                    <div key={mod.id} className="bg-gray-900 border border-gray-800 rounded p-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <IconBox />
                          <span className="text-xs font-semibold capitalize text-white">{mod.name}</span>
                        </div>
                        <Badge variant={mod.status === 'active' ? 'success' : 'info'}>{mod.status || 'active'}</Badge>
                      </div>
                      <div className="text-[11px] text-gray-400 font-mono mt-1">{mod.baseDir || `src/modules/${mod.name}`}</div>
                      
                      {mod.provides && mod.provides.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-gray-800 space-y-1">
                          <span className="text-[10px] text-gray-500 uppercase tracking-wider block">Module Files:</span>
                          {mod.provides.map((prov: any, pIdx: number) => (
                            <button
                              key={pIdx}
                              onClick={() => openFile(prov.location || prov.name)}
                              className="w-full text-left text-xs font-mono text-blue-400 hover:text-blue-300 hover:underline truncate block py-0.5"
                            >
                              {prov.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Main Editor Surface */}
      <div className="flex-1 flex flex-col relative bg-gray-900">
        {currentFile ? (
          <>
            {/* Editor Toolbar */}
            <div className="h-10 border-b border-gray-800 flex items-center justify-between px-4 bg-gray-950 text-xs text-gray-400">
              <div className="flex items-center gap-2 truncate">
                <IconFile />
                <span className="font-mono text-gray-200">{currentFile}</span>
                {isDirty && <span className="text-amber-400 font-bold ml-1">* (unsaved)</span>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchAutocomplete(true)}
                  disabled={completionLoading}
                  title="Crystal Code Auto-completion (Ctrl+Space)"
                  className="flex items-center gap-1 px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-purple-300 hover:text-white rounded text-xs transition-colors"
                >
                  <IconSparkles />
                  <span>{completionLoading ? 'Completing...' : 'AI Complete'}</span>
                </button>
                <button
                  onClick={() => {
                    if (currentFile) sessionStorage.setItem('codex_active_file', currentFile);
                    window.dispatchEvent(new CustomEvent('codex-navigate-tab', { detail: 'chat' }));
                  }}
                  title="Discuss or edit this file with AI Assistant"
                  className="flex items-center gap-1 px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-blue-300 hover:text-white rounded text-xs transition-colors"
                >
                  <IconMessage />
                  <span>Ask AI</span>
                </button>
                <button
                  onClick={() => downloadFileOrFolder(currentFile)}
                  title="Download File"
                  className="p-1 text-gray-400 hover:text-white rounded hover:bg-gray-800"
                >
                  <IconDownload />
                </button>
                <button
                  onClick={() => setTerminalOpen(!terminalOpen)}
                  title="Toggle Sandboxed Terminal & Pipeline Testing"
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors font-medium ${
                    terminalOpen ? 'bg-blue-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white'
                  }`}
                >
                  <span className="font-mono text-[11px]">&gt;_</span>
                  <span>Terminal</span>
                </button>
                <button
                  onClick={saveFile}
                  disabled={!isDirty || saving}
                  className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded text-xs font-medium transition-colors"
                >
                  {saving ? <Spinner size="sm" /> : <IconSave />}
                  <span>{saving ? 'Saving...' : 'Save File'}</span>
                </button>
              </div>
            </div>

            {/* Code Surface */}
            <div className="flex-1 flex overflow-hidden relative">
              <div 
                ref={lineNumbersRef}
                className="w-12 bg-gray-950 border-r border-gray-800 text-right pr-2 py-4 text-gray-600 font-mono text-xs leading-6 overflow-hidden select-none"
              >
                {lines.map(n => <div key={n}>{n}</div>)}
              </div>
              <textarea
                ref={textAreaRef}
                value={fileContent}
                onChange={(e) => handleContentChange(e.target.value)}
                onKeyDown={handleEditorKeyDown}
                onSelect={handleSelect}
                onScroll={handleScroll}
                spellCheck={false}
                className="flex-1 bg-gray-900 text-gray-200 p-4 font-mono text-xs leading-6 resize-none focus:outline-none whitespace-pre selection:bg-blue-800/60"
                wrap="off"
              />

              {/* Floating Autocomplete Overlay */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute bottom-4 right-6 w-96 bg-gray-950/95 backdrop-blur border border-blue-800/80 rounded-lg shadow-2xl z-40 overflow-hidden text-xs animate-fade-in font-sans">
                  <div className="flex items-center justify-between px-3 py-1.5 bg-gray-900 border-b border-gray-800 text-[11px] text-gray-400">
                    <span className="font-semibold text-blue-300 flex items-center gap-1.5">
                      <IconSparkles />
                      <span>Code Suggestions ({suggestions.length})</span>
                    </span>
                    <span className="text-[10px] text-gray-500 font-mono">Tab/Enter: Insert &bull; Esc: Close</span>
                  </div>
                  <div className="max-h-52 overflow-y-auto p-1 space-y-0.5 font-mono">
                    {suggestions.map((sug, i) => (
                      <div
                        key={i}
                        onClick={() => insertSuggestion(sug)}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer transition-colors ${
                          i === selectedIndex ? 'bg-blue-900/70 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                        }`}
                      >
                        <div className="truncate mr-2 font-medium text-xs">
                          {sug.text.split('\n')[0]}
                          {sug.text.includes('\n') && <span className="text-gray-500 text-[10px] ml-1">...</span>}
                        </div>
                        <span className="text-[10px] text-gray-400 uppercase shrink-0 px-1.5 py-0.5 bg-gray-900 border border-gray-800 rounded">
                          {sug.kind || 'code'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-6 text-center">
            <div className="w-12 h-12 mb-3 text-gray-600 flex items-center justify-center">
              <IconFile />
            </div>
            <h3 className="text-sm font-medium text-gray-400">No file currently opened</h3>
            <p className="text-xs text-gray-600 mt-1 max-w-sm">Select any file from the Project Explorer or Installed Modules panel to view and edit its code.</p>
            <div className="flex gap-2 mt-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setIsDirToCreate(false); setIsCreateOpen(true); }}
              >
                Create File
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsUploadOpen(true)}
              >
                Upload File
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setTerminalOpen(true)}
                className="flex items-center gap-1 font-mono text-xs"
              >
                <span>&gt;_</span>
                <span>Terminal</span>
              </Button>
            </div>
          </div>
        )}

        {/* Sandboxed Terminal Drawer */}
        <Terminal isOpen={terminalOpen} onClose={() => setTerminalOpen(false)} />
      </div>

      {/* Create File / Folder Modal */}
      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Create New File or Folder">
        <form onSubmit={handleCreateItem} className="space-y-4">
          <div className="flex gap-4">
            <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
              <input
                type="radio"
                checked={!isDirToCreate}
                onChange={() => setIsDirToCreate(false)}
                name="itemType"
              />
              <span>File</span>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
              <input
                type="radio"
                checked={isDirToCreate}
                onChange={() => setIsDirToCreate(true)}
                name="itemType"
              />
              <span>Directory / Folder</span>
            </label>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">
              Relative Path
            </label>
            <input
              type="text"
              required
              placeholder={isDirToCreate ? 'e.g. src/services' : 'e.g. src/services/PaymentService.ts'}
              value={newItemPath}
              onChange={e => setNewItemPath(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-gray-800">
            <Button variant="secondary" type="button" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={createLoading || !newItemPath.trim()}>
              {createLoading ? <Spinner size="sm" /> : `Create ${isDirToCreate ? 'Folder' : 'File'}`}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Upload Local File Modal */}
      <Modal isOpen={isUploadOpen} onClose={() => setIsUploadOpen(false)} title="Add File from Local Machine">
        <form onSubmit={handleUploadSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">
              Choose File from Local System
            </label>
            <input
              type="file"
              required
              onChange={e => {
                if (e.target.files && e.target.files[0]) {
                  setSelectedFileObj(e.target.files[0]);
                }
              }}
              className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-xs text-gray-300 file:mr-3 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-blue-600 file:text-white hover:file:bg-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">
              Destination Directory / Path (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. src/ or leave empty for root"
              value={uploadDestPath}
              onChange={e => setUploadDestPath(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-gray-800">
            <Button variant="secondary" type="button" onClick={() => setIsUploadOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={uploadLoading || !selectedFileObj}>
              {uploadLoading ? <Spinner size="sm" /> : 'Import to Project'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
