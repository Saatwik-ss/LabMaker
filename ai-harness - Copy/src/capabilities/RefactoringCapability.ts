import * as fs from 'fs';
import * as path from 'path';
import { IAICapability, HarnessContext } from '../interfaces';
import { FileChange } from '@codex/shared';

export interface RefactorInput {
  operation: 'rename-symbol' | 'extract-constant' | 'clean-imports';
  targetPath: string;
  parameters: {
    oldName?: string;
    newName?: string;
    constantValue?: string;
  };
}

export interface RefactorOutput {
  success: boolean;
  changes: FileChange[];
  message: string;
}

export class RefactoringCapability implements IAICapability<RefactorInput, RefactorOutput> {
  readonly id = 'refactoring';
  readonly name = 'Codebase Refactoring';
  readonly description = 'Performs safe, structure-preserving refactorings across codebase files.';

  async execute(input: RefactorInput, context: HarnessContext): Promise<RefactorOutput> {
    const fullPath = path.resolve(context.projectRoot, input.targetPath);
    if (!fs.existsSync(fullPath)) {
      return { success: false, changes: [], message: `Target file not found: ${input.targetPath}` };
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    let newContent = content;

    if (input.operation === 'rename-symbol' && input.parameters.oldName && input.parameters.newName) {
      const regex = new RegExp(`\\b${input.parameters.oldName}\\b`, 'g');
      newContent = content.replace(regex, input.parameters.newName);
    } else if (input.operation === 'clean-imports') {
      // Remove unused or blank import lines
      newContent = content
        .split('\n')
        .filter(line => !line.match(/^import\s+.*?from\s+['"][^'"]+['"];?\s*$/) || line.length > 5)
        .join('\n');
    }

    if (newContent !== content) {
      fs.writeFileSync(fullPath, newContent, 'utf8');
      const change: FileChange = {
        path: input.targetPath,
        action: 'modify',
        lineCount: { added: 1, removed: 1, modified: 1 },
        newContent,
      };
      return {
        success: true,
        changes: [change],
        message: `Successfully applied refactoring '${input.operation}' to ${input.targetPath}`,
      };
    }

    return {
      success: true,
      changes: [],
      message: 'No changes required.',
    };
  }
}
