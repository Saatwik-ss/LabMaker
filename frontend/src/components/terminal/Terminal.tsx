import React, { useState, useRef, useEffect } from 'react';
import { executeTerminalCommand, getQuickCommands, runPipelineTest, QuickCommand, PipelineTestResult } from '../../api/terminal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Spinner } from '../ui/Spinner';
import { IconCheck, IconX, IconRefresh, IconCode, IconSparkles } from '../ui/Icons';

interface TerminalOutputItem {
  id: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timestamp: string;
  cwd: string;
}

interface TerminalProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}

export const Terminal: React.FC<TerminalProps> = ({ isOpen, onClose, className = '' }) => {
  const [activeTab, setActiveTab] = useState<'terminal' | 'pipeline'>('terminal');
  const [inputCommand, setInputCommand] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [outputItems, setOutputItems] = useState<TerminalOutputItem[]>([]);
  const [running, setRunning] = useState(false);
  const [quickCommands, setQuickCommands] = useState<QuickCommand[]>([]);
  const [pipelineResult, setPipelineResult] = useState<PipelineTestResult | null>(null);
  const [testingPipeline, setTestingPipeline] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getQuickCommands()
      .then(res => setQuickCommands(res.commands || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (isOpen && activeTab === 'terminal') {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, activeTab]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [outputItems]);

  if (!isOpen) return null;

  const handleExecute = async (cmdToRun?: string) => {
    const cmd = (cmdToRun !== undefined ? cmdToRun : inputCommand).trim();
    if (!cmd) return;

    if (cmd === 'clear') {
      setOutputItems([]);
      setInputCommand('');
      return;
    }

    setRunning(true);
    setHistory(prev => [...prev.filter(c => c !== cmd), cmd]);
    setHistoryIndex(-1);
    setInputCommand('');

    try {
      const res = await executeTerminalCommand(cmd);
      const item: TerminalOutputItem = {
        id: `term-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        command: cmd,
        stdout: res.stdout,
        stderr: res.stderr,
        exitCode: res.exitCode,
        durationMs: res.durationMs,
        timestamp: new Date().toLocaleTimeString(),
        cwd: res.cwd || '.',
      };
      setOutputItems(prev => [...prev, item]);
    } catch (err: any) {
      setOutputItems(prev => [
        ...prev,
        {
          id: `term-err-${Date.now()}`,
          command: cmd,
          stdout: '',
          stderr: err.message || 'Execution error',
          exitCode: 1,
          durationMs: 0,
          timestamp: new Date().toLocaleTimeString(),
          cwd: '.',
        },
      ]);
    } finally {
      setRunning(false);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleExecute();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const nextIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      setInputCommand(history[nextIndex]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === -1) return;
      const nextIndex = historyIndex + 1;
      if (nextIndex >= history.length) {
        setHistoryIndex(-1);
        setInputCommand('');
      } else {
        setHistoryIndex(nextIndex);
        setInputCommand(history[nextIndex]);
      }
    }
  };

  const handleRunPipelineTest = async (stage: 'pre-flight' | 'post-install' | 'full' = 'full') => {
    setTestingPipeline(true);
    try {
      const res = await runPipelineTest(stage);
      setPipelineResult(res);
    } catch (err: any) {
      console.error('Pipeline test failed:', err);
    } finally {
      setTestingPipeline(false);
    }
  };

  return (
    <div
      className={`border-t border-gray-800 bg-gray-950 flex flex-col transition-all duration-200 z-20 ${
        isExpanded ? 'h-[500px]' : 'h-[280px]'
      } ${className}`}
    >
      {/* Terminal Title Bar */}
      <div className="h-9 px-3 bg-gray-900/90 border-b border-gray-800 flex items-center justify-between shrink-0 select-none text-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('terminal')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors font-medium ${
              activeTab === 'terminal' ? 'bg-gray-800 text-white border border-gray-700' : 'text-gray-400 hover:text-white'
            }`}
          >
            <span className="font-mono text-[11px]">&gt;_</span>
            <span>Terminal</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('pipeline');
              if (!pipelineResult) handleRunPipelineTest('full');
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors font-medium ${
              activeTab === 'pipeline' ? 'bg-gray-800 text-white border border-gray-700' : 'text-gray-400 hover:text-white'
            }`}
          >
            <IconSparkles />
            <span>Pipeline Testing</span>
            {pipelineResult && (
              <span
                className={`w-2 h-2 rounded-full ${
                  pipelineResult.wholePipelineWorks ? 'bg-green-400' : 'bg-amber-400'
                }`}
              />
            )}
          </button>
        </div>

        {/* Quick Command Chips */}
        {activeTab === 'terminal' && (
          <div className="hidden md:flex items-center gap-1 overflow-x-auto max-w-[450px]">
            {quickCommands.slice(0, 4).map(qc => (
              <button
                key={qc.command}
                onClick={() => handleExecute(qc.command)}
                disabled={running}
                className="px-2 py-0.5 bg-gray-800 hover:bg-gray-700 text-[11px] font-mono text-gray-300 rounded border border-gray-700/60 truncate transition-colors"
                title={qc.description}
              >
                {qc.command}
              </button>
            ))}
            <button
              onClick={() => handleExecute('clear')}
              className="px-1.5 py-0.5 text-gray-500 hover:text-gray-300 text-[11px]"
              title="Clear terminal output"
            >
              clear
            </button>
          </div>
        )}

        {/* Actions (Expand, Close) */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 text-gray-400 hover:text-white rounded hover:bg-gray-800 transition-colors"
            title={isExpanded ? 'Restore Size' : 'Maximize'}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {isExpanded ? (
                <path d="M4 14h6m0 0v6m0-6L3 21m17-7h-6m0 0v6m0-6l7 7M4 10h6m0 0V4m0 6L3 3m17 7h-6m0 0V4m0 6l7-7" />
              ) : (
                <path d="M15 3h6m0 0v6m0-6l-7 7M9 21H3m0 0v-6m0 6l7-7M3 9V3m0 0h6M3 3l7 7m11 11v-6m0 6h-6m6 0l-7-7" />
              )}
            </svg>
          </button>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-red-400 rounded hover:bg-gray-800 transition-colors"
            title="Close Terminal"
          >
            <IconX />
          </button>
        </div>
      </div>

      {/* TAB 1: Terminal Output & Input */}
      {activeTab === 'terminal' && (
        <div className="flex-1 flex flex-col min-h-0 bg-gray-950 font-mono text-xs">
          {/* Scrollable logs */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {outputItems.length === 0 ? (
              <div className="text-gray-600 text-xs py-2 select-none">
                <p>Welcome to Codex Sandboxed Terminal.</p>
                <p className="text-[11px] text-gray-500 mt-1">
                  Commands execute safely within your active workspace. Type <span className="text-blue-400">npm test</span>, <span className="text-blue-400">npx tsc --noEmit</span>, or use quick action chips above.
                </p>
              </div>
            ) : (
              outputItems.map(item => (
                <div key={item.id} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-gray-500 border-b border-gray-900 pb-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-green-400 font-semibold">workspace$</span>
                      <span className="text-white font-medium">{item.command}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span>{item.durationMs}ms</span>
                      <span
                        className={`px-1 rounded text-[10px] ${
                          item.exitCode === 0 ? 'bg-green-950 text-green-400' : 'bg-red-950 text-red-400'
                        }`}
                      >
                        code {item.exitCode}
                      </span>
                      <span>{item.timestamp}</span>
                    </div>
                  </div>

                  {item.stdout && (
                    <pre className="text-gray-300 whitespace-pre-wrap leading-relaxed overflow-x-auto text-[11px]">
                      {item.stdout}
                    </pre>
                  )}

                  {item.stderr && (
                    <pre className="text-red-400 whitespace-pre-wrap leading-relaxed overflow-x-auto text-[11px]">
                      {item.stderr}
                    </pre>
                  )}
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>

          {/* Interactive Command Input Line */}
          <div className="h-9 bg-gray-900 border-t border-gray-800 px-3 flex items-center gap-2 shrink-0">
            <span className="text-green-400 select-none font-semibold text-xs">workspace$</span>
            <input
              ref={inputRef}
              type="text"
              value={inputCommand}
              onChange={e => setInputCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={running}
              placeholder={running ? 'Executing command...' : 'Type command (e.g. npm test, git status)...'}
              className="flex-1 bg-transparent text-white focus:outline-none text-xs font-mono placeholder:text-gray-600"
            />
            {running ? (
              <Spinner size="sm" />
            ) : (
              <button
                onClick={() => handleExecute()}
                disabled={!inputCommand.trim()}
                className="text-[11px] font-sans px-2 py-0.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded transition-colors"
              >
                Run
              </button>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: Pipeline Testing & Module Verification */}
      {activeTab === 'pipeline' && (
        <div className="flex-1 overflow-y-auto p-4 bg-gray-950 text-xs space-y-4">
          <div className="flex items-center justify-between border-b border-gray-800 pb-3">
            <div>
              <h3 className="font-semibold text-white text-sm">Full Pipeline & Module Test Suite</h3>
              <p className="text-gray-400 text-xs mt-0.5">
                Verify whether the whole pipeline works after adding modules or modifying architecture.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleRunPipelineTest('pre-flight')}
                disabled={testingPipeline}
                className="text-xs"
              >
                Pre-Flight Check
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() => handleRunPipelineTest('full')}
                disabled={testingPipeline}
                className="text-xs flex items-center gap-1.5"
              >
                {testingPipeline ? <Spinner size="sm" /> : <IconRefresh />}
                <span>Run Whole Pipeline Test</span>
              </Button>
            </div>
          </div>

          {testingPipeline && (
            <div className="p-4 bg-gray-900 rounded-lg border border-gray-800 flex items-center justify-center gap-3">
              <Spinner size="md" />
              <span className="text-gray-300">Executing type checks, compiler, unit tests, and schema verification...</span>
            </div>
          )}

          {pipelineResult && !testingPipeline && (
            <div className="space-y-4">
              {/* Overall Pipeline Banner */}
              <div
                className={`p-3 rounded-lg border flex items-center justify-between ${
                  pipelineResult.wholePipelineWorks
                    ? 'bg-green-950/40 border-green-800 text-green-200'
                    : 'bg-amber-950/40 border-amber-800 text-amber-200'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">{pipelineResult.wholePipelineWorks ? '✅' : '⚠️'}</span>
                  <div>
                    <strong className="block font-semibold">
                      {pipelineResult.wholePipelineWorks ? 'Whole Pipeline Works Cleanly' : 'Pipeline Issues Detected'}
                    </strong>
                    <span className="text-xs opacity-90">{pipelineResult.summary}</span>
                  </div>
                </div>
                <Badge variant={pipelineResult.wholePipelineWorks ? 'success' : 'warning'}>
                  {pipelineResult.stage.toUpperCase()}
                </Badge>
              </div>

              {/* Grid of checks */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 font-sans">
                <div className="p-3 bg-gray-900 border border-gray-800 rounded-lg">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-gray-300">TypeScript Types</span>
                    <Badge variant={pipelineResult.checks.typeCheck.passed ? 'success' : 'error'}>
                      {pipelineResult.checks.typeCheck.passed ? 'Passed' : `${pipelineResult.checks.typeCheck.errorCount} Errors`}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-gray-500">npx tsc --noEmit</p>
                </div>

                <div className="p-3 bg-gray-900 border border-gray-800 rounded-lg">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-gray-300">Unit Tests</span>
                    <Badge variant={pipelineResult.checks.unitTests.passed ? 'success' : 'error'}>
                      {pipelineResult.checks.unitTests.passed ? 'Passed' : 'Failed'}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    {pipelineResult.checks.unitTests.passedCount}/{pipelineResult.checks.unitTests.total || 0} assertions passed
                  </p>
                </div>

                <div className="p-3 bg-gray-900 border border-gray-800 rounded-lg">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-gray-300">Build Check</span>
                    <Badge variant={pipelineResult.checks.build.passed ? 'success' : 'error'}>
                      {pipelineResult.checks.build.passed ? 'Success' : 'Failed'}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-gray-500">{pipelineResult.checks.build.message}</p>
                </div>

                <div className="p-3 bg-gray-900 border border-gray-800 rounded-lg">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-gray-300">Database Schema</span>
                    <Badge variant={pipelineResult.checks.schema.passed ? 'success' : 'error'}>
                      {pipelineResult.checks.schema.passed ? 'Valid' : 'Issues'}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    {pipelineResult.checks.schema.issues.length === 0 ? 'Primary keys verified' : `${pipelineResult.checks.schema.issues.length} schema issue(s)`}
                  </p>
                </div>

                <div className="p-3 bg-gray-900 border border-gray-800 rounded-lg">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-gray-300">Module Health</span>
                    <Badge variant={pipelineResult.checks.moduleHealth.status === 'healthy' ? 'success' : 'warning'}>
                      {pipelineResult.checks.moduleHealth.status.toUpperCase()}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-gray-500">Wiring and architecture alignment</p>
                </div>

                <div className="p-3 bg-gray-900 border border-gray-800 rounded-lg">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-gray-300">Commands Run</span>
                    <span className="text-gray-400 font-mono text-[11px]">{pipelineResult.commandOutputs.length} cmds</span>
                  </div>
                  <p className="text-[11px] text-gray-500">Sandboxed execution results</p>
                </div>
              </div>

              {/* Next Steps */}
              {pipelineResult.nextSteps.length > 0 && (
                <div className="p-3 bg-gray-900/70 border border-gray-800 rounded-lg">
                  <h4 className="font-semibold text-gray-300 text-xs mb-1.5">Recommendations & Next Steps:</h4>
                  <ul className="list-disc pl-4 space-y-1 text-gray-400 text-[11px]">
                    {pipelineResult.nextSteps.map((s, idx) => (
                      <li key={idx}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
