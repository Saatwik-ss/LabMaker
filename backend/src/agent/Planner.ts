import {
  AgentRequest,
  AgentPlan,
  PlannedFile,
  DatabaseChange,
  TestRequirement,
} from '@codex/shared';
import { ApplicationModelManager } from '../core/ApplicationModel';
import { Logger } from '../utils/Logger';

/**
 * Planner converts high-level user requests into detailed execution plans.
 *
 * This is where the "thinking" happens. The planner:
 * 1. Parses the user intent
 * 2. Identifies which modules/services are affected
 * 3. Plans what files need to be created/modified
 * 4. Identifies database changes
 * 5. Plans tests
 * 6. Estimates complexity
 *
 * The plan is then presented to the human for review before execution.
 */
export class Planner {
  private model: ApplicationModelManager;
  private logger: Logger;

  constructor(model: ApplicationModelManager) {
    this.model = model;
    this.logger = new Logger('Planner');
  }

  /**
   * Main planning method
   */
  async plan(request: AgentRequest): Promise<AgentPlan> {
    this.logger.info(`Planning request: ${request.type} - ${request.prompt}`);

    // Parse intent
    const intent = this.parseIntent(request);
    const promptLower = request.prompt.toLowerCase();
    const isModuleRequest = promptLower.includes('module') || promptLower.includes('add service') || promptLower.includes('add api');
    const isExplicitCodeGen = promptLower.includes('generate code') || promptLower.includes('write code') || promptLower.includes('scaffold code') || promptLower.includes('implement');

    // Identify affected modules
    const affectedModules = this.inferAffectedModules(request);

    // If it's a module request without explicit code generation instruction, gather requirements first!
    let newFiles: PlannedFile[] = [];
    let modifiedFiles: PlannedFile[] = [];
    let databaseChanges: DatabaseChange[] = [];

    if (isModuleRequest && !isExplicitCodeGen) {
      this.logger.info('Module creation detected: gathering requirements first before generating code.');
      // Do not generate code prematurely
      newFiles = [];
      modifiedFiles = [];
      databaseChanges = [];
    } else {
      // Plan file changes
      newFiles = this.planNewFiles(request, affectedModules);
      modifiedFiles = this.planModifiedFiles(request, affectedModules);
      databaseChanges = this.planDatabaseChanges(request);
    }

    // Plan tests
    const testsRequired = this.planTests(newFiles, modifiedFiles);

    // Estimate complexity
    const complexity = this.estimateComplexity(newFiles, modifiedFiles, databaseChanges);
    const estimatedTime = this.estimateTime(complexity, newFiles, modifiedFiles, databaseChanges);

    // Generate description
    let description = this.generateDescription(request, newFiles, modifiedFiles, databaseChanges);

    if (isModuleRequest && !isExplicitCodeGen) {
      description = [
        `Requirements Analysis for Module:`,
        `Before generating code, let's establish the module specification:`,
        `1. What core functionality and interfaces should this module expose?`,
        `2. Are there specific frameworks, libraries, or Groq API models to configure?`,
        `3. Which existing modules, databases, or APIs should this integrate with?`,
        `4. Are there authentication, credential, or security constraints?`,
        `5. Would you like to reference patterns from historical projects (e.g. FinTech Payments, HealthPortal)?`,
        ``,
        `Module identity registered. Reply with your requirements or ask to 'Generate code' whenever ready.`
      ].join('\n');
    }

    const plan: AgentPlan = {
      requestId: '', // Will be set by orchestrator
      intent,
      affectedModules,
      newFiles,
      modifiedFiles,
      databaseChanges,
      testsRequired,
      estimatedComplexity: complexity,
      estimatedTimeMinutes: estimatedTime,
      description,
    };

    this.logger.info(`Plan created: ${newFiles.length} new files, ${modifiedFiles.length} modifications, ${databaseChanges.length} DB changes`);
    return plan;
  }

  /**
   * Parse the user's intent from their request
   */
  private parseIntent(request: AgentRequest): AgentRequest['type'] {
    // In production, this would use NLP/LLM to understand the request
    // For MVP, we return the type as-is
    return request.type;
  }

  /**
   * Infer which modules/services are affected by this request
   */
  private inferAffectedModules(request: AgentRequest): string[] {
    const affected: Set<string> = new Set();

    // Check explicit targets
    if (request.targetModules) {
      request.targetModules.forEach(m => affected.add(m));
    }

    // Infer from keywords in prompt
    const prompt = request.prompt.toLowerCase();

    // Auth-related requests
    if (prompt.includes('auth') || prompt.includes('login') || prompt.includes('user')) {
      const authModule = this.model.getModuleByName('auth');
      if (authModule) affected.add(authModule.id);
    }

    // CRUD-related requests
    if (prompt.includes('create') || prompt.includes('read') || prompt.includes('update') || prompt.includes('delete')) {
      const crudModule = this.model.getModuleByName('crud');
      if (crudModule) affected.add(crudModule.id);
    }

    // Search-related requests
    if (prompt.includes('search')) {
      const searchModule = this.model.getModuleByName('search');
      if (searchModule) affected.add(searchModule.id);
    }

    // File-related requests
    if (prompt.includes('file') || prompt.includes('upload') || prompt.includes('download')) {
      const filesModule = this.model.getModuleByName('files');
      if (filesModule) affected.add(filesModule.id);
    }

    // Real-time requests
    if (prompt.includes('real-time') || prompt.includes('websocket') || prompt.includes('live update')) {
      const realtimeModule = this.model.getModuleByName('realtime');
      if (realtimeModule) affected.add(realtimeModule.id);
    }

    return Array.from(affected);
  }

  /**
   * Plan which new files need to be created
   */
  private planNewFiles(request: AgentRequest, affectedModules: string[]): PlannedFile[] {
    const files: PlannedFile[] = [];

    const prompt = request.prompt.toLowerCase();

    // Frontend files
    if (prompt.includes('component') || prompt.includes('page') || prompt.includes('form')) {
      files.push({
        path: 'src/components/NewComponent.tsx',
        action: 'create',
        estimatedLines: 50,
        reason: 'React component for ' + request.prompt,
      });
    }

    // API route files
    if (prompt.includes('api') || prompt.includes('endpoint') || prompt.includes('route')) {
      const backends = this.model.getBackends();
      if (backends.length > 0) {
        files.push({
          path: `backend/src/routes/${this.slugify(request.prompt)}.ts`,
          action: 'create',
          estimatedLines: 80,
          reason: 'API route for ' + request.prompt,
        });
      }
    }

    // Service files
    if (prompt.includes('service') || prompt.includes('business logic')) {
      const backends = this.model.getBackends();
      if (backends.length > 0) {
        files.push({
          path: `backend/src/services/${this.slugify(request.prompt)}Service.ts`,
          action: 'create',
          estimatedLines: 100,
          reason: 'Business logic service for ' + request.prompt,
        });
      }
    }

    // Database model files
    if (prompt.includes('model') || prompt.includes('schema') || prompt.includes('table')) {
      files.push({
        path: `database/models/${this.slugify(request.prompt)}.ts`,
        action: 'create',
        estimatedLines: 60,
        reason: 'Database model for ' + request.prompt,
      });
    }

    // Test files
    files.push({
      path: `tests/${this.slugify(request.prompt)}.test.ts`,
      action: 'create',
      estimatedLines: 40,
      reason: 'Unit tests for ' + request.prompt,
    });

    return files;
  }

  /**
   * Plan which existing files need to be modified
   */
  private planModifiedFiles(request: AgentRequest, affectedModules: string[]): PlannedFile[] {
    const files: PlannedFile[] = [];

    const prompt = request.prompt.toLowerCase();

    // Modify app files (add imports, register routes, etc.)
    const backends = this.model.getBackends();
    if (backends.length > 0 && (prompt.includes('route') || prompt.includes('api'))) {
      files.push({
        path: 'backend/src/index.ts',
        action: 'modify',
        estimatedLines: 5,
        reason: 'Register new routes',
      });
    }

    // Modify middleware/auth if relevant
    if (prompt.includes('auth') || prompt.includes('permission') || prompt.includes('protect')) {
      files.push({
        path: 'backend/src/middleware/auth.ts',
        action: 'modify',
        estimatedLines: 10,
        reason: 'Update authentication logic',
      });
    }

    // Modify main app component if frontend changes
    if (prompt.includes('component') || prompt.includes('page') || prompt.includes('layout')) {
      files.push({
        path: 'frontend/src/App.tsx',
        action: 'modify',
        estimatedLines: 5,
        reason: 'Register new component/page',
      });
    }

    return files;
  }

  /**
   * Plan database schema changes
   */
  private planDatabaseChanges(request: AgentRequest): DatabaseChange[] {
    const changes: DatabaseChange[] = [];
    const prompt = request.prompt.toLowerCase();

    const databases = this.model.getDatabases();
    if (databases.length === 0) return changes;

    // Detect if user is asking for a new table
    if (prompt.includes('table') || prompt.includes('model') || prompt.includes('schema')) {
      const tableName = this.extractTableName(request.prompt);
      changes.push({
        type: 'create-table',
        table: tableName,
        description: `Create ${tableName} table`,
        migration: `CREATE TABLE ${tableName} (\n  id SERIAL PRIMARY KEY,\n  created_at TIMESTAMP DEFAULT NOW()\n);`,
      });
    }

    // Detect if user is adding columns
    if (prompt.includes('add column') || prompt.includes('add field')) {
      changes.push({
        type: 'add-column',
        table: 'users',
        description: 'Add new column to existing table',
        migration: 'ALTER TABLE ... ADD COLUMN ...;',
      });
    }

    // Detect if user is adding indexes
    if (prompt.includes('index') || prompt.includes('performance') || prompt.includes('speed up')) {
      changes.push({
        type: 'add-index',
        table: 'users',
        description: 'Add index for better query performance',
        migration: 'CREATE INDEX idx_user_email ON users(email);',
      });
    }

    return changes;
  }

  /**
   * Plan which tests need to be written
   */
  private planTests(newFiles: PlannedFile[], modifiedFiles: PlannedFile[]): TestRequirement[] {
    const tests: TestRequirement[] = [];

    // Add unit tests for new backend files
    newFiles.forEach(file => {
      if (file.path.includes('/src/routes/') || file.path.includes('/src/services/')) {
        tests.push({
          type: 'unit',
          module: file.path,
          description: `Unit tests for ${file.path}`,
        });
      }

      if (file.path.includes('/components/')) {
        tests.push({
          type: 'unit',
          module: file.path,
          description: `Unit tests for ${file.path}`,
        });
      }
    });

    // Add integration tests for API changes
    if (newFiles.some(f => f.path.includes('/routes/'))) {
      tests.push({
        type: 'integration',
        module: 'api',
        description: 'Integration tests for new API endpoints',
      });
    }

    return tests;
  }

  /**
   * Estimate the complexity of this plan
   */
  private estimateComplexity(
    newFiles: PlannedFile[],
    modifiedFiles: PlannedFile[],
    databaseChanges: DatabaseChange[]
  ): 'low' | 'medium' | 'high' {
    let score = 0;

    // Score based on number of files
    score += newFiles.length * 2;
    score += modifiedFiles.length;

    // Score based on database changes
    score += databaseChanges.length * 3;

    if (score <= 3) return 'low';
    if (score <= 7) return 'medium';
    return 'high';
  }

  /**
   * Estimate how long this will take (in minutes)
   */
  private estimateTime(
    complexity: 'low' | 'medium' | 'high',
    newFiles: PlannedFile[],
    modifiedFiles: PlannedFile[],
    databaseChanges: DatabaseChange[]
  ): number {
    let baseTime = 0;

    if (complexity === 'low') baseTime = 2;
    if (complexity === 'medium') baseTime = 8;
    if (complexity === 'high') baseTime = 15;

    // Add time for each file
    baseTime += (newFiles.length + modifiedFiles.length) * 1;

    // Add time for database changes
    baseTime += databaseChanges.length * 2;

    return Math.ceil(baseTime);
  }

  /**
   * Generate a human-readable description of the plan
   */
  private generateDescription(
    request: AgentRequest,
    newFiles: PlannedFile[],
    modifiedFiles: PlannedFile[],
    databaseChanges: DatabaseChange[]
  ): string {
    const parts = [
      `Implementing: ${request.prompt}`,
      '',
      `Files to create: ${newFiles.length}`,
      newFiles.slice(0, 3).map(f => `  - ${f.path}`).join('\n'),
      newFiles.length > 3 ? `  ... and ${newFiles.length - 3} more` : '',
      '',
      `Files to modify: ${modifiedFiles.length}`,
      modifiedFiles.slice(0, 3).map(f => `  - ${f.path}`).join('\n'),
      modifiedFiles.length > 3 ? `  ... and ${modifiedFiles.length - 3} more` : '',
      '',
      databaseChanges.length > 0 ? `Database changes: ${databaseChanges.length}` : '',
      databaseChanges.slice(0, 3).map(c => `  - ${c.description}`).join('\n'),
    ].filter(Boolean).join('\n');

    return parts;
  }

  /**
   * Utility: Convert text to filename slug
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 30); // Limit length
  }

  /**
   * Utility: Extract table name from request
   */
  private extractTableName(text: string): string {
    // Very simple extraction - in production, use proper NLP
    const words = text.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      if (words[i].toLowerCase() === 'table' || words[i].toLowerCase() === 'model') {
        if (i + 1 < words.length) {
          return this.slugify(words[i + 1]);
        }
      }
    }
    return 'new_table';
  }
}
