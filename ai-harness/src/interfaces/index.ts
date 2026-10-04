import {
  FrontendStack,
  Backend,
  Database,
  APIRoute,
  Relationship,
  InstalledModule,
  ModuleTemplate,
  AgentRequest,
  AgentResult,
  ValidationResult,
  FileChange
} from '@codex/shared';
import { CrystalBridge } from '../crystal/CrystalBridge';

/**
 * File symbol metadata extracted by indexer
 */
export interface CodeSymbol {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'variable' | 'component' | 'route' | 'type';
  line: number;
  exported: boolean;
}

/**
 * Individual file indexing metadata
 */
export interface FileIndex {
  relativePath: string;
  absolutePath: string;
  extension: string;
  size: number;
  lastModified: string;
  symbols: CodeSymbol[];
  imports: string[];
  exports: string[];
  isTest: boolean;
  isComponent: boolean;
  isRoute: boolean;
  isConfig: boolean;
}

/**
 * Overall project profile detected by AI harness
 */
export interface ProjectStackProfile {
  projectRoot: string;
  language: 'typescript' | 'javascript' | 'python' | 'unknown';
  frontend?: FrontendStack;
  backends: Backend[];
  databases: Database[];
  packageManager: 'npm' | 'yarn' | 'pnpm';
  hasTailwind: boolean;
  namingConvention: 'camelCase' | 'kebab-case' | 'PascalCase';
  apiStructure: 'express-router' | 'nextjs-app-router' | 'rest-handlers';
}

/**
 * Full project index produced by IProjectIndexer
 */
export interface ProjectIndex {
  projectRoot: string;
  indexedAt: string;
  totalFiles: number;
  profile: ProjectStackProfile;
  files: Map<string, FileIndex>;
  routes: APIRoute[];
  relationships: Relationship[];
}

/**
 * Query for retrieving targeted project context
 */
export interface ContextQuery {
  prompt: string;
  maxFiles?: number;
  targetPaths?: string[];
  includeSymbols?: boolean;
  projectRoot?: string;
}

/**
 * Retrieved context for feeding into AI prompts and capabilities
 */
export interface RetrievedContext {
  relevantFiles: Array<{
    path: string;
    content: string;
    relevanceScore: number;
    symbols: string[];
  }>;
  stackSummary: string;
  architectureSummary: string;
  routes: APIRoute[];
}

/**
 * Architecture graph structure
 */
export interface ArchitectureGraphData {
  nodes: Array<{
    id: string;
    name: string;
    type: string;
    technology?: string;
    port?: number;
    status?: string;
  }>;
  relationships: Relationship[];
}

/**
 * Indexer Contract
 */
export interface IProjectIndexer {
  indexProject(projectRoot: string): Promise<ProjectIndex>;
  indexDirectory(dirPath: string): Promise<FileIndex[]>;
  indexFile(filePath: string, rootDir?: string): Promise<FileIndex | null>;
  queryContext(query: ContextQuery): Promise<RetrievedContext>;
  getArchitectureGraph(projectRoot: string): Promise<ArchitectureGraphData>;
  getProjectProfile(projectRoot: string): Promise<ProjectStackProfile>;
}

/**
 * Module Definition for adaptation
 */
export interface ModuleDefinition {
  id: string;
  name: string;
  version: string;
  description: string;
  category: string;
  variantId?: string;
  template?: ModuleTemplate;
  rawFiles?: Array<{ path: string; template: string }>;
  dependencies?: string[];
}

/**
 * Concrete adaptation plan computed before code generation
 */
export interface ModuleAdaptationPlan {
  moduleId: string;
  variantId: string;
  targetStack: ProjectStackProfile;
  adaptations: {
    language: string;
    importPathStyle: string;
    mountFile: string;
    mountSnippet: string;
  };
  filesToCreate: Array<{ path: string; purpose: string }>;
  filesToModify: Array<{ path: string; modification: string }>;
  requiredPackages: string[];
}

/**
 * Result of module adaptation and integration
 */
export interface ModuleIntegrationResult {
  success: boolean;
  moduleId: string;
  moduleName: string;
  filesCreated: FileChange[];
  filesModified: FileChange[];
  installedModuleRecord: InstalledModule;
  validation: {
    passed: boolean;
    issues: string[];
  };
  error?: string;
}

/**
 * Module Adapter Contract
 */
export interface IModuleAdapter {
  inspectProject(projectRoot: string): Promise<ProjectStackProfile>;
  determineAdaptations(profile: ProjectStackProfile, moduleDef: ModuleDefinition): Promise<ModuleAdaptationPlan>;
  adaptAndIntegrate(projectRoot: string, moduleDef: ModuleDefinition, config?: Record<string, any>): Promise<ModuleIntegrationResult>;
  validateIntegration(projectRoot: string, integration: ModuleIntegrationResult): Promise<{ passed: boolean; issues: string[] }>;
}

/**
 * Harness execution context passed to capabilities
 */
export interface HarnessContext {
  projectRoot: string;
  repoId?: string;
  indexer: IProjectIndexer;
  moduleAdapter: IModuleAdapter;
  credentials?: {
    openaiApiKey?: string;
    anthropicApiKey?: string;
    groqApiKey?: string;
    customEndpoint?: string;
  };
  systemPrompt?: string;
  /** Optional bridge to Crystal's indexed, tool-calling agent runtime. */
  crystal?: CrystalBridge;
  toolRegistry?: {
    listDefinitions: () => unknown[];
    execute: (name: string, args: Record<string, unknown>) => Promise<{
      content: string;
      mutating: boolean;
      files?: string[];
      diff?: { path: string; action: string; newContent?: string };
    }>;
  };
}

/**
 * Capability Plugin Interface
 */
export interface IAICapability<TInput = any, TOutput = any> {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  execute(input: TInput, context: HarnessContext): Promise<TOutput>;
}

/**
 * Agent Task Request & Result
 */
export interface AgentTaskRequest extends AgentRequest {
  systemPrompt?: string;
  contextFiles?: string[];
  credentials?: {
    openaiApiKey?: string;
    anthropicApiKey?: string;
    groqApiKey?: string;
    customEndpoint?: string;
  };
}

export interface AgentTaskResult extends AgentResult {
  indexedContextUsed?: string[];
}

/**
 * Unifying AI Harness Contract
 */
export interface IAIHarness {
  readonly projectRoot: string;
  readonly indexer: IProjectIndexer;
  readonly moduleAdapter: IModuleAdapter;
  readonly capabilities: Map<string, IAICapability>;

  registerCapability(capability: IAICapability): void;
  getCapability<T extends IAICapability>(id: string): T | undefined;
  listCapabilities(): Array<{ id: string; name: string; description: string }>;
  executeCapability<TInput = any, TOutput = any>(capabilityId: string, input: TInput): Promise<TOutput>;
  executeTask(task: AgentTaskRequest): Promise<AgentTaskResult>;
  setProjectRoot(newRoot: string): void;
  setCredentials(credentials: Record<string, string>): void;
}
