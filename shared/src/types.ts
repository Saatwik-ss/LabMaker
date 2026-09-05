// ============================================================
// Codex Shared Type Definitions
// All interfaces shared between backend and frontend
// ============================================================

// ── Application Model ────────────────────────────────────────

export interface ApplicationModel {
  metadata: AppMetadata;
  stack: TechStack;
  modules: InstalledModule[];
  architecture: Architecture;
  files: FileIndex;
  discoveryMetadata: DiscoveryMetadata;
}

export interface AppMetadata {
  name: string;
  description: string;
  version: string;
  createdAt: string;
  updatedAt: string;
}

// ── Multi-Project Registry ────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'historical' | 'archived';
  isCurrent: boolean;
  path?: string;
  workspaceId?: string;
  createdAt: string;
  updatedAt: string;
  model: ApplicationModel;
  credentials?: {
    groqApiKey?: string;
    openaiApiKey?: string;
    anthropicApiKey?: string;
    customApiUrl?: string;
    [key: string]: any;
  };
  requirements?: string[];
  history?: ProjectHistoryEntry[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'historical' | 'archived';
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
  frontend: string;
  backendCount: number;
  databaseCount: number;
  moduleCount: number;
  serviceCount: number;
  healthyModuleCount: number;
  totalModules: number;
}

export interface ProjectHistoryEntry {
  id: string;
  timestamp: string;
  action: string;
  description: string;
  author?: string;
}

export interface TechStack {
  frontend: FrontendStack | null;
  backends: Backend[];
  databases: Database[];
  ai: AIService[];
}

export interface FrontendStack {
  framework: 'react' | 'next.js' | 'vue' | null;
  versionManager: 'vite' | 'webpack' | 'next' | null;
  language: 'javascript' | 'typescript';
  components: Component[];
}

export interface Component {
  name: string;
  path: string;
  type: 'page' | 'component' | 'layout' | 'hook';
  props?: Record<string, string>;
}

export interface Backend {
  id: string;
  name: string;
  framework: 'express' | 'fastapi' | 'flask' | null;
  language: 'javascript' | 'typescript' | 'python';
  port: number;
  routes: APIRoute[];
  middleware: Middleware[];
  services: Service[];
}

export interface APIRoute {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  handler: string;
  middleware?: string[];
  description?: string;
}

export interface Middleware {
  name: string;
  path: string;
  description?: string;
}

export interface Service {
  name: string;
  path: string;
  methods: string[];
  description?: string;
}

export interface Database {
  id: string;
  type: 'postgresql' | 'mysql' | 'sqlite' | 'mongodb';
  name: string;
  host: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
  schema?: Schema;
  tables?: Table[];
  migrationTools?: 'alembic' | 'knex' | 'raw' | null;
}

export interface Schema {
  tables: Table[];
}

export interface Table {
  name: string;
  columns: Column[];
  indexes?: Index[];
}

export interface Column {
  name: string;
  type: string;
  nullable?: boolean;
  primaryKey?: boolean;
  foreignKey?: ForeignKey;
  defaultValue?: string;
}

export interface ForeignKey {
  table: string;
  column: string;
}

export interface Index {
  name: string;
  columns: string[];
  unique?: boolean;
}

export interface AIService {
  name: string;
  provider: string;
  model?: string;
  apiKeyEnv?: string;
}

export interface Architecture {
  services: ServiceNode[];
  relationships: Relationship[];
  dataFlow: DataFlowEdge[];
}

export interface ServiceNode {
  id: string;
  name: string;
  type: 'frontend' | 'backend' | 'database' | 'external' | 'module';
  technology?: string;
  port?: number;
  metadata?: Record<string, unknown>;
}

export interface Relationship {
  id: string;
  source: string;
  target: string;
  type: 'http' | 'grpc' | 'websocket' | 'database' | 'message-queue' | 'import';
  label?: string;
}

export interface DataFlowEdge {
  source: string;
  target: string;
  dataType: string;
  protocol?: string;
}

export interface FileIndex {
  projectRoot: string;
  importantPaths: string[];
  moduleRoots: string[];
  configFiles: string[];
}

export interface DiscoveryMetadata {
  lastDiscoveredAt: string;
  discoveryVersion: string;
  parserVersion: string;
}

// ── Installed Modules ────────────────────────────────────────

export type ModuleCategoryType = 'frontend' | 'backend' | 'database' | 'api' | 'services' | 'custom' | 'auth' | 'crud' | 'search' | 'files' | 'notifications' | 'other';

export interface InstalledModule {
  id: string;
  name: string;
  version: string;
  baseDir: string;
  status: 'active' | 'deprecated' | 'replaced' | 'draft' | 'configured';
  type?: ModuleCategoryType;
  description?: string;
  projectId?: string;
  requirements?: string[];
  config?: Record<string, any>;
  credentials?: {
    groqApiKey?: string;
    openaiApiKey?: string;
    anthropicApiKey?: string;
    [key: string]: any;
  };
  relationships?: ModuleRelationship[];
  testStatus?: 'passed' | 'failed' | 'untested' | 'issues';
  health?: ModuleHealth;
  codeGenerated?: boolean;
  provides: ModuleInterface[];
  dependencies: ModuleDependency[];
  exports: string[];
  lastModified: string;
  metadata?: Record<string, unknown>;
}

export interface ModuleRelationship {
  targetId: string;
  targetName: string;
  type: 'http' | 'database' | 'integration' | 'depends_on';
  label: string;
}

export interface ModuleHealth {
  status: 'healthy' | 'warning' | 'error' | 'untested';
  issues: string[];
  lastTested?: string;
}

export interface ModuleInterface {
  name: string;
  type: 'function' | 'class' | 'component' | 'route' | 'middleware';
  exports: string[];
  location: string;
}

export interface ModuleDependency {
  moduleId: string;
  moduleName: string;
}

// ── Module Templates (Registry) ──────────────────────────────

export interface ModuleTemplate {
  id: string;
  name: string;
  version: string;
  description: string;
  category: 'auth' | 'crud' | 'search' | 'files' | 'notifications' | 'other';
  variants: ModuleVariant[];
  requiredDependencies: string[];
  optional: string[];
  installation: ModuleInstallation;
}

export interface ModuleVariant {
  id: string;
  name: string;
  description: string;
  stack: {
    backend?: string;
    frontend?: string;
    database?: string;
  };
  files: ModuleFile[];
}

export interface ModuleFile {
  path: string;
  template: string;
  isStatic: boolean;
}

export interface ModuleInstallation {
  preInstall: string[];
  postInstall: string[];
  modifyFiles: string[];
  createFiles: string[];
  runScripts: string[];
}

// ── Agent System ─────────────────────────────────────────────

export interface AgentRequest {
  type: 'feature' | 'bugfix' | 'refactor' | 'module-integration' | 'architecture-change';
  prompt: string;
  targetModules?: string[];
  context?: Record<string, unknown>;
}

export interface AgentPlan {
  requestId: string;
  intent: string;
  affectedModules: string[];
  newFiles: PlannedFile[];
  modifiedFiles: PlannedFile[];
  databaseChanges: DatabaseChange[];
  testsRequired: TestRequirement[];
  estimatedComplexity: 'low' | 'medium' | 'high';
  estimatedTimeMinutes: number;
  description: string;
}

export interface PlannedFile {
  path: string;
  action: 'create' | 'modify' | 'delete';
  estimatedLines: number;
  reason: string;
}

export interface DatabaseChange {
  type: 'create-table' | 'add-column' | 'add-index' | 'custom';
  table: string;
  description: string;
  migration: string;
}

export interface TestRequirement {
  type: 'unit' | 'integration' | 'e2e';
  module: string;
  description: string;
}

export interface AgentResult {
  requestId: string;
  status: 'success' | 'partial' | 'failed' | 'cancelled';
  changes: FileChange[];
  modelUpdates: ModelUpdate;
  validationResults: ValidationResult;
  errors: AgentError[];
  summary: string;
}

export interface FileChange {
  path: string;
  action: 'create' | 'modify' | 'delete';
  oldContent?: string;
  newContent?: string;
  lineCount?: {
    added: number;
    removed: number;
    modified: number;
  };
}

export interface ModelUpdate {
  addedModules: string[];
  modifiedModules: string[];
  databaseChanges: string[];
  architectureChanges: {
    newServices: string[];
    newRelationships: string[];
  };
}

export interface AgentError {
  code: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  file?: string;
  line?: number;
}

// ── Validation ───────────────────────────────────────────────

export interface ValidationResult {
  timestamp: string;
  passed: boolean;
  linting: LintResult;
  typeCheck: TypeCheckResult;
  unitTests: TestResult;
  buildCheck: BuildResult;
  schemaValidation: SchemaValidationResult;
  summary: ValidationSummary;
}

export interface LintResult {
  passed: boolean;
  errors: LintIssue[];
  warnings: LintIssue[];
  totalIssues: number;
}

export interface LintIssue {
  file: string;
  line: number;
  column: number;
  rule: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface TypeCheckResult {
  passed: boolean;
  errors: TypeCheckError[];
  totalErrors: number;
}

export interface TypeCheckError {
  file: string;
  line: number;
  column: number;
  code: string;
  message: string;
}

export interface TestResult {
  passed: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  coverage?: TestCoverage;
  failures: TestFailure[];
}

export interface TestCoverage {
  statements: number;
  branches: number;
  functions: number;
  lines: number;
}

export interface TestFailure {
  testName: string;
  error: string;
  file?: string;
}

export interface BuildResult {
  passed: boolean;
  errors: BuildError[];
  warnings: string[];
}

export interface BuildError {
  message: string;
  file?: string;
  line?: number;
}

export interface SchemaValidationResult {
  passed: boolean;
  issues: SchemaIssue[];
}

export interface SchemaIssue {
  table: string;
  column?: string;
  issue: string;
  severity: 'error' | 'warning';
}

export interface ValidationSummary {
  allPassed: boolean;
  failedCategories: string[];
  suggestions: string[];
  nextSteps: string[];
}

// ── Discovery ────────────────────────────────────────────────

export interface DiscoveryResult {
  model: ApplicationModel;
  confidence: number;
  warnings: string[];
  suggestedActions: string[];
}

export interface DiscoveryHeuristic {
  name: string;
  description: string;
  detect: (context: DiscoveryContext) => boolean;
  extract: (context: DiscoveryContext) => Partial<ApplicationModel>;
}

export interface DiscoveryContext {
  projectRoot: string;
  files: string[];
  packageJson?: Record<string, unknown>;
  fileContents: Map<string, string>;
}

// ── File Operations ──────────────────────────────────────────

export interface FileOperationResult {
  success: boolean;
  content?: string;
  error?: string;
}

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modifiedAt?: string;
  children?: FileEntry[];
}

export interface FileStats {
  size: number;
  isDirectory: boolean;
  isFile: boolean;
  createdAt: string;
  modifiedAt: string;
}
