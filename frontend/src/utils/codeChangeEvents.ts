export interface FileChangeDetail {
  path: string;
  action: 'create' | 'modify' | 'delete' | string;
  linesAdded?: number;
  linesRemoved?: number;
  linesModified?: number;
  newContent?: string;
  diff?: string;
}

export interface CodeChangeEvent {
  title: string;
  source: 'agent' | 'install' | 'uninstall' | 'sync' | 'template';
  summary?: string;
  files: FileChangeDetail[];
  validationPassed?: boolean;
  timestamp?: string;
}

export const notifyCodeChange = (event: CodeChangeEvent): void => {
  const timestampedEvent: CodeChangeEvent = {
    ...event,
    timestamp: event.timestamp || new Date().toISOString(),
  };
  window.dispatchEvent(new CustomEvent('codex-code-change', { detail: timestampedEvent }));
  window.dispatchEvent(new CustomEvent('codex-code-changed', { detail: timestampedEvent }));
};
