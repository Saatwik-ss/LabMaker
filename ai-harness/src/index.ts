// Export interfaces
export * from './interfaces';

// Export core harness
export { AIHarness } from './harness/AIHarness';

// Export subsystems
export { ProjectIndexer } from './indexing/ProjectIndexer';
export { ModuleAdapter } from './modules/ModuleAdapter';
export { AgentOrchestrator } from './orchestration/AgentOrchestrator';

// Export capabilities
export { ChatAssistantCapability } from './capabilities/ChatAssistantCapability';
export { CodeGenerationCapability } from './capabilities/CodeGenerationCapability';
export { AutocompleteCapability } from './capabilities/AutocompleteCapability';
export { RefactoringCapability } from './capabilities/RefactoringCapability';
export { ContextRetrievalCapability } from './capabilities/ContextRetrievalCapability';
export { ErrorAnalysisFixCapability } from './capabilities/ErrorAnalysisFixCapability';
export { CursorAgentCapability } from './capabilities/CursorAgentCapability';
export { ModuleAdaptationCapability } from './capabilities/ModuleAdaptationCapability';
export { TerminalExecutionCapability } from './capabilities/TerminalExecutionCapability';
export { PipelineTestingCapability } from './capabilities/PipelineTestingCapability';

// Export Crystal bridge
export { CrystalBridge, CrystalHealthStatus, AgentStreamChunk, AgentExecutionSummary } from './crystal/CrystalBridge';

export { AgentToolRegistry } from './tools/AgentToolRegistry';
export { WorkspaceFs } from './tools/WorkspaceFs';
export { ModuleCatalogIndex } from './indexing/ModuleCatalogIndex';
export { CodexMcpServer } from './mcp/CodexMcpServer';
export { scanModuleCompatibility } from './modules/CompatibilityScanner';

// Export utils
export { Logger } from './utils/Logger';
export { normalizeLlmModel, isDeprecatedGroqModel, detectProjectDomain } from './utils/ModelNormalizer';
