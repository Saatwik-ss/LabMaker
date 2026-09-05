import { ApplicationModelManager } from '../core/ApplicationModel';
import { Logger } from '../utils/Logger';

/**
 * CodeGenerator produces code based on patterns and specifications.
 * Used by the agent to generate files.
 */
export class CodeGenerator {
  private model: ApplicationModelManager;
  private logger: Logger;

  constructor(model: ApplicationModelManager) {
    this.model = model;
    this.logger = new Logger('CodeGenerator');
  }

  /**
   * Generate a React component
   */
  generateReactComponent(spec: ComponentSpec): string {
    const template = `import React from 'react';
import './styles.css';

interface ${spec.name}Props {
  // Props here
}

/**
 * ${spec.name}
 * ${spec.description}
 */
export const ${spec.name}: React.FC<${spec.name}Props> = (props) => {
  return (
    <div className="${this.slugify(spec.name)}">
      {/* Component content here */}
    </div>
  );
};

export default ${spec.name};
`;
    return this.formatCode(template);
  }

  /**
   * Generate an API route (Express)
   */
  generateApiRoute(spec: RouteSpec): string {
    const methodLower = spec.method.toLowerCase();
    const template = `import { Router, Request, Response, NextFunction } from 'express';

const router = Router();

/**
 * ${spec.method} ${spec.path}
 * ${spec.description}
 */
router.${methodLower}('${spec.path}', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Request validation
    // Business logic
    // Response

    res.json({ success: true, data: {} });
  } catch (error) {
    next(error);
  }
});

export default router;
`;
    return this.formatCode(template);
  }

  /**
   * Generate a database model/schema (Prisma/TypeORM style)
   */
  generateDatabaseModel(spec: ModelSpec): string {
    const template = `/**
 * ${spec.name}
 * ${spec.description}
 */

export interface ${spec.name} {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  // Add fields here
}

export const ${spec.name}Schema = {
  tableName: '${this.slugify(spec.name)}',
  fields: {
    id: { type: 'string', primaryKey: true },
    createdAt: { type: 'timestamp', default: 'now()' },
    updatedAt: { type: 'timestamp', default: 'now()' },
    // Add fields here
  },
};
`;
    return this.formatCode(template);
  }

  /**
   * Generate a service/business logic class
   */
  generateService(spec: ServiceSpec): string {
    const template = `import { Logger } from '../utils/Logger';

/**
 * ${spec.name}
 * ${spec.description}
 */
export class ${spec.name} {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('${spec.name}');
  }

  // Add methods here
}

export default new ${spec.name}();
`;
    return this.formatCode(template);
  }

  /**
   * Generate a test file
   */
  generateTestFile(spec: TestSpec): string {
    const template = `import { describe, it, expect, beforeEach } from '@jest/globals';

describe('${spec.name}', () => {
  beforeEach(() => {
    // Setup
  });

  it('should work', () => {
    // Test implementation
    expect(true).toBe(true);
  });
});
`;
    return this.formatCode(template);
  }

  /**
   * Generate a migration file (SQL)
   */
  generateMigration(spec: MigrationSpec): string {
    const timestamp = Date.now();
    const template = `-- Migration: ${timestamp}
-- Description: ${spec.description}

BEGIN;

-- TODO: Add SQL migration here

COMMIT;
`;
    return template;
  }

  /**
   * Generate types/interfaces
   */
  generateTypeFile(spec: TypeSpec): string {
    const template = `/**
 * ${spec.name}
 * ${spec.description}
 */

${spec.types.map(t => `export interface ${t.name} {
${t.fields.map(f => `  ${f.name}: ${f.type};`).join('\n')}
}`).join('\n\n')}
`;
    return this.formatCode(template);
  }

  /**
   * Helper: Format generated code (basic indentation, etc.)
   */
  private formatCode(code: string): string {
    // In production, use prettier or similar
    return code.trim();
  }

  /**
   * Helper: Convert to slug
   */
  private slugify(text: string): string {
    return text
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .toLowerCase();
  }
}

// Specification types
export interface ComponentSpec {
  name: string;
  description: string;
  props?: Record<string, string>;
}

export interface RouteSpec {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  description: string;
  requestBody?: any;
  response?: any;
}

export interface ModelSpec {
  name: string;
  description: string;
  fields?: Record<string, any>;
}

export interface ServiceSpec {
  name: string;
  description: string;
  methods?: string[];
}

export interface TestSpec {
  name: string;
  description?: string;
  targetFile?: string;
}

export interface MigrationSpec {
  name: string;
  description: string;
  type: 'create-table' | 'add-column' | 'add-index' | 'custom';
}

export interface TypeSpec {
  name: string;
  description: string;
  types: Array<{
    name: string;
    fields: Array<{
      name: string;
      type: string;
      optional?: boolean;
    }>;
  }>;
}
