/**
 * Quick Edit Module - Instant AI text editing with inline comparison
 */

export * from './types';
export * from './inline-types';

// Core orchestrator
export { QuickEditManager } from './QuickEditManager';

// Modular components (new architecture)
export { SelectionHandler } from './SelectionHandler';
export { BlockOperations } from './BlockOperations';
export { PromptBuilder } from './PromptBuilder';
export { EditStateManager } from './EditStateManager';

// Support components
export { ContextExtractor } from './ContextExtractor';
export { InlineEditRenderer } from './InlineEditRenderer';
export { InstructionInputPopup } from './InstructionInputPopup';

// Additional types
export type { BlockInsertResult, BlockDeleteResult, BlockUpdateResult } from './BlockOperations';
export type { PromptBuildOptions, BuiltPrompt } from './PromptBuilder';
