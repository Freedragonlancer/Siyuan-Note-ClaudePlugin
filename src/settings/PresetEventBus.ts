import type { PromptTemplate } from './config-types';
import { Logger } from '@/utils/Logger';

/**
 * Preset event types for state synchronization
 */
export type PresetEventType =
    | 'created'   // New preset created
    | 'updated'   // Existing preset modified
    | 'deleted'   // Preset removed
    | 'imported'  // Presets imported from file
    | 'selected'; // Preset selection changed

/**
 * Preset event payload
 */
export interface PresetEvent {
    type: PresetEventType;
    presetId: string;
    preset?: PromptTemplate;  // Full preset data (undefined for delete events)
    timestamp: number;        // Event timestamp for debugging
    source?: string;          // Optional source identifier for debugging
}

/**
 * Event listener function type
 */
export type PresetEventListener = (event: PresetEvent) => void;

/**
 * Unsubscribe function type
 */
export type UnsubscribeFn = () => void;

/**
 * PresetEventBus - Centralized event system for Preset state synchronization
 *
 * Purpose:
 * - Eliminate manual UI refresh requirements
 * - Provide automatic state synchronization across components
 * - Enable loose coupling between Preset producers and consumers
 *
 * Usage:
 * ```typescript
 * const eventBus = PresetEventBus.getInstance();
 *
 * // Subscribe to events
 * const unsubscribe = eventBus.subscribe('updated', (event) => {
 *     console.log('Preset updated:', event.presetId);
 *     this.refreshUI();
 * });
 *
 * // Publish events
 * eventBus.publish({
 *     type: 'created',
 *     presetId: 'new-preset-id',
 *     preset: newPresetData,
 *     timestamp: Date.now()
 * });
 *
 * // Clean up
 * unsubscribe();
 * ```
 */
export class PresetEventBus {
    private static instance: PresetEventBus | null = null;
    private listeners: Map<PresetEventType, Set<PresetEventListener>>;
    private logger = Logger.createScoped('PresetEventBus');
    private eventHistory: PresetEvent[] = [];
    private readonly MAX_HISTORY = 50; // Keep last 50 events for debugging

    private constructor() {
        this.listeners = new Map();
        this.logger.debug('PresetEventBus initialized');
    }

    /**
     * Get singleton instance
     */
    public static getInstance(): PresetEventBus {
        if (!PresetEventBus.instance) {
            PresetEventBus.instance = new PresetEventBus();
        }
        return PresetEventBus.instance;
    }

    /**
     * Subscribe to preset events
     *
     * @param type - Event type to listen for
     * @param listener - Callback function
     * @returns Unsubscribe function
     *
     * @example
     * ```typescript
     * const unsubscribe = eventBus.subscribe('updated', (event) => {
     *     console.log('Preset updated:', event.presetId);
     * });
     * // Later...
     * unsubscribe();
     * ```
     */
    public subscribe(type: PresetEventType, listener: PresetEventListener): UnsubscribeFn {
        if (!this.listeners.has(type)) {
            this.listeners.set(type, new Set());
        }

        const listeners = this.listeners.get(type)!;
        listeners.add(listener);

        this.logger.debug(`Subscribed to '${type}' events (total: ${listeners.size})`);

        // Return unsubscribe function
        return () => {
            listeners.delete(listener);
            this.logger.debug(`Unsubscribed from '${type}' events (remaining: ${listeners.size})`);

            // Clean up empty listener sets
            if (listeners.size === 0) {
                this.listeners.delete(type);
            }
        };
    }

    /**
     * Subscribe to all event types
     *
     * @param listener - Callback function for all events
     * @returns Unsubscribe function
     */
    public subscribeAll(listener: PresetEventListener): UnsubscribeFn {
        const unsubscribes: UnsubscribeFn[] = [];
        const eventTypes: PresetEventType[] = ['created', 'updated', 'deleted', 'imported', 'selected'];

        for (const type of eventTypes) {
            unsubscribes.push(this.subscribe(type, listener));
        }

        // Return combined unsubscribe function
        return () => {
            unsubscribes.forEach(fn => fn());
        };
    }

    /**
     * Publish preset event to all subscribers
     *
     * @param event - Event to publish
     *
     * @example
     * ```typescript
     * eventBus.publish({
     *     type: 'updated',
     *     presetId: 'my-preset',
     *     preset: updatedPreset,
     *     timestamp: Date.now(),
     *     source: 'ConfigManager'
     * });
     * ```
     */
    public publish(event: PresetEvent): void {
        // Add to history for debugging
        this.eventHistory.push(event);
        if (this.eventHistory.length > this.MAX_HISTORY) {
            this.eventHistory.shift();
        }

        const listeners = this.listeners.get(event.type);
        if (!listeners || listeners.size === 0) {
            this.logger.debug(`No listeners for '${event.type}' event (presetId: ${event.presetId})`);
            return;
        }

        this.logger.debug(
            `Publishing '${event.type}' event (presetId: ${event.presetId}, listeners: ${listeners.size})`,
            event.source ? `from ${event.source}` : ''
        );

        // Notify all listeners
        listeners.forEach(listener => {
            try {
                listener(event);
            } catch (error) {
                this.logger.error(`Error in event listener for '${event.type}':`, error);
            }
        });
    }

    /**
     * Get event history for debugging
     */
    public getEventHistory(): readonly PresetEvent[] {
        return [...this.eventHistory];
    }

    /**
     * Clear all listeners (useful for testing)
     */
    public clearAllListeners(): void {
        const totalListeners = Array.from(this.listeners.values())
            .reduce((sum, set) => sum + set.size, 0);

        this.listeners.clear();
        this.logger.debug(`Cleared all listeners (${totalListeners} total)`);
    }

    /**
     * Get listener count for debugging
     */
    public getListenerCount(type?: PresetEventType): number {
        if (type) {
            return this.listeners.get(type)?.size ?? 0;
        }
        return Array.from(this.listeners.values())
            .reduce((sum, set) => sum + set.size, 0);
    }

    /**
     * Destroy singleton instance (useful for testing)
     */
    public static destroyInstance(): void {
        if (PresetEventBus.instance) {
            PresetEventBus.instance.clearAllListeners();
            PresetEventBus.instance = null;
        }
    }
}

/**
 * Convenience function to get singleton instance
 */
export function getPresetEventBus(): PresetEventBus {
    return PresetEventBus.getInstance();
}
