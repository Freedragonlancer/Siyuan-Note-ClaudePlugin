/**
 * Quick Edit Module - Instant AI text editing with inline comparison
 */

export * from './types';
export * from './inline-types';

// Core orchestrator (v0.18.0: Renamed from QuickEditManager)
export { QuickEditCoordinator } from './QuickEditCoordinator';

// Backward compatibility alias (deprecated)
export { QuickEditCoordinator as QuickEditManager } from './QuickEditCoordinator';

// Modular components (new architecture)
export { SelectionHandler } from './SelectionHandler';
export { BlockOperations } from './BlockOperations';
export { PromptBuilder } from './PromptBuilder';
export { EditStateManager } from './EditStateManager';
export { EditStateMachine, QuickEditState, QuickEditEvent } from './EditStateMachine';
export { ActionHandler } from './ActionHandler';
export { AIRequestHandler } from './AIRequestHandler';

// Support components
export { ContextExtractor } from './ContextExtractor';
export { InlineEditRenderer } from './InlineEditRenderer';
export { InstructionInputPopup } from './InstructionInputPopup';

// Additional types
export type { BlockInsertResult, BlockDeleteResult, BlockUpdateResult } from './BlockOperations';
export type { PromptBuildOptions, BuiltPrompt, QuickEditPromptOptions, QuickEditPromptResult } from './PromptBuilder';
export type { ExtendedSelection } from './SelectionHandler';
export type { StateChangeListener } from './EditStateMachine';
export type { ActionHandlerDependencies } from './ActionHandler';
export type { AIRequestHandlerDependencies, QuickEditAutoAction } from './AIRequestHandler';
