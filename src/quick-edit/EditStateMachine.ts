/**
 * Edit State Machine
 * Manages state transitions for Quick Edit workflow
 *
 * Created v0.18.0: Implements state machine pattern for clearer state management
 */

/**
 * Quick Edit workflow states
 */
export enum QuickEditState {
    /** No edit in progress */
    IDLE = 'IDLE',
    /** User is entering instruction */
    INPUT_INSTRUCTION = 'INPUT_INSTRUCTION',
    /** AI is processing the request */
    PROCESSING = 'PROCESSING',
    /** AI is streaming response */
    STREAMING = 'STREAMING',
    /** User is reviewing the result */
    REVIEWING = 'REVIEWING',
    /** Changes are being applied */
    APPLYING = 'APPLYING',
    /** An error occurred */
    ERROR = 'ERROR'
}

/**
 * Events that trigger state transitions
 */
export enum QuickEditEvent {
    /** User triggered Quick Edit */
    TRIGGER = 'TRIGGER',
    /** User submitted instruction */
    SUBMIT = 'SUBMIT',
    /** User cancelled */
    CANCEL = 'CANCEL',
    /** AI started streaming */
    START_STREAM = 'START_STREAM',
    /** AI finished streaming */
    STREAM_COMPLETE = 'STREAM_COMPLETE',
    /** User accepted changes */
    ACCEPT = 'ACCEPT',
    /** User rejected changes */
    REJECT = 'REJECT',
    /** User requested retry */
    RETRY = 'RETRY',
    /** Changes applied successfully */
    APPLIED = 'APPLIED',
    /** An error occurred */
    ERROR = 'ERROR',
    /** Error dismissed */
    DISMISS = 'DISMISS'
}

/**
 * State transition definition
 */
interface StateTransition {
    from: QuickEditState;
    event: QuickEditEvent;
    to: QuickEditState;
    guard?: () => boolean;
}

/**
 * State change listener callback
 */
export type StateChangeListener = (
    from: QuickEditState,
    to: QuickEditState,
    event: QuickEditEvent,
    blockId?: string
) => void;

/**
 * Edit State Machine
 * Implements a finite state machine for Quick Edit workflow
 */
export class EditStateMachine {
    private currentState: QuickEditState = QuickEditState.IDLE;
    private currentBlockId: string | null = null;
    private listeners: StateChangeListener[] = [];
    private errorMessage: string | null = null;

    /**
     * Valid state transitions
     */
    private readonly transitions: StateTransition[] = [
        // IDLE transitions
        { from: QuickEditState.IDLE, event: QuickEditEvent.TRIGGER, to: QuickEditState.INPUT_INSTRUCTION },

        // INPUT_INSTRUCTION transitions
        { from: QuickEditState.INPUT_INSTRUCTION, event: QuickEditEvent.SUBMIT, to: QuickEditState.PROCESSING },
        { from: QuickEditState.INPUT_INSTRUCTION, event: QuickEditEvent.CANCEL, to: QuickEditState.IDLE },

        // PROCESSING transitions
        { from: QuickEditState.PROCESSING, event: QuickEditEvent.START_STREAM, to: QuickEditState.STREAMING },
        { from: QuickEditState.PROCESSING, event: QuickEditEvent.ERROR, to: QuickEditState.ERROR },
        { from: QuickEditState.PROCESSING, event: QuickEditEvent.CANCEL, to: QuickEditState.IDLE },

        // STREAMING transitions
        { from: QuickEditState.STREAMING, event: QuickEditEvent.STREAM_COMPLETE, to: QuickEditState.REVIEWING },
        { from: QuickEditState.STREAMING, event: QuickEditEvent.ERROR, to: QuickEditState.ERROR },
        { from: QuickEditState.STREAMING, event: QuickEditEvent.CANCEL, to: QuickEditState.IDLE },

        // REVIEWING transitions
        { from: QuickEditState.REVIEWING, event: QuickEditEvent.ACCEPT, to: QuickEditState.APPLYING },
        { from: QuickEditState.REVIEWING, event: QuickEditEvent.REJECT, to: QuickEditState.IDLE },
        { from: QuickEditState.REVIEWING, event: QuickEditEvent.RETRY, to: QuickEditState.PROCESSING },

        // APPLYING transitions
        { from: QuickEditState.APPLYING, event: QuickEditEvent.APPLIED, to: QuickEditState.IDLE },
        { from: QuickEditState.APPLYING, event: QuickEditEvent.ERROR, to: QuickEditState.ERROR },

        // ERROR transitions
        { from: QuickEditState.ERROR, event: QuickEditEvent.DISMISS, to: QuickEditState.IDLE },
        { from: QuickEditState.ERROR, event: QuickEditEvent.RETRY, to: QuickEditState.PROCESSING }
    ];

    /**
     * Get current state
     */
    getState(): QuickEditState {
        return this.currentState;
    }

    /**
     * Get current block ID being edited
     */
    getCurrentBlockId(): string | null {
        return this.currentBlockId;
    }

    /**
     * Get error message (if in ERROR state)
     */
    getErrorMessage(): string | null {
        return this.errorMessage;
    }

    /**
     * Check if a transition is valid
     */
    canTransition(event: QuickEditEvent): boolean {
        const transition = this.transitions.find(
            t => t.from === this.currentState && t.event === event
        );

        if (!transition) {
            return false;
        }

        // Check guard if present
        if (transition.guard && !transition.guard()) {
            return false;
        }

        return true;
    }

    /**
     * Attempt a state transition
     * @returns true if transition was successful
     */
    transition(event: QuickEditEvent, blockId?: string, errorMessage?: string): boolean {
        const transition = this.transitions.find(
            t => t.from === this.currentState && t.event === event
        );

        if (!transition) {
            console.warn(
                `[EditStateMachine] Invalid transition: ${this.currentState} + ${event}`
            );
            return false;
        }

        // Check guard if present
        if (transition.guard && !transition.guard()) {
            console.warn(
                `[EditStateMachine] Transition guard failed: ${this.currentState} + ${event}`
            );
            return false;
        }

        const previousState = this.currentState;
        this.currentState = transition.to;

        // Update block ID if provided
        if (blockId !== undefined) {
            this.currentBlockId = blockId;
        }

        // Clear block ID when returning to IDLE
        if (transition.to === QuickEditState.IDLE) {
            this.currentBlockId = null;
            this.errorMessage = null;
        }

        // Store error message if transitioning to ERROR
        if (transition.to === QuickEditState.ERROR && errorMessage) {
            this.errorMessage = errorMessage;
        }

        // Notify listeners
        this.notifyListeners(previousState, this.currentState, event, this.currentBlockId ?? undefined);

        console.log(
            `[EditStateMachine] ${previousState} -> ${this.currentState} (${event})`,
            blockId ? `blockId: ${blockId}` : ''
        );

        return true;
    }

    /**
     * Force reset to IDLE state
     * Use sparingly - prefer proper transitions
     */
    reset(): void {
        const previousState = this.currentState;
        this.currentState = QuickEditState.IDLE;
        this.currentBlockId = null;
        this.errorMessage = null;

        this.notifyListeners(previousState, QuickEditState.IDLE, QuickEditEvent.CANCEL);
        console.log('[EditStateMachine] Reset to IDLE');
    }

    /**
     * Add state change listener
     */
    addListener(listener: StateChangeListener): () => void {
        this.listeners.push(listener);
        return () => this.removeListener(listener);
    }

    /**
     * Remove state change listener
     */
    removeListener(listener: StateChangeListener): void {
        const index = this.listeners.indexOf(listener);
        if (index !== -1) {
            this.listeners.splice(index, 1);
        }
    }

    /**
     * Notify all listeners of state change
     */
    private notifyListeners(
        from: QuickEditState,
        to: QuickEditState,
        event: QuickEditEvent,
        blockId?: string
    ): void {
        for (const listener of this.listeners) {
            try {
                listener(from, to, event, blockId);
            } catch (error) {
                console.error('[EditStateMachine] Listener error:', error);
            }
        }
    }

    /**
     * Check if currently processing (PROCESSING or STREAMING)
     */
    isProcessing(): boolean {
        return this.currentState === QuickEditState.PROCESSING ||
               this.currentState === QuickEditState.STREAMING;
    }

    /**
     * Check if edit is active (not IDLE)
     */
    isActive(): boolean {
        return this.currentState !== QuickEditState.IDLE;
    }

    /**
     * Check if in error state
     */
    isError(): boolean {
        return this.currentState === QuickEditState.ERROR;
    }

    /**
     * Get available events from current state
     */
    getAvailableEvents(): QuickEditEvent[] {
        return this.transitions
            .filter(t => t.from === this.currentState)
            .map(t => t.event);
    }

    /**
     * Get state as human-readable string (for UI)
     */
    getStateLabel(): string {
        const labels: Record<QuickEditState, string> = {
            [QuickEditState.IDLE]: '空闲',
            [QuickEditState.INPUT_INSTRUCTION]: '输入指令',
            [QuickEditState.PROCESSING]: '处理中',
            [QuickEditState.STREAMING]: '生成中',
            [QuickEditState.REVIEWING]: '审阅中',
            [QuickEditState.APPLYING]: '应用中',
            [QuickEditState.ERROR]: '错误'
        };
        return labels[this.currentState];
    }
}
