import { AIHarness } from '@codex/ai-harness';
import { ApplicationModelManager } from './ApplicationModel';
import { ProjectManager } from './ProjectManager';
import { WorkspaceStore, ImportedFile } from './WorkspaceStore';
import { EditSnapshotStore } from './EditSnapshotStore';
import { FileOperations } from '../tools/FileOperations';
import { Validator } from '../validation/Validator';
import { ProjectDiscovery } from '../discovery/ProjectDiscovery';
import { ModuleManager } from '../modules/ModuleManager';
import { AgentOrchestrator } from '../agent/AgentOrchestrator';
import { CommandRunner } from '../tools/CommandRunner';
import { Logger } from '../utils/Logger';
import { Project, ApplicationModel } from '@codex/shared';
import { findCodexRoot } from './codexPaths';

export class CodexRuntime {
  readonly codexRoot: string;
  readonly projectManager: ProjectManager;
  readonly workspaceStore: WorkspaceStore;
  readonly fileOps: FileOperations;
  readonly cmdRunner: CommandRunner;
  readonly validator: Validator;
  readonly discovery: ProjectDiscovery;
  readonly aiHarness: AIHarness;
  readonly moduleManager: ModuleManager;
  readonly orchestrator: AgentOrchestrator;
  readonly modelManager: ApplicationModelManager;
  readonly editSnapshots: EditSnapshotStore;
  private lastIndexedRoot = '';
  private lastBoundRoot = '';
  private logger: Logger;

  constructor() {
    this.codexRoot = findCodexRoot(process.cwd());
    this.logger = new Logger('CodexRuntime');
    this.projectManager = new ProjectManager(this.codexRoot);
    this.workspaceStore = this.projectManager.workspaceStore;
    const initialRoot = this.projectManager.getWorkspaceRoot();

    this.fileOps = new FileOperations(initialRoot);
    this.cmdRunner = new CommandRunner(initialRoot);
    this.validator = new Validator(initialRoot);
    this.discovery = new ProjectDiscovery(initialRoot);
    this.aiHarness = new AIHarness(initialRoot);
    this.modelManager = new ApplicationModelManager();
    this.moduleManager = new ModuleManager(this.modelManager, this.fileOps, initialRoot);
    this.orchestrator = new AgentOrchestrator(
      this.modelManager,
      this.fileOps,
      initialRoot,
      this.projectManager
    );
    this.editSnapshots = new EditSnapshotStore();
    this.bindActive();
  }

  public bindActive(): { project: Project; workspaceRoot: string; repoId: string } {
    const project = this.projectManager.getCurrentProject();
    const workspaceRoot = this.projectManager.getWorkspaceRoot(project.id);
    const repoId = project.id;

    if (this.lastBoundRoot !== workspaceRoot) {
      this.lastIndexedRoot = '';
      this.lastBoundRoot = workspaceRoot;
    }

    this.fileOps.setProjectRoot(workspaceRoot);
    this.cmdRunner.setProjectRoot(workspaceRoot);
    this.validator.setProjectRoot(workspaceRoot);
    this.discovery.setProjectRoot(workspaceRoot);
    this.aiHarness.setProjectRoot(workspaceRoot);
    this.aiHarness.setRepoId(repoId);
    this.moduleManager.setProjectRoot(workspaceRoot);
    this.orchestrator.setProjectRoot(workspaceRoot);
    this.syncModelManager();

    return { project, workspaceRoot, repoId };
  }

  public syncModelManager(): void {
    const model = this.projectManager.getCurrentProject().model;
    this.modelManager.loadFromJSON(JSON.stringify(model));
  }

  public persistModel(model: ApplicationModel): ApplicationModel {
    const curr = this.projectManager.getCurrentProject();
    model.files = model.files || curr.model.files;
    model.files.projectRoot = '.';
    this.projectManager.updateProject(curr.id, { model });
    this.syncModelManager();
    return model;
  }

  public persistCurrentModelFromManager(): ApplicationModel {
    return this.persistModel(this.modelManager.getModel());
  }

  public async ensureIndexed(): Promise<{
    totalFiles: number;
    indexedAt: string;
    crystal?: { status: string };
    skipped?: boolean;
  }> {
    const { workspaceRoot } = this.bindActive();
    if (this.lastIndexedRoot === workspaceRoot) {
      return { totalFiles: 0, indexedAt: new Date().toISOString(), skipped: true };
    }
    return this.indexActive();
  }

  public async indexActive(): Promise<{
    totalFiles: number;
    indexedAt: string;
    crystal?: { status: string };
  }> {
    const { workspaceRoot, repoId, project } = this.bindActive();
    const index = await this.aiHarness.indexer.indexProject(workspaceRoot);
    this.lastIndexedRoot = workspaceRoot;

    let crystal: { status: string } | undefined;
    try {
      const health = await this.aiHarness.crystal.checkHealth();
      if (health.isAvailable) {
        await this.aiHarness.crystal.registerLocalFolder(workspaceRoot, repoId, project.name);
        await this.aiHarness.crystal.triggerIndex(repoId);
        crystal = { status: 'indexing' };
      }
    } catch (err: any) {
      this.logger.warn(`Crystal index skipped: ${err?.message || err}`);
    }

    return { totalFiles: index.totalFiles, indexedAt: index.indexedAt, crystal };
  }

  public async importFiles(files: ImportedFile[]): Promise<{ written: number; repoId: string }> {
    const { project, repoId } = this.bindActive();
    this.lastIndexedRoot = '';
    const written = this.workspaceStore.writeImportedFiles(project.id, files);
    await this.indexActive();
    await this.refreshModelFromDiscovery();
    return { written, repoId };
  }

  public async refreshModelFromDiscovery(): Promise<ApplicationModel> {
    this.bindActive();
    const curr = this.projectManager.getCurrentProject();
    const discovered = await this.discovery.discover();
    const discoveredModel = discovered.getModel();
    discoveredModel.metadata.name = curr.name;
    discoveredModel.metadata.description = curr.description;
    discoveredModel.metadata.createdAt = curr.model.metadata?.createdAt || discoveredModel.metadata.createdAt;
    discoveredModel.files.projectRoot = '.';

    const installed = curr.model.modules || [];
    const discoveredMods = discoveredModel.modules || [];
    const byName = new Map(installed.map((m) => [m.name, m]));
    for (const m of discoveredMods) {
      if (!byName.has(m.name)) byName.set(m.name, m);
    }
    discoveredModel.modules = Array.from(byName.values());

    if (installed.length > 0 && discoveredModel.architecture) {
      for (const mod of installed) {
        if (!discoveredModel.architecture.services.some((s) => s.id === mod.id)) {
          discoveredModel.architecture.services.push({
            id: mod.id,
            name: mod.name,
            type: (mod.type as any) || 'module',
            technology: mod.config?.technology || mod.type || 'module',
            port: mod.config?.port,
          });
        }
      }
    }

    return this.persistModel(discoveredModel);
  }
}
