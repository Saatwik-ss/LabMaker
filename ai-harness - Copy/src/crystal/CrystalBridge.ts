import http from 'http';
import https from 'https';
import { URL } from 'url';
import WebSocket from 'ws';
import { Logger } from '../utils/Logger';

export interface CrystalHealthStatus {
  isAvailable: boolean;
  version?: string;
  provider?: string;
  baseUrl: string;
}

export interface AgentStreamChunk {
  type: 'planning' | 'tool_call' | 'tool_result' | 'diff' | 'diffs' | 'message' | 'terminal' | 'error' | 'finish';
  content?: string;
  name?: string;
  arguments?: any;
  result?: any;
  diff?: string;
  proposed?: string;
  newContent?: string;
  changes?: any[];
  path?: string;
  summary?: string;
  error?: string;
  goal?: string;
  todos?: any[];
  action?: string;
  requestId?: string;
  terminal?: any;
  [key: string]: any;
}

export interface AgentExecutionSummary {
  success: boolean;
  summary: string;
  steps: AgentStreamChunk[];
  changes: Array<{
    path: string;
    action: 'create' | 'modify' | 'delete';
    newContent?: string;
  }>;
  error?: string;
}

export class CrystalBridge {
  private baseUrl: string;
  private logger: Logger;
  private isConnected: boolean = false;

  constructor(baseUrl: string = process.env.CRYSTAL_URL || 'http://127.0.0.1:8000') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.logger = new Logger('CrystalBridge');
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Check if Crystal FastAPI backend is reachable and healthy
   */
  public async checkHealth(): Promise<CrystalHealthStatus> {
    try {
      const res = await this.httpRequest<{ status?: string; version?: string }>(
        'GET',
        '/health',
        undefined,
        2000
      ).catch(() => null);

      const status = (res as any)?.status;
      if (res && (status === 'ok' || status === 'healthy')) {
        this.isConnected = true;
        return {
          isAvailable: true,
          version: (res as any).version || '0.1.0',
          baseUrl: this.baseUrl,
        };
      }

      const alt = await this.httpRequest<{ status?: string }>(
        'GET',
        '/api/health',
        undefined,
        2000
      ).catch(() => null);
      if (alt && (alt.status === 'ok' || alt.status === 'healthy')) {
        this.isConnected = true;
        return { isAvailable: true, version: '0.1.0', baseUrl: this.baseUrl };
      }

      const docsCheck = await this.httpRequestRaw('GET', '/docs').catch(() => null);
      if (docsCheck && docsCheck.statusCode === 200) {
        this.isConnected = true;
        return {
          isAvailable: true,
          version: '0.1.0',
          baseUrl: this.baseUrl,
        };
      }

      this.isConnected = false;
      return { isAvailable: false, baseUrl: this.baseUrl };
    } catch {
      this.isConnected = false;
      return { isAvailable: false, baseUrl: this.baseUrl };
    }
  }

  public async triggerIndex(repoId: string): Promise<{ status: string; repo_id: string }> {
    return this.httpRequest('POST', `/api/repositories/${encodeURIComponent(repoId)}/index`, {});
  }

  public async getIndexStatus(repoId: string): Promise<any> {
    return this.httpRequest('GET', `/api/repositories/${encodeURIComponent(repoId)}/status`);
  }

  /** Return the curated, function-calling tool schemas exposed by Crystal. */
  public async getAgentTools(): Promise<any[]> {
    const result = await this.httpRequest<{ tools?: any[] }>('GET', '/api/tools');
    return result.tools || [];
  }

  public async completeCode(params: {
    repoId: string;
    prompt: string;
    filePath?: string;
    language?: string;
    suffix?: string;
    apiKey?: string;
    model?: string;
  }): Promise<{ text: string }> {
    try {
      const res = await this.httpRequest<{ text?: string; completion?: string }>(
        'POST',
        '/api/completion/complete',
        {
          repo_id: params.repoId,
          prompt: params.prompt,
          file_path: params.filePath,
          language: params.language || 'typescript',
          suffix: params.suffix || '',
          api_key: params.apiKey,
          model: params.model,
        }
      );
      return { text: res.text || res.completion || '' };
    } catch {
      return { text: '' };
    }
  }

  /**
   * Register an arbitrary local directory with Crystal for direct AST indexing and retrieval
   */
  public async registerLocalFolder(
    localPath: string,
    repoId?: string,
    name?: string
  ): Promise<{ repo_id: string; status: string; path: string }> {
    return this.httpRequest<{ repo_id: string; status: string; path: string }>(
      'POST',
      '/api/register-local-folder',
      {
        local_path: localPath,
        repo_id: repoId,
        name: name,
      }
    );
  }

  /**
   * Analyze module compatibility, conflicts, and requirements
   */
  public async analyzeModule(
    moduleData: any,
    projectPath?: string,
    repoId?: string
  ): Promise<any> {
    return this.httpRequest<any>('POST', '/api/modules/analyze', {
      module: moduleData,
      project_path: projectPath,
      repo_id: repoId,
    });
  }

  /**
   * Adapt module to match target project stack and integrate source code
   */
  public async adaptModule(
    moduleData: any,
    projectPath?: string,
    repoId?: string
  ): Promise<any> {
    return this.httpRequest<any>('POST', '/api/modules/adapt', {
      module: moduleData,
      project_path: projectPath,
      repo_id: repoId,
    });
  }

  /**
   * Retrieve ApplicationModel from Crystal architecture service
   */
  public async getArchitectureModel(
    projectPath?: string,
    repoId?: string
  ): Promise<any> {
    const params = new URLSearchParams();
    if (projectPath) params.set('project_path', projectPath);
    if (repoId) params.set('repo_id', repoId);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.httpRequest<any>('GET', `/api/architecture/model${qs}`);
  }

  /**
   * Update architecture graph nodes or relationships
   */
  public async updateArchitectureGraph(
    action: string,
    data: {
      node?: any;
      relationship?: any;
      projectPath?: string;
      repoId?: string;
    }
  ): Promise<any> {
    return this.httpRequest<any>('POST', '/api/architecture/graph', {
      action,
      node: data.node,
      relationship: data.relationship,
      project_path: data.projectPath,
      repo_id: data.repoId,
    });
  }

  /**
   * Apply edits to repository and create snapshot
   */
  public async applyEdits(
    repoId: string,
    requestId: string,
    edits: Array<{ file_path: string; proposed: string }>
  ): Promise<{ applied: Array<{ file_path: string; status: string }>; request_id: string }> {
    return this.httpRequest<any>(
      'POST',
      `/api/repositories/${encodeURIComponent(repoId)}/edits/apply`,
      {
        request_id: requestId,
        edits,
      }
    );
  }

  /**
   * Undo edits from previous snapshot
   */
  public async undoEdits(
    repoId: string,
    requestId: string
  ): Promise<{ undone: Array<{ file_path: string; status: string }>; request_id: string }> {
    return this.httpRequest<any>(
      'POST',
      `/api/repositories/${encodeURIComponent(repoId)}/edits/undo`,
      {
        request_id: requestId,
      }
    );
  }

  /**
   * Run cursor-like agent loop via WebSocket or HTTP fallback
   */
  public async runAgentTask(params: {
    message: string;
    repoId?: string;
    selectedFile?: string;
    selectedCode?: string;
    apiKey?: string;
    model?: string;
    systemPrompt?: string;
    enablePlanning?: boolean;
    onChunk?: (chunk: AgentStreamChunk) => void;
  }): Promise<AgentExecutionSummary> {
    const repoId = params.repoId;
    if (!repoId || repoId === 'local' || repoId === 'none') {
      return {
        success: false,
        summary: 'No workspace repository is bound. Import or create a project first.',
        steps: [],
        changes: [],
        error: 'Missing repoId',
      };
    }

    try {
      return await this.runAgentTaskWebSocket(repoId, params);
    } catch (wsErr) {
      this.logger.warn(`WebSocket agent failed: ${wsErr}`);
      throw wsErr;
    }
  }

  private runAgentTaskWebSocket(
    repoId: string,
    params: {
      message: string;
      selectedFile?: string;
      selectedCode?: string;
      apiKey?: string;
      model?: string;
      systemPrompt?: string;
      enablePlanning?: boolean;
      onChunk?: (chunk: AgentStreamChunk) => void;
    }
  ): Promise<AgentExecutionSummary> {
    return new Promise((resolve, reject) => {
      const wsUrl = `${this.baseUrl.replace(/^http/, 'ws')}/ws/chat/${encodeURIComponent(repoId)}`;
      const ws = new WebSocket(wsUrl);
      const steps: AgentStreamChunk[] = [];
      const changes: Array<{ path: string; action: 'create' | 'modify' | 'delete'; newContent?: string }> = [];
      let finalSummary = '';
      let settled = false;

      const finish = (result: AgentExecutionSummary) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        resolve(result);
      };

      const timeout = setTimeout(() => {
        finish({
          success: true,
          summary: finalSummary || `Agent completed processing: ${params.message}`,
          steps,
          changes,
        });
      }, 120000);

      ws.on('open', () => {
        ws.send(
          JSON.stringify({
            message: params.message,
            selected_file: params.selectedFile,
            selected_code: params.selectedCode,
            api_key: params.apiKey,
            model: params.model,
            system_prompt: params.systemPrompt,
            enable_planning: params.enablePlanning ?? true,
          })
        );
      });

      ws.on('message', (data: WebSocket.RawData) => {
        try {
          const raw = typeof data === 'string' ? data : data.toString();
          const parsed = JSON.parse(raw) as AgentStreamChunk & { proposed?: string; newContent?: string };
          steps.push(parsed);
          if (params.onChunk) {
            params.onChunk(parsed);
          }

          if ((parsed.type === 'diff' || parsed.type === 'diffs') && (parsed.path || parsed.changes)) {
            if (parsed.path) {
              changes.push({
                path: parsed.path,
                action: 'modify',
                newContent: parsed.proposed || parsed.newContent || parsed.diff,
              });
            }
          }

          if (parsed.type === 'finish' || parsed.type === 'message') {
            if (parsed.content) finalSummary = parsed.content;
            if (parsed.summary) finalSummary = parsed.summary;
          }
        } catch {
          // ignore non-json frames
        }
      });

      ws.on('error', (err: Error) => {
        if (!settled) {
          clearTimeout(timeout);
          settled = true;
          reject(err);
        }
      });

      ws.on('close', () => {
        finish({
          success: true,
          summary: finalSummary || `Agent finished: ${params.message}`,
          steps,
          changes,
        });
      });
    });
  }

  /**
   * Internal HTTP request helper
   */
  private httpRequest<T>(method: string, endpoint: string, body?: any, timeoutMs: number = 30000): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint.startsWith('/') ? `${this.baseUrl}${endpoint}` : `${this.baseUrl}/${endpoint}`);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      const payload = body ? JSON.stringify(body) : null;
      const req = client.request(
        url,
        {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          },
          timeout: timeoutMs,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve(JSON.parse(data) as T);
              } catch {
                resolve(data as unknown as T);
              }
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            }
          });
        }
      );

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout to ${url.toString()}`));
      });

      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  }

  private httpRequestRaw(
    method: string,
    endpoint: string
  ): Promise<{ statusCode?: number; data: string }> {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint.startsWith('/') ? `${this.baseUrl}${endpoint}` : `${this.baseUrl}/${endpoint}`);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      const req = client.request(
        url,
        {
          method,
          timeout: 5000,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve({ statusCode: res.statusCode, data }));
        }
      );

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Raw request timeout to ${url.toString()}`));
      });
      req.end();
    });
  }
}
