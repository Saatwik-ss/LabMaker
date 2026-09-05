import React, { useState, useEffect } from 'react';
import { CodeChangeEvent, FileChangeDetail } from '../../utils/codeChangeEvents';
import { Badge } from './Badge';
import { Button } from './Button';
import { IconCode, IconCheck, IconX, IconChevronDown, IconChevronRight, IconBox, IconTrash } from './Icons';

export const CodeChangeNotificationModal: React.FC = () => {
  const [currentEvent, setCurrentEvent] = useState<CodeChangeEvent | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const handler = (e: any) => {
      if (e.detail) {
        setCurrentEvent(e.detail);
        setIsOpen(true);
        // Default expand the first file if files exist
        if (e.detail.files && e.detail.files.length > 0) {
          setExpandedFiles({ [e.detail.files[0].path]: true });
        } else {
          setExpandedFiles({});
        }
      }
    };

    window.addEventListener('codex-code-change', handler);
    return () => window.removeEventListener('codex-code-change', handler);
  }, []);

  if (!isOpen || !currentEvent) return null;

  const toggleFileExpand = (path: string) => {
    setExpandedFiles(prev => ({
      ...prev,
      [path]: !prev[path]
    }));
  };

  const handleOpenInEditor = (targetPath?: string) => {
    const path = targetPath || currentEvent.files[0]?.path;
    if (path) {
      sessionStorage.setItem('codex_editor_open_file', path);
      window.dispatchEvent(new CustomEvent('codex-open-editor-file', { detail: path }));
    }
    window.dispatchEvent(new CustomEvent('nav-page', { detail: 'editor' }));
    setIsOpen(false);
  };

  const totalAdded = currentEvent.files.reduce((sum, f) => sum + (f.linesAdded || (f.newContent ? f.newContent.split('\n').length : 0)), 0);
  const totalRemoved = currentEvent.files.reduce((sum, f) => sum + (f.linesRemoved || 0), 0);

  const sourceBadgeVariant = currentEvent.source === 'agent' 
    ? 'info' 
    : currentEvent.source === 'install' 
      ? 'success' 
      : currentEvent.source === 'uninstall' 
        ? 'error' 
        : 'default';

  const sourceLabel = currentEvent.source === 'agent'
    ? 'AI Agent Update'
    : currentEvent.source === 'install'
      ? 'Module Installed'
      : currentEvent.source === 'uninstall'
        ? 'Module Uninstalled'
        : 'System Code Update';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in font-sans">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-3xl max-h-[85vh] shadow-2xl flex flex-col overflow-hidden text-sm">
        
        {/* Modal Header */}
        <div className="p-4 border-b border-gray-800 bg-gray-950 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-950/60 border border-blue-800/80 text-blue-400">
              <IconCode />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-white">{currentEvent.title}</h3>
                <Badge variant={sourceBadgeVariant}>{sourceLabel}</Badge>
              </div>
              <span className="text-[11px] text-gray-500 font-mono">
                {currentEvent.timestamp ? new Date(currentEvent.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString()}
              </span>
            </div>
          </div>

          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <IconX />
          </button>
        </div>

        {/* Change Statistics Bar */}
        <div className="px-5 py-3 bg-gray-950/60 border-b border-gray-800 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-3 font-mono">
            <span className="font-semibold text-white">
              {currentEvent.files.length} {currentEvent.files.length === 1 ? 'File Changed' : 'Files Changed'}
            </span>
            <span>&bull;</span>
            <span className="text-green-400 font-bold">+{totalAdded} lines</span>
            {totalRemoved > 0 && (
              <>
                <span>&bull;</span>
                <span className="text-red-400 font-bold">-{totalRemoved} lines</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {currentEvent.validationPassed !== undefined && (
              <Badge variant={currentEvent.validationPassed ? 'success' : 'warning'}>
                {currentEvent.validationPassed ? 'Validation: Passed' : 'Validation: Pending'}
              </Badge>
            )}
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Summary / Diff Message Box */}
          {currentEvent.summary && (
            <div>
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
                Execution Diff Summary
              </span>
              <div className="bg-gray-950 p-3.5 rounded-lg border border-gray-800/90 whitespace-pre-wrap font-mono text-xs text-gray-300 leading-relaxed overflow-x-auto">
                {currentEvent.summary}
              </div>
            </div>
          )}

          {/* Files List with Diff Viewers */}
          <div>
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-2">
              Modified Files & Diffs ({currentEvent.files.length})
            </span>

            <div className="space-y-2.5">
              {currentEvent.files.map((file, idx) => {
                const isExpanded = expandedFiles[file.path] !== false;
                const actionBadgeVariant = file.action === 'create'
                  ? 'success'
                  : file.action === 'delete'
                    ? 'error'
                    : 'info';

                const lines = file.newContent ? file.newContent.split('\n') : [];

                return (
                  <div key={idx} className="border border-gray-800 rounded-lg overflow-hidden bg-gray-950/80">
                    {/* File Header / Accordion Bar */}
                    <div
                      onClick={() => toggleFileExpand(file.path)}
                      className="p-3 bg-gray-900 hover:bg-gray-800/80 cursor-pointer flex items-center justify-between transition-colors select-none"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-gray-400">
                          {isExpanded ? <IconChevronDown /> : <IconChevronRight />}
                        </span>
                        <Badge variant={actionBadgeVariant}>
                          {file.action.toUpperCase()}
                        </Badge>
                        <span className="font-mono text-xs font-semibold text-white truncate">
                          {file.path}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 text-xs font-mono">
                        {file.linesAdded !== undefined && (
                          <span className="text-green-400 font-bold">+{file.linesAdded}</span>
                        )}
                        {file.linesRemoved ? (
                          <span className="text-red-400 font-bold">-{file.linesRemoved}</span>
                        ) : null}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenInEditor(file.path);
                          }}
                          className="ml-2 text-[11px] text-blue-400 hover:text-blue-300 underline"
                        >
                          Edit
                        </button>
                      </div>
                    </div>

                    {/* Diff / Code Content Preview */}
                    {isExpanded && (
                      <div className="border-t border-gray-800 p-3 bg-gray-950 font-mono text-xs overflow-x-auto max-h-64 overflow-y-auto">
                        {file.action === 'delete' ? (
                          <div className="text-red-400 italic p-2">
                            [File deleted from workspace]
                          </div>
                        ) : file.newContent ? (
                          <div className="space-y-0.5">
                            {lines.slice(0, 100).map((line, lineIdx) => (
                              <div key={lineIdx} className="flex leading-5 hover:bg-gray-900/50 px-1 rounded">
                                <span className="text-gray-600 select-none w-10 text-right pr-3 shrink-0 text-[11px]">
                                  {lineIdx + 1}
                                </span>
                                <span className={`${file.action === 'create' ? 'text-green-300' : 'text-gray-300'} whitespace-pre`}>
                                  {file.action === 'create' ? '+ ' : '  '}
                                  {line}
                                </span>
                              </div>
                            ))}
                            {lines.length > 100 && (
                              <div className="text-gray-500 italic p-2">
                                ... and {lines.length - 100} more lines. Open in Editor to inspect full file.
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-gray-500 italic p-2">
                            No inline diff preview available.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 border-t border-gray-800 bg-gray-950 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-gray-500">
            Updated via {sourceLabel.toLowerCase()}
          </span>

          <div className="flex items-center gap-2.5">
            {currentEvent.files.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleOpenInEditor()}
                className="flex items-center gap-1.5"
              >
                <IconCode />
                <span>Open in Editor</span>
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsOpen(false)}
            >
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
