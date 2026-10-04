import {
  IAIHarness,
  IProjectIndexer,
  IModuleAdapter,
  IAICapability,
  AgentTaskRequest,
  AgentTaskResult,
  HarnessContext
} from '../interfaces';
import { ProjectIndexer } from '../indexing/ProjectIndexer';
import { ModuleCatalogIndex } from '../indexing/ModuleCatalogIndex';
import { ModuleAdapter } from '../modules/ModuleAdapter';
import { AgentOrchestrator } from '../orchestration/AgentOrchestrator';
import { ChatAssistantCapability } from '../capabilities/ChatAssistantCapability';
import { CodeGenerationCapability } from '../capabilities/CodeGenerationCapability';
import { AutocompleteCapability } from '../capabilities/AutocompleteCapability';
import { RefactoringCapability } from '../capabilities/RefactoringCapability';
import { ContextRetrievalCapability } from '../capabilities/ContextRetrievalCapability';
import { ErrorAnalysisFixCapability } from '../capabilities/ErrorAnalysisFixCapability';
import { CursorAgentCapability } from '../capabilities/CursorAgentCapability';
import { ModuleAdaptationCapability } from '../capabilities/ModuleAdaptationCapability';
import { TerminalExecutionCapability } from '../capabilities/TerminalExecutionCapability';
import { PipelineTestingCapability } from '../capabilities/PipelineTestingCapability';
import { CrystalBridge } from '../crystal/CrystalBridge';
import { AgentToolHost, AgentToolRegistry } from '../tools/AgentToolRegistry';
import { Logger } from '../utils/Logger';
import * as path from 'path';
import * as fs from 'fs';

export class AIHarness implements IAIHarness {
  private _projectRoot: string;
  private _catalogRoot: string;
  private _indexer: IProjectIndexer;
  private _catalog: ModuleCatalogIndex;
  private _moduleAdapter: IModuleAdapter;
  private _capabilities: Map<string, IAICapability> = new Map();
  private _orchestrator: AgentOrchestrator;
  private _credentials: Record<string, string> = {};
  private _crystal: CrystalBridge;
  private _repoId: string = '';
  private _toolRegistry: AgentToolRegistry;
  private _hostOverrides: Partial<AgentToolHost> = {};
  private logger: Logger;

  constructor(projectRoot: string = process.cwd(), crystalUrl?: string) {
    this._projectRoot = projectRoot;
    this._catalogRoot = this.guessCatalogRoot(projectRoot);
    this.logger = new Logger('AIHarness');

    this._crystal = new CrystalBridge(crystalUrl);
    this._indexer = new ProjectIndexer();
    this._catalog = new ModuleCatalogIndex(this._catalogRoot);
    this._moduleAdapter = new ModuleAdapter(this._indexer);
    this._toolRegistry = new AgentToolRegistry(this.buildHost());

    this.registerStandardCapabilities();

    this._orchestrator = new AgentOrchestrator(
      this._projectRoot,
      this._indexer,
      this._moduleAdapter,
      this._capabilities,
      this._toolRegistry
    );

    this.logger.info(`Codex AI Harness initialized for root: ${this._projectRoot}`);
  }

  get projectRoot(): string {
    return this._projectRoot;
  }

  get indexer(): IProjectIndexer {
    return this._indexer;
  }

  get catalog(): ModuleCatalogIndex {
    return this._catalog;
  }

  get moduleAdapter(): IModuleAdapter {
    return this._moduleAdapter;
  }

  get capabilities(): Map<string, IAICapability> {
    return this._capabilities;
  }

  get crystal(): CrystalBridge {
    return this._crystal;
  }

  public getToolRegistry(): AgentToolRegistry {
    return this._toolRegistry;
  }

  public attachHost(overrides: Partial<AgentToolHost>): void {
    this._hostOverrides = { ...this._hostOverrides, ...overrides };
    this._toolRegistry = new AgentToolRegistry(this.buildHost());
    this._orchestrator.setToolRegistry(this._toolRegistry);
  }

  public setCatalogRoot(catalogRoot: string): void {
    this._catalogRoot = catalogRoot;
    this._catalog.setCatalogRoot(catalogRoot);
  }

  public setProjectRoot(newRoot: string): void {
    this._projectRoot = newRoot;
    this._orchestrator.setProjectRoot(newRoot);
    this._toolRegistry.refreshRoot();
    this.logger.info(`Updated AI Harness project root`);
  }

  public setRepoId(repoId: string): void {
    this._repoId = repoId;
  }

  public getRepoId(): string {
    return this._repoId;
  }

  public setCredentials(credentials: Record<string, string>): void {
    this._credentials = { ...this._credentials, ...credentials };
    this.logger.info('Updated AI credentials configuration.');
  }

  public registerCapability(capability: IAICapability): void {
    this._capabilities.set(capability.id, capability);
    this.logger.info(`Registered AI capability: ${capability.id} (${capability.name})`);
  }

  public getCapability<T extends IAICapability>(id: string): T | undefined {
    return this._capabilities.get(id) as T | undefined;
  }

  public listCapabilities(): Array<{ id: string; name: string; description: string }> {
    return Array.from(this._capabilities.values()).map(c => ({
      id: c.id,
      name: c.name,
      description: c.description,
    }));
  }

  public listAgentTools() {
    return this._toolRegistry.listDefinitions();
  }

  public async executeCapability<TInput = any, TOutput = any>(
    capabilityId: string,
    input: TInput
  ): Promise<TOutput> {
    const capability = this.getCapability(capabilityId);
    if (!capability) {
      throw new Error(`Capability '${capabilityId}' is not registered with the AI harness.`);
    }

    const context: HarnessContext = {
      projectRoot: this._projectRoot,
      repoId: this._repoId,
      indexer: this._indexer,
      moduleAdapter: this._moduleAdapter,
      credentials: this._credentials,
      crystal: this._crystal,
      toolRegistry: this._toolRegistry,
    };

    return capability.execute(input, context);
  }

  public async executeTask(task: AgentTaskRequest): Promise<AgentTaskResult> {
    return this._orchestrator.executeTask(task);
  }

  private buildHost(): AgentToolHost {
    return {
      getProjectRoot: () => this._hostOverrides.getProjectRoot?.() || this._projectRoot,
      getCatalogRoot: () => this._hostOverrides.getCatalogRoot?.() || this._catalogRoot,
      indexer: this._indexer,
      crystal: this._crystal,
      catalog: this._catalog,
      getModel: this._hostOverrides.getModel,
      afterMutation: this._hostOverrides.afterMutation,
      onInstallModule: this._hostOverrides.onInstallModule,
      updateArchitecture: this._hostOverrides.updateArchitecture,
    };
  }

  private guessCatalogRoot(start: string): string {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      const candidate = path.join(dir, 'module-library');
      if (fs.existsSync(candidate)) return candidate;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return path.join(start, 'module-library');
  }

  private registerStandardCapabilities(): void {
    this.registerCapability(new ChatAssistantCapability());
    this.registerCapability(new CodeGenerationCapability());
    this.registerCapability(new AutocompleteCapability());
    this.registerCapability(new RefactoringCapability());
    this.registerCapability(new ContextRetrievalCapability());
    this.registerCapability(new ErrorAnalysisFixCapability());
    this.registerCapability(new CursorAgentCapability(this._crystal));
    this.registerCapability(new ModuleAdaptationCapability(this._crystal));
    this.registerCapability(new TerminalExecutionCapability());
    this.registerCapability(new PipelineTestingCapability());
  }
}
