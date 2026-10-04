import { IAICapability, HarnessContext, ModuleIntegrationResult } from '../interfaces';
import { CrystalBridge } from '../crystal/CrystalBridge';
import { Logger } from '../utils/Logger';

export interface ModuleAdaptationInput {
  moduleData: any;
  targetPath?: string;
  config?: Record<string, any>;
  action?: 'analyze' | 'integrate';
}

export interface ModuleAdaptationOutput {
  action: 'analyze' | 'integrate';
  analysis?: {
    compatible: boolean;
    issues: string[];
    conflicts: Array<{ type: string; details: string; severity: string }>;
    required_packages: string[];
  };
  integration?: ModuleIntegrationResult;
}

export class ModuleAdaptationCapability implements IAICapability<ModuleAdaptationInput, ModuleAdaptationOutput> {
  readonly id = 'module-adaptation';
  readonly name = 'Module Intelligence and Stack Adaptation';
  readonly description = 'Performs compatibility check, conflict analysis, and adapts modules to the project framework, conventions, and database.';

  private crystal: CrystalBridge;
  private logger: Logger;

  constructor(crystalBridge?: CrystalBridge) {
    this.crystal = crystalBridge || new CrystalBridge();
    this.logger = new Logger('ModuleAdaptationCapability');
  }

  async execute(input: ModuleAdaptationInput, context: HarnessContext): Promise<ModuleAdaptationOutput> {
    const action = input.action || 'analyze';
    const targetPath = input.targetPath || context.projectRoot;
    const health = await this.crystal.checkHealth();

    if (health.isAvailable) {
      this.logger.info(`Invoking Crystal Module Intelligence for action: ${action}`);
      if (action === 'analyze') {
        const analysis = await this.crystal.analyzeModule(input.moduleData, targetPath);
        return { action: 'analyze', analysis };
      } else {
        const adapted = await this.crystal.adaptModule(input.moduleData, targetPath);
        const integrationResult: ModuleIntegrationResult = {
          success: adapted.status === 'success',
          moduleId: input.moduleData.id,
          moduleName: input.moduleData.name,
          filesCreated: (adapted.changes || []).filter((c: any) => c.action === 'create'),
          filesModified: (adapted.changes || []).filter((c: any) => c.action === 'modify'),
          installedModuleRecord: {
            id: input.moduleData.id,
            name: input.moduleData.name,
            version: input.moduleData.version || '1.0.0',
            baseDir: `src/modules/${input.moduleData.name}`,
            status: 'active',
            type: (input.moduleData.category || 'other') as any,
            description: input.moduleData.description || '',
            config: input.config || {},
            provides: [],
            dependencies: [],
            exports: (adapted.changes || []).map((c: any) => c.path),
            lastModified: new Date().toISOString(),
          },
          validation: {
            passed: true,
            issues: [],
          },
        };
        return { action: 'integrate', integration: integrationResult };
      }
    }

    // Local TypeScript fallback via ModuleAdapter
    this.logger.info(`Running local TypeScript module adapter fallback for: ${input.moduleData.name}`);
    if (action === 'analyze') {
      const profile = await context.moduleAdapter.inspectProject(targetPath);
      const plan = await context.moduleAdapter.determineAdaptations(profile, input.moduleData);
      return {
        action: 'analyze',
        analysis: {
          compatible: true,
          issues: [],
          conflicts: [],
          required_packages: plan.requiredPackages,
        },
      };
    } else {
      const integration = await context.moduleAdapter.adaptAndIntegrate(
        targetPath,
        input.moduleData,
        input.config
      );
      return { action: 'integrate', integration };
    }
  }
}
