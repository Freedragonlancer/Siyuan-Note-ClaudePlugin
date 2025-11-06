/**
 * Filter Pipeline - Advanced response filtering system
 * Allows chaining multiple filter middleware for complex transformations
 */

/**
 * Context passed to filter middleware
 */
export interface FilterContext {
    /** Original unfiltered response */
    originalResponse: string;
    /** Current filtered response (may be modified by previous middleware) */
    currentResponse: string;
    /** Feature that triggered the request (e.g., "Chat", "QuickEdit") */
    feature: string;
    /** Optional preset ID for preset-specific filtering */
    presetId?: string;
    /** Custom metadata for middleware communication */
    metadata: Map<string, any>;
}

/**
 * Filter Middleware Interface
 * Each middleware processes the response and returns the filtered version
 */
export interface FilterMiddleware {
    /**
     * Middleware name for debugging and logging
     */
    readonly name: string;

    /**
     * Process the response through this middleware
     * @param response Current response text
     * @param context Filter context with metadata
     * @returns Filtered response
     */
    process(response: string, context: FilterContext): Promise<string> | string;

    /**
     * Optional: Validate configuration before processing
     */
    validate?(): boolean | string;
}

/**
 * Filter Pipeline
 * Chains multiple middleware to process AI responses
 */
export class FilterPipeline {
    private middleware: FilterMiddleware[] = [];

    /**
     * Add middleware to the pipeline
     * @param middleware Middleware to add
     * @returns This pipeline (for chaining)
     */
    use(middleware: FilterMiddleware): this {
        // Validate middleware if validation method exists
        if (middleware.validate) {
            const validationResult = middleware.validate();
            if (validationResult !== true) {
                throw new Error(
                    `Middleware validation failed for "${middleware.name}": ${validationResult}`
                );
            }
        }

        this.middleware.push(middleware);
        console.log(`[FilterPipeline] Added middleware: ${middleware.name}`);
        return this;
    }

    /**
     * Remove middleware from the pipeline
     * @param name Middleware name
     * @returns True if removed, false if not found
     */
    remove(name: string): boolean {
        const index = this.middleware.findIndex(m => m.name === name);
        if (index !== -1) {
            this.middleware.splice(index, 1);
            console.log(`[FilterPipeline] Removed middleware: ${name}`);
            return true;
        }
        return false;
    }

    /**
     * Clear all middleware from the pipeline
     */
    clear(): void {
        this.middleware = [];
        console.log(`[FilterPipeline] Cleared all middleware`);
    }

    /**
     * Get list of registered middleware names
     */
    getMiddlewareNames(): string[] {
        return this.middleware.map(m => m.name);
    }

    /**
     * Execute the filter pipeline
     * @param response Original AI response
     * @param feature Feature name (e.g., "Chat", "QuickEdit")
     * @param presetId Optional preset ID
     * @returns Filtered response after passing through all middleware
     */
    async execute(
        response: string,
        feature: string = 'Unknown',
        presetId?: string
    ): Promise<string> {
        const context: FilterContext = {
            originalResponse: response,
            currentResponse: response,
            feature,
            presetId,
            metadata: new Map(),
        };

        let filtered = response;

        for (const middleware of this.middleware) {
            try {
                // Update context with current response
                context.currentResponse = filtered;

                // Process through middleware
                filtered = await middleware.process(filtered, context);

                // Log transformation
                if (filtered !== context.currentResponse) {
                    console.log(
                        `[FilterPipeline] ${middleware.name} transformed response (${context.currentResponse.length} → ${filtered.length} chars)`
                    );
                }
            } catch (error) {
                console.error(
                    `[FilterPipeline] Error in middleware "${middleware.name}":`,
                    error
                );
                // Continue with unmodified response on error
                // (don't let one middleware break the entire pipeline)
            }
        }

        return filtered;
    }

    /**
     * Execute pipeline synchronously (for non-async middleware only)
     * @throws Error if any middleware is async
     */
    executeSync(
        response: string,
        feature: string = 'Unknown',
        presetId?: string
    ): string {
        const context: FilterContext = {
            originalResponse: response,
            currentResponse: response,
            feature,
            presetId,
            metadata: new Map(),
        };

        let filtered = response;

        for (const middleware of this.middleware) {
            try {
                context.currentResponse = filtered;
                const result = middleware.process(filtered, context);

                // Check if result is a Promise (async)
                if (result instanceof Promise) {
                    throw new Error(
                        `Cannot use async middleware "${middleware.name}" in sync pipeline`
                    );
                }

                filtered = result;
            } catch (error) {
                console.error(
                    `[FilterPipeline] Error in middleware "${middleware.name}":`,
                    error
                );
            }
        }

        return filtered;
    }
}
