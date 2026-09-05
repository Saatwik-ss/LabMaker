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
import { Logger } from '../utils/Logger';

export class AIHarness implements IAIHarness {
  private _projectRoot: string;
  private _indexer: IProjectIndexer;
  private _moduleAdapter: IModuleAdapter;
  private _capabilities: Map<string, IAICapability> = new Map();
  private _orchestrator: AgentOrchestrator;
  private _credentials: Record<string, string> = {};
  private _crystal: CrystalBridge;
  private _repoId: string = '';
  private logger: Logger;

  constructor(projectRoot: string = process.cwd(), crystalUrl?: string) {
    this._projectRoot = projectRoot;
    this.logger = new Logger('AIHarness');

    // 1. Crystal Intelligence Bridge
    this._crystal = new CrystalBridge(crystalUrl);

    // 2. Core subsystems
    this._indexer = new ProjectIndexer();
    this._moduleAdapter = new ModuleAdapter(this._indexer);

    // 3. Register standard capability plugins
    this.registerStandardCapabilities();

    // 4. Autonomous orchestrator
    this._orchestrator = new AgentOrchestrator(
      this._projectRoot,
      this._indexer,
      this._moduleAdapter,
      this._capabilities
    );

    this.logger.info(`Codex AI Harness initialized for root: ${this._projectRoot}`);
  }

  get projectRoot(): string {
    return this._projectRoot;
  }

  get indexer(): IProjectIndexer {
    return this._indexer;
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

  public setProjectRoot(newRoot: string): void {
    this._projectRoot = newRoot;
    this._orchestrator.setProjectRoot(newRoot);
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
    };

    return capability.execute(input, context);
  }

  public async executeTask(task: AgentTaskRequest): Promise<AgentTaskResult> {
    return this._orchestrator.executeTask(task);
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
