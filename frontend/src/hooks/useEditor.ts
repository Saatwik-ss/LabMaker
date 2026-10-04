import { useState, useEffect, useCallback } from 'react';
import { getFileTree, readFile, writeFile as apiWriteFile, FileEntry } from '../api/files';
import { notifyCodeChange } from '../utils/codeChangeEvents';

export const useEditor = () => {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [subtrees, setSubtrees] = useState<Record<string, FileEntry[]>>({});
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [isDirty, setIsDirty] = useState<boolean>(false);

  const loadTree = useCallback(async (path?: string) => {
    setLoading(true);
    try {
      const tree = await getFileTree(path);
      setFiles(tree);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load file tree');
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleDir = async (dirPath: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });

    if (!subtrees[dirPath]) {
      try {
        const children = await getFileTree(dirPath);
        setSubtrees(prev => ({ ...prev, [dirPath]: children }));
      } catch (err: any) {
        console.error('Failed to load dir', dirPath, err);
      }
    }
  };

  const openFile = async (path: string) => {
    setLoading(true);
    try {
      const res = await readFile(path);
      if (res.success && res.content !== undefined) {
        setFileContent(res.content);
        setCurrentFile(path);
        setIsDirty(false);
        setError(null);
      } else {
        throw new Error(res.error || 'Failed to read file');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to open file');
    } finally {
      setLoading(false);
    }
  };

  const updateContent = (content: string) => {
    setFileContent(content);
    setIsDirty(true);
  };

  const saveFile = async () => {
    if (!currentFile) return;
    setSaving(true);
    try {
      const res = await apiWriteFile(currentFile, fileContent);
      if (res.success) {
        setIsDirty(false);
        setError(null);
        notifyCodeChange({
          title: `Editor saved ${currentFile}`,
          source: 'sync',
          summary: `Saved ${currentFile}`,
          files: [{ path: currentFile, action: 'modify' }],
        });
      } else {
        throw new Error(res.error || 'Failed to save file');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save file');
    } finally {
      setSaving(false);
    }
  };

  const refreshTree = useCallback(async () => {
    try {
      const tree = await getFileTree();
      setFiles(tree);
      
      // Refresh any already-expanded subtrees
      setExpandedDirs(prevDirs => {
        if (prevDirs.size > 0) {
          Array.from(prevDirs).forEach(async (dirPath) => {
            try {
              const children = await getFileTree(dirPath);
              setSubtrees(subPrev => ({ ...subPrev, [dirPath]: children }));
            } catch (err) {
              console.error('Failed to reload dir', dirPath, err);
            }
          });
        }
        return prevDirs;
      });

      // If current file is not dirty, reload its content to show changes
      if (currentFile && !isDirty) {
        readFile(currentFile).then(res => {
          if (res.success && res.content !== undefined) {
            setFileContent(res.content);
          }
        }).catch(() => {});
      }
    } catch (err: any) {
      console.warn('Failed to refresh file tree', err);
    }
  }, [currentFile, isDirty]);

  useEffect(() => {
    const handleCodeChange = () => {
      refreshTree();
    };

    window.addEventListener('codex-code-changed', handleCodeChange);
    window.addEventListener('codex-code-change', handleCodeChange);
    window.addEventListener('codex-project-changed', handleCodeChange);
    window.addEventListener('codex-files-imported', handleCodeChange);
    window.addEventListener('codex-module-added', handleCodeChange);

    return () => {
      window.removeEventListener('codex-code-changed', handleCodeChange);
      window.removeEventListener('codex-code-change', handleCodeChange);
      window.removeEventListener('codex-project-changed', handleCodeChange);
      window.removeEventListener('codex-files-imported', handleCodeChange);
      window.removeEventListener('codex-module-added', handleCodeChange);
    };
  }, [refreshTree]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  return {
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
    refreshTree,
    toggleDir,
    openFile,
    updateContent,
    saveFile,
  };
};
