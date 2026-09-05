import { FileOperations } from '../tools/FileOperations';

export interface SnapshotEdit {
  file_path: string;
  proposed: string;
}

interface SnapshotEntry {
  requestId: string;
  files: Array<{ file_path: string; before: string; after: string }>;
}

export class EditSnapshotStore {
  private snapshots: Map<string, SnapshotEntry> = new Map();

  public apply(
    fileOps: FileOperations,
    requestId: string,
    edits: SnapshotEdit[]
  ): { applied: Array<{ file_path: string; status: string }>; request_id: string } {
    const files: SnapshotEntry['files'] = [];
    const applied: Array<{ file_path: string; status: string }> = [];

    for (const edit of edits) {
      const rel = edit.file_path.replace(/\\/g, '/');
      const existing = fileOps.readFile(rel);
      const before = existing.success ? existing.content || '' : '';
      const result = fileOps.writeFile(rel, edit.proposed ?? '');
      files.push({ file_path: rel, before, after: edit.proposed ?? '' });
      applied.push({ file_path: rel, status: result.success ? 'applied' : 'error' });
    }

    this.snapshots.set(`${requestId}`, { requestId, files });
    return { applied, request_id: requestId };
  }

  public undo(
    fileOps: FileOperations,
    requestId: string
  ): { undone: Array<{ file_path: string; status: string }>; request_id: string } {
    const entry = this.snapshots.get(requestId);
    if (!entry) {
      throw new Error('No undo snapshot for this request');
    }

    const undone: Array<{ file_path: string; status: string }> = [];
    for (const snap of entry.files) {
      const result = fileOps.writeFile(snap.file_path, snap.before);
      undone.push({ file_path: snap.file_path, status: result.success ? 'undone' : 'error' });
    }

    this.snapshots.delete(requestId);
    return { undone, request_id: requestId };
  }
}
