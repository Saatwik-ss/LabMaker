import { IAICapability, HarnessContext } from '../interfaces';

export interface AutocompleteInput {
  filePath: string;
  prefix: string;
  line: number;
  column: number;
}

export interface AutocompleteSuggestion {
  text: string;
  kind: 'symbol' | 'snippet' | 'keyword';
  detail?: string;
}

export interface AutocompleteOutput {
  suggestions: AutocompleteSuggestion[];
}

export class AutocompleteCapability implements IAICapability<AutocompleteInput, AutocompleteOutput> {
  readonly id = 'autocomplete';
  readonly name = 'Contextual Autocomplete';
  readonly description = 'Provides symbols, types, and snippets suggested from codebase AST and project profile.';

  async execute(input: AutocompleteInput, context: HarnessContext): Promise<AutocompleteOutput> {
    const fileIndex = await context.indexer.indexFile(input.filePath, context.projectRoot);
    const suggestions: AutocompleteSuggestion[] = [];

    const prefix = input.prefix.trim().toLowerCase();

    if (fileIndex) {
      fileIndex.symbols.forEach(sym => {
        if (!prefix || sym.name.toLowerCase().startsWith(prefix)) {
          suggestions.push({
            text: sym.name,
            kind: 'symbol',
            detail: `${sym.kind} (line ${sym.line})`,
          });
        }
      });
    }

    // Common TypeScript / React snippets
    if (input.filePath.endsWith('.tsx') || input.filePath.endsWith('.ts')) {
      suggestions.push(
        { text: 'useEffect(() => {\n  \n}, []);', kind: 'snippet', detail: 'React useEffect Hook' },
        { text: 'useState<boolean>(false);', kind: 'snippet', detail: 'React useState Hook' },
        { text: 'useCallback(() => {\n  \n}, []);', kind: 'snippet', detail: 'React useCallback Hook' },
        { text: 'export interface Props {\n  \n}', kind: 'snippet', detail: 'Interface definition' }
      );
    }

    return { suggestions: suggestions.slice(0, 10) };
  }
}
