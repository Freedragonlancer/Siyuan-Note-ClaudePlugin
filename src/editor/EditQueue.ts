/**
 * Edit Queue - Manages queuing and processing of AI edit requests
 */

import type {
    TextSelection,
    IEditQueue,
    EditSettings,
    EditEventType,
    EditEvent,
    EditEventCallback
} from './types';
import { AIEditProcessor } from './AIEditProcessor';
import { TextSelectionManager } from './TextSelectionManager';

/**
 * Simple event emitter for queue events
 */
class QueueEventEmitter {
    private listeners: Map<string, Set<() => void>> = new Map();

    on(event: string, callback: () => void): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(callback);
    }

    off(event: string, callback: () => void): void {
        this.listeners.get(event)?.delete(callback);
    }

    emit(event: string): void {
        this.listeners.get(event)?.forEach(cb => {
            try {
                cb();
            } catch (e) {
                console.error(`[EditQueue] Error in event listener for ${event}:`, e);
            }
        });
    }

    clear(): void {
        this.listeners.clear();
    }
}

export class EditQueue implements IEditQueue {
    private queue: string[] = []; // Queue of selection IDs
    private processing: Set<string> = new Set();
    private paused: boolean = false;
    private settings: EditSettings;
    private processor: AIEditProcessor;
    private manager: TextSelectionManager;
    private eventListeners: Set<EditEventCallback> = new Set();
    private queueEmitter: QueueEventEmitter = new QueueEventEmitter();

    constructor(
        processor: AIEditProcessor,
        manager: TextSelectionManager,
        settings: EditSettings
    ) {
        this.processor = processor;
        this.manager = manager;
        this.settings = settings;

        // Event-driven processing: listen for 'itemCompleted' to process next
        this.queueEmitter.on('itemCompleted', () => {
            if (!this.paused && this.queue.length > 0) {
                // Use microtask to avoid stack overflow on rapid completions
                queueMicrotask(() => this.processNext());
            }
        });

        // Note: Removed auto-enqueue listener
        // All enqueue operations should be explicit via enqueue() calls
    }

    /**
     * Add a selection to the queue
     */
    enqueue(selection: TextSelection): void {
        if (this.queue.includes(selection.id)) {
            console.log(`[AIEdit] Selection ${selection.id} already in queue`);
            return;
        }

        this.queue.push(selection.id);
        console.log(`[AIEdit] Enqueued selection ${selection.id} (queue size: ${this.queue.length})`);

        // Auto-process if enabled and not paused
        if (this.settings.autoProcessQueue && !this.paused) {
            this.processNext();
        }
    }

    /**
     * Remove and return the next selection from queue
     */
    dequeue(): TextSelection | undefined {
        const selectionId = this.queue.shift();
        if (!selectionId) {
            return undefined;
        }

        const selection = this.manager.getSelection(selectionId);
        if (!selection) {
            console.warn(`[AIEdit] Selection ${selectionId} not found in manager`);
            return this.dequeue(); // Try next one
        }

        return selection;
    }

    /**
     * Process the next item in queue
     */
    async processNext(): Promise<void> {
        // Check if we can process more
        if (this.paused) {
            console.log('[AIEdit] Queue is paused, not processing');
            return;
        }

        if (this.processing.size >= this.settings.maxConcurrentEdits) {
            console.log('[AIEdit] Max concurrent edits reached, waiting...');
            return;
        }

        if (this.queue.length === 0) {
            console.log('[AIEdit] Queue is empty');
            return;
        }

        const selection = this.dequeue();
        if (!selection) {
            return;
        }

        // Start processing
        this.processing.add(selection.id);
        this.manager.updateStatus(selection.id, 'processing');

        console.log(`[AIEdit] Processing selection ${selection.id} (${this.processing.size} concurrent, ${this.queue.length} queued)`);

        try {
            // Process with AI
            const editResult = await this.processor.processSelection(
                selection,
                selection.customInstruction
            );

            // Update selection with result
            this.manager.updateEditResult(selection.id, editResult);

            console.log(`[AIEdit] Completed processing selection ${selection.id}`);

        } catch (error) {
            console.error(`[AIEdit] Error processing selection ${selection.id}:`, error);

            // Update status to error
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.manager.updateStatus(selection.id, 'error', errorMessage);

        } finally {
            // Remove from processing set
            this.processing.delete(selection.id);

            // Emit event to trigger next processing (event-driven, no setTimeout polling)
            this.queueEmitter.emit('itemCompleted');
        }
    }

    /**
     * Pause queue processing
     */
    pauseQueue(): void {
        if (this.paused) {
            return;
        }

        this.paused = true;
        console.log('[AIEdit] Queue paused');

        this.emitEvent({
            type: 'queue_paused' as EditEventType,
            timestamp: Date.now()
        });
    }

    /**
     * Resume queue processing
     */
    resumeQueue(): void {
        if (!this.paused) {
            return;
        }

        this.paused = false;
        console.log('[AIEdit] Queue resumed');

        this.emitEvent({
            type: 'queue_resumed' as EditEventType,
            timestamp: Date.now()
        });

        // Start processing if there are items in queue
        if (this.queue.length > 0) {
            this.processNext();
        }
    }

    /**
     * Check if queue is currently processing
     */
    isProcessing(): boolean {
        return this.processing.size > 0 || this.queue.length > 0;
    }

    /**
     * Check if queue is paused
     */
    isPaused(): boolean {
        return this.paused;
    }

    /**
     * Get current queue size
     */
    getQueueSize(): number {
        return this.queue.length;
    }

    /**
     * Get number of items currently processing
     */
    getProcessingCount(): number {
        return this.processing.size;
    }

    /**
     * Clear the entire queue
     */
    clearQueue(): void {
        const queueSize = this.queue.length;
        this.queue = [];

        console.log(`[AIEdit] Cleared queue (${queueSize} items removed)`);

        this.emitEvent({
            type: 'queue_cleared' as EditEventType,
            timestamp: Date.now()
        });
    }

    /**
     * Cancel all processing items
     */
    cancelAll(): void {
        // Cancel active requests in processor
        this.processor.cancelAll();

        // Clear processing set
        this.processing.clear();

        // Clear queue
        this.clearQueue();

        console.log('[AIEdit] Cancelled all processing and cleared queue');
    }

    /**
     * Process all pending selections
     */
    async processAll(): Promise<void> {
        console.log('[AIEdit] Processing all pending selections');

        // Resume if paused
        if (this.paused) {
            this.resumeQueue();
        }

        // Start processing and wait for completion
        // Event-driven: processNext triggers the next via events, we just wait
        return new Promise<void>((resolve) => {
            const checkComplete = () => {
                if (this.queue.length === 0 && this.processing.size === 0) {
                    this.queueEmitter.off('itemCompleted', checkComplete);
                    console.log('[AIEdit] Finished processing all selections');
                    resolve();
                }
            };

            // Listen for completion events
            this.queueEmitter.on('itemCompleted', checkComplete);

            // Start processing if not already
            if (this.processing.size < this.settings.maxConcurrentEdits && this.queue.length > 0) {
                this.processNext();
            }

            // Check immediately in case queue is already empty
            checkComplete();
        });
    }

    /**
     * Get queue statistics
     */
    getStatistics(): {
        queued: number;
        processing: number;
        isPaused: boolean;
        maxConcurrent: number;
    } {
        return {
            queued: this.queue.length,
            processing: this.processing.size,
            isPaused: this.paused,
            maxConcurrent: this.settings.maxConcurrentEdits
        };
    }

    /**
     * Update settings
     */
    updateSettings(settings: Partial<EditSettings>): void {
        this.settings = { ...this.settings, ...settings };
        console.log('[AIEdit] Queue settings updated');

        // If maxConcurrentEdits increased and we have queued items, process more
        if (settings.maxConcurrentEdits && !this.paused && this.queue.length > 0) {
            this.processNext();
        }
    }

    /**
     * Add event listener
     */
    addEventListener(callback: EditEventCallback): void {
        this.eventListeners.add(callback);
    }

    /**
     * Remove event listener
     */
    removeEventListener(callback: EditEventCallback): void {
        this.eventListeners.delete(callback);
    }

    /**
     * Emit event to all listeners
     */
    private emitEvent(event: EditEvent): void {
        this.eventListeners.forEach(callback => {
            try {
                callback(event);
            } catch (error) {
                console.error('[AIEdit] Error in queue event listener:', error);
            }
        });
    }
}
