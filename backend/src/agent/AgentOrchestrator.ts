import { v4 as uuidv4 } from 'uuid';
import {
  AgentRequest,
  AgentResult,
  AgentPlan,
  FileChange,
  ValidationResult,
  ModelUpdate,
  AgentError,
} from '@codex/shared';
import { ApplicationModelManager } from '../core/ApplicationModel';
import { FileOperations } from '../tools/FileOperations';
import { Planner } from './Planner';
import { Validator } from '../validation/Validator';
import { CodeGenerator } from '../generation/CodeGenerator';
import { Logger } from '../utils/Logger';

/**
 * AgentOrchestrator is the main coordinator for AI-powered development tasks.
 *
 * Flow:
 * 1. Receive user request (natural language or structured)
 * 2. Create execution plan (identify changes needed)
 * 3. Validate plan (check for issues)
 * 4. Execute plan (make changes)
 * 5. Validate results (type check, lint, test)
 * 6. Update model
 * 7. Return result to user
 *
 * Key principle: Always keep human in the loop. Plan is reviewable before execution.
 */
export class AgentOrchestrator {
  private model: ApplicationModelManager;
  private fileOps: FileOperations;
  private planner: Planner;
  private validator: Validator;
  private codeGen: CodeGenerator;
  private projectRoot: string;
  private logger: Logger;
  private projectManager?: any;
  private requestLog: Map<string, AgentRequestState> = new Map();

  constructor(
    model: ApplicationModelManager,
    fileOps: FileOperations,
    projectRoot: string,
    projectManager?: any
  ) {
    this.projectRoot = projectRoot;
    this.model = model;
    this.fileOps = fileOps;
    this.projectManager = projectManager;
    this.planner = new Planner(model);
    this.validator = new Validator(projectRoot);
    this.codeGen = new CodeGenerator(model);
    this.logger = new Logger('AgentOrchestrator');
  }

  public setProjectRoot(projectRoot: string): void {
    this.projectRoot = projectRoot;
    this.fileOps.setProjectRoot(projectRoot);
    this.validator.setProjectRoot(projectRoot);
  }

  /**
   * Main entry point: Process a user request
   *
   * Steps:
   * 1. Create plan (agent thinks about what to do)
   * 2. Return plan for human review
   * 3. (Human approves via separate endpoint)
   * 4. Execute changes
   * 5. Validate
   * 6. Return result
   */
  async processRequest(request: AgentRequest): Promise<AgentResult> {
    const requestId = uuidv4();
    const startTime = Date.now();

    // Check for custom configuration (API key, system prompt)
    const fs = require('fs');
    const path = require('path');
    const configPath = path.join(this.fileOps ? (this as any).projectRoot || process.cwd() : process.cwd(), '.codex', 'config.json');
    let customConfig: any = {};
    try {
      if (fs.existsSync(configPath)) {
        customConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }
    } catch { /* ignore */ }

    const effectivePrompt = request.context?.systemPrompt || customConfig.systemPrompt || '';
    if (effectivePrompt) {
      this.logger.info(`Active system prompt: "${effectivePrompt.slice(0, 80)}..."`);
    }
    const hasApiKey = customConfig.openaiApiKey || customConfig.anthropicApiKey || customConfig.groqApiKey || request.context?.apiKey;
    if (hasApiKey) {
      const provider = customConfig.groqApiKey ? 'Groq' : customConfig.openaiApiKey ? 'OpenAI' : customConfig.anthropicApiKey ? 'Anthropic' : 'Custom';
      this.logger.info(`LLM provider configured with API key (${provider}).`);
    }

    this.logger.info(`Processing request ${requestId}: ${request.type} - ${request.prompt}`);

    try {
      // Step 1: Create plan
      this.logger.info(`Creating plan for request ${requestId}...`);
      const plan = await this.planner.plan(request);
      plan.requestId = requestId;

      // Store plan in memory (return to client for review)
      this.requestLog.set(requestId, {
        id: requestId,
        request,
        plan,
        status: 'planning',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Client polls or websocket to get plan
      // Client reviews plan
      // Client calls /approve endpoint
      // Once approved, execution continues (see approveAndExecute method)

      // For MVP, we'll auto-execute. In production, require approval.
      return await this.approveAndExecute(requestId);
    } catch (error) {
      this.logger.error(`Request ${requestId} failed:`, error);
      return {
        requestId,
        status: 'failed',
        changes: [],
        modelUpdates: { addedModules: [], modifiedModules: [], databaseChanges: [], architectureChanges: { newServices: [], newRelationships: [] } },
        validationResults: {
          timestamp: new Date().toISOString(),
          passed: false,
          linting: { passed: false, errors: [], warnings: [], totalIssues: 0 },
          typeCheck: { passed: false, errors: [], totalErrors: 0 },
          unitTests: { passed: false, totalTests: 0, passedTests: 0, failedTests: 0, skippedTests: 0, failures: [] },
          buildCheck: { passed: false, errors: [], warnings: [] },
          schemaValidation: { passed: false, issues: [] },
          summary: {
            allPassed: false,
            failedCategories: ['validation'],
            suggestions: [],
            nextSteps: [],
          },
        },
        errors: [
          {
            code: 'EXECUTION_FAILED',
            message: String(error),
            severity: 'error',
          },
        ],
        summary: `Failed to process request: ${String(error)}`,
      };
    }
  }

  /**
   * Approve a plan and execute it
   * Called after human reviews the plan
   */
  async approveAndExecute(requestId: string): Promise<AgentResult> {
    const state = this.requestLog.get(requestId);
    if (!state || !state.plan) {
      return this.failResult(requestId, 'Request or plan not found');
    }

    const plan = state.plan;
    const errors: AgentError[] = [];

    try {
      this.logger.info(`Executing plan for request ${requestId}...`);
      state.status = 'executing';
      state.updatedAt = new Date().toISOString();

      // Step 2: Execute plan
      const changes = await this.executePlan(plan, errors);

      // Step 3: Run validation
      this.logger.info(`Validating changes for request ${requestId}...`);
      const validationResults = await this.validator.validate();

      if (!validationResults.passed) {
        this.logger.warn(`Validation failed for request ${requestId}`);
        errors.push({
          code: 'VALIDATION_FAILED',
          message: `${validationResults.summary.failedCategories.length} validation checks failed`,
          severity: 'warning',
        });
      }

      // Step 4: Update model
      const modelUpdates = this.updateModel(changes, plan);

      // Save updated model
      const modelJson = this.model.toJSON();
      this.fileOps.writeFile('.codex/applicationModel.json', modelJson);
      this.model.markSaved();

      // Step 5: Prepare result
      const result: AgentResult = {
        requestId,
        status: validationResults.passed ? 'success' : 'partial',
        changes,
        modelUpdates,
        validationResults,
        errors,
        summary: this.generateSummary(plan, changes, validationResults),
      };

      state.status = result.status;
      state.result = result;
      state.updatedAt = new Date().toISOString();

      this.logger.info(`Request ${requestId} completed with status: ${result.status}`);
      return result;
    } catch (error) {
      this.logger.error(`Execution failed for request ${requestId}:`, error);
      return this.failResult(requestId, String(error), errors);
    }
  }

  /**
   * Execute the plan: make all the necessary file changes
   */
  private async executePlan(plan: AgentPlan, errors: AgentError[]): Promise<FileChange[]> {
    const changes: FileChange[] = [];

    // Create new files
    for (const file of plan.newFiles) {
      try {
        this.logger.info(`Creating file: ${file.path}`);

        // Generate code based on the intent
        const content = await this.generateFileContent(file, plan);

        const result = this.fileOps.writeFile(file.path, content);
        if (result.success) {
          changes.push({
            path: file.path,
            action: 'create',
            newContent: content,
            lineCount: { added: content.split('\n').length, removed: 0, modified: 0 },
          });
        } else {
          errors.push({
            code: 'FILE_CREATE_FAILED',
            message: result.error || 'Unknown error',
            severity: 'error',
            file: file.path,
          });
        }
      } catch (error) {
        errors.push({
          code: 'FILE_CREATE_FAILED',
          message: String(error),
          severity: 'error',
          file: file.path,
        });
      }
    }

    // Modify existing files
    for (const file of plan.modifiedFiles) {
      try {
        this.logger.info(`Modifying file: ${file.path}`);

        const oldContent = this.fileOps.readFile(file.path).content || '';
        const newContent = await this.generateFileContent(file, plan);

        const result = this.fileOps.replaceInFile(file.path, oldContent, newContent);
        if (result.success) {
          changes.push({
            path: file.path,
            action: 'modify',
            oldContent,
            newContent,
          });
        } else {
          errors.push({
            code: 'FILE_MODIFY_FAILED',
            message: result.error || 'Unknown error',
            severity: 'error',
            file: file.path,
          });
        }
      } catch (error) {
        errors.push({
          code: 'FILE_MODIFY_FAILED',
          message: String(error),
          severity: 'error',
          file: file.path,
        });
      }
    }

    return changes;
  }

  /**
   * Generate file content based on file type and context
   * This is where the AI actually generates the code
   */
  private async generateFileContent(file: PlannedFile, plan: AgentPlan): Promise<string> {
    const path = file.path;

    // Detect file type
    if (path.endsWith('.tsx')) {
      // React component
      return this.codeGen.generateReactComponent({
        name: this.extractFileName(path),
        description: file.reason,
      });
    } else if (path.includes('routes') || path.includes('handlers')) {
      // API route/handler
      return this.codeGen.generateApiRoute({
        path: this.extractPath(path),
        method: 'GET',
        description: file.reason,
      });
    } else if (path.includes('models') || path.includes('schema')) {
      // Database model
      return this.codeGen.generateDatabaseModel({
        name: this.extractFileName(path),
        description: file.reason,
      });
    } else if (path.includes('service') || path.includes('services')) {
      // Business logic service
      return this.codeGen.generateService({
        name: this.extractFileName(path),
        description: file.reason,
      });
    } else {
      // Generic TypeScript/JavaScript file
      return `// ${file.reason}\n// Generated by Codex\n\nexport default {};\n`;
    }
  }

  /**
   * Update the Application Model based on changes made
   */
  private updateModel(changes: FileChange[], plan: AgentPlan): ModelUpdate {
    const update: ModelUpdate = {
      addedModules: [],
      modifiedModules: [],
      databaseChanges: [],
      architectureChanges: {
        newServices: [],
        newRelationships: [],
      },
    };

    // Parse changes and update model
    // In production, this would do deeper analysis
    for (const change of changes) {
      if (change.action === 'create') {
        // Track new services, components, etc.
        if (change.path.includes('routes') || change.path.includes('handlers')) {
          this.logger.info(`Detected new route in ${change.path}`);
        }
      }
    }

    // Update database changes from plan
    for (const dbChange of plan.databaseChanges) {
      // Create table structure and add to model
      if (dbChange.type === 'create-table') {
        this.logger.info(`Planning database migration: ${dbChange.table}`);
      }
    }

    return update;
  }

  /**
   * Request status lookup
   */
  getRequestStatus(requestId: string): AgentRequestState | undefined {
    return this.requestLog.get(requestId);
  }

  /**
   * Cancel a request
   */
  cancelRequest(requestId: string): boolean {
    const state = this.requestLog.get(requestId);
    if (!state) return false;

    if (state.status === 'executing') {
      this.logger.warn(`Cannot cancel request ${requestId}: already executing`);
      return false;
    }

    state.status = 'cancelled';
    state.updatedAt = new Date().toISOString();
    return true;
  }

  /**
   * Get plan for review (before execution)
   */
  getPlanForReview(requestId: string): AgentPlan | undefined {
    const state = this.requestLog.get(requestId);
    return state?.plan;
  }

  /**
   * Utility: Generate result summary
   */
  private generateSummary(
    plan: AgentPlan,
    changes: FileChange[],
    validation: ValidationResult
  ): string {
    const lines = [
      `Completed: ${plan.intent}`,
      `Files changed: ${changes.length}`,
      `Validation: ${validation.passed ? 'PASSED' : 'WARNINGS'}`,
      `Affected modules: ${plan.affectedModules.join(', ') || 'none'}`,
    ];

    if (!validation.passed) {
      lines.push(`Issues: ${validation.summary.failedCategories.join(', ')}`);
    }

    return lines.join('\n');
  }

  /**
   * Utility: Create failed result
   */
  private failResult(
    requestId: string,
    message: string,
    additionalErrors: AgentError[] = []
  ): AgentResult {
    return {
      requestId,
      status: 'failed',
      changes: [],
      modelUpdates: {
        addedModules: [],
        modifiedModules: [],
        databaseChanges: [],
        architectureChanges: { newServices: [], newRelationships: [] },
      },
      validationResults: {
        timestamp: new Date().toISOString(),
        passed: false,
        linting: { passed: false, errors: [], warnings: [], totalIssues: 0 },
        typeCheck: { passed: false, errors: [], totalErrors: 0 },
        unitTests: {
          passed: false,
          totalTests: 0,
          passedTests: 0,
          failedTests: 0,
          skippedTests: 0,
          failures: [],
        },
        buildCheck: { passed: false, errors: [], warnings: [] },
        schemaValidation: { passed: false, issues: [] },
        summary: {
          allPassed: false,
          failedCategories: ['execution'],
          suggestions: [],
          nextSteps: [],
        },
      },
      errors: [
        { code: 'REQUEST_FAILED', message, severity: 'error' },
        ...additionalErrors,
      ],
      summary: `Failed: ${message}`,
    };
  }

  /**
   * Utilities for path/filename extraction
   */
  private extractFileName(path: string): string {
    const parts = path.split('/');
    const file = parts[parts.length - 1];
    return file.replace(/\.[^/.]+$/, ''); // Remove extension
  }

  private extractPath(path: string): string {
    // Extract route path from file path
    return '/' + this.extractFileName(path);
  }
}

/**
 * Internal state tracking for requests
 */
export interface AgentRequestState {
  id: string;
  request: AgentRequest;
  plan?: AgentPlan;
  result?: AgentResult;
  status: 'planning' | 'reviewing' | 'executing' | 'validating' | 'success' | 'partial' | 'failed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  errors?: AgentError[];
}

/**
 * File specification for code generation
 */
export interface PlannedFile {
  path: string;
  action: 'create' | 'modify' | 'delete';
  estimatedLines: number;
  reason: string;
}
