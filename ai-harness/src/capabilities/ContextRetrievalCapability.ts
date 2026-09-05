import { IAICapability, HarnessContext, RetrievedContext } from '../interfaces';

export interface ContextRetrievalInput {
  query: string;
  maxFiles?: number;
  targetPaths?: string[];
}

export class ContextRetrievalCapability implements IAICapability<ContextRetrievalInput, RetrievedContext> {
  readonly id = 'context-retrieval';
  readonly name = 'Codebase Context Retrieval';
  readonly description = 'Extracts targeted source files, AST symbols, and architecture data for any development prompt.';

  async execute(input: ContextRetrievalInput, context: HarnessContext): Promise<RetrievedContext> {
    return context.indexer.queryContext({
      prompt: input.query,
      maxFiles: input.maxFiles || 6,
      targetPaths: input.targetPaths,
    });
  }
}
